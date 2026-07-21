"""Operator Warning Agent — triage existing scores into alert briefs."""

from __future__ import annotations

from typing import Any

from api.services.explain import explain_node, template_summary
from api.services.store import health_status, store

SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}
EXPLAIN_BUDGET = 5
ECE_WARN = 0.05
CAVEAT = "Projected advice — not a live move"


def _alert_id(atype: str, key: str, seed: int) -> str:
    return f"{atype}:{key}:seed{seed}"



def _placement_rankings(snap) -> list[tuple[int, float]]:
    """Precompute placement scores once for the snapshot."""
    assert store.data is not None
    fail_map = store.data.groupby("node_id")["will_fail"].mean().to_dict()
    ranked: list[tuple[int, float]] = []
    for _, r in snap.iterrows():
        nid = int(r["node_id"])
        hist = float(fail_map.get(nid, 0.0))
        sc = store.placement_score(
            float(r["fused_risk"]), float(r["anomaly_score"]), hist
        )
        ranked.append((nid, sc))
    ranked.sort(key=lambda x: -x[1])
    return ranked


def _rec_from_rankings(
    ranked: list[tuple[int, float]], exclude_id: int | None = None
) -> dict[str, Any] | None:
    for nid, sc in ranked:
        if exclude_id is not None and nid == exclude_id:
            continue
        return {
            "kind": "place_elsewhere",
            "target_node_id": nid,
            "placement_score": sc,
            "caveat": CAVEAT,
        }
    return None


def _node_alert(
    *,
    atype: str,
    severity: str,
    row,
    seed: int,
    critical: float,
    watch: float,
    title: str,
    recommendation: dict[str, Any] | None,
    light: bool = False,
) -> dict[str, Any]:
    nid = int(row["node_id"])
    risk = float(row["risk_score"])
    anomaly = float(row["anomaly_score"])
    fused = float(row["fused_risk"])
    health = store.status_code(fused, critical, watch)
    if light:
        reasons: list[str] = []
        summary = f"Node {nid} is {health} (fused risk {fused:.1f}%)."
    else:
        fail = store.hist_fail_rate(nid)
        reasons = store.shap_reasons(row, failure_rate=fail)
        summary = template_summary(nid, health, fused, reasons)
    return {
        "id": _alert_id(atype, str(nid), seed),
        "type": atype,
        "severity": severity,
        "node_id": nid,
        "scores": {
            "risk": round(risk, 2),
            "anomaly": round(anomaly, 4),
            "fused": round(fused, 2),
            "risk_percentile": round(float(row["risk_percentile"]), 2),
            "fleet_rank": int(row["fleet_rank"]),
        },
        "title": title,
        "summary": summary,
        "reasons": reasons,
        "neighbors": [],
        "recommendation": recommendation,
        "providers": {"llm": None, "embeddings": None},
        "model_version": store.model_version,
        "llm_used": False,
        "embedding_used": False,
        "caveat": (
            "Explanation restates model outputs; not a live remediation order."
        ),
    }


def _enrich_with_explain(
    alert: dict[str, Any],
    seed: int,
    critical: float,
    watch: float,
    *,
    rich: bool,
) -> dict[str, Any]:
    nid = alert.get("node_id")
    if nid is None:
        return alert
    try:
        brief = explain_node(
            int(nid), seed=seed, critical=critical, watch=watch, rich=rich
        )
    except Exception:
        return alert
    alert["summary"] = brief["summary"]
    alert["reasons"] = brief["shap_reasons"]
    alert["neighbors"] = brief.get("neighbors") or []
    alert["providers"] = brief.get("providers") or alert["providers"]
    alert["llm_used"] = bool(brief.get("llm_used"))
    alert["embedding_used"] = bool(brief.get("embedding_used"))
    alert["caveat"] = brief.get("caveat", alert["caveat"])
    return alert


