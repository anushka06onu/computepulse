from __future__ import annotations

import warnings
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from api.services.store import store

router = APIRouter(prefix="/api/demo", tags=["demo"])

# Cache by (seed, rank) so re-clicks never reshuffle or re-run SHAP.
_SCENARIO_CACHE: dict[tuple[int, int], dict[str, Any]] = {}
_MAX_DEMO_RANKS = 10
_CANDIDATE_N = 5

# Early-prediction cost model (labeled assumptions — same $2.50 base as Model 3).
ASSUMED_COST_PER_GPU_HOUR = 2.50
ASSUMED_JOB_GPU_HOURS = 24.0
ASSUMED_INCIDENT_OVERHEAD_USD = 850.0


def _early_prediction_savings(
    fused_from: float, fused_to: float
) -> dict[str, Any]:
    """Expected $ avoided by moving the job before failure.

    savings ≈ ΔP(fail) × (job compute cost + incident overhead)
    """
    p_from = max(0.0, min(1.0, fused_from / 100.0))
    p_to = max(0.0, min(1.0, fused_to / 100.0))
    delta_p = max(0.0, p_from - p_to)
    compute_at_risk = ASSUMED_JOB_GPU_HOURS * ASSUMED_COST_PER_GPU_HOUR
    at_risk_usd = compute_at_risk + ASSUMED_INCIDENT_OVERHEAD_USD
    saved = round(delta_p * at_risk_usd, 1)
    return {
        "estimated_usd": saved,
        "risk_reduction_pp": round(fused_from - fused_to, 1),
        "probability_avoided": round(delta_p, 4),
        "assumed_job_gpu_hours": ASSUMED_JOB_GPU_HOURS,
        "assumed_cost_per_gpu_hour": ASSUMED_COST_PER_GPU_HOUR,
        "assumed_incident_overhead_usd": ASSUMED_INCIDENT_OVERHEAD_USD,
        "formula": (
            "ΔP(fail) × (job GPU-hours × $/GPU-hour + incident overhead)"
        ),
        "caveat": (
            f"Assumes a {ASSUMED_JOB_GPU_HOURS:.0f}h GPU job at "
            f"${ASSUMED_COST_PER_GPU_HOUR:.2f}/GPU-hour plus "
            f"${ASSUMED_INCIDENT_OVERHEAD_USD:.0f} incident overhead — "
            "not Alibaba ground truth."
        ),
    }


