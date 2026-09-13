"""Ajan döngüsü — tool çağrılarını yürütür, riskli olanları onaya düşürür.

--------------------------------------------------------------------------------
DÖNGÜNÜN SÖZLEŞMESİ
--------------------------------------------------------------------------------
1. Model bir ya da birden çok `tool_use` bloğu üretir.
2. Her blok için:
   * `AUTO_EXECUTE` ise -> handler çalışır, gerçek sonuç döner.
   * `APPROVAL_REQUIRED` ise -> **hiçbir veri değişmez**. Bir `PendingAction`
     satırı açılır ve modele "kullanıcı onayı bekleniyor" sonucu döner.
3. Tüm `tool_result` blokları **TEK** bir user mesajında geri gönderilir.
   Bunları ayrı mesajlara bölmek modele "paralel tool çağırma" diye sessiz bir
   sinyal verir ve sonraki turlarda paralellik kaybolur.
4. `end_turn` gelene ya da tavana ulaşana kadar tekrarla.

Neden SDK'nın `tool_runner` yardımcısı kullanılmadı: burada her turda
(a) cevabı SSE ile istemciye akıtmak, (b) `ChatMessage` satırlarını yazmak,
(c) onay kartı üretmek gerekiyor. `tool_runner` bu üç kancayı aynı anda
vermiyor ve ayrıca beta. Döngüyü açık yazmak burada daha az sürpriz üretiyor.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from overload_api.db.models.ai import (
    ActionLog,
    ActionResult,
    ActionType,
    ChatMessage,
    ChatRole,
    PendingAction,
)
from overload_api.db.models.user import User
from overload_api.services.ai import executors
from overload_api.services.ai.client import complete_chat
from overload_api.services.ai.tools import APPROVAL_REQUIRED, AUTO_EXECUTE

MAX_TOOL_ITERATIONS = 8


@dataclass(slots=True)
class TurnEvent:
    """İstemciye SSE ile gönderilen olay."""

    type: str  # "text" | "tool_started" | "pending_action" | "done" | "error"
    data: dict[str, Any]

    def to_sse(self) -> str:
        return f"event: {self.type}\ndata: {json.dumps(self.data, ensure_ascii=False)}\n\n"


def _summarize_for_card(action: ActionType, payload: dict[str, Any]) -> str:
    """Onay kartında görünecek tek satırlık insan-okur özet.

    Modelin ürettiği metne güvenmiyoruz; özeti payload'ın *yapısından* üretiyoruz.
    """
    match action:
        case ActionType.propose_program:
            days = payload.get("days", [])
            n_ex = sum(len(d.get("exercises", [])) for d in days)
            return f"«{payload.get('name', 'İsimsiz program')}» — {len(days)} gün, {n_ex} hareket"
        case ActionType.propose_update:
            op = "Silme" if payload.get("operation") == "delete" else "Güncelleme"
            return f"{op}: {payload.get('entity')} ({payload.get('reason', '')[:120]})"
        case ActionType.add_exercise_to_library:
            return f"Kütüphaneye yeni hareket: «{payload.get('name')}» ({payload.get('equipment')})"
        case _:
            return action.value


async def _handle_tool_call(
    session: AsyncSession,
    user: User,
    *,
    tool_name: str,
    tool_use_id: str,
    tool_input: dict[str, Any],
    chat_message_id: uuid.UUID | None,
) -> tuple[dict[str, Any], PendingAction | None]:
    """Tek tool çağrısını işler. Dönüş: (tool_result bloğu, varsa PendingAction)."""
    now = datetime.now(UTC)

    # Bilinmeyen tool adı: modelin uydurduğu bir isim olabilir. Hata döndür,
    # sessizce yutma — model düzeltebilsin.
    try:
        action = ActionType(tool_name)
    except ValueError:
        return (
            {
                "type": "tool_result",
                "tool_use_id": tool_use_id,
                "content": f"'{tool_name}' diye bir tool yok.",
                "is_error": True,
            },
            None,
        )

    # --- Onay gerektirenler: SADECE öneri kaydı oluştur ---
    if action in APPROVAL_REQUIRED:
        pending = PendingAction(
            user_id=user.id,
            action_type=action,
            payload=tool_input,
            summary=_summarize_for_card(action, tool_input),
            chat_message_id=chat_message_id,
            tool_use_id=tool_use_id,
        )
        session.add(pending)
        await session.flush()  # id lazım

        session.add(
            ActionLog(
                user_id=user.id,
                action_type=action,
                payload=tool_input,
                result=ActionResult.proposed,
                detail=pending.summary,
                pending_action_id=pending.id,
                created_at=now,
            )
        )
        return (
            {
                "type": "tool_result",
                "tool_use_id": tool_use_id,
                "content": (
                    "Öneri kullanıcıya onay kartı olarak gösterildi. "
                    "HENÜZ HİÇBİR ŞEY KAYDEDİLMEDİ — kullanıcı onaylayana kadar bu "
                    "veri yok. Cevabında 'kaydettim' deme; kartı inceleyip "
                    "onaylamasını iste."
                ),
            },
            pending,
        )

    # --- Otomatik çalışanlar ---
    if action not in AUTO_EXECUTE:  # pragma: no cover - iki küme ALL_TOOLS'u kapsıyor
        return (
            {
                "type": "tool_result",
                "tool_use_id": tool_use_id,
                "content": f"'{tool_name}' bu bağlamda çalıştırılamaz.",
                "is_error": True,
            },
            None,
        )

    try:
        result_text = await executors.execute_auto_tool(session, user, action, tool_input)
        outcome, detail = ActionResult.executed, result_text[:2000]
        is_error = False
    except executors.ToolExecutionError as exc:
        # Beklenen türden hata (besin bulunamadı, geçersiz slug...). Modele geri
        # bildir; düzeltip tekrar deneyebilir.
        result_text, outcome, detail, is_error = str(exc), ActionResult.failed, str(exc), True

    session.add(
        ActionLog(
            user_id=user.id,
            action_type=action,
            payload=tool_input,
            result=outcome,
            detail=detail,
            created_at=now,
        )
    )
    return (
        {
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": result_text,
            **({"is_error": True} if is_error else {}),
        },
        None,
    )


async def run_turn(
    session: AsyncSession,
    user: User,
    *,
    history: list[dict[str, Any]],
    chat_message_id: uuid.UUID | None = None,
) -> AsyncIterator[TurnEvent]:
    """Bir sohbet turunu baştan sona yürütür ve olayları yayar.

    `history` Anthropic mesaj biçiminde; son eleman kullanıcının (bağlam bloğu
    eklenmiş) mesajı olmalı.
    """
    messages = list(history)
    assistant_blocks: list[dict[str, Any]] = []

    for _iteration in range(MAX_TOOL_ITERATIONS):
        try:
            response = await complete_chat(messages)
        except Exception as exc:
            yield TurnEvent("error", {"message": f"Model çağrısı başarısız: {exc}"})
            return

        # Güvenlik sınıflandırıcısı reddettiyse `content` okumadan önce yakala.
        if response.stop_reason == "refusal":
            detail = getattr(response.stop_details, "explanation", None) or ""
            yield TurnEvent(
                "error",
                {"message": "Model bu isteği güvenlik gerekçesiyle yanıtlamadı.", "detail": detail},
            )
            return

        blocks = [b.model_dump() for b in response.content]
        assistant_blocks = blocks

        for block in response.content:
            if block.type == "text" and block.text:
                yield TurnEvent("text", {"text": block.text})

        if response.stop_reason != "tool_use":
            yield TurnEvent(
                "done",
                {
                    "content_blocks": blocks,
                    "usage": {
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens,
                        "cache_read": getattr(response.usage, "cache_read_input_tokens", 0),
                    },
                },
            )
            return

        messages.append({"role": "assistant", "content": blocks})

        tool_results: list[dict[str, Any]] = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            yield TurnEvent("tool_started", {"name": block.name})

            result_block, pending = await _handle_tool_call(
                session,
                user,
                tool_name=block.name,
                tool_use_id=block.id,
                tool_input=dict(block.input),
                chat_message_id=chat_message_id,
            )
            tool_results.append(result_block)

            if pending is not None:
                yield TurnEvent(
                    "pending_action",
                    {
                        "id": str(pending.id),
                        "action_type": pending.action_type.value,
                        "summary": pending.summary,
                        "payload": pending.payload,
                    },
                )

        # Sözleşme #3: hepsi TEK user mesajında.
        messages.append({"role": "user", "content": tool_results})

    # Tavana ulaşıldı — döngüyü kesiyoruz ki maliyet patlamasın.
    yield TurnEvent(
        "error",
        {
            "message": (
                f"Tool döngüsü {MAX_TOOL_ITERATIONS} adımda sonuçlanmadı; tur kesildi. "
                "İsteğini daha küçük parçalara bölmeyi dene."
            ),
            "content_blocks": assistant_blocks,
        },
    )


def persist_messages(
    session: AsyncSession,
    user: User,
    *,
    user_text: str,
    image_url: str | None,
    assistant_blocks: list[dict[str, Any]],
) -> tuple[ChatMessage, ChatMessage]:
    """Turu kalıcılaştırır.

    `content_blocks` ham hâliyle saklanır: sonraki turda geçmişi eksiksiz geri
    göndermezsek model kendi `tool_use` bloğunu göremez ve `tool_result`
    eşleşmediği için API 400 döner.
    """
    now = datetime.now(UTC)
    user_msg = ChatMessage(
        user_id=user.id,
        role=ChatRole.user,
        content=user_text,
        image_url=image_url,
        created_at=now,
    )
    assistant_text = "\n".join(
        b.get("text", "") for b in assistant_blocks if b.get("type") == "text"
    )
    assistant_msg = ChatMessage(
        user_id=user.id,
        role=ChatRole.assistant,
        content=assistant_text,
        content_blocks=assistant_blocks,
        created_at=now,
    )
    session.add_all([user_msg, assistant_msg])
    return user_msg, assistant_msg
