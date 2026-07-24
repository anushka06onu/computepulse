"""Grounded advisor chat: node briefs + product help (Groq + HF optional)."""

from __future__ import annotations

import re
from typing import Any

from api.services import chat_catalog
from api.services.explain import explain_node, _env, _hf_embed, _timeout
from api.services.store import store

_EXPLAIN_CACHE: dict[tuple, dict[str, Any]] = {}
_EXPLAIN_CACHE_MAX = 64


def _cached_explain(node_id: int, seed: int, critical: float, watch: float) -> dict[str, Any]:
    key = (int(seed), int(node_id), float(critical), float(watch))
    hit = _EXPLAIN_CACHE.get(key)
    if hit is not None:
        return hit
    expl = explain_node(
        node_id, seed=seed, critical=critical, watch=watch, rich=False
    )
    pack = {
        "summary": expl.get("summary"),
        "shap_reasons": expl.get("shap_reasons"),
        "neighbors": expl.get("neighbors"),
        "providers": expl.get("providers"),
    }
    if len(_EXPLAIN_CACHE) >= _EXPLAIN_CACHE_MAX:
        _EXPLAIN_CACHE.pop(next(iter(_EXPLAIN_CACHE)))
    _EXPLAIN_CACHE[key] = pack
    return pack


# Require explicit node wording, or bare digits only when id exists in snapshot.
NODE_EXPLICIT_RE = re.compile(
    r"(?:node\s*#?\s*|n#\s*|node_id\s*=\s*)(\d{1,5})\b",
    re.IGNORECASE,
)
BARE_ID_RE = re.compile(r"\b(\d{1,5})\b")
THRESHOLD_CTX_RE = re.compile(
    r"(?:set\s+\w+\s+to\s*\d+|critical\s*(?:above|to|≥|>=|>)\s*\d+|watch\s*(?:above|to|≥|>=|>)\s*\d+|\bthreshold\b)",
    re.IGNORECASE,
)
# Back-compat alias for any external imports/tests
NODE_RE = NODE_EXPLICIT_RE

INTENT_BANK: list[tuple[str, str]] = [
    ("node_brief", "tell me about this node status metrics"),
    ("why_status", "why is the node critical watch healthy risky"),
    ("recommend", "where should the job go recommend safer host placement"),
    ("product_overview", "how does computepulse work getting started"),
    ("list_features", "list all features what can the app do"),
    ("feature_help", "what is warnings fleet placement optimize"),
    ("howto", "how do I run the demo place a job safely"),
]

_GREETING_RE = re.compile(
    r"^(hi|hello|hey|thanks|thank you|thx|ok|okay|help|yo)[.!?]*$",
    re.IGNORECASE,
)

# Strong product / fleet signals — weak single words like "health" alone do not count.
_DOMAIN_PHRASES = (
    "computepulse",
    "compute pulse",
    "fleet",
    "cluster",
    "gpu",
    "node explorer",
    "job placement",
    "cost optimization",
    "system accuracy",
    "warnings",
    "warning",
    "run demo",
    "the demo",
    "placement",
    "fused risk",
    "anomaly",
    "shap",
    "threshold",
    "critical node",
    "safer host",
    "place a job",
    "place the job",
    "underutilized",
    "compare nodes",
    "cluster map",
)


def _is_greeting(message: str) -> bool:
    return bool(_GREETING_RE.match(message.strip()))


def _is_on_topic(message: str) -> bool:
    text = message.lower().strip()
    if not text:
        return True
    if NODE_EXPLICIT_RE.search(text):
        return True
    if any(p in text for p in _DOMAIN_PHRASES):
        return True
    # Feature / playbook titles or multi-word keywords
    for f in chat_catalog.FEATURES:
        title = str(f["title"]).lower()
        if title in text:
            return True
        for kw in f.get("keywords", []):
            k = str(kw).lower()
            if len(k) >= 5 and k in text:
                return True
    for p in chat_catalog.PLAYBOOKS:
        for kw in p.get("keywords", []):
            k = str(kw).lower()
            if len(k) >= 6 and k in text:
                return True
    # Common in-product verbs tied to fleet ops
    if any(
        k in text
        for k in (
            "node ",
            "nodes",
            "risk score",
            "failure rate",
            "where should",
            "list all feature",
            "how does computepulse",
        )
    ):
        return True
    return False


