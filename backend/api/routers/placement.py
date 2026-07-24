from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.services.store import store

router = APIRouter(prefix="/api/placement", tags=["placement"])

POLICY = "risk_anomaly_v2"


@router.get("/")
def placement(n: int = Query(5, ge=3, le=20), seed: int | None = Query(None)):
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    snap = store.get_snapshot(seed).copy()
    fail_map = store.fail_rate_map()

    hist = snap["node_id"].map(lambda nid: float(fail_map.get(int(nid), 0.0)))
    fused = snap["fused_risk"].astype(float)
    anomaly = snap["anomaly_score"].astype(float)
    # placement_score = 0.6*safety + 0.3*normality + 0.1*history
    safety = 100.0 - fused
    normality = 100.0 - anomaly * 100.0
    history = 100.0 - hist * 100.0
    snap["placement_score"] = (0.6 * safety + 0.3 * normality + 0.1 * history).round(2)
    snap["_safety"] = safety.round(2)
    snap["_normality"] = normality.round(2)
    snap["_history"] = history.round(2)

    best = snap.sort_values("placement_score", ascending=False).head(n)
    worst = snap.sort_values("placement_score", ascending=True).head(n)

    def pack(df):
        out = []
        for _, r in df.iterrows():
            nid = int(r["node_id"])
            afr = store.actual_failure_rate(nid)
            out.append(
                {
                    "node_id": nid,
                    "risk_score": round(float(r["risk_score"]), 2),
                    "anomaly_score": round(float(r["anomaly_score"]), 4),
                    "fused_risk": round(float(r["fused_risk"]), 2),
                    "score": round(float(r["placement_score"]), 2),
                    "components": {
                        "safety": float(r["_safety"]),
                        "normality": float(r["_normality"]),
                        "history": float(r["_history"]),
                    },
                    "cpu_usage_pct": round(float(r["cpu_usage_pct"]), 2),
                    "gpu_usage_pct": round(float(r["gpu_usage_pct"]), 2),
                    "actual_failure_rate": (
                        round(afr, 4) if afr is not None else None
                    ),
                }
            )
        return out

    recommended = pack(best)
    avoid = pack(worst)

    if recommended:
        store.append_shadow(
            {
                "event": "placement",
                "policy": POLICY,
                "seed": store.refresh_seed if seed is None else seed,
                "top_pick": recommended[0]["node_id"],
                "score": recommended[0]["score"],
            }
        )

    return {
        "policy": POLICY,
        "correlation": float(store.model2_corr.get("correlation", 0)),
        "n": n,
        "recommended": recommended,
        "avoid": avoid,
        "top_pick": recommended[0] if recommended else None,
        "lift": store.placement_lift or None,
    }
