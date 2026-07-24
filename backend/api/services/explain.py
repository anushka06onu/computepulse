"""Grounded explain briefs: template + optional HF neighbors + Groq rewrite."""

from __future__ import annotations

import os
import time
from typing import Any

import numpy as np
import pandas as pd

from api.services.store import FEATURES, ROOT, store

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:
    pass


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _timeout() -> float:
    try:
        return float(_env("EXPLAIN_TIMEOUT_S", "8") or "8")
    except ValueError:
        return 8.0


def _node_card(node_id: int, risk: float, fail: float, reasons: list[str], row: pd.Series) -> str:
    top = "; ".join(reasons[:3]) if reasons else "n/a"
    return (
        f"node={node_id}; risk={risk:.1f}; fail_rate={fail:.3f}; "
        f"top_shap={top}; gpu={float(row['gpu_usage_pct']):.1f}; "
        f"cpu={float(row['cpu_usage_pct']):.1f}; mem={float(row['mem_pressure']):.3f}"
    )


def template_summary(
    node_id: int,
    health: str,
    fused: float,
    reasons: list[str],
) -> str:
    drivers = ", ".join(reasons[:3]) if reasons else "overall elevated risk"
    return (
        f"Node {node_id} is {health} (risk score {fused:.1f}%). "
        f"Main drivers: {drivers}."
    )


def _sklearn_neighbors(
    query_row: pd.Series, k: int = 3
) -> list[dict[str, Any]]:
    assert store.data is not None and store.model is not None
    failed = store.data[store.data["will_fail"] == 1]
    if failed.empty:
        return []
    bank = failed.sample(n=min(2000, len(failed)), random_state=42)
    q = query_row[FEATURES].astype(float).to_numpy()
    X = bank[FEATURES].astype(float).to_numpy()
    # Standardize lightly
    mu = X.mean(axis=0)
    sd = X.std(axis=0) + 1e-9
    d = np.linalg.norm((X - mu) / sd - (q - mu) / sd, axis=1)
    idx = np.argsort(d)[:k]
    out = []
    for i in idx:
        r = bank.iloc[int(i)]
        nid = int(r["node_id"])
        feat = r[FEATURES].astype(float).to_frame().T
        risk = float(store.model.predict_proba(feat)[0, 1] * 100)
        hist = store.hist_fail_rate(nid)
        out.append(
            {
                "node_id": nid,
                "risk_score": round(risk, 2),
                "historical_failure_rate": round(hist, 4),
                "distance": round(float(d[int(i)]), 4),
            }
        )
    return out


