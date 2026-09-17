"""Beslenme, kilo ve vücut takibi endpoint'leri."""

from __future__ import annotations

import uuid
from dataclasses import asdict

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
from overload_api.db.models.user import NutritionGoal, User
from overload_api.services.nutrition import meal_suggestion as ms
from overload_api.services.nutrition import sources
from overload_api.services.nutrition.tdee import MacroTarget, age_from, macro_target

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


class NutritionLogPatch(BaseModel):
    """Kısmi güncelleme: yalnızca verilen alanlar değişir."""

    quantity_g: Decimal | None = Field(default=None, gt=0, le=10000)
    meal_type: MealType | None = None


class FrequentFoodOut(BaseModel):
    """Sık kullanılan besin — son kullanılan miktar ve öğünle birlikte.

    Miktar ve öğün de dönüyor çünkü tek dokunuşla tekrar eklemenin anlamlı
    olması için "ne kadar" ve "hangi öğün" bilgisinin de hazır olması gerekiyor.
    """

    food: FoodOut
    times_logged: int
    last_quantity_g: Decimal
    last_meal_type: MealType
    last_used: date_t


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


def _resolve_goal(user: User, requested: NutritionGoal | None) -> NutritionGoal:
    """İstekte hedef yoksa kullanıcının KAYITLI hedefi.

    Önce varsayılan her istekte "koruma"ydı ve hedef yalnızca ekrandaki bir
    düğmede yaşıyordu: yağ kaybındaki biri beslenme ekranını her açtığında
    kalori hedefini koruma kalorisi olarak görüyor, düğmeye yeniden
    basmadıkça yanlış sayıyla gün geçiriyordu. Asistan da hedefi bilmiyordu.

    İstekteki değer hâlâ öncelikli: ekrandaki seçici "yağ kaybında olsam
    ne olurdu" diye bakmak için kullanılabiliyor.
    """
    return requested or user.nutrition_goal or NutritionGoal.maintain


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
    """Önbellekte arar, bulamazsa USDA'ya gider ve adayları önbelleğe yazar.

    Birden çok aday döner ve seçimi kullanıcı yapar; gerekçesi
    `sources.search_foods` içinde.
    """
    results = await sources.search_foods(db, q)
    await db.flush()
    return results


@router.get("/foods/barcode/{barcode}", response_model=FoodOut, tags=["nutrition"])
async def lookup_barcode(barcode: str, db: DbSession, user: CurrentUser) -> FoodDatabaseEntry:
    """Barkod okuma (Bölüm 4.2) — Open Food Facts."""
    entry = await sources.resolve_barcode(db, barcode)
    if entry is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Bu barkod Open Food Facts'te bulunamadı. Ürünü elle ekleyebilirsin.",
        )
    await db.flush()
    return entry


# --- Günlük beslenme ---------------------------------------------------------


