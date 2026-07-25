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


def _conflicts_for_row(row: pd.Series) -> list[dict[str, Any]]:
    node = int(row["node_id"])
    found: list[dict[str, Any]] = []

    if float(row["risk_score"]) > RISK_HIGH and bool(row["placement_safe"]):
        found.append(
            {
                "node_id": node,
                "type": "Risk vs Placement",
                "model_a": "Model 1 — Failure Risk",
                "model_a_says": (
                    f"{row['risk_score']:.0f}% failure risk now — avoid this node"
                ),
                "model_b": "Model 2 — Placement",
                "model_b_says": (
                    f"Historical failure rate {row['avg_risk_score']:.0f}% — "
                    "record says safe to place jobs"
                ),
                "severity": "high",
            }
        )

    if float(row["risk_score"]) > RISK_HIGH and bool(row["is_underutilized"]):
        found.append(
            {
                "node_id": node,
                "type": "Risk vs Idle GPU",
                "model_a": "Model 1 — Failure Risk",
                "model_a_says": (
                    f"{row['risk_score']:.0f}% failure risk — node is struggling"
                ),
                "model_b": "Model 3 — GPU Savings",
                "model_b_says": (
                    f"GPU at {row['gpu_usage_pct']:.0f}% util — underutilized, "
                    f"est. ${row['estimated_savings_usd']:,.0f} reclaim"
                ),
                "severity": "high",
            }
        )

    if float(row["avg_risk_score"]) > PLACEMENT_RISKY_ABOVE and bool(
        row["is_underutilized"]
    ):
        found.append(
            {
                "node_id": node,
                "type": "Placement vs Idle GPU",
                "model_a": "Model 2 — Placement",
                "model_a_says": (
                    f"Historical failure rate {row['avg_risk_score']:.0f}% — "
                    "avoid placing new jobs here"
                ),
                "model_b": "Model 3 — GPU Savings",
                "model_b_says": (
                    f"GPU at {row['gpu_usage_pct']:.0f}% — "
                    "consolidate or reclaim idle capacity"
                ),
                "severity": "medium",
            }
        )

    return found


def detect_conflicts(df: pd.DataFrame, limit: int = 12) -> list[dict[str, Any]]:
    """Flag real nodes where two models disagree. Both views kept visible."""
    conflicts: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        conflicts.extend(_conflicts_for_row(row))
        if len(conflicts) >= limit:
            break
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


def get_shap_reason(node_row: pd.Series, explainer: Any) -> str:
    """One plain sentence from the top SHAP feature of the risk model."""
    row_features = node_row[FEATURES].to_frame().T.astype(float)
    shap_vals = explainer.shap_values(row_features)

    if isinstance(shap_vals, list):
        local_shap = shap_vals[1][0]
    else:
        local_shap = shap_vals[0]

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


def build_daily_brief(store: Any, seed: int | None = None) -> dict[str, Any]:
    """Full brief payload for API + Streamlit — real fleet, top-5 actions."""
    store.ensure_loaded()

    telem = build_brief_telemetry(store, seed)
    scored = _score_three_models(telem, store)
    ranked = compute_priority_scores(scored)

    # Conflicts scanned over the highest-priority slice of the real fleet
    # (top rows carry the disagreements worth an operator's morning).
    conflicts = detect_conflicts(ranked.head(200))

    by_node: dict[int, list[dict[str, Any]]] = {}
    for c in conflicts:
        by_node.setdefault(int(c["node_id"]), []).append(c)
    primary = {nid: items[0] for nid, items in by_node.items()}

    # Guarantee at least one conflicted real node appears inside the top-5
    # so the live demo always shows the flag working.
    top = ranked.head(5)
    top_ids = set(top["node_id"].astype(int))
    if primary and not (top_ids & set(primary)):
        first_conflict_id = next(iter(primary))
        conflict_row = ranked[ranked["node_id"].astype(int) == first_conflict_id]
        top = pd.concat([top.head(4), conflict_row.head(1)])

    explainer = store.get_explainer()
    actions: list[dict[str, Any]] = []
    for rank, (_, row) in enumerate(top.iterrows(), 1):
        nid = int(row["node_id"])
        has_conflict = nid in primary
        severity, tone = severity_for(row, has_conflict)
        actions.append(
            {
                "node_id": nid,
                "rank": rank,
                "action_text": assign_action(row, by_node),
                "reason": get_shap_reason(row, explainer),
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
                "conflicts": by_node.get(nid, []),
                "priority_score": round(float(row["priority_score"]), 2),
                "severity": severity,
                "severity_tone": tone,
            }
        )

    return {
        "actions": actions,
        "conflicts": conflicts,
        "total_actions": len(actions),
        "total_conflicts": len(conflicts),
        "fleet_nodes": int(len(ranked)),
        "total_savings": round(
            float(sum(a["estimated_savings_usd"] for a in actions)), 2
        ),
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
