"""İlerleme endpoint'leri — güç standartları, tutarlılık ızgarası, zaman serileri.

Bölüm 4.4'ün (motivasyon/gamification) veri tarafı.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import asdict
from datetime import date as date_t
from datetime import timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from overload_api.core.deps import CurrentUser, DbSession
from overload_api.core.time import today_in
from overload_api.db.models.body import BodyWeightLog
from overload_api.db.models.exercise import Exercise
from overload_api.db.models.workout import SetLog, WorkoutSession
from overload_api.services import strength_standards as std

router = APIRouter(prefix="/progress", tags=["progress"])


# --- Şemalar -----------------------------------------------------------------


class StandardOut(BaseModel):
    lift_key: str
    lift_label: str
    estimated_1rm: Decimal
    bodyweight_ratio: Decimal
    level: std.StrengthLevel
    level_label: str
    next_level: std.StrengthLevel | None
    next_level_label: str | None
    next_level_kg: Decimal | None
    progress_to_next: float


class StandardsOut(BaseModel):
    bodyweight_kg: Decimal | None
    #: 1RM'ler gerçek tek tekrar testinden değil, Epley formülüyle tahmin ediliyor.
    #: Arayüz bunu kullanıcıya belirtmeli.
    is_estimated: bool
    results: list[StandardOut]
    #: Neden sonuç üretilemediğini açıklar (kilo kaydı yok, cinsiyet belirtilmemiş...).
    unavailable_reason: str | None


class ConsistencyDay(BaseModel):
    date: date_t
    sessions: int
    total_volume_kg: Decimal


class ExercisePoint(BaseModel):
    date: date_t
    top_weight_kg: Decimal
    top_reps: int
    total_volume_kg: Decimal
    estimated_1rm: Decimal


# --- Güç standartları --------------------------------------------------------


@router.get("/strength-standards", response_model=StandardsOut)
async def strength_standards(db: DbSession, user: CurrentUser) -> StandardsOut:
    """Bench / Squat / Deadlift / OHP için vücut ağırlığına göre seviye.

    Her hareketin en iyi tahmini 1RM'i tüm geçmişten alınıyor (tek bir seansın
    kötü gününe takılmamak için).
    """
    bodyweight = (
        await db.execute(
            select(BodyWeightLog.weight_kg)
            .where(BodyWeightLog.user_id == user.id)
            .order_by(BodyWeightLog.date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if bodyweight is None:
        return StandardsOut(
            bodyweight_kg=None,
            is_estimated=True,
            results=[],
            unavailable_reason=(
                "Güç standartları vücut ağırlığına göre hesaplanıyor. Önce bir kilo kaydı gir."
            ),
        )
    if user.sex.value == "unspecified":
        return StandardsOut(
            bodyweight_kg=bodyweight,
            is_estimated=True,
            results=[],
            unavailable_reason=(
                "Erkek ve kadın standart tabloları belirgin biçimde farklı ve "
                "ortalama almak yanıltıcı olur. Hesap Ayarları'ndan cinsiyet "
                "bilgisini girersen seviye karşılaştırması açılır."
            ),
        )

    # Takip edilen hareketlerin id'leri
    lift_rows = (
        await db.execute(
            select(Exercise.id, Exercise.search_name).where(
                Exercise.search_name.in_(std.TRACKED_LIFTS.keys()),
                Exercise.owner_id.is_(None),
            )
        )
    ).all()
    by_id = {row[0]: row[1] for row in lift_rows}

    results: list[StandardOut] = []
    for exercise_id, search_name in by_id.items():
        sets = (
            await db.execute(
                select(SetLog.weight_kg, SetLog.reps).where(
                    SetLog.user_id == user.id,
                    SetLog.exercise_id == exercise_id,
                    SetLog.is_warmup.is_(False),
                )
            )
        ).all()
        if not sets:
            continue

        best = max(
            (w * (Decimal(1) + Decimal(r) / Decimal(30)) for w, r in sets),
            default=Decimal(0),
        )
        result = std.classify(
            lift_key=search_name,
            estimated_1rm=best,
            bodyweight_kg=bodyweight,
            sex=user.sex,
        )
        if result is not None:
            # `asdict()`: kaynak dataclass `slots=True`, `__dict__`'i yok.
            results.append(StandardOut(**asdict(result)))

    results.sort(key=lambda r: list(std.TRACKED_LIFTS).index(r.lift_key))
    return StandardsOut(
        bodyweight_kg=bodyweight,
        is_estimated=True,
        results=results,
        unavailable_reason=(
            None
            if results
            else "Henüz bu hareketlerde kayıtlı setin yok (Bench, Squat, Deadlift, OHP)."
        ),
    )


# --- Tutarlılık ızgarası -----------------------------------------------------


@router.get("/consistency", response_model=list[ConsistencyDay])
async def consistency(
    db: DbSession,
    user: CurrentUser,
    days: Annotated[int, Query(ge=7, le=730)] = 365,
) -> list[ConsistencyDay]:
    """GitHub katkı ızgarası tarzı günlük yoğunluk.

    Antrenman yapılmayan günler de **0 değerle** dönüyor. Izgarayı frontend'de
    çizerken boşlukları doldurmak gerekiyor; bunu burada yapmak istemci tarafında
    tarih aritmetiği tekrarını önlüyor.
    """
    today = today_in(user.timezone)
    since = today - timedelta(days=days - 1)

    rows = await db.execute(
        select(
            func.date(WorkoutSession.started_at).label("d"),
            func.count(func.distinct(WorkoutSession.id)),
            func.coalesce(func.sum(SetLog.weight_kg * SetLog.reps), 0),
        )
        .select_from(WorkoutSession)
        .outerjoin(
            SetLog,
            (SetLog.workout_session_id == WorkoutSession.id) & (SetLog.is_warmup.is_(False)),
        )
        .where(
            WorkoutSession.user_id == user.id,
            WorkoutSession.completed_at.isnot(None),
            func.date(WorkoutSession.started_at) >= since,
        )
        .group_by(func.date(WorkoutSession.started_at))
    )

    by_day: dict[date_t, tuple[int, Decimal]] = {
        d: (count, Decimal(volume)) for d, count, volume in rows.all()
    }

    out: list[ConsistencyDay] = []
    cursor = since
    while cursor <= today:
        sessions, volume = by_day.get(cursor, (0, Decimal(0)))
        out.append(ConsistencyDay(date=cursor, sessions=sessions, total_volume_kg=volume))
        cursor += timedelta(days=1)
    return out


# --- Hareket zaman serisi ----------------------------------------------------


@router.get("/exercise/{exercise_id}", response_model=list[ExercisePoint])
async def exercise_history(
    exercise_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[ExercisePoint]:
    """Bir hareketin seans bazında ağırlık / hacim / tahmini 1RM serisi."""
    if await db.get(Exercise, exercise_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hareket bulunamadı.")

    rows = await db.execute(
        select(WorkoutSession.id, WorkoutSession.started_at, SetLog.weight_kg, SetLog.reps)
        .join(SetLog, SetLog.workout_session_id == WorkoutSession.id)
        .where(
            SetLog.user_id == user.id,
            SetLog.exercise_id == exercise_id,
            SetLog.is_warmup.is_(False),
            WorkoutSession.completed_at.isnot(None),
        )
        .order_by(WorkoutSession.started_at.desc())
    )

    grouped: dict[uuid.UUID, list[tuple[date_t, Decimal, int]]] = defaultdict(list)
    for session_id, started_at, weight, reps in rows.all():
        grouped[session_id].append((started_at.date(), weight, reps))

    points: list[ExercisePoint] = []
    for entries in list(grouped.values())[:limit]:
        day = entries[0][0]
        top = max(entries, key=lambda e: (e[1], e[2]))
        points.append(
            ExercisePoint(
                date=day,
                top_weight_kg=top[1],
                top_reps=top[2],
                total_volume_kg=sum((w * r for _, w, r in entries), Decimal(0)),
                estimated_1rm=max(
                    w * (Decimal(1) + Decimal(r) / Decimal(30)) for _, w, r in entries
                ).quantize(Decimal("0.01")),
            )
        )
    points.reverse()  # grafikte eskiden yeniye
    return points
