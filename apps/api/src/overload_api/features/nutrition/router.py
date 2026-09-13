"""Beslenme, kilo ve vücut takibi endpoint'leri."""

from __future__ import annotations

import uuid

# `date` takma adla import ediliyor: bu modüldeki şemalarda `date` adında bir
# ALAN var ve `date: date | None = None` yazıldığında Pydantic açıklamayı
# çözerken `date` adını sınıf gövdesinden okuyor — orada da varsayılan değer
# olan None duruyor. Sonuç: "unsupported operand for |: NoneType and NoneType".
# Takma ad tip adını alan adından tamamen ayırıyor.
from datetime import date as date_t
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from overload_api.core.deps import CurrentUser, DbSession
from overload_api.core.time import today_in
from overload_api.db.models.body import BodyWeightLog
from overload_api.db.models.nutrition import (
    FoodDatabaseEntry,
    FoodSource,
    MealType,
    NutritionLog,
)
from overload_api.services.nutrition import sources
from overload_api.services.nutrition.tdee import MacroTarget, NutritionGoal, age_from, macro_target

router = APIRouter(tags=["nutrition"])


# --- Şemalar -----------------------------------------------------------------


class FoodOut(BaseModel):
    id: uuid.UUID
    name: str
    brand: str | None
    source: FoodSource
    calories_per_100g: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal

    model_config = {"from_attributes": True}


class NutritionLogOut(BaseModel):
    id: uuid.UUID
    date: date_t
    meal_type: MealType
    quantity_g: Decimal
    food: FoodOut
    calories: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal


class DayTotals(BaseModel):
    calories: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal


class MacroTargetOut(BaseModel):
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    bmr: int
    tdee: int
    floor_applied: bool

    model_config = {"from_attributes": True}


class DayOut(BaseModel):
    date: date_t
    items: list[NutritionLogOut]
    totals: DayTotals
    target: MacroTargetOut | None
    remaining: DayTotals | None


class NutritionLogIn(BaseModel):
    food_database_entry_id: uuid.UUID
    quantity_g: Decimal = Field(gt=0, le=10000)
    meal_type: MealType
    date: date_t | None = None


class BodyWeightIn(BaseModel):
    weight_kg: Decimal = Field(ge=20, le=400)
    date: date_t | None = None
    body_fat_pct: Decimal | None = Field(default=None, ge=1, le=70)
    notes: str | None = Field(default=None, max_length=500)


class BodyWeightOut(BaseModel):
    id: uuid.UUID
    date: date_t
    weight_kg: Decimal
    body_fat_pct: Decimal | None
    notes: str | None

    model_config = {"from_attributes": True}


class WeightTrendPoint(BaseModel):
    date: date_t
    weight_kg: Decimal
    #: 7 günlük hareketli ortalama — günlük dalgalanmayı (su, tuz, sindirim)
    #: eleyip gerçek eğilimi gösterir. Tek günlük ölçüme bakmak yanıltıcı.
    moving_average: Decimal | None


def _log_out(log: NutritionLog) -> NutritionLogOut:
    return NutritionLogOut(
        id=log.id,
        date=log.date,
        meal_type=log.meal_type,
        quantity_g=log.quantity_g,
        food=FoodOut.model_validate(log.food_entry),
        calories=log.calories,
        protein_g=log.protein_g,
        carbs_g=log.carbs_g,
        fat_g=log.fat_g,
    )


