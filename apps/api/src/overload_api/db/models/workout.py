"""Antrenman seansları, set kayıtları ve kişisel rekorlar.

Progresif overload motorunun (bölüm 3) okuduğu tablolar bunlar.

**Neden `user_id` alt tablolarda da var (denormalizasyon):** `set_log.user_id` teknik
olarak `workout_session` üzerinden türetilebilir. Ama RLS politikası her satır için
JOIN yapmak zorunda kalırdı — hem yavaş hem de politika yazımı kırılgan olurdu.
Prompt'un "her tabloda user_id" şartı da bunu istiyor. Tutarlılık, session'a yazarken
`user_id`'yi kopyalayan servis katmanı + FK bileşimiyle korunur.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from overload_api.db.base import Base, TimestampMixin, enum_column, pk_column
from overload_api.db.models.program import IntensityTechnique


class PRType(StrEnum):
    """Kişisel rekor türleri. Dördü de ayrı kutlanır çünkü farklı şeyler ölçerler:
    ağır tek set (max_weight), dayanıklılık (max_reps), toplam iş (session_volume),
    ve ikisini birleştiren tahmini tek tekrar maksimumu (estimated_1rm)."""

    max_weight = "max_weight"
    max_reps = "max_reps"
    session_volume = "session_volume"
    estimated_1rm = "estimated_1rm"


class WorkoutSession(TimestampMixin, Base):
    __tablename__ = "workout_session"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    # Serbest (programsız) antrenmanda NULL olabilir.
    program_day_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("program_day.id", ondelete="SET NULL")
    )
    started_at: Mapped[datetime] = mapped_column(nullable=False)
    completed_at: Mapped[datetime | None]
    notes: Mapped[str | None] = mapped_column(String(2000))
    # Deload haftası otomasyonu (bölüm 4.1) bu bayrağı kullanır.
    is_deload: Mapped[bool] = mapped_column(default=False, nullable=False)

    set_logs: Mapped[list[SetLog]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SetLog.set_number",
        lazy="selectin",
    )

    __table_args__ = (
        CheckConstraint(
            "completed_at IS NULL OR completed_at >= started_at", name="completed_after_start"
        ),
        # Takvim/streak sorguları hep kullanıcı + tarih ile filtreler.
        Index("ix_workout_session_user_id_started_at", "user_id", "started_at"),
    )

    @property
    def is_complete(self) -> bool:
        return self.completed_at is not None


class SetLog(Base):
    """Tek bir set. Progresif overload motorunun temel birimi.

    `rir` NULL ise: set failure'a kadar götürülmüş ya da kullanıcı girmemiş demektir.
    Motor bunu 0 gibi değil, 'bilinmiyor' olarak ele alır (bkz. progression.py).
    """

    __tablename__ = "set_log"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    workout_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_session.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercise.id", ondelete="RESTRICT"), nullable=False
    )
    set_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    weight_kg: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    reps: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    rir: Mapped[int | None] = mapped_column(SmallInteger)

    is_warmup: Mapped[bool] = mapped_column(default=False, nullable=False)
    technique: Mapped[IntensityTechnique] = enum_column(
        IntensityTechnique, default=IntensityTechnique.straight, nullable=False
    )
    completed_at: Mapped[datetime | None]

    session: Mapped[WorkoutSession] = relationship(back_populates="set_logs")

    __table_args__ = (
        # Vücut ağırlığı hareketlerinde 0 kg geçerli; negatif değil.
        CheckConstraint("weight_kg >= 0", name="weight_non_negative"),
        CheckConstraint("reps BETWEEN 1 AND 200", name="reps_range"),
        CheckConstraint("rir IS NULL OR rir BETWEEN 0 AND 10", name="rir_range"),
        CheckConstraint("set_number BETWEEN 1 AND 50", name="set_number_range"),
        UniqueConstraint("workout_session_id", "exercise_id", "set_number", name="uq_set_slot"),
        # Motorun en sıcak sorgusu: "bu kullanıcının bu hareketteki son setleri".
        Index("ix_set_log_user_id_exercise_id", "user_id", "exercise_id"),
    )

    @property
    def volume(self) -> Decimal:
        """Tonaj: ağırlık x tekrar. Failure setlerinde motorun baz aldığı metrik."""
        return self.weight_kg * self.reps

    @property
    def estimated_1rm(self) -> Decimal:
        """Epley formülü: 1RM ≈ w x (1 + r/30).

        Tek tekrarda formül kendini ağırlığa indirger (doğru davranış). 12+ tekrarda
        sapma büyür; bu yüzden PR takibinde 1RM tahmini 12 tekrara kadar anlamlı sayılır.
        """
        return self.weight_kg * (Decimal(1) + Decimal(self.reps) / Decimal(30))


class PersonalRecord(Base):
    """Kırılan rekorlar. Her yeni rekor yeni satır — geçmiş üzerine yazılmaz ki
    'PR grafiği' (bölüm 4.4) zaman serisini gösterebilsin."""

    __tablename__ = "personal_record"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercise.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[PRType] = enum_column(PRType, nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # max_weight rekorunda kaç tekrarla yapıldığı bağlamı — "100kg x 1" ile
    # "100kg x 8" aynı rekor değil.
    reps: Mapped[int | None] = mapped_column(SmallInteger)
    achieved_at: Mapped[datetime] = mapped_column(nullable=False)
    workout_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workout_session.id", ondelete="SET NULL")
    )
    # Kutlama animasyonu bir kez gösterilsin diye.
    seen_by_user: Mapped[bool] = mapped_column(default=False, nullable=False)

    __table_args__ = (
        CheckConstraint("value > 0", name="value_positive"),
        Index("ix_personal_record_user_id_exercise_id_type", "user_id", "exercise_id", "type"),
    )
