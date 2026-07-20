from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.services.store import store

router = APIRouter(prefix="/api/optimize", tags=["optimize"])


@router.get("")
def optimize():
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    assert store.optimization is not None
    opp = (
        store.optimization[store.optimization["is_underutilized"]]
        .sort_values("estimated_savings_usd", ascending=False)
        .head(30)
    )

    rows = []
    for _, r in opp.iterrows():
        rows.append(
            {
                "node_id": int(r["node_id"]),
                "avg_gpu_usage_pct": round(float(r["avg_gpu_usage_pct"]), 2),
                "avg_cpu_usage_pct": round(float(r["avg_cpu_usage_pct"]), 2),
                "total_hours_observed": round(float(r["total_hours_observed"]), 1),
                "estimated_idle_hours": round(float(r["estimated_idle_hours"]), 1),
                "estimated_savings_usd": round(float(r["estimated_savings_usd"]), 1),
            }
        )

    s = store.model3_summary
    return {
        "summary": {
            "total_machines_analyzed": int(s.get("total_machines_analyzed", 0)),
            "underutilized_machines": int(s.get("underutilized_machines", 0)),
            "total_estimated_savings_usd": float(
                s.get("total_estimated_savings_usd", 0)
            ),
            "underutilized_threshold_pct": float(
                s.get("underutilized_threshold_pct", 15)
            ),
            "assumed_cost_per_gpu_hour": float(
                s.get("assumed_cost_per_gpu_hour", 2.5)
            ),
        },
        "opportunities": rows,
    }