async def _current_target(
    db: DbSession, user: CurrentUser, goal: NutritionGoal
) -> MacroTarget | None:
    """Hedefi kullanıcının SON kilo kaydından hesaplar.

    Profildeki sabit bir kilo değeri kullanmıyoruz — kilo değiştikçe TDEE de
    değişir ve hedef güncel kalmalı.
    """
    if user.height_cm is None or user.birth_date is None:
        return None
    latest = (
        await db.execute(
            select(BodyWeightLog.weight_kg)
            .where(BodyWeightLog.user_id == user.id)
            .order_by(BodyWeightLog.date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest is None:
        return None

    return macro_target(
        weight_kg=latest,
        height_cm=user.height_cm,
        age=age_from(user.birth_date, today_in(user.timezone)),
        sex=user.sex,
        activity=user.activity_level,
        goal=goal,
    )


# --- Besin arama -------------------------------------------------------------


@router.get("/foods/search", response_model=list[FoodOut], tags=["nutrition"])
async def search_foods(
    db: DbSession,
    user: CurrentUser,
    q: Annotated[str, Query(min_length=2, max_length=120)],
) -> list[FoodDatabaseEntry]:
    """Önbellekte arar, bulamazsa USDA'ya gider ve sonucu önbelleğe yazar."""
    cached = (
        (
            await db.execute(
                select(FoodDatabaseEntry)
                .where(FoodDatabaseEntry.search_name.ilike(f"%{q.strip().lower()}%"))
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    if cached:
        return list(cached)

    entry = await sources.resolve_food(db, q)
    await db.commit()
    return [entry] if entry else []


@router.get("/foods/barcode/{barcode}", response_model=FoodOut, tags=["nutrition"])
async def lookup_barcode(barcode: str, db: DbSession, user: CurrentUser) -> FoodDatabaseEntry:
    """Barkod okuma (Bölüm 4.2) — Open Food Facts."""
    entry = await sources.resolve_barcode(db, barcode)
    if entry is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Bu barkod Open Food Facts'te bulunamadı. Ürünü elle ekleyebilirsin.",
        )
    await db.commit()
    return entry


# --- Günlük beslenme ---------------------------------------------------------


@router.get("/nutrition/day", response_model=DayOut)
async def nutrition_day(
    db: DbSession,
    user: CurrentUser,
    on: date_t | None = None,
    goal: NutritionGoal = NutritionGoal.maintain,
) -> DayOut:
    target_date = on or today_in(user.timezone)

    rows = (
        (
            await db.execute(
                select(NutritionLog)
                .where(NutritionLog.user_id == user.id, NutritionLog.date == target_date)
                .options(selectinload(NutritionLog.food_entry))
                .order_by(NutritionLog.created_at)
            )
        )
        .scalars()
        .unique()
        .all()
    )

    totals = DayTotals(
        calories=sum((r.calories for r in rows), Decimal(0)),
        protein_g=sum((r.protein_g for r in rows), Decimal(0)),
        carbs_g=sum((r.carbs_g for r in rows), Decimal(0)),
        fat_g=sum((r.fat_g for r in rows), Decimal(0)),
    )

    target = await _current_target(db, user, goal)
    remaining = (
        DayTotals(
            calories=Decimal(target.calories) - totals.calories,
            protein_g=Decimal(target.protein_g) - totals.protein_g,
            carbs_g=Decimal(target.carbs_g) - totals.carbs_g,
            fat_g=Decimal(target.fat_g) - totals.fat_g,
        )
        if target
        else None
    )

    return DayOut(
        date=target_date,
        items=[_log_out(r) for r in rows],
        totals=totals,
        target=MacroTargetOut.model_validate(target) if target else None,
        remaining=remaining,
    )


@router.post("/nutrition/log", response_model=NutritionLogOut, status_code=201)
async def add_nutrition_log(
    payload: NutritionLogIn, db: DbSession, user: CurrentUser
) -> NutritionLogOut:
    food = await db.get(FoodDatabaseEntry, payload.food_database_entry_id)
    if food is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Besin kaydı bulunamadı.")

    log = NutritionLog(
        user_id=user.id,
        date=payload.date or today_in(user.timezone),
        food_database_entry_id=food.id,
        quantity_g=payload.quantity_g,
        meal_type=payload.meal_type,
    )
    log.food_entry = food
    db.add(log)
    await db.commit()
    return _log_out(log)


@router.delete("/nutrition/log/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_nutrition_log(log_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    log = await db.get(NutritionLog, log_id)
    if log is None or log.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kayıt bulunamadı.")
    await db.delete(log)
    await db.commit()


@router.get("/nutrition/target", response_model=MacroTargetOut)
async def nutrition_target(
    db: DbSession, user: CurrentUser, goal: NutritionGoal = NutritionGoal.maintain
) -> MacroTarget:
    target = await _current_target(db, user, goal)
    if target is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Hedef hesaplanamıyor: boy, doğum tarihi, cinsiyet ve en az bir kilo "
            "kaydı gerekli. Hesap Ayarları'ndan tamamlayabilirsin.",
        )
    return target


# --- Kilo takibi -------------------------------------------------------------


@router.post("/bodyweight", response_model=BodyWeightOut, status_code=201)
async def log_bodyweight(payload: BodyWeightIn, db: DbSession, user: CurrentUser) -> BodyWeightLog:
    """Günde tek kayıt — aynı gün tekrar gönderilirse üzerine yazılır.
    Gün içi dalgalanma (su, yemek) trend çizgisini gürültüye boğuyor."""
    on_date = payload.date or today_in(user.timezone)
    existing = (
        await db.execute(
            select(BodyWeightLog).where(
                BodyWeightLog.user_id == user.id, BodyWeightLog.date == on_date
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.weight_kg = payload.weight_kg
        existing.body_fat_pct = payload.body_fat_pct
        existing.notes = payload.notes
        await db.commit()
        return existing

    row = BodyWeightLog(
        user_id=user.id,
        date=on_date,
        weight_kg=payload.weight_kg,
        body_fat_pct=payload.body_fat_pct,
        notes=payload.notes,
    )
    db.add(row)
    await db.commit()
    return row


@router.get("/bodyweight/trend", response_model=list[WeightTrendPoint])
async def bodyweight_trend(
    db: DbSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=7, le=365)] = 90,
) -> list[WeightTrendPoint]:
    rows = (
        (
            await db.execute(
                select(BodyWeightLog)
                .where(BodyWeightLog.user_id == user.id)
                .order_by(BodyWeightLog.date.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    ordered = list(reversed(rows))

    window = 7
    points: list[WeightTrendPoint] = []
    for i, row in enumerate(ordered):
        # Pencere dolmadan ortalama verilmiyor: 2 kayıttan "7 günlük ortalama"
        # üretmek sahte bir kesinlik olurdu.
        average: Decimal | None = None
        if i + 1 >= window:
            chunk = ordered[i + 1 - window : i + 1]
            average = sum((r.weight_kg for r in chunk), Decimal(0)) / Decimal(window)
            average = average.quantize(Decimal("0.01"))
        points.append(
            WeightTrendPoint(date=row.date, weight_kg=row.weight_kg, moving_average=average)
        )
    return points
