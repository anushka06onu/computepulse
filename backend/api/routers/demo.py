from __future__ import annotations

import hashlib
import json
import warnings
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from api.services.store import store

router = APIRouter(prefix="/api/demo", tags=["demo"])

# Cache by (seed, rank, critical, reservations_hash).
_SCENARIO_CACHE: dict[tuple[Any, ...], dict[str, Any]] = {}
_MAX_DEMO_RANKS = 25  # same cap as Warnings node_critical inbox
_CANDIDATE_N = 5

# Early-prediction cost model (labeled assumptions — same $2.50 base as Model 3).
ASSUMED_COST_PER_GPU_HOUR = 2.50
ASSUMED_JOB_GPU_HOURS = 24.0
ASSUMED_INCIDENT_OVERHEAD_USD = 850.0

_JOB_TEMPLATES: list[dict[str, Any]] = [
    {
        "name": "LLM fine-tune",
        "workload": "Multi-GPU training",
        "duration_hours": 24,
        "gpu_count": 4,
        "max_fused_risk_pct": 42.0,
        "max_cpu_usage_pct": 72.0,
        "max_gpu_usage_pct": 78.0,
        "max_mem_pressure": 0.62,
        "max_anomaly_score": 0.35,
    },
    {
        "name": "Vision batch infer",
        "workload": "GPU inference burst",
        "duration_hours": 12,
        "gpu_count": 2,
        "max_fused_risk_pct": 48.0,
        "max_cpu_usage_pct": 78.0,
        "max_gpu_usage_pct": 82.0,
        "max_mem_pressure": 0.68,
        "max_anomaly_score": 0.40,
    },
    {
        "name": "Recommend model train",
        "workload": "Distributed training",
        "duration_hours": 36,
        "gpu_count": 8,
        "max_fused_risk_pct": 38.0,
        "max_cpu_usage_pct": 68.0,
        "max_gpu_usage_pct": 74.0,
        "max_mem_pressure": 0.58,
        "max_anomaly_score": 0.30,
    },
    {
        "name": "ETL feature build",
        "workload": "CPU+GPU pipeline",
        "duration_hours": 18,
        "gpu_count": 1,
        "max_fused_risk_pct": 50.0,
        "max_cpu_usage_pct": 80.0,
        "max_gpu_usage_pct": 70.0,
        "max_mem_pressure": 0.72,
        "max_anomaly_score": 0.45,
    },
]


class DemoReservationIn(BaseModel):
    node_id: int
    cpu_delta: float = 0.0
    gpu_delta: float = 0.0
    mem_delta: float = 0.0
    job_id: int = 0


class DemoNoFreeNodeError(Exception):
    """No unclaimed recommend host remains in this session."""


class DemoPlaceBody(BaseModel):
    seed: Optional[int] = None
    critical: float = 70.0
    watch: float = 40.0
    rank: int = Field(0, ge=0, le=100)
    reservations: list[DemoReservationIn] = Field(default_factory=list)
    session_index: Optional[int] = None


class DemoPlaceBatchBody(BaseModel):
    seed: Optional[int] = None
    critical: float = 70.0
    watch: float = 40.0
    ranks: list[int] = Field(default_factory=list)
    reservations: list[DemoReservationIn] = Field(default_factory=list)
    session_index_start: int = 0


def _reservation_from_result(result: dict[str, Any]) -> dict[str, Any]:
    gpus = int(result.get("job", {}).get("gpu_count") or 1)
    return {
        "node_id": int(result["to"]["node_id"]),
        "cpu_delta": float(min(28, 6 + gpus * 4)),
        "gpu_delta": float(min(35, 8 + gpus * 5)),
        "mem_delta": float(min(0.18, 0.04 + gpus * 0.02)),
        "job_id": int(result["job"]["id"]),
    }


