"""Daily Action Brief — join Model 1/2/3 into one ranked plan.

Scores the REAL fleet (all ~1,728 system nodes from the shared snapshot):
  Model 1 — failure risk (LightGBM artifact, already scored in the snapshot)
  Model 2 — placement view (historical fail rate + live placement score)
  Model 3 — idle-GPU reclaim (util < 15%, $2.50/GPU-hour assumption)

Ranking, conflict detection, and SHAP reason lines live here, separated from
UI rendering. No model training runs inside a request.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from api.services.brief_telemetry import build_brief_telemetry

FEATURES = [
    "task_role",
    "cpu_usage_pct",
    "gpu_usage_pct",
    "mem_pressure",
    "gpu_mem_pressure",
    "cpu_gpu_ratio",
    "io_bytes_total",
    "io_ops_total",
    "avg_io_size",
]

FEATURE_PHRASES = {
    "cpu_usage_pct": "CPU utilization is abnormally high",
    "gpu_usage_pct": "GPU utilization is unusually low",
    "mem_pressure": "memory pressure has spiked",
    "gpu_mem_pressure": "GPU memory pressure is elevated",
    "cpu_gpu_ratio": "CPU-to-GPU load is severely imbalanced",
    "io_bytes_total": "disk I/O volume is excessive",
    "io_ops_total": "I/O operation count is abnormally high",
    "avg_io_size": "average I/O request size is unusually large",
    "task_role": "the workload type carries inherently higher risk",
}

# Same documented assumption as Module 3 — not from the Alibaba trace.
GPU_HOUR_USD = 2.50
IDLE_WINDOW_HOURS = 72.0  # morning brief looks at ~3 days of idle capacity

# Priority blend across the three model voices.
W_RISK, W_PLACEMENT, W_SAVINGS = 0.45, 0.30, 0.25

# Conflict thresholds (documented in docs/DESIGN_NOTES.md).
RISK_HIGH = 60.0
PLACEMENT_SAFE_BELOW = 20.0
PLACEMENT_RISKY_ABOVE = 50.0
IDLE_GPU_BELOW = 15.0


def _score_three_models(df: pd.DataFrame, store: Any) -> pd.DataFrame:
    """Attach Model 2/3 views to the real, already-scored snapshot rows."""
    out = df.copy()

    # Model 2 — placement: historical failure rate per real node (0–100 view)
    fail_map = store.fail_rate_map()
    hist_fail = out["node_id"].astype(int).map(
        lambda n: float(fail_map.get(int(n), 0.0))
    )
    out["hist_fail_rate"] = hist_fail
    out["avg_risk_score"] = (hist_fail * 100.0).clip(0, 100)
    out["placement_safe"] = out["avg_risk_score"] < PLACEMENT_SAFE_BELOW
    out["placement_score"] = [
        store.placement_score(float(f), float(a), float(h))
        for f, a, h in zip(
            out["fused_risk"], out["anomaly_score"], out["hist_fail_rate"]
        )
    ]

    # Model 3 — idle GPU / savings estimate
    gpu = out["gpu_usage_pct"].astype(float)
    out["is_underutilized"] = gpu < IDLE_GPU_BELOW
    idle_frac = (100.0 - gpu).clip(lower=0) / 100.0
    out["estimated_savings_usd"] = np.where(
        out["is_underutilized"],
        idle_frac * IDLE_WINDOW_HOURS * GPU_HOUR_USD,
        0.0,
    )
    return out


def compute_priority_scores(df: pd.DataFrame) -> pd.DataFrame:
    """Merge three model voices into one priority (0–100) and rank."""
    out = df.copy()

    risk_norm = out["risk_score"].astype(float) / 100.0
    place_norm = out["avg_risk_score"].astype(float) / 100.0
    sav_max = float(out["estimated_savings_usd"].max() or 0.0)
    if sav_max > 0:
        sav_norm = out["estimated_savings_usd"].astype(float) / sav_max
    else:
        sav_norm = risk_norm * 0.0

    out["priority_score"] = (
        W_RISK * risk_norm + W_PLACEMENT * place_norm + W_SAVINGS * sav_norm
    ) * 100.0
    return out.sort_values("priority_score", ascending=False)


def detect_conflicts(
    df: pd.DataFrame, limit: int | None = None
) -> list[dict[str, Any]]:
    """Flag every real node where two models disagree (full-fleet scan)."""
    conflicts: list[dict[str, Any]] = []
    if df.empty:
        return conflicts

    risk = df["risk_score"].astype(float)
    place = df["avg_risk_score"].astype(float)
    idle = df["is_underutilized"].astype(bool)
    safe = df["placement_safe"].astype(bool)

    masks = [
        (
            (risk > RISK_HIGH) & safe,
            "Risk vs Placement",
            "high",
            "Model 1 — Failure Risk",
            "Model 2 — Placement",
            lambda r: f"{r['risk_score']:.0f}% failure risk now — avoid this node",
            lambda r: (
                f"Historical failure rate {r['avg_risk_score']:.0f}% — "
                "record says safe to place jobs"
            ),
        ),
        (
            (risk > RISK_HIGH) & idle,
            "Risk vs Idle GPU",
            "high",
            "Model 1 — Failure Risk",
            "Model 3 — GPU Savings",
            lambda r: f"{r['risk_score']:.0f}% failure risk — node is struggling",
            lambda r: (
                f"GPU at {r['gpu_usage_pct']:.0f}% util — underutilized, "
                f"est. ${r['estimated_savings_usd']:,.0f} reclaim"
            ),
        ),
        (
            (place > PLACEMENT_RISKY_ABOVE) & idle,
            "Placement vs Idle GPU",
            "medium",
            "Model 2 — Placement",
            "Model 3 — GPU Savings",
            lambda r: (
                f"Historical failure rate {r['avg_risk_score']:.0f}% — "
                "avoid placing new jobs here"
            ),
            lambda r: (
                f"GPU at {r['gpu_usage_pct']:.0f}% — "
                "consolidate or reclaim idle capacity"
            ),
        ),
    ]

    for mask, ctype, severity, ma, mb, sa, sb in masks:
        hits = df.loc[mask]
        for _, row in hits.iterrows():
            conflicts.append(
                {
                    "node_id": int(row["node_id"]),
                    "type": ctype,
                    "model_a": ma,
                    "model_a_says": sa(row),
                    "model_b": mb,
                    "model_b_says": sb(row),
                    "severity": severity,
                    "risk_score": round(float(row["risk_score"]), 2),
                    "avg_risk_score": round(float(row["avg_risk_score"]), 2),
                    "gpu_usage_pct": round(float(row["gpu_usage_pct"]), 2),
                    "estimated_savings_usd": round(
                        float(row["estimated_savings_usd"]), 2
                    ),
                    "is_underutilized": bool(row["is_underutilized"]),
                    "priority_score": round(float(row["priority_score"]), 2),
                }
            )
            if limit is not None and len(conflicts) >= limit:
                return conflicts
    conflicts.sort(key=lambda c: float(c.get("priority_score") or 0), reverse=True)
    return conflicts


def severity_for(row: pd.Series, has_conflict: bool) -> tuple[str, str]:
    """(severity, tone) for UI pips. Conflict always amber-tagged."""
    if has_conflict:
        return "conflict", "watch"
    p = float(row["priority_score"])
    if p >= 60 or float(row["risk_score"]) > 70:
        return "high", "critical"
    if p >= 35 or float(row["risk_score"]) > 40:
        return "medium", "watch"
    return "low", "healthy"


def _reason_from_impacts(local_shap: np.ndarray) -> str:
    abs_impacts = np.abs(local_shap)
    top_idx = int(np.argmax(abs_impacts))
    top_feature = FEATURES[top_idx]
    top_impact = float(local_shap[top_idx])
    human_phrase = FEATURE_PHRASES.get(top_feature, top_feature)
    direction = "pushing risk up" if top_impact > 0 else "reducing risk"
    return (
        f"Flagged because {human_phrase} "
        f"({direction}; top SHAP feature: {top_feature}, impact {top_impact:+.2f})."
    )


def get_shap_reasons_batch(top_df: pd.DataFrame, explainer: Any) -> list[str]:
    """One SHAP call for the whole top-N frame (much faster than per-row)."""
    if top_df.empty:
        return []
    X = top_df[FEATURES].astype(float)
    shap_vals = explainer.shap_values(X)
    if isinstance(shap_vals, list):
        matrix = np.asarray(shap_vals[1])
    else:
        matrix = np.asarray(shap_vals)
    if matrix.ndim == 1:
        matrix = matrix.reshape(1, -1)
    return [_reason_from_impacts(matrix[i]) for i in range(len(top_df))]


def assign_action(
    row: pd.Series, conflicts_by_node: dict[int, list[dict[str, Any]]]
) -> str:
    node = int(row["node_id"])
    if node in conflicts_by_node:
        return f"Resolve conflict on Node-{node} — models disagree; review both views"
    if float(row["risk_score"]) > 70:
        return f"Migrate jobs off Node-{node} — failure risk critically high"
    if float(row["risk_score"]) > 40:
        return f"Monitor Node-{node} closely — failure risk is elevated"
    if bool(row["is_underutilized"]) and float(row["estimated_savings_usd"]) > 50:
        return (
            f"Reclaim capacity on Node-{node} — "
            f"est. ${row['estimated_savings_usd']:,.0f} idle savings"
        )
    if float(row["risk_score"]) <= 25 and not bool(row["is_underutilized"]):
        return f"Place new jobs on Node-{node} — healthy and well utilized"
    return f"Review Node-{node} — moderate signals across models"


# Seed → (monotonic_ts, payload). Keeps live demos snappy after first build.
_BRIEF_CACHE: dict[int, tuple[float, dict[str, Any]]] = {}
_BRIEF_CACHE_TTL_S = 90.0


def clear_brief_cache() -> None:
    _BRIEF_CACHE.clear()


def build_daily_brief(
    store: Any, seed: int | None = None, *, use_cache: bool = True
) -> dict[str, Any]:
    """Full brief payload for API + Streamlit — real fleet, top-5 actions."""
    import time as _time

    store.ensure_loaded()
    resolved_seed = int(store.refresh_seed if seed is None else seed)

    if use_cache:
        hit = _BRIEF_CACHE.get(resolved_seed)
        if hit and (_time.monotonic() - hit[0]) < _BRIEF_CACHE_TTL_S:
            return hit[1]

    telem = build_brief_telemetry(store, resolved_seed)
    scored = _score_three_models(telem, store)
    ranked = compute_priority_scores(scored)

    # Full-fleet conflict scan. Today's top-5 still surfaces exactly ONE
    # conflict card; the Conflicts tab lists every disagreement found.
    fleet_conflicts = detect_conflicts(ranked)

    by_node: dict[int, list[dict[str, Any]]] = {}
    for c in fleet_conflicts:
        by_node.setdefault(int(c["node_id"]), []).append(c)
    conflict_ids = set(by_node)
    non_conflict = ranked[~ranked["node_id"].astype(int).isin(conflict_ids)].head(4)
    featured: list[dict[str, Any]] = []
    if conflict_ids:
        conflict_row = ranked[ranked["node_id"].astype(int).isin(conflict_ids)].head(1)
        selected_id = int(conflict_row.iloc[0]["node_id"])
        featured = [by_node[selected_id][0]]
        top = pd.concat([non_conflict, conflict_row], ignore_index=True)
        top = top.sort_values("priority_score", ascending=False).reset_index(drop=True)
    else:
        top = ranked.head(5).reset_index(drop=True)

    featured_by_node = {int(c["node_id"]): [c] for c in featured}
    primary = {nid: items[0] for nid, items in featured_by_node.items()}

    explainer = store.get_explainer()
    reasons = get_shap_reasons_batch(top, explainer)

    actions: list[dict[str, Any]] = []
    for rank, ((_, row), reason) in enumerate(zip(top.iterrows(), reasons), 1):
        nid = int(row["node_id"])
        has_conflict = nid in primary
        severity, tone = severity_for(row, has_conflict)
        actions.append(
            {
                "node_id": nid,
                "rank": rank,
                "action_text": assign_action(row, featured_by_node),
                "reason": reason,
                "risk_score": round(float(row["risk_score"]), 2),
                "avg_risk_score": round(float(row["avg_risk_score"]), 2),
                "placement_score": round(float(row["placement_score"]), 2),
                "fused_risk": round(float(row["fused_risk"]), 2),
                "is_underutilized": bool(row["is_underutilized"]),
                "estimated_savings_usd": round(
                    float(row["estimated_savings_usd"]), 2
                ),
                "gpu_usage_pct": round(float(row["gpu_usage_pct"]), 2),
                "memory_pct": round(float(row.get("memory_pct", 0.0)), 1),
                "error_count": int(row.get("error_count", 0)),
                "queue_length": int(row.get("queue_length", 0)),
                "has_conflict": has_conflict,
                "conflict": primary.get(nid),
                "conflicts": featured_by_node.get(nid, []),
                "priority_score": round(float(row["priority_score"]), 2),
                "severity": severity,
                "severity_tone": tone,
            }
        )

    payload = {
        "actions": actions,
        "conflicts": fleet_conflicts,
        "total_actions": len(actions),
        "total_conflicts": len(fleet_conflicts),
        "featured_conflicts": len(featured),
        "fleet_nodes": int(len(ranked)),
        "total_savings": round(
            float(sum(a["estimated_savings_usd"] for a in actions)), 2
        ),
        "seed": resolved_seed,
        "caveat": (
            f"All {len(ranked):,} nodes come from the real system snapshot and are "
            "scored by the existing Model 1/2/3 artifacts — no training ran in this "
            "session. error_count and queue_length are simulated ops fields (the "
            f"trace does not carry them). Dollar figures use ${GPU_HOUR_USD:.2f}"
            "/GPU-hour over a 72h idle window — an assumption, not invoices."
        ),
        "models": {
            "model1": "Failure risk (LightGBM)",
            "model2": "Placement (historical fail rate + live placement score)",
            "model3": "Idle GPU reclaim (util < 15%)",
        },
    }
    _BRIEF_CACHE[resolved_seed] = (_time.monotonic(), payload)
    return payload

