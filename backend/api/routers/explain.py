from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from api.services.explain import explain_node

router = APIRouter(prefix="/api/explain", tags=["explain"])


class ExplainBody(BaseModel):
    node_id: int = Field(..., ge=0)
    seed: int | None = None
    critical: float = 70
    watch: float = 40


@router.post("")
def explain(body: ExplainBody):
    try:
        return explain_node(
            body.node_id,
            seed=body.seed,
            critical=body.critical,
            watch=body.watch,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("/{node_id}")
def explain_get(
    node_id: int,
    seed: int | None = Query(None),
    critical: float = Query(70),
    watch: float = Query(40),
):
    try:
        return explain_node(node_id, seed=seed, critical=critical, watch=watch)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
