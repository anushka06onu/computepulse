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

    assert store.node_scores is not None
    snap = store.get_snapshot(seed).copy()

    scores = []
    components = []
    for _, r in snap.iterrows():
        nid = int(r["node_id"])
        hist = store.hist_fail_rate(nid)
        fused = float(r["fused_risk"])
        anomaly = float(r["anomaly_score"])
        sc = store.placement_score(fused, anomaly, hist)
        scores.append(sc)
        components.append(store.placement_components(fused, anomaly, hist))
    snap["placement_score"] = scores
    snap["_components"] = components

    best = snap.sort_values("placement_score", ascending=False).head(n)
    worst = snap.sort_values("placement_score", ascending=True).head(n)

    def pack(df):
        out = []
        for _, r in df.iterrows():
            nid = int(r["node_id"])
            fail_rate = store.node_scores.loc[
                store.node_scores["node_id"] == nid, "actual_failure_rate"
            ]
            out.append(
                {
                    "node_id": nid,
                    "risk_score": round(float(r["risk_score"]), 2),
                    "anomaly_score": round(float(r["anomaly_score"]), 4),
                    "fused_risk": round(float(r["fused_risk"]), 2),
                    "score": round(float(r["placement_score"]), 2),
                    "components": r["_components"],
                    "cpu_usage_pct": round(float(r["cpu_usage_pct"]), 2),
                    "gpu_usage_pct": round(float(r["gpu_usage_pct"]), 2),
                    "actual_failure_rate": (
                        round(float(fail_rate.values[0]), 4)
                        if len(fail_rate)
                        else None
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