def scan_warnings(
    seed: int | None = None,
    critical: float = 70,
    watch: float = 40,
    *,
    explain_budget: int = EXPLAIN_BUDGET,
    log_shadow: bool = False,
    include_forecast: bool = True,
) -> dict[str, Any]:
    store.ensure_loaded()
    use_seed = store.refresh_seed if seed is None else seed
    snap = store.get_snapshot(use_seed)
    drift = store.drift_psi(snap)
    meta = store.meta()
    alerts: list[dict[str, Any]] = []

    place_ranked = _placement_rankings(snap)
    place_rec = _rec_from_rankings(place_ranked)

    # --- node_critical / node_watch (cap volume for inbox usability) ---
    critical_rows = []
    watch_rows = []
    for _, r in snap.iterrows():
        fused = float(r["fused_risk"])
        health = store.status_code(fused, critical, watch)
        pct = float(r["risk_percentile"])
        if health == "critical":
            critical_rows.append(r)
        elif health == "watch" and pct >= 90:
            watch_rows.append(r)
    critical_rows.sort(key=lambda r: -float(r["fused_risk"]))
    watch_rows.sort(key=lambda r: -float(r["fused_risk"]))

    light = True  # always skip SHAP on scan; explain budget enriches top alerts

    for r in critical_rows[:25]:
        nid = int(r["node_id"])
        rec = _rec_from_rankings(place_ranked, exclude_id=nid) or place_rec
        alerts.append(
            _node_alert(
                atype="node_critical",
                severity="high",
                row=r,
                seed=use_seed,
                critical=critical,
                watch=watch,
                title=f"Node {nid} critical",
                recommendation=rec,
                light=light,
            )
        )
    for r in watch_rows[:15]:
        nid = int(r["node_id"])
        rec = _rec_from_rankings(place_ranked, exclude_id=nid) or place_rec
        alerts.append(
            _node_alert(
                atype="node_watch",
                severity="medium",
                row=r,
                seed=use_seed,
                critical=critical,
                watch=watch,
                title=f"Node {nid} watch (top percentile)",
                recommendation=rec,
                light=light,
            )
        )

    # --- forecast_rising (small budget: watch band only) ---
    if include_forecast and explain_budget > 0:
        forecast_pool = snap[
            (snap["fused_risk"] < critical)
            & (snap["fused_risk"] >= max(0.0, watch - 15))
        ].sort_values("fused_risk", ascending=False).head(5)
        for _, r in forecast_pool.iterrows():
            nid = int(r["node_id"])
            timeline = store.node_timeline(nid, limit=10)
            observed = [p for p in timeline if p.get("risk_score") is not None]
            forecasts = [
                p["forecast_risk"]
                for p in timeline
                if p.get("forecast_risk") is not None
            ]
            if not observed or not forecasts:
                continue
            last_risk = float(observed[-1]["risk_score"])
            max_fc = max(float(x) for x in forecasts)
            if last_risk < watch and max_fc >= watch:
                sev = "high" if max_fc >= critical else "medium"
                rec = _rec_from_rankings(place_ranked, exclude_id=nid) or place_rec
                alert = _node_alert(
                    atype="forecast_rising",
                    severity=sev,
                    row=r,
                    seed=use_seed,
                    critical=critical,
                    watch=watch,
                    title=f"Node {nid} forecast rising to {max_fc:.0f}%",
                    recommendation=rec,
                    light=True,
                )
                alert["scores"]["forecast_peak"] = round(max_fc, 2)
                alert["summary"] = (
                    f"Node {nid} last risk {last_risk:.1f}% but forecast peaks at "
                    f"{max_fc:.1f}% (watch={watch:.0f}, critical={critical:.0f})."
                )
                alerts.append(alert)

    # --- drift_high ---
    if drift.get("high"):
        alerts.append(
            {
                "id": _alert_id("drift_high", "fleet", use_seed),
                "type": "drift_high",
                "severity": "medium",
                "node_id": None,
                "scores": {"psi": drift.get("psi"), "threshold": drift.get("threshold")},
                "title": "Feature drift elevated",
                "summary": drift.get("message")
                or (
                    f"Snapshot feature distribution diverges from training "
                    f"(PSI≈{drift.get('psi')})."
                ),
                "reasons": [
                    f"{k}={v}"
                    for k, v in sorted(
                        (drift.get("by_feature") or {}).items(),
                        key=lambda x: -x[1],
                    )[:5]
                ],
                "neighbors": [],
                "recommendation": {
                    "kind": "review_model",
                    "target_node_id": None,
                    "placement_score": None,
                    "caveat": CAVEAT,
                },
                "providers": {"llm": None, "embeddings": None},
                "model_version": store.model_version,
                "llm_used": False,
                "embedding_used": False,
                "caveat": CAVEAT,
            }
        )

    # --- unsafe_reclaim ---
    if store.optimization is not None:
        fused_map = {
            int(r["node_id"]): float(r["fused_risk"]) for _, r in snap.iterrows()
        }
        opp = (
            store.optimization[store.optimization["is_underutilized"]]
            .sort_values("estimated_savings_usd", ascending=False)
            .head(30)
        )
        for _, r in opp.head(12).iterrows():
            nid = int(r["node_id"])
            fused = fused_map.get(nid)
            if fused is None or fused < watch:
                continue
            savings = float(r["estimated_savings_usd"])
            alerts.append(
                {
                    "id": _alert_id("unsafe_reclaim", str(nid), use_seed),
                    "type": "unsafe_reclaim",
                    "severity": "medium",
                    "node_id": nid,
                    "scores": {
                        "fused": round(fused, 2),
                        "estimated_savings_usd": round(savings, 1),
                        "avg_gpu_usage_pct": round(float(r["avg_gpu_usage_pct"]), 2),
                    },
                    "title": f"Node {nid}: investigate before reclaim",
                    "summary": (
                        f"Node {nid} looks underutilized (${savings:.0f} est.) but "
                        f"fused risk {fused:.1f}% ≥ watch {watch:.0f}% — "
                        f"policy safe_reclaim_v1 says investigate, not reclaim."
                    ),
                    "reasons": ["High fused risk on idle-looking node"],
                    "neighbors": [],
                    "recommendation": {
                        "kind": "investigate",
                        "target_node_id": nid,
                        "placement_score": None,
                        "caveat": (
                            "$ figures assumed at $2.50/GPU-hour — not Alibaba ground truth. "
                            + CAVEAT
                        ),
                    },
                    "providers": {"llm": None, "embeddings": None},
                    "model_version": store.model_version,
                    "llm_used": False,
                    "embedding_used": False,
                    "caveat": CAVEAT,
                }
            )

    # --- model_trust ---
    ready = health_status()
    ece = float(store.eval_report.get("ece", 0) or 0)
    if not ready.get("ready"):
        missing = ", ".join(m["file"] for m in ready.get("missing", [])[:5])
        alerts.append(
            {
                "id": _alert_id("model_trust", "artifacts", use_seed),
                "type": "model_trust",
                "severity": "medium",
                "node_id": None,
                "scores": {},
                "title": "ML artifacts incomplete",
                "summary": f"Pipeline not ready. Missing: {missing or 'unknown'}.",
                "reasons": [m["command"] for m in ready.get("missing", [])[:5]],
                "neighbors": [],
                "recommendation": {
                    "kind": "fix_artifacts",
                    "target_node_id": None,
                    "placement_score": None,
                    "caveat": CAVEAT,
                },
                "providers": {"llm": None, "embeddings": None},
                "model_version": store.model_version,
                "llm_used": False,
                "embedding_used": False,
                "caveat": CAVEAT,
            }
        )
    elif ece >= ECE_WARN:
        alerts.append(
            {
                "id": _alert_id("model_trust", "ece", use_seed),
                "type": "model_trust",
                "severity": "low",
                "node_id": None,
                "scores": {"ece": round(ece, 4)},
                "title": "Calibration ECE elevated",
                "summary": (
                    f"Holdout ECE={ece:.4f} ≥ {ECE_WARN}. Risk percentages may be "
                    f"miscalibrated — trust Evidence before aggressive thresholds."
                ),
                "reasons": [f"ece={ece:.4f}"],
                "neighbors": [],
                "recommendation": {
                    "kind": "review_evidence",
                    "target_node_id": None,
                    "placement_score": None,
                    "caveat": CAVEAT,
                },
                "providers": {"llm": None, "embeddings": None},
                "model_version": store.model_version,
                "llm_used": False,
                "embedding_used": False,
                "caveat": CAVEAT,
            }
        )

    # Rank: severity then fused score
    def sort_key(a: dict[str, Any]) -> tuple:
        sev = SEVERITY_RANK.get(a.get("severity", "low"), 9)
        fused = float((a.get("scores") or {}).get("fused") or 0)
        return (sev, -fused)

    alerts.sort(key=sort_key)

    # Explain budget: only enrich top-N with rich=True. Never SHAP the whole inbox.
    budget_left = explain_budget
    if budget_left > 0:
        for i, alert in enumerate(alerts):
            if budget_left <= 0:
                break
            if alert.get("node_id") is None:
                continue
            if alert["type"] in ("drift_high", "model_trust", "unsafe_reclaim"):
                continue
            if alert["severity"] not in ("high", "medium"):
                continue
            alerts[i] = _enrich_with_explain(
                alert, use_seed, critical, watch, rich=True
            )
            budget_left -= 1

    counts = {
        "total": len(alerts),
        "high": sum(1 for a in alerts if a["severity"] == "high"),
        "medium": sum(1 for a in alerts if a["severity"] == "medium"),
        "low": sum(1 for a in alerts if a["severity"] == "low"),
        "by_type": {},
    }
    for a in alerts:
        t = a["type"]
        counts["by_type"][t] = counts["by_type"].get(t, 0) + 1

    if log_shadow:
        store.append_shadow(
            {
                "event": "warning_scan",
                "seed": use_seed,
                "total": counts["total"],
                "high": counts["high"],
                "types": counts["by_type"],
            }
        )

    return {
        "seed": use_seed,
        "critical": critical,
        "watch": watch,
        "counts": counts,
        "drift": drift,
        "model_version": meta["model_version"],
        "fusion": meta["fusion"],
        "explain_budget": explain_budget,
        "alerts": alerts,
        "caveat": (
            "Operator Warning Agent triages model scores only — not a live "
            "scheduler or remediation system."
        ),
    }