def _groq_chat(system: str, user: str, *, max_tokens: int = 700) -> str | None:
    key = _env("GROQ_API_KEY")
    if not key:
        return None
    model = _env("GROQ_MODEL", "llama-3.1-8b-instant")
    try:
        import httpx

        with httpx.Client(timeout=_timeout()) as client:
            r = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "temperature": 0.2,
                    "max_tokens": max_tokens,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


def _id_in_fleet(nid: int, seed: int | None = None) -> bool:
    try:
        snap = store.get_snapshot(seed)
        return bool((snap["node_id"] == int(nid)).any())
    except Exception:
        return False


def _parse_node_from_text(text: str, *, allow_bare: bool) -> int | None:
    m = NODE_EXPLICIT_RE.search(text)
    if m:
        return int(m.group(1))
    if not allow_bare:
        return None
    # "set critical to 70" must not resolve as node 70
    if THRESHOLD_CTX_RE.search(text):
        return None
    for bm in BARE_ID_RE.finditer(text):
        nid = int(bm.group(1))
        if _id_in_fleet(nid):
            return nid
    return None


def _extract_node_id(
    message: str,
    history: list[dict[str, str]],
    explicit: int | None,
) -> int | None:
    if explicit is not None:
        return int(explicit)
    found = _parse_node_from_text(message, allow_bare=True)
    if found is not None:
        return found
    # Prefer last explicit mention in history (no bare digits from prior turns).
    for turn in reversed(history):
        content = turn.get("content") or ""
        found = _parse_node_from_text(content, allow_bare=False)
        if found is not None:
            return found
    return None


def _keyword_intent(message: str) -> str:
    text = message.lower().strip()
    if not text:
        return "clarify"

    if any(
        k in text
        for k in (
            "list all feature",
            "all features",
            "what features",
            "what can you",
            "what can the app",
        )
    ):
        return "list_features"

    if any(
        k in text
        for k in (
            "where should",
            "recommend",
            "safer host",
            "place the job",
            "move the job",
            "where can",
        )
    ):
        return "recommend"

    if any(
        k in text
        for k in (
            "why is",
            "why risk",
            "why critical",
            "why watch",
            "why healthy",
            "why risky",
            "drivers",
            "shap",
        )
    ):
        return "why_status"

    pb = chat_catalog.match_playbook(text)
    if pb and pb["id"] in {"first_visit", "fused_risk", "safe_place", "trust_model", "run_demo"}:
        if pb["id"] == "first_visit":
            return "product_overview"
        return "howto"

    feat = chat_catalog.match_feature(text)
    if feat and any(
        k in text for k in ("what is", "explain", "about", "tell me about the", "how do i use")
    ):
        return "feature_help"

    if any(
        k in text
        for k in (
            "how does",
            "getting started",
            "how to use",
            "work the system",
            "first visit",
        )
    ):
        return "product_overview"

    if any(k in text for k in ("how do i", "how to", "walk me through")):
        return "howto"

    if feat:
        return "feature_help"

    if NODE_EXPLICIT_RE.search(text):
        return "node_brief"

    # Bare digits alone are not a node brief (avoids "set critical to 70").
    return "clarify"


def _hf_intent(message: str) -> str | None:
    """Optional HF embedding similarity vs intent bank."""
    if not _env("HF_TOKEN"):
        return None
    phrases = [p for _, p in INTENT_BANK]
    labels = [lab for lab, _ in INTENT_BANK]
    try:
        import numpy as np

        emb = _hf_embed([message] + phrases)
        if emb is None or len(emb) < 2:
            return None
        q = emb[0]
        bank = emb[1:]
        qn = q / (np.linalg.norm(q) + 1e-9)
        bn = bank / (np.linalg.norm(bank, axis=1, keepdims=True) + 1e-9)
        sims = bn @ qn
        idx = int(np.argmax(sims))
        if float(sims[idx]) < 0.35:
            return None
        return labels[idx]
    except Exception:
        return None


