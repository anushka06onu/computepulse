from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.services.store import store

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/scenario")
def scenario(
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
):
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    assert store.data is not None

    snap = (
        store.get_snapshot(seed)
        .sort_values("risk_score", ascending=False)
        .reset_index(drop=True)
    )
    worst = snap.iloc[0]
    best = snap.iloc[-1]
    worst_id = int(worst["node_id"])
    best_id = int(best["node_id"])
    worst_risk = round(float(worst["risk_score"]), 1)
    best_risk = round(float(best["risk_score"]), 1)

    hist = store.data[store.data["node_id"] == worst_id]
    fail_rate = float(hist["will_fail"].mean()) if len(hist) else 0.0
    reasons = store.shap_reasons(worst, failure_rate=fail_rate)

    health_before = store.health_score(snap)["score"]
    sim = snap.copy()
    sim.loc[sim["node_id"] == worst_id, "risk_score"] = float(best["risk_score"])
    health_after = store.health_score(sim)["score"]

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
        f"Node {worst_id} flagged at {worst_risk}% risk",
        "Top drivers: " + ", ".join(reasons),
        f"Recommend moving Job {job_id} \u2192 Node {best_id}",
        f"Projected cluster health {health_before} \u2192 {health_after}",
    ]

    return {
        "seed": store.refresh_seed if seed is None else seed,
        "job": {"id": job_id, "label": f"Job {job_id}"},
        "from": {
            "node_id": worst_id,
            "risk_score": worst_risk,
            "health": round(100 - worst_risk, 1),
            "reasons": reasons,
        },
        "to": {
            "node_id": best_id,
            "risk_score": best_risk,
            "health": round(100 - best_risk, 1),
            "actual_failure_rate": afr,
        },
        "health_before": health_before,
        "health_after": health_after,
        "caveat": (
            "Projected: assumes the workload runs on the recommended node instead."
        ),
        "steps": steps,
    }
