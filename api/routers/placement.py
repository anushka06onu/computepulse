from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.services.store import store

router = APIRouter(prefix="/api/placement", tags=["placement"])


@router.get("/")
def placement(n: int = Query(5, ge=3, le=20), seed: int | None = Query(None)):
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    assert store.node_scores is not None
    snap = store.get_snapshot(seed)
    best = snap.sort_values("risk_score").head(n)
    worst = snap.sort_values("risk_score", ascending=False).head(n)

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
    return {
        "correlation": float(store.model2_corr.get("correlation", 0)),
        "n": n,
        "recommended": recommended,
        "avoid": pack(worst),
        "top_pick": recommended[0] if recommended else None,
    }