def _hf_embed(texts: list[str]) -> np.ndarray | None:
    token = _env("HF_TOKEN")
    if not token:
        return None
    model = _env("HF_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    try:
        import httpx

        headers = {"Authorization": f"Bearer {token}"}
        urls = [
            f"https://router.huggingface.co/hf-inference/models/{model}/pipeline/feature-extraction",
            f"https://api-inference.huggingface.co/pipeline/feature-extraction/{model}",
            f"https://api-inference.huggingface.co/models/{model}",
        ]
        payload = {"inputs": texts, "options": {"wait_for_model": True}}
        with httpx.Client(timeout=_timeout()) as client:
            data = None
            for url in urls:
                try:
                    r = client.post(url, headers=headers, json=payload)
                    if r.status_code >= 400:
                        continue
                    data = r.json()
                    break
                except Exception:
                    continue
            if data is None:
                return None
        arr = np.array(data, dtype=float)
        if arr.ndim == 3:
            arr = arr.mean(axis=1)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        return arr
    except Exception:
        return None


def _neighbors_hf_or_sklearn(query_row: pd.Series, query_card: str, k: int = 3):
    assert store.data is not None
    failed = store.data[store.data["will_fail"] == 1]
    if failed.empty:
        return [], False
    bank = failed.sample(n=min(400, len(failed)), random_state=7).reset_index(drop=True)
    cards = []
    for _, r in bank.iterrows():
        nid = int(r["node_id"])
        feat = r[FEATURES].astype(float).to_frame().T
        risk = float(store.model.predict_proba(feat)[0, 1] * 100)
        hist = store.hist_fail_rate(nid)
        cards.append(_node_card(nid, risk, hist, [], r))

    emb = _hf_embed([query_card] + cards)
    if emb is None or len(emb) != len(cards) + 1:
        return _sklearn_neighbors(query_row, k=k), False

    q = emb[0]
    M = emb[1:]
    # cosine similarity
    qn = q / (np.linalg.norm(q) + 1e-9)
    Mn = M / (np.linalg.norm(M, axis=1, keepdims=True) + 1e-9)
    sims = Mn @ qn
    idx = np.argsort(-sims)[:k]
    out = []
    for i in idx:
        r = bank.iloc[int(i)]
        nid = int(r["node_id"])
        feat = r[FEATURES].astype(float).to_frame().T
        risk = float(store.model.predict_proba(feat)[0, 1] * 100)
        hist = store.hist_fail_rate(nid)
        out.append(
            {
                "node_id": nid,
                "risk_score": round(risk, 2),
                "historical_failure_rate": round(hist, 4),
                "similarity": round(float(sims[int(i)]), 4),
            }
        )
    return out, True


def _groq_rewrite(payload: dict[str, Any], template: str) -> str | None:
    key = _env("GROQ_API_KEY")
    if not key:
        return None
    model = _env("GROQ_MODEL", "llama-3.1-8b-instant")
    system = (
        "You rewrite cluster-node risk briefs. Use ONLY numbers already written "
        "in the template brief. Do not invent metrics, attach scores to SHAP "
        "reason names, dollars, or actions. Keep under 50 words. "
        "Start with the node id and health."
    )
    user = (
        f"Frozen payload (context only):\n{payload}\n\n"
        f"Template brief (rewrite this; keep the same numbers):\n{template}\n"
    )
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
                    "max_tokens": 180,
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


def explain_node(
    node_id: int,
    seed: int | None = None,
    critical: float = 70,
    watch: float = 40,
    *,
    rich: bool = True,
) -> dict[str, Any]:
    store.ensure_loaded()
    snap = store.get_snapshot(seed)
    match = snap[snap["node_id"] == node_id]
    if match.empty:
        raise KeyError(f"Node {node_id} not found")
    row = match.iloc[0]
    risk = float(row["risk_score"])
    anomaly = float(row["anomaly_score"])
    fused = float(row["fused_risk"])
    health = store.status_code(fused, critical, watch)
    fail = store.hist_fail_rate(node_id)
    reasons = store.shap_reasons(row, failure_rate=fail)

    t0 = time.time()
    neighbors: list[dict[str, Any]] = []
    embedding_used = False
    llm_used = False
    summary = template_summary(node_id, health, fused, reasons)

    frozen = {
        "node_id": node_id,
        "risk_score": round(risk, 2),
        "anomaly_score": round(anomaly, 4),
        "fused_risk": round(fused, 2),
        "historical_failure_rate": round(fail, 4),
        "health": health,
        "shap_reasons": reasons,
        "model_version": store.model_version,
    }

    if rich:
        card = _node_card(node_id, risk, fail, reasons, row)
        neighbors, embedding_used = _neighbors_hf_or_sklearn(row, card, k=3)
        llm_text = _groq_rewrite(frozen, summary)
        llm_used = llm_text is not None
        if llm_text:
            summary = llm_text

    providers = {
        "llm": "groq" if llm_used else None,
        "embeddings": (
            "huggingface" if embedding_used else ("sklearn" if rich else None)
        ),
    }

    return {
        "summary": summary,
        "shap_reasons": reasons,
        "neighbors": neighbors,
        "caveat": (
            "Explanation restates model outputs; not a live remediation order."
        ),
        "llm_used": llm_used,
        "embedding_used": embedding_used,
        "providers": providers,
        "payload": frozen,
        "elapsed_ms": int((time.time() - t0) * 1000),
    }