def parse_intent(
    message: str,
    history: list[dict[str, str]],
    *,
    node_id: int | None = None,
) -> dict[str, Any]:
    kw = _keyword_intent(message)
    hf = _hf_intent(message)
    intent = kw
    # Prefer HF when keyword is vague clarify/node_brief and HF is confident help/recommend.
    if hf and kw in {"clarify", "node_brief"} and hf not in {"node_brief"}:
        intent = hf
    elif hf and kw == "clarify":
        intent = hf

    # Explicit node mention this turn only (do not inherit history for off-topic checks).
    explicit_nid = (
        int(node_id)
        if node_id is not None
        else _parse_node_from_text(message, allow_bare=True)
    )

    nid = _extract_node_id(message, history, node_id)
    feature = chat_catalog.match_feature(message)
    playbook = chat_catalog.match_playbook(message)

    # If we have a node id and intent is help-only without explicit help ask, prefer node.
    help_intents = {
        "product_overview",
        "list_features",
        "feature_help",
        "howto",
    }
    if nid is not None and intent in help_intents:
        text = message.lower()
        if not any(
            k in text
            for k in ("feature", "how do", "how does", "what is warnings", "demo", "fleet")
        ):
            intent = "node_brief"

    if nid is not None and intent == "clarify":
        intent = "node_brief"

    # Off-topic: no fleet/product signal this turn → refuse clearly.
    # Do not use history node ids to "answer" unrelated chat.
    if (
        not _is_greeting(message)
        and not _is_on_topic(message)
        and explicit_nid is None
        and node_id is None
    ):
        intent = "off_topic"
        nid = None
        feature = None
        playbook = None

    return {
        "intent": intent,
        "node_id": nid,
        "feature_id": feature["id"] if feature else None,
        "playbook_id": playbook["id"] if playbook else None,
        "embedding_used": hf is not None and intent != "off_topic",
    }


def _placement_shortlist(
    exclude_node_id: int,
    seed: int | None,
    n: int = 5,
) -> list[dict[str, Any]]:
    snap = store.get_snapshot(seed).copy()
    fail_map = store.fail_rate_map()
    hist = snap["node_id"].map(lambda nid: float(fail_map.get(int(nid), 0.0)))
    fused = snap["fused_risk"].astype(float)
    anomaly = snap["anomaly_score"].astype(float)
    safety = 100.0 - fused
    normality = 100.0 - anomaly * 100.0
    history = 100.0 - hist * 100.0
    snap["placement_score"] = (0.6 * safety + 0.3 * normality + 0.1 * history).round(2)
    others = snap[snap["node_id"] != int(exclude_node_id)]
    best = others.sort_values(
        ["placement_score", "node_id"], ascending=[False, True]
    ).head(n)
    out: list[dict[str, Any]] = []
    for _, r in best.iterrows():
        out.append(
            {
                "node_id": int(r["node_id"]),
                "placement_score": round(float(r["placement_score"]), 1),
                "fused_risk": round(float(r["fused_risk"]), 1),
                "anomaly_score": round(float(r["anomaly_score"]), 4),
                "cpu_usage_pct": round(float(r["cpu_usage_pct"]), 1),
                "gpu_usage_pct": round(float(r["gpu_usage_pct"]), 1),
                "why": (
                    f"Higher placement score from low fused risk "
                    f"({float(r['fused_risk']):.1f}%) and calmer telemetry"
                ),
            }
        )
    return out


def _node_snapshot(node_id: int, seed: int | None, critical: float, watch: float) -> dict[str, Any]:
    snap = store.get_snapshot(seed)
    match = snap[snap["node_id"] == node_id]
    if match.empty:
        raise KeyError(f"Node {node_id} not found")
    row = match.iloc[0]
    fused = float(row["fused_risk"])
    health = store.status_code(fused, critical, watch)
    fail = store.hist_fail_rate(node_id)
    return {
        "node_id": node_id,
        "health": health,
        "fused_risk": round(fused, 1),
        "risk_score": round(float(row["risk_score"]), 1),
        "anomaly_score": round(float(row["anomaly_score"]), 4),
        "cpu_usage_pct": round(float(row["cpu_usage_pct"]), 1),
        "gpu_usage_pct": round(float(row["gpu_usage_pct"]), 1),
        "mem_pressure": round(float(row["mem_pressure"]), 3),
        "historical_failure_rate": round(fail, 4),
        "critical_threshold": critical,
        "watch_threshold": watch,
        "status_rule": (
            f"critical if fused_risk > {critical:.0f}; "
            f"watch if fused_risk > {watch:.0f}; else healthy"
        ),
    }