def _scenario_for_seed(use_seed: int, rank: int = 0) -> dict[str, Any]:
    assert store.data is not None

    snap = (
        store.get_snapshot(use_seed)
        .sort_values(["fused_risk", "node_id"], ascending=[False, True])
        .reset_index(drop=True)
    )
    # Only cycle among high-risk machines so each Run Demo is a real critical story.
    critical_pool = snap[snap["fused_risk"] > 70]
    if critical_pool.empty:
        critical_pool = snap.head(_MAX_DEMO_RANKS)
    else:
        critical_pool = critical_pool.head(_MAX_DEMO_RANKS)
    pool_n = max(1, len(critical_pool))
    use_rank = int(rank) % pool_n
    worst = critical_pool.iloc[use_rank]

    scored = snap.copy()
    fail_map = store.fail_rate_map()
    hist = scored["node_id"].map(lambda nid: float(fail_map.get(int(nid), 0.0)))
    fused = scored["fused_risk"].astype(float)
    anomaly = scored["anomaly_score"].astype(float)
    safety = 100.0 - fused
    normality = 100.0 - anomaly * 100.0
    history = 100.0 - hist * 100.0
    scored["placement_score"] = (0.6 * safety + 0.3 * normality + 0.1 * history).round(2)
    # Score every other node, then shortlist — recommend only after analysis.
    ranked = (
        scored[scored["node_id"] != int(worst["node_id"])]
        .sort_values(["placement_score", "node_id"], ascending=[False, True])
        .reset_index(drop=True)
    )
    shortlist = ranked.head(_CANDIDATE_N)
    best = shortlist.iloc[0]

    worst_id = int(worst["node_id"])
    best_id = int(best["node_id"])
    worst_risk = round(float(worst["risk_score"]), 1)
    worst_fused = round(float(worst["fused_risk"]), 1)
    best_risk = round(float(best["risk_score"]), 1)
    best_fused = round(float(best["fused_risk"]), 1)
    best_score = round(float(best["placement_score"]), 1)
    worst_score = round(
        store.placement_score(
            float(worst["fused_risk"]),
            float(worst["anomaly_score"]),
            float(fail_map.get(worst_id, 0.0)),
        ),
        1,
    )

    candidates: list[dict[str, Any]] = []
    for i, (_, row) in enumerate(shortlist.iterrows()):
        nid = int(row["node_id"])
        comps = store.placement_components(
            float(row["fused_risk"]),
            float(row["anomaly_score"]),
            float(fail_map.get(nid, 0.0)),
        )
        candidates.append(
            {
                "rank": i + 1,
                "node_id": nid,
                "placement_score": round(float(row["placement_score"]), 1),
                "fused_risk": round(float(row["fused_risk"]), 1),
                "risk_score": round(float(row["risk_score"]), 1),
                "components": comps,
                "selected": nid == best_id,
            }
        )

    hist_rows = store.data[store.data["node_id"] == worst_id] if store.data is not None else None
    fail_rate = float(hist_rows["will_fail"].mean()) if hist_rows is not None and len(hist_rows) else float(fail_map.get(worst_id, 0.0))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        reasons = store.shap_reasons(worst, failure_rate=fail_rate)

    health_before = round(100 - worst_fused, 1)
    health_after = round(100 - best_fused, 1)
    savings = _early_prediction_savings(worst_fused, best_fused)

    afr = store.actual_failure_rate(best_id)
    if afr is not None:
        afr = round(afr, 4)

    job_id = 1000 + worst_id
    steps = [
        "Scanning fleet\u2026",
        f"Node {worst_id} flagged at {worst_fused}% risk score",
        "Top drivers: " + ", ".join(reasons),
        (
            f"Scoring top {_CANDIDATE_N} placement candidates "
            f"(safety 60% + normality 30% + history 10%)\u2026"
        ),
        f"Recommend Job {job_id} \u2192 Node {best_id} (score {best_score})",
        (
            f"Workload health {health_before} \u2192 {health_after} · "
            f"est. ${savings['estimated_usd']:,.0f} avoided"
        ),
    ]

    return {
        "seed": use_seed,
        "rank": use_rank,
        "pool_size": pool_n,
        "job": {"id": job_id, "label": f"Job {job_id}"},
        "from": {
            "node_id": worst_id,
            "risk_score": worst_risk,
            "anomaly_score": round(float(worst["anomaly_score"]), 4),
            "fused_risk": worst_fused,
            "placement_score": worst_score,
            "health": health_before,
            "reasons": reasons,
        },
        "to": {
            "node_id": best_id,
            "risk_score": best_risk,
            "anomaly_score": round(float(best["anomaly_score"]), 4),
            "fused_risk": best_fused,
            "placement_score": best_score,
            "health": health_after,
            "actual_failure_rate": afr,
        },
        "candidates": candidates,
        "cost_savings": savings,
        "health_before": health_before,
        "health_after": health_after,
        "placement_delta": round(best_score - worst_score, 2),
        "fusion": store.meta()["fusion"],
        "model_version": store.model_version,
        "caveat": (
            "Projected workload health after moving off the critical node onto the "
            "highest-scoring placement candidate (safety + normality + history). "
            f"Run Demo cycles critical rank {use_rank + 1}/{pool_n} for fleet seed {use_seed}. "
            "Replay keeps this node; Run Demo advances to the next critical machine. "
            + savings["caveat"]
        ),
        "steps": steps,
    }


@router.get("/scenario")
def scenario(
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
    rank: int = Query(0, ge=0, le=50),
):
    """Demo a critical node from the current fleet snapshot.

    ``rank`` selects among the top critical machines (0 = worst).
    Same (seed, rank) → cached identical scenario.
    """
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    use_seed = store.refresh_seed if seed is None else seed
    cache_key = (use_seed, int(rank))
    # Drop stale cache entries that predate candidates / cost_savings.
    cached = _SCENARIO_CACHE.get(cache_key)
    if cached is not None and "candidates" in cached and "cost_savings" in cached:
        return cached

    result = _scenario_for_seed(use_seed, rank)
    store.append_shadow(
        {
            "event": "demo",
            "from": result["from"]["node_id"],
            "to": result["to"]["node_id"],
            "health_before": result["health_before"],
            "health_after": result["health_after"],
            "placement_delta": result["placement_delta"],
            "estimated_savings_usd": result["cost_savings"]["estimated_usd"],
            "seed": use_seed,
            "rank": result["rank"],
        }
    )
    _SCENARIO_CACHE[cache_key] = result
    return result

