from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.services.store import store

router = APIRouter(prefix="/api/fleet", tags=["fleet"])


@router.get("/snapshot")
def fleet_snapshot(
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
):
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    snap = store.get_snapshot(seed)
    use_seed = store.refresh_seed if seed is None else seed

    rows = []
    for _, r in snap.iterrows():
        risk = float(r["risk_score"])
        rows.append(
            {
                "node_id": int(r["node_id"]),
                "risk_score": round(risk, 2),
                "cpu_usage_pct": round(float(r["cpu_usage_pct"]), 2),
                "gpu_usage_pct": round(float(r["gpu_usage_pct"]), 2),
                "mem_pressure": round(float(r["mem_pressure"]), 3),
                "duration_hours": round(float(r["duration_hours"]), 2),
                "status": str(r["status"]),
                "health": store.status_code(risk, critical, watch),
            }
        )
    rows.sort(key=lambda x: x["risk_score"], reverse=True)

    critical_n = sum(1 for x in rows if x["health"] == "critical")
    watch_n = sum(1 for x in rows if x["health"] == "watch")
    healthy_n = sum(1 for x in rows if x["health"] == "healthy")

    hs = store.health_score(snap)

    return {
        "seed": use_seed,
        "summary": {
            "total_machines": len(rows),
            "critical": critical_n,
            "watch": watch_n,
            "healthy": healthy_n,
            "health_score": hs["score"],
            "grade": hs["grade"],
        },
        "nodes": rows,
        "caption": (
            "Historical trace resample — every value is real, from a different "
            "moment in the Alibaba GPU cluster trace."
        ),
    }


@router.post("/refresh")
def refresh_fleet():
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    seed = store.bump_seed()
    # Invalidate is via new seed key in lru_cache
    return {"seed": seed}
