"""Antrenman endpoint'leri — seans akışı, set kaydı, ilerleme ve hacim.

Seans akışı kasıtlı olarak üç adımlı: **başlat → set ekle → bitir**.

Tek bir "antrenmanı kaydet" endpoint'i daha basit görünürdü ama salonda
telefon kilitlenir, uygulama arka plana atılır, bağlantı kopar. Her set
tamamlandığında ayrı yazmak, yarım kalan antrenmanın kaybolmamasını sağlıyor;
`completed_at IS NULL` olan seans "devam ediyor" demek ve kullanıcı geri
dönünce kaldığı yerden devam edebiliyor.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from overload_api.core.deps import CurrentUser, DbSession
from overload_api.core.time import now_utc, today_in
from overload_api.db.models.exercise import Exercise
from overload_api.db.models.program import IntensityTechnique, Program, ProgramDay
from overload_api.db.models.workout import PersonalRecord, PRType, SetLog, WorkoutSession
from overload_api.features.workouts import service
from overload_api.services.progression import ProgressionSuggestion

router = APIRouter(prefix="/workouts", tags=["workouts"])


# --- Şemalar -----------------------------------------------------------------


class ProgressionOut(BaseModel):
    kind: str
    weight_kg: Decimal
    reps: int
    label: str
    message: str
    alternative_label: str | None = None
    plateau_sessions: int | None = None
    warnings: list[str] = Field(default_factory=list)


class PlannedExerciseOut(BaseModel):
    program_exercise_id: uuid.UUID
    exercise_id: uuid.UUID
    name: str
    equipment: str
    order_index: int
    target_sets: int
    target_rep_min: int
    target_rep_max: int
    technique: IntensityTechnique
    superset_group: int | None
    rest_seconds: int | None
    progression: ProgressionOut | None
    last_session_summary: str | None


class TodayOut(BaseModel):
    program_name: str | None
    program_day_id: uuid.UUID | None
    day_label: str | None
    exercises: list[PlannedExerciseOut]
    active_session_id: uuid.UUID | None
    is_deload_suggested: bool


class SessionStart(BaseModel):
    program_day_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)


class SetIn(BaseModel):
    exercise_id: uuid.UUID
    set_number: int = Field(ge=1, le=50)
    weight_kg: Decimal = Field(ge=0, le=1000)
    reps: int = Field(ge=1, le=200)
    rir: int | None = Field(default=None, ge=0, le=10)
    is_warmup: bool = False
    technique: IntensityTechnique = IntensityTechnique.straight


class SetOut(BaseModel):
    id: uuid.UUID
    exercise_id: uuid.UUID
    set_number: int
    weight_kg: Decimal
    reps: int
    rir: int | None
    is_warmup: bool
    technique: IntensityTechnique

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: uuid.UUID
    program_day_id: uuid.UUID | None
    started_at: datetime
    completed_at: datetime | None
    notes: str | None
    is_deload: bool
    sets: list[SetOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class RecordOut(BaseModel):
    exercise_id: uuid.UUID
    type: PRType
    value: Decimal
    reps: int | None

    model_config = {"from_attributes": True}


class CompleteOut(BaseModel):
    session: SessionOut
    new_records: list[RecordOut]


class MuscleVolumeOut(BaseModel):
    slug: str
    name_tr: str
    svg_id: str
    region: str
    sets: float
    target: int


class StreakOut(BaseModel):
    intact_weeks: int
    this_week_sessions: int
    weekly_target: int
    sessions_in_streak: int
    label: str


# --- Yardımcılar -------------------------------------------------------------


async def _owned_session(db: DbSession, user: CurrentUser, session_id: uuid.UUID) -> WorkoutSession:
    row = await db.get(WorkoutSession, session_id, options=[selectinload(WorkoutSession.set_logs)])
    # RLS zaten başkasının seansını gizler; açık kontrol hata mesajını netleştiriyor.
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Antrenman seansı bulunamadı.")
    return row


def _to_progression_out(suggestion: ProgressionSuggestion | None) -> ProgressionOut | None:
    """Motorun dataclass çıktısını API şemasına çevirir."""
    if suggestion is None:
        return None
    return ProgressionOut(
        kind=suggestion.primary.kind.value,
        weight_kg=suggestion.primary.weight_kg,
        reps=suggestion.primary.reps,
        label=suggestion.primary.label,
        message=suggestion.message,
        alternative_label=(suggestion.alternative.label if suggestion.alternative else None),
        plateau_sessions=(suggestion.plateau.stalled_sessions if suggestion.plateau else None),
        warnings=list(suggestion.warnings),
    )


# --- Endpoint'ler ------------------------------------------------------------


@router.get("/today", response_model=TodayOut)
async def todays_workout(db: DbSession, user: CurrentUser) -> TodayOut:
    """Bugünkü planlanan antrenman, her hareket için ilerleme önerisiyle.

    Hangi günün sırada olduğu takvim gününe göre DEĞİL, tamamlanan seans
    sayısına göre belirlenir. Sebep: kullanıcı bir günü kaçırırsa programın
    tamamı kaymamalı, kaldığı yerden devam etmeli.
    """
    program = (
        await db.execute(
            select(Program)
            .where(Program.owner_id == user.id, Program.is_active)
            .options(selectinload(Program.days))
        )
    ).scalar_one_or_none()

    active_session = (
        await db.execute(
            select(WorkoutSession.id).where(
                WorkoutSession.user_id == user.id, WorkoutSession.completed_at.is_(None)
            )
        )
    ).scalar_one_or_none()

    if program is None or not program.days:
        return TodayOut(
            program_name=program.name if program else None,
            program_day_id=None,
            day_label=None,
            exercises=[],
            active_session_id=active_session,
            is_deload_suggested=False,
        )

    completed = (
        await db.execute(
            select(WorkoutSession)
            .where(WorkoutSession.user_id == user.id, WorkoutSession.completed_at.isnot(None))
            .order_by(WorkoutSession.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    # Son tamamlanan günün bir sonrası; hiç yapılmamışsa ilk gün.
    next_index = 0
    if completed is not None and completed.program_day_id is not None:
        last_day = await db.get(ProgramDay, completed.program_day_id)
        if last_day is not None:
            next_index = (last_day.order_index + 1) % len(program.days)

    day = program.days[next_index]

    planned: list[PlannedExerciseOut] = []
    for px in day.exercises:
        exercise = px.exercise
        suggestion = await service.progression_for_exercise(db, user.id, px.exercise_id)
        planned.append(
            PlannedExerciseOut(
                program_exercise_id=px.id,
                exercise_id=px.exercise_id,
                name=exercise.name,
                equipment=exercise.equipment.value,
                order_index=px.order_index,
                target_sets=px.target_sets,
                target_rep_min=px.target_rep_min,
                target_rep_max=px.target_rep_max,
                technique=px.technique,
                superset_group=px.superset_group,
                rest_seconds=px.rest_seconds,
                progression=_to_progression_out(suggestion),
                last_session_summary=suggestion.previous_summary if suggestion else None,
            )
        )

    streak = await service.compute_streak(db, user.id, today_in(user.timezone))
    return TodayOut(
        program_name=program.name,
        program_day_id=day.id,
        day_label=day.label,
        exercises=planned,
        active_session_id=active_session,
        is_deload_suggested=service.should_suggest_deload(streak.intact_weeks),
    )


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def start_session(payload: SessionStart, db: DbSession, user: CurrentUser) -> WorkoutSession:
    """Yeni seans başlatır.

    Yarım kalmış bir seans varsa yenisi açılmaz — kullanıcı ya onu bitirmeli ya
    da silmeli. İki açık seans, set kayıtlarının hangisine gideceğini belirsiz
    yapar ve ilerleme geçmişini bozar.
    """
    open_session = (
        await db.execute(
            select(WorkoutSession).where(
                WorkoutSession.user_id == user.id, WorkoutSession.completed_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if open_session is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Devam eden bir antrenman var ({open_session.id}). Önce onu bitir ya da sil.",
        )

    session_row = WorkoutSession(
        user_id=user.id,
        program_day_id=payload.program_day_id,
        started_at=now_utc(),
        notes=payload.notes,
    )
    db.add(session_row)
    await db.flush()
    await db.commit()
    return session_row


@router.post("/sessions/{session_id}/sets", response_model=SetOut, status_code=201)
async def log_set(
    session_id: uuid.UUID, payload: SetIn, db: DbSession, user: CurrentUser
) -> SetLog:
    """Tek set kaydeder. Aynı slot tekrar gönderilirse üzerine yazılır —
    kullanıcı yanlış girip düzeltmek isteyebilir."""
    workout = await _owned_session(db, user, session_id)
    if workout.completed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu antrenman kapanmış.")

    if await db.get(Exercise, payload.exercise_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hareket bulunamadı.")

    existing = next(
        (
            s
            for s in workout.set_logs
            if s.exercise_id == payload.exercise_id and s.set_number == payload.set_number
        ),
        None,
    )
    if existing is not None:
        existing.weight_kg = payload.weight_kg
        existing.reps = payload.reps
        existing.rir = payload.rir
        existing.is_warmup = payload.is_warmup
        existing.technique = payload.technique
        existing.completed_at = now_utc()
        await db.commit()
        return existing

    set_log = SetLog(
        user_id=user.id,
        workout_session_id=workout.id,
        exercise_id=payload.exercise_id,
        set_number=payload.set_number,
        weight_kg=payload.weight_kg,
        reps=payload.reps,
        rir=payload.rir,
        is_warmup=payload.is_warmup,
        technique=payload.technique,
        completed_at=now_utc(),
    )
    db.add(set_log)
    await db.commit()
    return set_log


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_set(set_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    set_log = await db.get(SetLog, set_id)
    if set_log is None or set_log.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Set kaydı bulunamadı.")
    await db.delete(set_log)
    await db.commit()


@router.post("/sessions/{session_id}/complete", response_model=CompleteOut)
async def complete_session(session_id: uuid.UUID, db: DbSession, user: CurrentUser) -> CompleteOut:
    """Seansı kapatır ve kırılan rekorları tespit eder.

    Rekor tespiti kapanışta yapılıyor, her set kaydında değil: seans hacmi
    rekoru ancak tüm setler girildikten sonra hesaplanabilir.
    """
    workout = await _owned_session(db, user, session_id)
    if workout.completed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu antrenman zaten kapanmış.")
    if not workout.set_logs:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Hiç set kaydı olmayan antrenman kapatılamaz. Silmek istiyorsan DELETE kullan.",
        )

    workout.completed_at = now_utc()
    records = await service.detect_new_records(db, workout)
    await db.commit()

    return CompleteOut(
        session=SessionOut.model_validate(workout),
        new_records=[RecordOut.model_validate(r) for r in records],
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    workout = await _owned_session(db, user, session_id)
    await db.delete(workout)
    await db.commit()


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    db: DbSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 30,
    since: date | None = None,
) -> list[WorkoutSession]:
    stmt = (
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .options(selectinload(WorkoutSession.set_logs))
        .order_by(WorkoutSession.started_at.desc())
        .limit(limit)
    )
    if since is not None:
        stmt = stmt.where(WorkoutSession.started_at >= since)
    return list((await db.execute(stmt)).scalars().unique().all())


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(session_id: uuid.UUID, db: DbSession, user: CurrentUser) -> WorkoutSession:
    return await _owned_session(db, user, session_id)


@router.get("/progression/{exercise_id}", response_model=ProgressionOut)
async def exercise_progression(
    exercise_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> ProgressionOut:
    suggestion = await service.progression_for_exercise(db, user.id, exercise_id)
    result = _to_progression_out(suggestion)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hareket bulunamadı.")
    return result


@router.get("/muscle-volume", response_model=list[MuscleVolumeOut])
async def muscle_volume(
    db: DbSession,
    user: CurrentUser,
    days: Annotated[int, Query(ge=1, le=90)] = 7,
) -> list[MuscleVolumeOut]:
    rows = await service.weekly_muscle_volume(db, user.id, today_in(user.timezone), days=days)
    return [MuscleVolumeOut(**row.__dict__) for row in rows]


@router.get("/streak", response_model=StreakOut)
async def streak(db: DbSession, user: CurrentUser) -> StreakOut:
    info = await service.compute_streak(db, user.id, today_in(user.timezone))
    return StreakOut(
        intact_weeks=info.intact_weeks,
        this_week_sessions=info.this_week_sessions,
        weekly_target=info.weekly_target,
        sessions_in_streak=info.sessions_in_streak,
        label=info.label,
    )


@router.get("/records", response_model=list[RecordOut])
async def list_records(db: DbSession, user: CurrentUser) -> list[PersonalRecord]:
    rows = await db.execute(
        select(PersonalRecord)
        .where(PersonalRecord.user_id == user.id)
        .order_by(PersonalRecord.achieved_at.desc())
        .limit(100)
    )
    return list(rows.scalars().all())