def _early_prediction_savings(
    fused_from: float, fused_to: float
) -> dict[str, Any]:
    """Expected $ avoided by moving the job before failure.

    savings ≈ ΔP(fail) × (job compute cost + incident overhead)
    """
    p_from = max(0.0, min(1.0, fused_from / 100.0))
    p_to = max(0.0, min(1.0, fused_to / 100.0))
    delta_p = max(0.0, p_from - p_to)
    compute_at_risk = ASSUMED_JOB_GPU_HOURS * ASSUMED_COST_PER_GPU_HOUR
    at_risk_usd = compute_at_risk + ASSUMED_INCIDENT_OVERHEAD_USD
    saved = round(delta_p * at_risk_usd, 1)
    return {
        "estimated_usd": saved,
        "risk_reduction_pp": round(fused_from - fused_to, 1),
        "probability_avoided": round(delta_p, 4),
        "assumed_job_gpu_hours": ASSUMED_JOB_GPU_HOURS,
        "assumed_cost_per_gpu_hour": ASSUMED_COST_PER_GPU_HOUR,
        "assumed_incident_overhead_usd": ASSUMED_INCIDENT_OVERHEAD_USD,
        "formula": (
            "ΔP(fail) × (job GPU-hours × $/GPU-hour + incident overhead)"
        ),
        "caveat": (
            f"Assumes a {ASSUMED_JOB_GPU_HOURS:.0f}h GPU job at "
            f"${ASSUMED_COST_PER_GPU_HOUR:.2f}/GPU-hour plus "
            f"${ASSUMED_INCIDENT_OVERHEAD_USD:.0f} incident overhead — "
            "not Alibaba ground truth."
        ),
    }


def _job_for_rank(seed: int, rank: int) -> dict[str, Any]:
    """Job profile changes with each critical rank.

    Same (seed, rank) → same job. Advancing rank cycles the template so
    operators see a new workload + requirements each run.
    """
    idx = (int(seed) + int(rank)) % len(_JOB_TEMPLATES)
    tmpl = _JOB_TEMPLATES[idx]
    job_id = 5100 + idx * 17 + (int(rank) % 17)
    return {
        "id": job_id,
        "label": f"{tmpl['name']} · Job {job_id}",
        "workload": tmpl["workload"],
        "duration_hours": tmpl["duration_hours"],
        "gpu_count": tmpl["gpu_count"],
        "requirements": {
            "max_fused_risk_pct": tmpl["max_fused_risk_pct"],
            "max_cpu_usage_pct": tmpl["max_cpu_usage_pct"],
            "max_gpu_usage_pct": tmpl["max_gpu_usage_pct"],
            "max_mem_pressure": tmpl["max_mem_pressure"],
            "max_anomaly_score": tmpl["max_anomaly_score"],
        },
        "locked": False,
    }


def _job_preview(seed: int, rank: int) -> dict[str, Any]:
    job = _job_for_rank(seed, rank)
    return {"id": job["id"], "label": job["label"]}


def _node_metrics(row: Any) -> dict[str, float]:
    return {
        "cpu_usage_pct": round(float(row["cpu_usage_pct"]), 1),
        "gpu_usage_pct": round(float(row["gpu_usage_pct"]), 1),
        "mem_pressure": round(float(row["mem_pressure"]), 3),
        "anomaly_score": round(float(row["anomaly_score"]), 4),
        "fused_risk": round(float(row["fused_risk"]), 1),
        "risk_score": round(float(row["risk_score"]), 1),
    }


