"""AI asistanı: sohbet, onay bekleyen aksiyonlar, denetim kaydı, koç raporu.

**Güvenlik modelinin kalbi burada.** Model asla doğrudan veritabanı değişikliği
yapmaz. Riskli bir tool çağırdığında yalnızca bir `PendingAction` satırı doğar —
öneri, uygulama değil. Kullanıcı sohbetteki onay kartına bastığında istek AI'ya
değil, `POST /pending-actions/{id}/approve` adresine gider ve değişikliği orada
deterministik Python kodu uygular.

Bu ayrımın önemi: `payload` alanı **modelin yazdığı veridir**, yani güvenilmez girdi.
Onay endpoint'i onu uygulamadan önce Pydantic şemasıyla yeniden doğrular; JSONB'de
ne yazdığına bakılmaksızın şemaya uymayan hiçbir şey veritabanına geçemez.
"""

from __future__ import annotations

import uuid
from datetime import date as date_t
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from overload_api.db.base import Base, TimestampMixin, enum_column, pk_column


class ChatRole(StrEnum):
    user = "user"
    assistant = "assistant"


class ActionType(StrEnum):
    """AI'nın çağırabileceği tool'ların tamamı.

    Hangisinin onay gerektirdiği burada değil, `ai/tools.py` içindeki
    `APPROVAL_REQUIRED` kümesinde tanımlı — tek kaynak orası.
    """

    # --- Otomatik: yalnızca yeni kayıt ekler, var olanı değiştirmez ---
    log_food_item = "log_food_item"
    log_activity = "log_activity"
    log_bodyweight = "log_bodyweight"
    log_soreness = "log_soreness"
    log_supplement = "log_supplement"
    search_exercise_library = "search_exercise_library"
    get_progression_suggestion = "get_progression_suggestion"

    # --- Onay gerektirir: var olanı değiştirir/siler ya da program kurar ---
    propose_program = "propose_program"
    propose_update = "propose_update"
    add_exercise_to_library = "add_exercise_to_library"


class PendingActionStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    expired = "expired"


class ActionResult(StrEnum):
    proposed = "proposed"
    executed = "executed"
    rejected = "rejected"
    failed = "failed"


class ChatMessage(Base):
    __tablename__ = "chat_message"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[ChatRole] = enum_column(ChatRole, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    image_url: Mapped[str | None] = mapped_column(String(500))  # R2 anahtarı
    # Anthropic content block'larının ham hâli. Sonraki turda geçmişi eksiksiz
    # geri göndermek için şart: tool_use bloklarını atarsak model kendi
    # çağrısını göremez ve tool_result'ı eşleştiremez (API hatası).
    content_blocks: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(nullable=False)

    __table_args__ = (Index("ix_chat_message_user_id_created_at", "user_id", "created_at"),)


class PendingAction(TimestampMixin, Base):
    """Onay bekleyen değişiklik önerisi. Sohbette onay kartı olarak görünür."""

    __tablename__ = "pending_action"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    action_type: Mapped[ActionType] = enum_column(ActionType, nullable=False)
    # Modelin ürettiği argümanlar. GÜVENİLMEZ — onay anında yeniden doğrulanır.
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # Kullanıcıya gösterilecek insan-okur özet ("5 günlük hipertrofi programı, 28 hareket").
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[PendingActionStatus] = enum_column(
        PendingActionStatus, default=PendingActionStatus.pending, nullable=False
    )

    # Onay kartının hangi mesajın altında çıkacağı.
    chat_message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chat_message.id", ondelete="CASCADE")
    )
    # Anthropic tool_use bloğunun id'si — tool_result'ı eşleştirmek için.
    tool_use_id: Mapped[str | None] = mapped_column(String(64))

    resolved_at: Mapped[datetime | None]
    # Onay sonrası oluşan/etkilenen kaydın kimliği (ör. yeni program id'si).
    result_entity_id: Mapped[uuid.UUID | None]
    error_message: Mapped[str | None] = mapped_column(String(1000))

    __table_args__ = (
        CheckConstraint(
            "(status = 'pending') = (resolved_at IS NULL)", name="resolved_matches_status"
        ),
        Index("ix_pending_action_user_id_status", "user_id", "status"),
    )

    @property
    def is_open(self) -> bool:
        return self.status is PendingActionStatus.pending


class ActionLog(Base):
    """Salt-ekleme denetim kaydı. Önerilen, onaylanan, reddedilen ve otomatik
    çalışan **her** aksiyon buraya yazılır — 'AI ne yaptı' sorusunun tek cevabı."""

    __tablename__ = "action_log"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    action_type: Mapped[ActionType] = enum_column(ActionType, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    result: Mapped[ActionResult] = enum_column(ActionResult, nullable=False)
    detail: Mapped[str | None] = mapped_column(String(2000))
    pending_action_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("pending_action.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False)

    __table_args__ = (Index("ix_action_log_user_id_created_at", "user_id", "created_at"),)


class CoachReport(Base):
    """Haftalık AI koç raporu. Batch API ile gece üretilir (bölüm 4.3)."""

    __tablename__ = "coach_report"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    # Haftanın Pazartesi'si — tekilliği bu sağlıyor.
    week_start: Mapped[date_t] = mapped_column(nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Rapor üretilirken kullanılan özet metrikler (grafik çizmek ve
    # "bu sayı nereden geldi" sorusunu cevaplamak için).
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    generated_at: Mapped[datetime] = mapped_column(nullable=False)
    read_at: Mapped[datetime | None]

    __table_args__ = (
        UniqueConstraint("user_id", "week_start", name="uq_coach_report_user_week"),
        Index("ix_coach_report_user_id_week_start", "user_id", "week_start"),
    )