def counts_only(
    seed: int | None = None,
    critical: float = 70,
    watch: float = 40,
) -> dict[str, Any]:
    """Fast badge path — no SHAP, forecast, or explain."""
    result = scan_warnings(
        seed=seed,
        critical=critical,
        watch=watch,
        explain_budget=0,
        log_shadow=False,
        include_forecast=False,
    )
    return {
        "seed": result["seed"],
        "counts": result["counts"],
        "model_version": result["model_version"],
    }


def get_alert(
    alert_id: str,
    seed: int | None = None,
    critical: float = 70,
    watch: float = 40,
    *,
    rich: bool = True,
) -> dict[str, Any] | None:
    # Skip forecast timelines on detail lookup path for speed; re-attach rich explain only.
    result = scan_warnings(
        seed=seed,
        critical=critical,
        watch=watch,
        explain_budget=0,
        log_shadow=False,
        include_forecast=False,
    )
    for alert in result["alerts"]:
        if alert["id"] == alert_id:
            if alert.get("node_id") is not None and rich:
                alert = _enrich_with_explain(
                    alert, result["seed"], critical, watch, rich=True
                )
            store.append_shadow(
                {
                    "event": "warning_open",
                    "alert_id": alert_id,
                    "type": alert["type"],
                    "node_id": alert.get("node_id"),
                    "seed": result["seed"],
                }
            )
            return {
                **alert,
                "seed": result["seed"],
                "fleet_caveat": result["caveat"],
            }
    return None
