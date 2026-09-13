"""Hareket kütüphanesi ve kas grubu eşlemesi.

Kas haritası özelliğinin doğruluğu tamamen `ExerciseMuscleMap` tablosuna bağlı.
Bu yüzden AI'nın serbestçe hareket adı uydurması engellenir (bkz. `ai/tools.py`):
uydurulan bir hareketin kas eşlemesi olmaz ve ısı haritası sessizce yanlışlanır.
"""

from __future__ import annotations

import uuid
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from overload_api.db.base import Base, TimestampMixin, enum_column, non_empty, pk_column


class MuscleRole(StrEnum):
    primary = "primary"
    secondary = "secondary"


class BodyRegion(StrEnum):
    """Kas haritası SVG'sinde ön/arka görünüm ayrımı için."""

    front = "front"
    back = "back"


class Equipment(StrEnum):
    barbell = "barbell"
    dumbbell = "dumbbell"
    machine = "machine"
    plate_loaded = "plate_loaded"
    smith_machine = "smith_machine"
    cable = "cable"
    bodyweight = "bodyweight"
    other = "other"


class MuscleGroup(Base):
    """Sabit referans tablosu (seed ile dolar). Kullanıcıya ait değil — RLS yok."""

    __tablename__ = "muscle_group"

    id: Mapped[uuid.UUID] = pk_column()
    slug: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name_tr: Mapped[str] = mapped_column(String(60), nullable=False)
    name_en: Mapped[str] = mapped_column(String(60), nullable=False)
    region: Mapped[BodyRegion] = enum_column(BodyRegion, nullable=False)
    # Kas haritası SVG'sindeki <path id="..."> değeri. Frontend bunu renklendirir.
    svg_id: Mapped[str] = mapped_column(String(40), nullable=False)
    # Haftalık hacim hedefi (set sayısı) — ısı haritasında "yeterli mi" eşiği.
    weekly_set_target: Mapped[int] = mapped_column(default=10, nullable=False)

    __table_args__ = (
        non_empty("slug"),
        CheckConstraint("weekly_set_target > 0", name="target_positive"),
    )


class Exercise(TimestampMixin, Base):
    """Hareket. `owner_id` NULL ise kütüphane hareketi (herkese açık, salt-okunur);
    dolu ise kullanıcının kendi eklediği özel hareket."""

    __tablename__ = "exercise"

    id: Mapped[uuid.UUID] = pk_column()
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Arama için normalize ad ("Plate Loaded Chest Press" -> "plate loaded chest press").
    # AI'nın search_exercise_library tool'u bu sütun üzerinden arar.
    search_name: Mapped[str] = mapped_column(String(120), nullable=False)
    equipment: Mapped[Equipment] = enum_column(Equipment, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(1000))
    is_custom: Mapped[bool] = mapped_column(default=False, nullable=False)
    # Tek taraflı hareketlerde hacim hesabı iki katı sayılır.
    is_unilateral: Mapped[bool] = mapped_column(default=False, nullable=False)

    muscle_map: Mapped[list[ExerciseMuscleMap]] = relationship(
        back_populates="exercise", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        non_empty("name"),
        Index("ix_exercise_search_name", "search_name"),
        Index("ix_exercise_owner_id", "owner_id"),
        # Aynı kullanıcı aynı adı iki kez ekleyemesin; kütüphanede de ad tekil.
        UniqueConstraint("owner_id", "search_name", name="uq_exercise_owner_search"),
    )


class ExerciseMuscleMap(Base):
    """Hareket -> kas grubu eşlemesi. Isı haritası ve hacim dengesi bunu kullanır.

    Hacim ağırlığı: primary kas 1.0 set, secondary kas 0.5 set sayılır
    (hipertrofi literatüründe yaygın 'fractional set' yaklaşımı).
    """

    __tablename__ = "exercise_muscle_map"

    id: Mapped[uuid.UUID] = pk_column()
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercise.id", ondelete="CASCADE"), nullable=False
    )
    muscle_group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("muscle_group.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MuscleRole] = enum_column(MuscleRole, nullable=False)

    exercise: Mapped[Exercise] = relationship(back_populates="muscle_map")
    muscle_group: Mapped[MuscleGroup] = relationship(lazy="joined")

    __table_args__ = (
        UniqueConstraint("exercise_id", "muscle_group_id", name="uq_exercise_muscle"),
        Index("ix_exercise_muscle_map_muscle_group_id", "muscle_group_id"),
    )

    @property
    def volume_weight(self) -> float:
        return 1.0 if self.role is MuscleRole.primary else 0.5