def _evaluate_fit(metrics: dict[str, float], req: dict[str, float]) -> dict[str, Any]:
    """Compare node telemetry against job requirements."""
    checks: list[dict[str, Any]] = [
        {
            "key": "fused_risk",
            "label": "Failure risk",
            "required": f"≤ {req['max_fused_risk_pct']:.0f}%",
            "actual": f"{metrics['fused_risk']:.1f}%",
            "met": metrics["fused_risk"] <= req["max_fused_risk_pct"],
            "why": (
                "Risk is within the job’s safety budget."
                if metrics["fused_risk"] <= req["max_fused_risk_pct"]
                else "Risk exceeds the job’s safety budget — likely to interrupt training."
            ),
        },
        {
            "key": "cpu",
            "label": "CPU headroom",
            "required": f"≤ {req['max_cpu_usage_pct']:.0f}% busy",
            "actual": f"{metrics['cpu_usage_pct']:.1f}% busy",
            "met": metrics["cpu_usage_pct"] <= req["max_cpu_usage_pct"],
            "why": (
                "CPU load leaves room for the job’s host processes."
                if metrics["cpu_usage_pct"] <= req["max_cpu_usage_pct"]
                else "CPU is already saturated — the job would compete for cycles."
            ),
        },
        {
            "key": "gpu",
            "label": "GPU headroom",
            "required": f"≤ {req['max_gpu_usage_pct']:.0f}% busy",
            "actual": f"{metrics['gpu_usage_pct']:.1f}% busy",
            "met": metrics["gpu_usage_pct"] <= req["max_gpu_usage_pct"],
            "why": (
                "GPU capacity can absorb the requested workload."
                if metrics["gpu_usage_pct"] <= req["max_gpu_usage_pct"]
                else "GPU is too full — the job would queue or thrash."
            ),
        },
        {
            "key": "mem",
            "label": "Memory pressure",
            "required": f"≤ {req['max_mem_pressure']:.2f}",
            "actual": f"{metrics['mem_pressure']:.3f}",
            "met": metrics["mem_pressure"] <= req["max_mem_pressure"],
            "why": (
                "Memory pressure is below the job’s limit."
                if metrics["mem_pressure"] <= req["max_mem_pressure"]
                else "Memory pressure is too high — OOM / eviction risk."
            ),
        },
        {
            "key": "anomaly",
            "label": "Telemetry normality",
            "required": f"≤ {req['max_anomaly_score']:.2f}",
            "actual": f"{metrics['anomaly_score']:.3f}",
            "met": metrics["anomaly_score"] <= req["max_anomaly_score"],
            "why": (
                "Node behavior looks normal versus the fleet baseline."
                if metrics["anomaly_score"] <= req["max_anomaly_score"]
                else "Node telemetry is anomalous — unstable for a long job."
            ),
        },
    ]
    met_n = sum(1 for c in checks if c["met"])
    meets_all = met_n == len(checks)
    if meets_all:
        summary = "All job requirements are met — safe to place."
    elif met_n == 0:
        summary = "No requirements are met — do not place the job here."
    else:
        summary = f"{met_n}/{len(checks)} requirements met — not a safe placement."
    return {
        "meets_all": meets_all,
        "met_count": met_n,
        "total": len(checks),
        "summary": summary,
        "checks": checks,
    }


