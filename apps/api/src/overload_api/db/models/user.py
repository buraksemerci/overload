"""Kullanıcı ve hedefler."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from overload_api.db.base import Base, TimestampMixin, enum_column, pk_column


class Sex(StrEnum):
    """TDEE (Mifflin-St Jeor) formülü biyolojik cinsiyete göre farklı sabit kullanır.
    `unspecified` seçilirse TDEE hesabı yapılmaz, kullanıcı hedefini elle girer."""

    male = "male"
    female = "female"
    unspecified = "unspecified"


class ActivityLevel(StrEnum):
    """TDEE çarpanları — `nutrition/tdee.py` içinde sayısal karşılıkları var."""

    sedentary = "sedentary"
    light = "light"
    moderate = "moderate"
    active = "active"
    very_active = "very_active"


class GoalType(StrEnum):
    bodyweight = "bodyweight"
    body_fat_pct = "body_fat_pct"
    lift_1rm = "lift_1rm"
    weekly_sessions = "weekly_sessions"


class User(SQLAlchemyBaseUserTableUUID, TimestampMixin, Base):
    """fastapi-users tabanı: id, email, hashed_password, is_active, is_superuser,
    is_verified alanlarını sağlar. Altına profil alanları ekliyoruz.

    NOT: Bu tabloya RLS uygulanmaz — fastapi-users kimlik doğrulaması sırasında
    henüz bir `app.user_id` yokken e-postaya göre kullanıcı aramak zorunda.
    Erişim kontrolü router seviyesinde (`/users/me` dışında endpoint yok).
    """

    __tablename__ = "user"

    display_name: Mapped[str | None] = mapped_column(String(80))
    birth_date: Mapped[date | None]
    sex: Mapped[Sex] = enum_column(Sex, default=Sex.unspecified, nullable=False)
    height_cm: Mapped[int | None] = mapped_column(SmallInteger)
    activity_level: Mapped[ActivityLevel] = enum_column(
        ActivityLevel, default=ActivityLevel.moderate, nullable=False
    )
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Istanbul", nullable=False)

    # NOT: "aktif program" burada DEĞİL, `program.is_active` üzerinde tutulur.
    # Buraya bir `active_program_id` koymak user <-> program arasında karşılıklı
    # yabancı anahtar döngüsü yaratıyordu; migration hangi tabloyu önce
    # oluşturacağını çözemiyor. Program tarafındaki kısmi tekil indeks aynı
    # kuralı ("kullanıcı başına en fazla bir aktif program") veritabanı
    # seviyesinde, döngü olmadan garanti ediyor.

    __table_args__ = (
        CheckConstraint("height_cm IS NULL OR height_cm BETWEEN 80 AND 260", name="height_sane"),
    )


class Goal(TimestampMixin, Base):
    """Kullanıcının sayısal hedefi (ör. 'Aralık'a kadar 78 kg')."""

    __tablename__ = "goal"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[GoalType] = enum_column(GoalType, nullable=False)
    target_value: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    target_date: Mapped[date | None]
    # lift_1rm hedefi hangi harekete ait — diğer tiplerde NULL.
    exercise_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("exercise.id", ondelete="CASCADE")
    )
    achieved_at: Mapped[date | None]
    notes: Mapped[str | None] = mapped_column(String(500))

    __table_args__ = (
        Index("ix_goal_user_id_type", "user_id", "type"),
        CheckConstraint(
            "(type = 'lift_1rm') = (exercise_id IS NOT NULL)",
            name="lift_goal_needs_exercise",
        ),
    )