#: `nutrition_log.quantity_g` sütunu Numeric(7,1). Bellekteki değeri de aynı
#: hassasiyete yuvarlamak ZORUNLU değil ama cevabın saklanan değerle aynı
#: olmasını sağlıyor: aksi halde PATCH "250" dönüyor, hemen ardından yapılan
#: GET "250.0" dönüyordu. Aynı sınıf bir tutarsızlık kişisel rekorlarda gerçek
#: bir hataya yol açmıştı (aynı performans her seferinde "yeni rekor"
#: sayılıyordu), o yüzden burada da yazarken yuvarlanıyor.
def _quantity(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.1"))


@router.get("/nutrition/day", response_model=DayOut)
async def nutrition_day(
    db: DbSession,
    user: CurrentUser,
    on: date_t | None = None,
    goal: NutritionGoal | None = None,
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

    target = await _current_target(db, user, _resolve_goal(user, goal))
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
        quantity_g=_quantity(payload.quantity_g),
        meal_type=payload.meal_type,
    )
    log.food_entry = food
    db.add(log)
    await db.flush()
    return _log_out(log)


@router.patch("/nutrition/log/{log_id}", response_model=NutritionLogOut)
async def update_nutrition_log(
    log_id: uuid.UUID, payload: NutritionLogPatch, db: DbSession, user: CurrentUser
) -> NutritionLogOut:
    """Kaydedilmiş bir kalemin miktarını ya da öğününü düzeltir.

    Bu uç olmadan düzeltmenin tek yolu silip yeniden eklemekti: kullanıcı
    200 gram yazıp 250 olduğunu fark edince kaydı siliyor, besini yeniden
    arıyor, miktarı yeniden giriyordu. Günlük kullanımda insanları besin
    takibinden vazgeçiren şey tam olarak bu tür sürtünmeler.
    """
    log = await db.get(NutritionLog, log_id)
    if log is None or log.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kayıt bulunamadı.")

    if payload.quantity_g is not None:
        log.quantity_g = _quantity(payload.quantity_g)
    if payload.meal_type is not None:
        log.meal_type = payload.meal_type

    await db.flush()
    return _log_out(log)


@router.delete("/nutrition/log/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_nutrition_log(log_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    log = await db.get(NutritionLog, log_id)
    if log is None or log.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kayıt bulunamadı.")
    await db.delete(log)
    await db.flush()


#: Sık kullanılan besin listesinde kaç kalem döner.
RECENT_FOOD_LIMIT = 12

#: Sıklık hesabı için kaç geçmiş kayıt taranır. Kullanıcının bütün geçmişini
#: taramak gereksiz: son iki-üç haftanın alışkanlığı bugünün önerisini
#: belirliyor, altı ay önce bir kez yenen şey değil.
_RECENT_SCAN = 300


@router.get("/nutrition/foods/recent", response_model=list[FrequentFoodOut])
async def recent_foods(db: DbSession, user: CurrentUser) -> list[FrequentFoodOut]:
    """Kullanıcının en sık ve en son kaydettiği besinler.

    **Besin takibinin gerçek darboğazı arama değil, tekrar.** İnsanlar her gün
    aynı beş altı şeyi yiyor; her sabah "chicken breast" yazıp listeden seçmek,
    doğru miktarı hatırlamak ve yeniden girmek bıktırıyor. Bu uç, son kullanılan
    miktar ve öğünle birlikte dönüyor — arayüz tek dokunuşla aynı kaydı
    tekrarlayabiliyor.

    Sıralama ölçütü sıklık, sonra tazelik: her gün yenen yulaf, dün bir kez
    yenen tatlıdan önce gelmeli.
    """
    rows = (
        (
            await db.execute(
                select(NutritionLog)
                .where(NutritionLog.user_id == user.id)
                .options(selectinload(NutritionLog.food_entry))
                .order_by(NutritionLog.date.desc(), NutritionLog.created_at.desc())
                .limit(_RECENT_SCAN)
            )
        )
        .scalars()
        .unique()
        .all()
    )

    # Python tarafında toplanıyor: pencere fonksiyonuyla "en son miktar"
    # çekmek tek sorguda mümkün ama okunması zor, ve taranan satır sayısı
    # zaten sınırlı.
    seen: dict[uuid.UUID, FrequentFoodOut] = {}
    for log in rows:
        existing = seen.get(log.food_database_entry_id)
        if existing is None:
            seen[log.food_database_entry_id] = FrequentFoodOut(
                food=FoodOut.model_validate(log.food_entry),
                times_logged=1,
                # `rows` en yeniden eskiye sıralı, yani ilk görülen en sonuncusu.
                last_quantity_g=log.quantity_g,
                last_meal_type=log.meal_type,
                last_used=log.date,
            )
        else:
            existing.times_logged += 1

    ordered = sorted(seen.values(), key=lambda f: (-f.times_logged, -f.last_used.toordinal()))
    return ordered[:RECENT_FOOD_LIMIT]


@router.get("/nutrition/target", response_model=MacroTargetOut)
async def nutrition_target(
    db: DbSession, user: CurrentUser, goal: NutritionGoal | None = None
) -> MacroTarget:
    target = await _current_target(db, user, _resolve_goal(user, goal))
    if target is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Hedef hesaplanamıyor: boy, doğum tarihi, cinsiyet ve en az bir kilo "
            "kaydı gerekli. Hesap Ayarları'ndan tamamlayabilirsin.",
        )
    return target


class SuggestedItemOut(BaseModel):
    food_id: str
    name: str
    quantity_g: int
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int


class MealSuggestionOut(BaseModel):
    items: list[SuggestedItemOut]
    total_calories: int
    total_protein_g: int
    total_carbs_g: int
    total_fat_g: int
    fit_score: float


class MealSuggestionsOut(BaseModel):
    suggestions: list[MealSuggestionOut]
    #: Öneri üretilemediyse sebebi. Boş liste tek başına belirsiz.
    reason: str | None


@router.get("/nutrition/meal-suggestions", response_model=MealSuggestionsOut)
async def meal_suggestions(
    db: DbSession,
    user: CurrentUser,
    goal: NutritionGoal | None = None,
) -> MealSuggestionsOut:
    """Kalan makrolara göre öğün önerisi (Bölüm 4.2).

    Hesap deterministik — bkz. `services/nutrition/meal_suggestion.py`. Bir dil
    modeline sormak hem maliyetli hem de daha kötü sonuç verirdi; porsiyon
    aritmetiğini tam yapabiliyoruz.
    """
    target = await _current_target(db, user, _resolve_goal(user, goal))
    if target is None:
        return MealSuggestionsOut(
            suggestions=[],
            reason=(
                "Önce kalori hedefi gerekiyor: boy, doğum tarihi, cinsiyet ve en az bir kilo kaydı."
            ),
        )

    today = today_in(user.timezone)
    logs = (
        (
            await db.execute(
                select(NutritionLog)
                .where(NutritionLog.user_id == user.id, NutritionLog.date == today)
                .options(selectinload(NutritionLog.food_entry))
            )
        )
        .scalars()
        .unique()
        .all()
    )

    remaining = ms.Remaining(
        calories=Decimal(target.calories) - sum((r.calories for r in logs), Decimal(0)),
        protein_g=Decimal(target.protein_g) - sum((r.protein_g for r in logs), Decimal(0)),
        carbs_g=Decimal(target.carbs_g) - sum((r.carbs_g for r in logs), Decimal(0)),
        fat_g=Decimal(target.fat_g) - sum((r.fat_g for r in logs), Decimal(0)),
    )

    if remaining.calories <= 0:
        return MealSuggestionsOut(
            suggestions=[],
            reason="Günlük kalori hedefini doldurdun — bugünlük eklemeye gerek yok.",
        )

    # Önbellekteki besinlerden öneri kuruluyor. Dış API'ye gidilmiyor: öneri
    # anlık bir etkileşim, ağ gecikmesi burada kabul edilemez.
    cached = (await db.execute(select(FoodDatabaseEntry).limit(200))).scalars().unique().all()
    if not cached:
        return MealSuggestionsOut(
            suggestions=[],
            reason=(
                "Besin önbelleği boş. Birkaç öğün kaydettikten sonra öneriler "
                "senin yediklerinden üretilmeye başlar."
            ),
        )

    options = [
        ms.FoodOption(
            id=str(entry.id),
            name=entry.name,
            calories_per_100g=entry.calories_per_100g,
            protein_g=entry.protein_g,
            carbs_g=entry.carbs_g,
            fat_g=entry.fat_g,
        )
        for entry in cached
    ]

    results = ms.suggest_meals(options, remaining)
    return MealSuggestionsOut(
        suggestions=[
            MealSuggestionOut(
                # `asdict()`: kaynak dataclass `slots=True`, `__dict__`'i yok.
                items=[SuggestedItemOut(**asdict(item)) for item in suggestion.items],
                total_calories=suggestion.total_calories,
                total_protein_g=suggestion.total_protein_g,
                total_carbs_g=suggestion.total_carbs_g,
                total_fat_g=suggestion.total_fat_g,
                fit_score=suggestion.fit_score,
            )
            for suggestion in results
        ],
        reason=(
            None
            if results
            else "Önbellekteki besinlerle bu makro açığını dolduracak bir kombinasyon çıkmadı."
        ),
    )


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
        await db.flush()
        return existing

    row = BodyWeightLog(
        user_id=user.id,
        date=on_date,
        weight_kg=payload.weight_kg,
        body_fat_pct=payload.body_fat_pct,
        notes=payload.notes,
    )
    db.add(row)
    await db.flush()
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
