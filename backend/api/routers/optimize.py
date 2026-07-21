from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.services.store import store

router = APIRouter(prefix="/api/optimize", tags=["optimize"])

POLICY = "safe_reclaim_v1"


@router.get("")
def optimize(
    seed: int | None = Query(None),
    watch: float = Query(40),
):
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    assert store.optimization is not None
    snap = store.get_snapshot(seed)
    fused_map = {
        int(r["node_id"]): float(r["fused_risk"]) for _, r in snap.iterrows()
    }

    opp = (
        store.optimization[store.optimization["is_underutilized"]]
        .sort_values("estimated_savings_usd", ascending=False)
        .head(30)
    )

    rows = []
    reclaim_n = 0
    investigate_n = 0
    for _, r in opp.iterrows():
        nid = int(r["node_id"])
        fused = fused_map.get(nid)
        if fused is None:
            action = "investigate"
        elif fused < watch:
            action = "reclaim"
            reclaim_n += 1
        else:
            action = "investigate"
            investigate_n += 1
        rows.append(
            {
                "node_id": nid,
                "avg_gpu_usage_pct": round(float(r["avg_gpu_usage_pct"]), 2),
                "avg_cpu_usage_pct": round(float(r["avg_cpu_usage_pct"]), 2),
                "total_hours_observed": round(float(r["total_hours_observed"]), 1),
                "estimated_idle_hours": round(float(r["estimated_idle_hours"]), 1),
                "estimated_savings_usd": round(float(r["estimated_savings_usd"]), 1),
                "fused_risk": round(fused, 2) if fused is not None else None,
                "action": action,
            }
        )

    s = store.model3_summary
    return {
        "policy": POLICY,
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
            "reclaim_count": reclaim_n,
            "investigate_count": investigate_n,
            "watch_threshold": watch,
        },
        "opportunities": rows,
        "caveat": (
            "$2.50/GPU-hour is an assumed cloud-adjacent estimate — not Alibaba ground truth."
        ),
    }
