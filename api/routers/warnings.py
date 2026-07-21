from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.services.warnings import counts_only, get_alert, scan_warnings

router = APIRouter(prefix="/api/warnings", tags=["warnings"])


@router.get("/counts")
def warning_counts(
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
):
    try:
        return counts_only(seed=seed, critical=critical, watch=watch)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("")
def list_warnings(
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
    explain_budget: int = Query(0, ge=0, le=20),
):
    try:
        return scan_warnings(
            seed=seed,
            critical=critical,
            watch=watch,
            explain_budget=explain_budget,
            log_shadow=False,
            include_forecast=explain_budget > 0,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.post("/run")
def run_warning_scan(
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
    explain_budget: int = Query(0, ge=0, le=20),
):
    try:
        return scan_warnings(
            seed=seed,
            critical=critical,
            watch=watch,
            explain_budget=explain_budget,
            log_shadow=True,
            include_forecast=False,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("/{alert_id:path}")
def warning_detail(
    alert_id: str,
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
):
    try:
        alert = get_alert(
            alert_id, seed=seed, critical=critical, watch=watch, rich=True
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    return alert