def build_context(
    *,
    intent: str,
    node_id: int | None,
    seed: int | None,
    critical: float,
    watch: float,
    feature_id: str | None = None,
    playbook_id: str | None = None,
) -> dict[str, Any]:
    sources: list[str] = []
    links: list[dict[str, str]] = []
    pack: dict[str, Any] = {
        "intent": intent,
        "thresholds": {"critical": critical, "watch": watch, "seed": seed},
    }

    help_intents = {
        "product_overview",
        "list_features",
        "feature_help",
        "howto",
    }

    if intent in help_intents or intent == "clarify":
        sources.append("catalog")
        if intent == "list_features":
            pack["catalog"] = chat_catalog.catalog_markdown(all_features=True)
            links.extend(chat_catalog.list_feature_links())
        elif intent == "product_overview":
            pack["catalog"] = chat_catalog.catalog_markdown(
                playbook_id="first_visit", all_features=True
            )
            pb = next(p for p in chat_catalog.PLAYBOOKS if p["id"] == "first_visit")
            links.extend(pb.get("links", []))
        elif intent == "feature_help":
            feat = (
                chat_catalog.feature_by_id(feature_id) if feature_id else None
            )
            if not feat:
                pack["catalog"] = chat_catalog.catalog_markdown(all_features=True)
                links.extend(chat_catalog.list_feature_links()[:8])
            else:
                pack["catalog"] = chat_catalog.catalog_markdown(
                    feature_ids=[feat["id"]]
                )
                links.append({"label": feat["title"], "path": feat["path"]})
        elif intent == "howto":
            pid = playbook_id or "safe_place"
            if not any(p["id"] == pid for p in chat_catalog.PLAYBOOKS):
                pid = "safe_place"
            pack["catalog"] = chat_catalog.catalog_markdown(playbook_id=pid)
            pb = next(p for p in chat_catalog.PLAYBOOKS if p["id"] == pid)
            links.extend(pb.get("links", []))
        else:
            pack["catalog"] = chat_catalog.catalog_markdown(
                playbook_id="first_visit", all_features=False
            )
            links.append({"label": "Fleet Overview", "path": "/app/fleet"})

    node_intents = {"node_brief", "why_status", "recommend"}

    # Always attach node pack for node intents.
    if intent in node_intents:
        if node_id is None:
            pack["error"] = "missing_node_id"
            pack["hint"] = (
                "Tell me a node number, e.g. “Node 1477” or “why is 659 critical?”."
            )
            sample = (
                store.get_snapshot(seed)
                .sort_values("fused_risk", ascending=False)
                .head(5)["node_id"]
                .astype(int)
                .tolist()
            )
            pack["sample_nodes"] = sample
            sources.append("fleet_sample")
        else:
            try:
                node = _node_snapshot(node_id, seed, critical, watch)
                pack["node"] = node
                sources.append("node")
                links.append(
                    {
                        "label": f"Open Node {node_id}",
                        "path": f"/app/nodes/{node_id}",
                    }
                )
                pack["explain"] = _cached_explain(
                    node_id, seed, critical, watch
                )
                sources.append("explain")

                if (
                    intent == "recommend"
                    or node["health"] in {"critical", "watch"}
                    or intent == "node_brief"
                ):
                    shortlist = _placement_shortlist(node_id, seed, n=5)
                    pack["placement"] = {
                        "policy": "risk_anomaly_v2",
                        "formula": "0.6*safety + 0.3*normality + 0.1*history",
                        "candidates": shortlist,
                    }
                    sources.append("placement")
                    if shortlist:
                        links.append(
                            {"label": "Job Placement", "path": "/app/placement"}
                        )
                        for c in shortlist[:2]:
                            links.append(
                                {
                                    "label": f"Node {c['node_id']}",
                                    "path": f"/app/nodes/{c['node_id']}",
                                }
                            )
            except KeyError:
                pack["error"] = "unknown_node"
                pack["hint"] = (
                    f"Node {node_id} was not found in the current fleet seed. "
                    "Try Refresh or pick another id from Fleet / Node Explorer."
                )
                sources.append("node")

    # Deduplicate links by label+path
    seen: set[str] = set()
    uniq_links: list[dict[str, str]] = []
    for link in links:
        key = f"{link['label']}|{link['path']}"
        if key in seen:
            continue
        seen.add(key)
        uniq_links.append(link)

    pack["sources"] = sources
    pack["links"] = uniq_links
    return pack


