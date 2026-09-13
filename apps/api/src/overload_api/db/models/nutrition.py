"""Beslenme ve aktivite kayıtları.

`FoodDatabaseEntry` dış kaynakların (USDA, Open Food Facts) yerel önbelleği.
Kullanıcıya ait değildir, RLS uygulanmaz — herkes aynı 'tavuk göğsü' satırını
paylaşır. Bu hem API kotasını korur hem de aynı besini tekrar tekrar çekmeyi önler.
"""

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


class FoodSource(StrEnum):
    usda = "usda"
    open_food_facts = "open_food_facts"
    manual = "manual"  # kullanıcının elle girdiği besin


class MealType(StrEnum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    snack = "snack"


class ActivityType(StrEnum):
    walking = "walking"
    running = "running"
    cycling = "cycling"
    swimming = "swimming"
    sports = "sports"
    other = "other"


class ActivitySource(StrEnum):
    manual = "manual"
    ai_parsed = "ai_parsed"


class FoodDatabaseEntry(TimestampMixin, Base):
    """Besin önbelleği. Makrolar **100 gram başına** saklanır — kaynaklar porsiyon
    tanımlarında tutarsız, 100g tek ortak payda."""

    __tablename__ = "food_database_entry"

    id: Mapped[uuid.UUID] = pk_column()
    source: Mapped[FoodSource] = enum_column(FoodSource, nullable=False)
    # USDA'da fdcId, OFF'ta barkod. manual kaynakta NULL.
    external_id: Mapped[str | None] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    search_name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(120))

    calories_per_100g: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    protein_g: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    carbs_g: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    fat_g: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    fiber_g: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))

    __table_args__ = (
        non_empty("name"),
        CheckConstraint("calories_per_100g >= 0", name="calories_non_negative"),
        CheckConstraint(
            "protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0", name="macros_non_negative"
        ),
        # Aynı dış kayıt iki kez önbelleklenmesin.
        UniqueConstraint("source", "external_id", name="uq_food_source_external"),
        Index("ix_food_database_entry_search_name", "search_name"),
    )


class NutritionLog(TimestampMixin, Base):
    """Yenen bir öğün kalemi. Makrolar `food_entry` x `quantity_g` ile türetilir —
    burada kopyalanmaz ki kaynak veri düzeltilince geçmiş de düzelsin."""

    __tablename__ = "nutrition_log"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_t] = mapped_column(nullable=False)
    food_database_entry_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("food_database_entry.id", ondelete="RESTRICT"), nullable=False
    )
    quantity_g: Mapped[Decimal] = mapped_column(Numeric(7, 1), nullable=False)
    meal_type: Mapped[MealType] = enum_column(MealType, nullable=False)
    # AI ayrıştırdıysa orijinal metin/foto — kullanıcı "bunu neden böyle saydı"
    # diye sorduğunda geri izlenebilsin.
    source_text: Mapped[str | None] = mapped_column(String(1000))
    photo_url: Mapped[str | None] = mapped_column(String(500))

    food_entry: Mapped[FoodDatabaseEntry] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint("quantity_g > 0 AND quantity_g <= 10000", name="quantity_range"),
        Index("ix_nutrition_log_user_id_date", "user_id", "date"),
    )

    def _scale(self, per_100g: Decimal) -> Decimal:
        return per_100g * self.quantity_g / Decimal(100)

    @property
    def calories(self) -> Decimal:
        return self._scale(self.food_entry.calories_per_100g)

    @property
    def protein_g(self) -> Decimal:
        return self._scale(self.food_entry.protein_g)

    @property
    def carbs_g(self) -> Decimal:
        return self._scale(self.food_entry.carbs_g)

    @property
    def fat_g(self) -> Decimal:
        return self._scale(self.food_entry.fat_g)


class ActivityLog(TimestampMixin, Base):
    """Antrenman dışı aktivite (yürüyüş, koşu...). TDEE'ye eklenir."""

    __tablename__ = "activity_log"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_t] = mapped_column(nullable=False)
    activity_type: Mapped[ActivityType] = enum_column(ActivityType, nullable=False)
    duration_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    estimated_calories: Mapped[int | None] = mapped_column(SmallInteger)
    source: Mapped[ActivitySource] = enum_column(
        ActivitySource, default=ActivitySource.manual, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(String(500))

    __table_args__ = (
        CheckConstraint("duration_min BETWEEN 1 AND 1440", name="duration_range"),
        CheckConstraint(
            "estimated_calories IS NULL OR estimated_calories >= 0", name="calories_non_negative"
        ),
        Index("ix_activity_log_user_id_date", "user_id", "date"),
    )
