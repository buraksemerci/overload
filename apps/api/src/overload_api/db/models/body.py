"""Vücut takibi: kilo, kas ağrısı (soreness), supplement."""

from __future__ import annotations

import uuid
from datetime import date as date_t
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

from overload_api.db.base import Base, TimestampMixin, enum_column, non_empty, pk_column


class SupplementSchedule(StrEnum):
    daily = "daily"
    training_days = "training_days"
    rest_days = "rest_days"
    as_needed = "as_needed"


class BodyWeightLog(TimestampMixin, Base):
    """Günlük kilo girişi. Günde tek kayıt — aynı gün tekrar girilirse üzerine yazılır,
    çünkü gün içi dalgalanma (su, yemek) trend çizgisini gürültüye boğar."""

    __tablename__ = "body_weight_log"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_t] = mapped_column(nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    body_fat_pct: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    notes: Mapped[str | None] = mapped_column(String(500))
    photo_url: Mapped[str | None] = mapped_column(String(500))  # R2 anahtarı

    __table_args__ = (
        CheckConstraint("weight_kg BETWEEN 20 AND 400", name="weight_sane"),
        CheckConstraint(
            "body_fat_pct IS NULL OR body_fat_pct BETWEEN 1 AND 70", name="bodyfat_sane"
        ),
        UniqueConstraint("user_id", "date", name="uq_bodyweight_user_date"),
        Index("ix_body_weight_log_user_id_date", "user_id", "date"),
    )


class SorenessCheckin(Base):
    """Kas grubu bazında günlük ağrı seviyesi (0-4).

    AI koçu bunu okur: 'dün bacak yaptın, quad'lerin 4/4 ağrıyor — bugünkü bacak
    gününü öne almak yerine üst vücuda geç' gibi öneriler bu veriye dayanır.
    """

    __tablename__ = "soreness_checkin"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_t] = mapped_column(nullable=False)
    muscle_group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("muscle_group.id", ondelete="CASCADE"), nullable=False
    )
    # 0 = ağrı yok, 4 = hareket kısıtlayıcı
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    __table_args__ = (
        CheckConstraint("level BETWEEN 0 AND 4", name="level_range"),
        UniqueConstraint("user_id", "date", "muscle_group_id", name="uq_soreness_slot"),
        Index("ix_soreness_checkin_user_id_date", "user_id", "date"),
    )


class InjuryNote(TimestampMixin, Base):
    """Sakatlık/ağrı notu (bölüm 4.1). Aktifken, o kas grubunu **primary** olarak
    çalıştıran hareketler antrenman modunda uyarı rozetiyle gösterilir."""

    __tablename__ = "injury_note"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    muscle_group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("muscle_group.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(String(1000), nullable=False)
    started_on: Mapped[date_t] = mapped_column(nullable=False)
    resolved_on: Mapped[date_t | None]

    __table_args__ = (
        non_empty("description"),
        CheckConstraint(
            "resolved_on IS NULL OR resolved_on >= started_on", name="resolved_after_start"
        ),
        Index("ix_injury_note_user_id_resolved_on", "user_id", "resolved_on"),
    )

    @property
    def is_active(self) -> bool:
        return self.resolved_on is None


class Supplement(TimestampMixin, Base):
    __tablename__ = "supplement"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    dose: Mapped[str | None] = mapped_column(String(80))  # "5 g", "2 kapsül"
    schedule: Mapped[SupplementSchedule] = enum_column(
        SupplementSchedule, default=SupplementSchedule.daily, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    intakes: Mapped[list[SupplementIntake]] = relationship(
        back_populates="supplement", cascade="all, delete-orphan"
    )

    __table_args__ = (
        non_empty("name"),
        UniqueConstraint("user_id", "name", name="uq_supplement_user_name"),
    )


class SupplementIntake(Base):
    """Günlük işaretleme. Satırın varlığı 'alındı' demek değil — `taken` alanı
    açıkça tutulur ki 'bugün atladım' da kayda geçsin (uyum oranı hesabı için)."""

    __tablename__ = "supplement_intake"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    supplement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("supplement.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_t] = mapped_column(nullable=False)
    taken: Mapped[bool] = mapped_column(nullable=False)

    supplement: Mapped[Supplement] = relationship(back_populates="intakes")

    __table_args__ = (
        UniqueConstraint("supplement_id", "date", name="uq_intake_supplement_date"),
        Index("ix_supplement_intake_user_id_date", "user_id", "date"),
    )