def _template_reply(context: dict[str, Any], intent: str) -> str:
    if intent == "off_topic":
        return (
            "That question is **out of scope** for ComputePulse Advisor.\n\n"
            "I only help with this product: fleet node risk, Warnings, Job Placement, "
            "the Run Demo, Cost Optimization, and how to use the app.\n\n"
            "Try something like:\n"
            "- “Node 1477”\n"
            "- “Why is it critical?”\n"
            "- “Where should it go?”\n"
            "- “How do I run the demo?”\n"
            "- “List all features”"
        )
    if context.get("error") == "missing_node_id":
        samples = context.get("sample_nodes") or []
        sample_txt = ", ".join(str(s) for s in samples[:5]) or "open Fleet Overview"
        return (
            "I can brief any fleet node. Send a node number "
            f"(for example Node {samples[0] if samples else 0}). "
            f"High-risk samples right now: {sample_txt}.\n\n"
            "I can also explain features — try “List all features” or "
            "“How does ComputePulse work?”."
        )
    if context.get("error") == "unknown_node":
        return context.get("hint") or "That node id was not found."

    parts: list[str] = []
    node = context.get("node")
    expl = context.get("explain") or {}
    placement = context.get("placement") or {}
    catalog = context.get("catalog")

    if node:
        parts.append(
            f"**Status:** Node {node['node_id']} is **{node['health']}** "
            f"(fused risk {node['fused_risk']}% · "
            f"critical>{node['critical_threshold']:.0f}, "
            f"watch>{node['watch_threshold']:.0f})."
        )
        reasons = expl.get("shap_reasons") or []
        if reasons or intent in {"why_status", "node_brief", "recommend"}:
            why = ", ".join(reasons[:4]) if reasons else "overall elevated risk signals"
            parts.append(
                f"**Why:** {why}. "
                f"Metrics — CPU {node['cpu_usage_pct']}% · "
                f"GPU {node['gpu_usage_pct']}% · "
                f"mem pressure {node['mem_pressure']} · "
                f"anomaly {node['anomaly_score']} · "
                f"historical failure rate {node['historical_failure_rate']}."
            )
            if expl.get("summary"):
                parts.append(f"**Brief:** {expl['summary']}")

        cands = placement.get("candidates") or []
        if cands and (
            intent == "recommend" or node["health"] in {"critical", "watch"}
        ):
            lines = []
            for c in cands[:5]:
                lines.append(
                    f"- Node {c['node_id']} (score {c['placement_score']}, "
                    f"fused {c['fused_risk']}%) — {c['why']}"
                )
            parts.append(
                "**Recommend:** Prefer these safer hosts "
                f"(formula {placement.get('formula')}):\n" + "\n".join(lines)
            )

    if catalog:
        if intent == "list_features":
            parts.append("**All features**\n" + catalog)
        elif intent == "product_overview":
            parts.append("**How ComputePulse works**\n" + catalog)
        elif intent in {"feature_help", "howto", "clarify"} and not node:
            parts.append(catalog)

    if not parts:
        parts.append(
            "I help with fleet nodes and product guidance. "
            "Try “Node 1477”, “List all features”, or “How do I run the demo?”."
        )

    parts.append(
        "_Caveat: grounded in model outputs and the product catalog — "
        "not a live remediation order._"
    )
    return "\n\n".join(parts)


def _system_prompt() -> str:
    return (
        "You are ComputePulse Advisor — a fleet node analyst and product guide. "
        "Use ONLY facts in the frozen context pack. Do not invent node ids, "
        "percentages, features, or routes. "
        "If the intent is off_topic or the user asks about anything outside "
        "ComputePulse (weather, sports, general knowledge, other products), "
        "politely say the question is irrelevant / out of scope and redirect "
        "to fleet nodes, Warnings, Placement, Demo, or product how-to. "
        "For node questions use sections: Status, Why, Recommend (if candidates "
        "exist), Caveat. "
        "For product help use clear steps and mention paths exactly as given. "
        "Keep answers concise and professional. If context has an error field, "
        "explain it and ask for a valid node id or feature question."
    )


