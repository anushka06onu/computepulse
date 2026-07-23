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

    rows = [store.pack_node_row(r, critical, watch) for _, r in snap.iterrows()]
    rows.sort(key=lambda x: x["fused_risk"], reverse=True)

    critical_n = sum(1 for x in rows if x["health"] == "critical")
    watch_n = sum(1 for x in rows if x["health"] == "watch")
    healthy_n = sum(1 for x in rows if x["health"] == "healthy")

    hs = store.health_score(snap)
    drift = store.drift_psi(snap)
    meta = store.meta()

    return {
        "seed": use_seed,
        "summary": {
            "total_machines": len(rows),
            "critical": critical_n,
            "watch": watch_n,
            "healthy": healthy_n,
            "health_score": hs["score"],
            "grade": hs["grade"],
            "fusion": hs["fusion"],
            "model_version": meta["model_version"],
            "feature_set": meta["feature_set"],
            "trained_at": meta["trained_at"],
        },
        "drift": drift,
        "nodes": rows,
        "caption": (
            "Live System Demo — every value reflects real telemetry data."
        ),
    }


@router.post("/refresh")
def refresh_fleet():
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    seed = store.bump_seed()
    return {"seed": seed}
