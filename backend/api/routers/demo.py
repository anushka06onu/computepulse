from __future__ import annotations

import warnings
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from api.services.store import store

router = APIRouter(prefix="/api/demo", tags=["demo"])

# Cache by (seed, rank) so re-clicks never reshuffle or re-run SHAP.
_SCENARIO_CACHE: dict[tuple[int, int], dict[str, Any]] = {}
_MAX_DEMO_RANKS = 10


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
    fail_map = store.data.groupby("node_id")["will_fail"].mean().to_dict()
    ps = [
        store.placement_score(
            float(r["fused_risk"]),
            float(r["anomaly_score"]),
            float(fail_map.get(int(r["node_id"]), 0.0)),
        )
        for _, r in scored.iterrows()
    ]
    scored["placement_score"] = ps
    # Never recommend moving onto the flagged node itself.
    best = (
        scored[scored["node_id"] != int(worst["node_id"])]
        .sort_values(["placement_score", "node_id"], ascending=[False, True])
        .iloc[0]
    )

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

    hist = store.data[store.data["node_id"] == worst_id]
    fail_rate = float(hist["will_fail"].mean()) if len(hist) else 0.0
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        reasons = store.shap_reasons(worst, failure_rate=fail_rate)

    health_before = round(100 - worst_fused, 1)
    health_after = round(100 - best_fused, 1)

    afr = None
    if store.node_scores is not None:
        match = store.node_scores.loc[
            store.node_scores["node_id"] == best_id, "actual_failure_rate"
        ]
        if len(match):
            afr = round(float(match.values[0]), 4)

    job_id = 1000 + worst_id
    steps = [
        "Scanning fleet\u2026",
        f"Node {worst_id} flagged at {worst_fused}% fused risk",
        "Top drivers: " + ", ".join(reasons),
        f"Recommend moving Job {job_id} \u2192 Node {best_id} (score {best_score})",
        f"Workload health {health_before} \u2192 {health_after}",
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
        "health_before": health_before,
        "health_after": health_after,
        "placement_delta": round(best_score - worst_score, 2),
        "fusion": store.meta()["fusion"],
        "model_version": store.model_version,
        "caveat": (
            "Projected workload health after moving off the critical node onto the "
            "recommended placement target. Uses fused risk (0.75 risk + 0.25 anomaly). "
            f"Run Demo cycles critical rank {use_rank + 1}/{pool_n} for fleet seed {use_seed}. "
            "Replay keeps this node; Run Demo advances to the next critical machine."
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
    cached = _SCENARIO_CACHE.get(cache_key)
    if cached is not None:
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
            "seed": use_seed,
            "rank": result["rank"],
        }
    )
    _SCENARIO_CACHE[cache_key] = result
    return result