def chat(
    message: str,
    *,
    history: list[dict[str, str]] | None = None,
    seed: int | None = None,
    critical: float = 70.0,
    watch: float = 40.0,
    node_id: int | None = None,
) -> dict[str, Any]:
    store.ensure_loaded()
    history = history or []
    parsed = parse_intent(message, history, node_id=node_id)
    intent = parsed["intent"]
    nid = parsed["node_id"]

    # Mixed: node + recommend wording (never for off-topic)
    text_l = message.lower()
    if intent != "off_topic" and nid is not None and any(
        k in text_l for k in ("where", "recommend", "safer", "place")
    ):
        intent = "recommend"
    if (
        intent != "off_topic"
        and nid is not None
        and any(k in text_l for k in ("why", "risk", "critical", "watch", "healthy"))
        and intent == "node_brief"
    ):
        intent = "why_status"

    # Resolve feature/playbook if help
    feature_id = parsed.get("feature_id")
    playbook_id = parsed.get("playbook_id")
    if intent == "feature_help" and not feature_id:
        feat = chat_catalog.match_feature(message)
        feature_id = feat["id"] if feat else None
    if intent == "howto" and not playbook_id:
        pb = chat_catalog.match_playbook(message)
        playbook_id = pb["id"] if pb else "safe_place"
    if intent == "product_overview":
        playbook_id = "first_visit"

    use_seed = store.refresh_seed if seed is None else seed
    if intent == "off_topic":
        context: dict[str, Any] = {
            "intent": "off_topic",
            "links": [
                {"label": "Fleet Overview", "path": "/app/fleet"},
                {"label": "Run Demo", "path": "/app/demo"},
                {"label": "Warnings", "path": "/app/warnings"},
            ],
            "sources": ["scope"],
        }
        template = _template_reply(context, intent)
        # Do not call the LLM for off-topic — keep the refusal grounded.
        reply = template
        llm_used = False
        recommendation = None
        node: dict[str, Any] = {}
        providers = {"llm": None, "embeddings": None}
    else:
        context = build_context(
            intent=intent,
            node_id=nid,
            seed=use_seed,
            critical=critical,
            watch=watch,
            feature_id=feature_id,
            playbook_id=playbook_id,
        )

        template = _template_reply(context, intent)
        user_prompt = (
            f"User message:\n{message}\n\n"
            f"Frozen context pack (JSON-like):\n{context}\n\n"
            f"Template answer (keep the same facts; improve clarity):\n{template}\n"
        )
        llm_text = _groq_chat(_system_prompt(), user_prompt)
        llm_used = llm_text is not None
        reply = llm_text if llm_text else template

        node = context.get("node") or {}
        placement = context.get("placement") or {}
        cands = placement.get("candidates") or []
        recommendation = None
        if cands:
            recommendation = {
                "target_node_ids": [c["node_id"] for c in cands[:5]],
                "why": (
                    "Ranked by placement score (safety 60% + normality 30% + history 10%)."
                ),
                "candidates": cands[:5],
            }

        providers = {
            "llm": "groq" if llm_used else None,
            "embeddings": (
                "huggingface"
                if parsed.get("embedding_used")
                or (context.get("explain") or {}).get("providers", {}).get("embeddings")
                == "huggingface"
                else None
            ),
        }

    store.append_shadow(
        {
            "event": "chat",
            "intent": intent,
            "node_id": nid,
            "llm_used": llm_used,
            "seed": use_seed,
            "critical": critical,
            "watch": watch,
        }
    )

    return {
        "reply": reply,
        "intent": intent,
        "node_id": nid,
        "health": node.get("health"),
        "links": context.get("links") or [],
        "recommendation": recommendation,
        "sources": context.get("sources") or [],
        "providers": providers,
        "llm_used": llm_used,
        "caveat": (
            "Grounded in model outputs and the product catalog; "
            "not a live remediation order."
        ),
        "context_error": context.get("error"),
    }


