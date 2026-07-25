from __future__ import annotations

from fastapi import APIRouter, Query

from api.services.brief_logic import build_daily_brief
from api.services.store import store

router = APIRouter(prefix="/api/fleet", tags=["fleet"])


@router.get("/daily-brief")
def daily_brief(seed: int | None = Query(default=None, ge=0)):
    """Daily Action Brief — top-5 ranked plan joining all three models.

    Optional `seed` matches the fleet snapshot so Refresh keeps brief + fleet in sync.
    """
    return build_daily_brief(store, seed=seed)

