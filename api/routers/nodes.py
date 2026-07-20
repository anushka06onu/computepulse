from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from api.services.store import store

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


class CompareRequest(BaseModel):
    node_ids: list[int] = Field(..., min_length=2, max_length=3)


@router.get("/")
def list_nodes(seed: int | None = Query(None)):
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    snap = store.get_snapshot(seed)
    ids = sorted(int(x) for x in snap["node_id"].unique().tolist())
    return {"node_ids": ids, "count": len(ids)}


@router.get("/{node_id}")
def get_node(
    node_id: int,
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
):
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    assert store.data is not None
    snap = store.get_snapshot(seed)
    match = snap[snap["node_id"] == node_id]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    row = match.iloc[0]
    history = store.data[store.data["node_id"] == node_id]
    risk = float(row["risk_score"])
    duration = float(row["duration_hours"])

    hist_tail = (
        history[
            [
                "cpu_usage_pct",
                "gpu_usage_pct",
                "mem_pressure",
                "duration_hours",
                "status",
            ]
        ]
        .tail(20)
        .round(2)
        .to_dict(orient="records")
    )

    return {
        "node_id": node_id,
        "risk_score": round(risk, 2),
        "health": store.status_code(risk, critical, watch),
        "instance_count": int(len(history)),
        "historical_failure_rate": round(float(history["will_fail"].mean()), 4),
        "snapshot": {
            "cpu_usage_pct": round(float(row["cpu_usage_pct"]), 2),
            "gpu_usage_pct": round(float(row["gpu_usage_pct"]), 2),
            "mem_pressure": round(float(row["mem_pressure"]), 3),
            "gpu_mem_pressure": round(float(row["gpu_mem_pressure"]), 3),
            "io_ops_total": round(float(row["io_ops_total"]), 0),
            "duration_hours": round(duration, 2) if duration >= 0 else None,
            "status": str(row["status"]),
        },
        "shap": store.local_shap(row),
        "timeline": store.node_timeline(node_id),
        "history": hist_tail,
    }


@router.post("/compare")
def compare_nodes(
    body: CompareRequest,
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
):
    results = []
    for nid in body.node_ids:
        results.append(get_node(nid, seed=seed, critical=critical, watch=watch))
    return {"nodes": results}
