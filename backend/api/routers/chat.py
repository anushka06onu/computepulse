from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.services.chat import chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[ChatTurn] = Field(default_factory=list)
    seed: Optional[int] = None
    critical: float = 70.0
    watch: float = 40.0
    node_id: Optional[int] = None


@router.post("")
def chat_endpoint(body: ChatBody) -> dict[str, Any]:
    """Grounded advisor: node briefs + product/feature help."""
    try:
        history = [
            {"role": t.role, "content": t.content}
            for t in body.history[-10:]
            if t.role in {"user", "assistant"} and t.content
        ]
        return chat(
            body.message.strip(),
            history=history,
            seed=body.seed,
            critical=body.critical,
            watch=body.watch,
            node_id=body.node_id,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e
