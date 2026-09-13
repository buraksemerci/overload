"""AI asistanı endpoint'leri — sohbet akışı ve onay kartları.

**Onay endpoint'i bu dosyanın en önemli parçası.** Sohbetteki "Onayla" butonu
modele değil buraya gelir; değişikliği burada, deterministik kod uygular.
Model bu endpoint'i çağıramaz — tool yüzeyinde karşılığı yok.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from overload_api.core.deps import CurrentUser, DbSession
from overload_api.db.models.ai import (
    ActionLog,
    ActionResult,
    ChatMessage,
    ChatRole,
    PendingAction,
    PendingActionStatus,
)
from overload_api.features.chat.context import build_history
from overload_api.services.ai import executors, runtime

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    image_url: str | None = Field(default=None, max_length=500)


class PendingActionOut(BaseModel):
    id: uuid.UUID
    action_type: str
    summary: str
    payload: dict[str, Any]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    role: ChatRole
    content: str
    image_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/messages", response_model=list[ChatMessageOut])
async def list_messages(db: DbSession, user: CurrentUser, limit: int = 50) -> list[ChatMessage]:
    rows = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(min(limit, 200))
    )
    return list(reversed(rows.scalars().all()))


@router.post("/stream")
async def stream_chat(payload: ChatRequest, db: DbSession, user: CurrentUser) -> StreamingResponse:
    """Bir sohbet turunu Server-Sent Events olarak akıtır.

    Akış SSE çünkü tek yönlü: sunucudan istemciye token akışı. WebSocket çift yönlü
    kanal kurup yeniden bağlanma/kalp atışı yönetimi getirirdi; burada karşılığı yok.
    """
    history = await build_history(db, user, payload.message, payload.image_url)
    assistant_blocks: list[dict[str, Any]] = []

    async def event_source() -> Any:
        nonlocal assistant_blocks
        async for event in runtime.run_turn(db, user, history=history):
            if event.type in {"done", "error"}:
                assistant_blocks = event.data.get("content_blocks", [])
            yield event.to_sse()

        runtime.persist_messages(
            db,
            user,
            user_text=payload.message,
            image_url=payload.image_url,
            assistant_blocks=assistant_blocks,
        )
        await db.commit()

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx/proxy arkasında akışı tamponlama
        },
    )


@router.get("/pending-actions", response_model=list[PendingActionOut])
async def list_pending(db: DbSession, user: CurrentUser) -> list[PendingAction]:
    rows = await db.execute(
        select(PendingAction)
        .where(
            PendingAction.user_id == user.id,
            PendingAction.status == PendingActionStatus.pending,
        )
        .order_by(PendingAction.created_at.desc())
    )
    return list(rows.scalars().all())


async def _load_open_action(
    db: DbSession, user: CurrentUser, action_id: uuid.UUID
) -> PendingAction:
    pending = await db.get(PendingAction, action_id)
    # RLS zaten başkasının kaydını gizler; burada açıkça de kontrol ediyoruz ki
    # hata mesajı net olsun ve savunma tek katmana bağlı kalmasın.
    if pending is None or pending.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Onay kaydı bulunamadı.")
    if pending.status is not PendingActionStatus.pending:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Bu aksiyon zaten '{pending.status.value}' durumunda.",
        )
    return pending


@router.post("/pending-actions/{action_id}/approve", response_model=PendingActionOut)
async def approve_action(action_id: uuid.UUID, db: DbSession, user: CurrentUser) -> PendingAction:
    """Onaylanan aksiyonu uygular.

    `executors.apply_pending_action` payload'ı Pydantic ile YENİDEN doğrular —
    payload modelin yazdığı veri olduğu için güvenilmez kabul edilir.
    """
    pending = await _load_open_action(db, user, action_id)
    now = datetime.now(UTC)

    try:
        entity_id = await executors.apply_pending_action(db, user, pending)
    except executors.ToolExecutionError as exc:
        # Başarısız onay da denetim kaydına girer; "neden olmadı" izlenebilsin.
        pending.status = PendingActionStatus.rejected
        pending.resolved_at = now
        pending.error_message = str(exc)
        db.add(
            ActionLog(
                user_id=user.id,
                action_type=pending.action_type,
                payload=pending.payload,
                result=ActionResult.failed,
                detail=str(exc),
                pending_action_id=pending.id,
                created_at=now,
            )
        )
        await db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    pending.status = PendingActionStatus.approved
    pending.resolved_at = now
    pending.result_entity_id = entity_id
    db.add(
        ActionLog(
            user_id=user.id,
            action_type=pending.action_type,
            payload=pending.payload,
            result=ActionResult.executed,
            detail=pending.summary,
            pending_action_id=pending.id,
            created_at=now,
        )
    )
    await db.commit()
    return pending


@router.post("/pending-actions/{action_id}/reject", response_model=PendingActionOut)
async def reject_action(action_id: uuid.UUID, db: DbSession, user: CurrentUser) -> PendingAction:
    pending = await _load_open_action(db, user, action_id)
    now = datetime.now(UTC)

    pending.status = PendingActionStatus.rejected
    pending.resolved_at = now
    db.add(
        ActionLog(
            user_id=user.id,
            action_type=pending.action_type,
            payload=pending.payload,
            result=ActionResult.rejected,
            detail="Kullanıcı reddetti.",
            pending_action_id=pending.id,
            created_at=now,
        )
    )
    await db.commit()
    return pending