def _normalize_reservations(
    reservations: list[DemoReservationIn] | list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    if not reservations:
        return []
    out: list[dict[str, Any]] = []
    for r in reservations:
        if isinstance(r, DemoReservationIn):
            out.append(r.model_dump())
        else:
            out.append(
                {
                    "node_id": int(r["node_id"]),
                    "cpu_delta": float(r.get("cpu_delta", 0)),
                    "gpu_delta": float(r.get("gpu_delta", 0)),
                    "mem_delta": float(r.get("mem_delta", 0)),
                    "job_id": int(r.get("job_id", 0)),
                }
            )
    return out


def _reservations_hash(reservations: list[dict[str, Any]]) -> str:
    if not reservations:
        return "none"
    payload = sorted(
        reservations,
        key=lambda r: (int(r["node_id"]), int(r.get("job_id", 0))),
    )
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _aggregate_load(
    reservations: list[dict[str, Any]],
) -> dict[int, dict[str, float]]:
    load: dict[int, dict[str, float]] = {}
    for r in reservations:
        nid = int(r["node_id"])
        bucket = load.setdefault(
            nid, {"cpu_delta": 0.0, "gpu_delta": 0.0, "mem_delta": 0.0}
        )
        bucket["cpu_delta"] += float(r.get("cpu_delta", 0))
        bucket["gpu_delta"] += float(r.get("gpu_delta", 0))
        bucket["mem_delta"] += float(r.get("mem_delta", 0))
    return load


def _apply_load_to_row(row: Any, load: dict[str, float]) -> dict[str, float]:
    m = _node_metrics(row)
    m["cpu_usage_pct"] = round(
        min(100.0, m["cpu_usage_pct"] + load.get("cpu_delta", 0.0)), 1
    )
    m["gpu_usage_pct"] = round(
        min(100.0, m["gpu_usage_pct"] + load.get("gpu_delta", 0.0)), 1
    )
    m["mem_pressure"] = round(
        min(1.0, m["mem_pressure"] + load.get("mem_delta", 0.0)), 3
    )
    return m


def _row_meets(row: Any, req: dict[str, float]) -> bool:
    m = _node_metrics(row)
    return bool(_evaluate_fit(m, req)["meets_all"])


def _row_meets_with_load(
    row: Any, req: dict[str, float], load_map: dict[int, dict[str, float]]
) -> bool:
    nid = int(row["node_id"])
    m = _apply_load_to_row(row, load_map.get(nid, {}))
    return bool(_evaluate_fit(m, req)["meets_all"])


def _scenario_for_seed(
    use_seed: int,
    rank: int = 0,
    *,
    critical: float = 70.0,
    watch: float = 40.0,
    reservations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    assert store.data is not None
    _ = watch  # reserved for parity with Warnings thresholds

    reservations = _normalize_reservations(reservations)
    load_map = _aggregate_load(reservations)
    claimed_ids = set(load_map.keys())

    snap = (
        store.get_snapshot(use_seed)
        .sort_values(["fused_risk", "node_id"], ascending=[False, True])
        .reset_index(drop=True)
    )

    # Same critical set as Warnings → node_critical (fused_risk > critical).
    critical_pool = (
        snap[snap["fused_risk"] > critical]
        .sort_values(["fused_risk", "node_id"], ascending=[False, True])
        .head(_MAX_DEMO_RANKS)
        .reset_index(drop=True)
    )
    if critical_pool.empty:
        # Fallback: highest fused risk if nothing crosses the threshold.
        critical_pool = snap.head(min(_MAX_DEMO_RANKS, len(snap))).reset_index(
            drop=True
        )

    pool_n = max(1, len(critical_pool))
    use_rank = int(rank) % pool_n
    worst = critical_pool.iloc[use_rank]

    job = _job_for_rank(use_seed, use_rank)
    req = job["requirements"]

    scored = snap.copy()
    fail_map = store.fail_rate_map()
    hist = scored["node_id"].map(lambda nid: float(fail_map.get(int(nid), 0.0)))
    fused = scored["fused_risk"].astype(float)
    anomaly = scored["anomaly_score"].astype(float)
    safety = 100.0 - fused
    normality = 100.0 - anomaly * 100.0
    history = 100.0 - hist * 100.0
    scored["placement_score"] = (0.6 * safety + 0.3 * normality + 0.1 * history).round(
        2
    )

    others_base = scored[scored["node_id"] != int(worst["node_id"])].copy()
    # Baseline best ignores session reservations (for session_note comparison).
    eligible_base = others_base[
        others_base.apply(lambda r: _row_meets(r, req), axis=1)
    ]
    baseline_ranked = (
        (eligible_base if len(eligible_base) else others_base)
        .sort_values(["placement_score", "node_id"], ascending=[False, True])
        .reset_index(drop=True)
    )
    baseline_best_id = (
        int(baseline_ranked.iloc[0]["node_id"]) if len(baseline_ranked) else None
    )

    # Soft-penalize nodes already hosting session jobs (capacity pressure).
    for nid, load in load_map.items():
        mask = scored["node_id"] == nid
        if not mask.any():
            continue
        pressure = (
            load["cpu_delta"] * 0.15
            + load["gpu_delta"] * 0.25
            + load["mem_delta"] * 40.0
        )
        scored.loc[mask, "placement_score"] = (
            scored.loc[mask, "placement_score"] - pressure
        ).clip(lower=0)

    others = scored[scored["node_id"] != int(worst["node_id"])].copy()
    eligible = others[
        others.apply(lambda r: _row_meets_with_load(r, req, load_map), axis=1)
    ]

    unconstrained = (
        (eligible if len(eligible) else others)
        .sort_values(["placement_score", "node_id"], ascending=[False, True])
        .reset_index(drop=True)
    )

    free = unconstrained[~unconstrained["node_id"].isin(claimed_ids)]
    all_free = others[~others["node_id"].isin(claimed_ids)]
    constrained = False
    session_note: Optional[str] = None

    # Strict rule: one node → one session job. Never recommend a claimed host.
    if len(free):
        ranked = free.reset_index(drop=True)
    elif len(all_free):
        ranked = (
            all_free.sort_values(
                ["placement_score", "node_id"], ascending=[False, True]
            )
            .reset_index(drop=True)
        )
        constrained = True
        session_note = (
            "No free host fully meets every requirement — placed on the best "
            "unclaimed node (exclusive: one job per node)."
        )
    else:
        raise DemoNoFreeNodeError(
            "No free nodes left in this session — every safer host already "
            "has a job. Clear the session or refresh the fleet seed."
        )

    shortlist = ranked.head(_CANDIDATE_N)
    best = shortlist.iloc[0]

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

    from_metrics = _node_metrics(worst)
    to_metrics = _apply_load_to_row(best, load_map.get(best_id, {}))
    from_fit = _evaluate_fit(from_metrics, req)
    to_fit = _evaluate_fit(to_metrics, req)

    if (
        not constrained
        and baseline_best_id is not None
        and baseline_best_id != best_id
        and baseline_best_id in claimed_ids
    ):
        prior = next(
            (r for r in reservations if int(r["node_id"]) == baseline_best_id),
            None,
        )
        job_ref = (
            f"Job {prior['job_id']}"
            if prior and prior.get("job_id")
            else "a prior job"
        )
        session_note = (
            f"Avoided Node {baseline_best_id} — already hosting {job_ref} "
            f"in this session. Recommending Node {best_id} instead."
        )

    candidates: list[dict[str, Any]] = []
    for i, (_, row) in enumerate(shortlist.iterrows()):
        nid = int(row["node_id"])
        comps = store.placement_components(
            float(row["fused_risk"]),
            float(row["anomaly_score"]),
            float(fail_map.get(nid, 0.0)),
        )
        m = _apply_load_to_row(row, load_map.get(nid, {}))
        candidates.append(
            {
                "rank": i + 1,
                "node_id": nid,
                "placement_score": round(float(row["placement_score"]), 1),
                "fused_risk": round(float(row["fused_risk"]), 1),
                "risk_score": round(float(row["risk_score"]), 1),
                "components": comps,
                "meets_requirements": _evaluate_fit(m, req)["meets_all"],
                "selected": nid == best_id,
                "reserved": nid in claimed_ids,
            }
        )

    hist_rows = (
        store.data[store.data["node_id"] == worst_id] if store.data is not None else None
    )
    fail_rate = (
        float(hist_rows["will_fail"].mean())
        if hist_rows is not None and len(hist_rows)
        else float(fail_map.get(worst_id, 0.0))
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        reasons = store.shap_reasons(worst, failure_rate=fail_rate)

    health_before = round(100 - worst_fused, 1)
    health_after = round(100 - best_fused, 1)
    savings = _early_prediction_savings(worst_fused, best_fused)

    afr = store.actual_failure_rate(best_id)
    if afr is not None:
        afr = round(afr, 4)

    fail_labels = [c["label"] for c in from_fit["checks"] if not c["met"]]

    steps = [
        "Scanning fleet\u2026",
        f"Job {job['id']} · {job['label'].split(' · ')[0]} requirements loaded",
        f"Node {worst_id} fails: " + (", ".join(fail_labels[:3]) or "safety checks"),
        (
            f"Scoring top {_CANDIDATE_N} placement candidates "
            f"(safety 60% + normality 30% + history 10%)\u2026"
        ),
        (
            f"Recommend Job {job['id']} \u2192 Node {best_id} "
            f"(meets {to_fit['met_count']}/{to_fit['total']})"
        ),
        (
            f"Workload health {health_before} \u2192 {health_after} · "
            f"est. ${savings['estimated_usd']:,.0f} avoided"
        ),
    ]

    return {
        "seed": use_seed,
        "rank": use_rank,
        "pool_size": pool_n,
        "job": job,
        "from": {
            "node_id": worst_id,
            "risk_score": worst_risk,
            "anomaly_score": round(float(worst["anomaly_score"]), 4),
            "fused_risk": worst_fused,
            "placement_score": worst_score,
            "health": health_before,
            "reasons": reasons,
            "metrics": from_metrics,
            "fit": from_fit,
        },
        "to": {
            "node_id": best_id,
            "risk_score": best_risk,
            "anomaly_score": round(float(best["anomaly_score"]), 4),
            "fused_risk": best_fused,
            "placement_score": best_score,
            "health": health_after,
            "actual_failure_rate": afr,
            "metrics": to_metrics,
            "fit": to_fit,
        },
        "candidates": candidates,
        "cost_savings": savings,
        "health_before": health_before,
        "health_after": health_after,
        "placement_delta": round(best_score - worst_score, 2),
        "fusion": store.meta()["fusion"],
        "model_version": store.model_version,
        "caveat": (
            "Demo criticals are the same node_critical machines as Warnings "
            f"(fused risk > {critical:.0f}%, up to {_MAX_DEMO_RANKS}). "
            "Each placement loads a job profile, compares that critical host "
            "against a safer recommendation, and accounts for nodes already "
            "used in this session. "
            f"Critical rank {use_rank + 1}/{pool_n} · seed {use_seed}. "
            + savings["caveat"]
        ),
        "steps": steps,
        "fit_headline": {
            "assign_fails": fail_labels,
            "recommend_meets": [c["label"] for c in to_fit["checks"] if c["met"]],
        },
        "critical_threshold": critical,
        "source": "warnings_node_critical",
        "session_note": session_note,
        "constrained": constrained,
        "reservations_applied": len(reservations),
    }


def _valid_cached(cached: dict[str, Any] | None) -> bool:
    return bool(
        cached is not None
        and "candidates" in cached
        and "cost_savings" in cached
        and isinstance(cached.get("job"), dict)
        and cached["job"].get("locked") is False
        and "requirements" in cached["job"]
        and "fit" in cached.get("from", {})
        and "fit" in cached.get("to", {})
        and cached.get("source") == "warnings_node_critical"
    )


def _get_or_build_scenario(
    use_seed: int,
    rank: int,
    *,
    critical: float,
    watch: float,
    reservations: list[dict[str, Any]],
    session_index: int | None = None,
    shadow_event: str = "demo",
) -> dict[str, Any]:
    rhash = _reservations_hash(reservations)
    cache_key = (use_seed, int(rank), float(critical), rhash)
    cached = _SCENARIO_CACHE.get(cache_key)
    if _valid_cached(cached):
        return cached  # type: ignore[return-value]

    result = _scenario_for_seed(
        use_seed,
        rank,
        critical=critical,
        watch=watch,
        reservations=reservations,
    )
    store.append_shadow(
        {
            "event": shadow_event,
            "from": result["from"]["node_id"],
            "to": result["to"]["node_id"],
            "health_before": result["health_before"],
            "health_after": result["health_after"],
            "placement_delta": result["placement_delta"],
            "estimated_savings_usd": result["cost_savings"]["estimated_usd"],
            "job_id": result["job"]["id"],
            "seed": use_seed,
            "rank": result["rank"],
            "critical": critical,
            "reservations": len(reservations),
            "session_index": session_index,
            "constrained": result.get("constrained", False),
        }
    )
    _SCENARIO_CACHE[cache_key] = result
    return result


@router.get("/scenario")
def scenario(
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
    rank: int = Query(0, ge=0, le=100),
):
    """Demo a critical node from the current fleet snapshot.

    Critical pool matches Warnings ``node_critical`` alerts
    (``fused_risk > critical``, capped at 25).
    ``rank`` selects among those machines (0 = worst).
    Advancing rank also cycles the incoming job + requirements.
    """
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    use_seed = store.refresh_seed if seed is None else seed
    return _get_or_build_scenario(
        use_seed,
        rank,
        critical=critical,
        watch=watch,
        reservations=[],
        shadow_event="demo",
    )


@router.post("/session/place")
def session_place(body: DemoPlaceBody):
    """Place the next demo job with session capacity reservations applied.

    Enforces exclusive hosts: a node already reserved in this session is
    never recommended for another job.
    """
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    use_seed = store.refresh_seed if body.seed is None else body.seed
    reservations = _normalize_reservations(body.reservations)
    try:
        return _get_or_build_scenario(
            use_seed,
            body.rank,
            critical=body.critical,
            watch=body.watch,
            reservations=reservations,
            session_index=body.session_index,
            shadow_event="demo_place",
        )
    except DemoNoFreeNodeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@router.post("/session/place-batch")
def session_place_batch(body: DemoPlaceBatchBody):
    """Place many queued jobs at once with exclusive node assignment.

    Each placement accumulates a reservation so later jobs cannot land on
    the same recommend host. Stops early if the fleet runs out of free nodes.
    """
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    if not body.ranks:
        raise HTTPException(status_code=400, detail="ranks must not be empty")

    use_seed = store.refresh_seed if body.seed is None else body.seed
    reservations = _normalize_reservations(body.reservations)
    placements: list[dict[str, Any]] = []
    stopped_reason: Optional[str] = None

    for i, rank in enumerate(body.ranks):
        session_index = int(body.session_index_start) + i
        try:
            result = _get_or_build_scenario(
                use_seed,
                int(rank),
                critical=body.critical,
                watch=body.watch,
                reservations=reservations,
                session_index=session_index,
                shadow_event="demo_place",
            )
        except DemoNoFreeNodeError as e:
            stopped_reason = str(e)
            break
        placements.append(result)
        reservations.append(_reservation_from_result(result))

    return {
        "seed": use_seed,
        "placements": placements,
        "reservations": reservations,
        "placed_count": len(placements),
        "requested_count": len(body.ranks),
        "stopped_reason": stopped_reason,
    }


@router.get("/job-preview")
def job_preview(
    seed: int | None = Query(None),
    rank: int = Query(0, ge=0, le=100),
):
    """Lightweight job label preview for queue UI (no SHAP / scoring)."""
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    use_seed = store.refresh_seed if seed is None else seed
    return {"seed": use_seed, "rank": rank, "job": _job_preview(use_seed, rank)}
