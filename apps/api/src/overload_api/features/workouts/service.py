"""Antrenman servisi — veritabanı ile progresif overload motoru arasındaki köprü.

Motor (`services/progression.py`) saf; bu katman ona veri taşır ve sonucu geri yazar.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from overload_api.db.models.exercise import Exercise
from overload_api.db.models.program import ProgramDay, ProgramExercise
from overload_api.db.models.workout import PersonalRecord, PRType, SetLog, WorkoutSession
from overload_api.services.progression import (
    ExerciseTarget,
    PerformedSet,
    ProgressionSuggestion,
    SessionPerformance,
    suggest_next_target,
)

#: Motora kaç seans geçmiş verilir. Plato tespiti 3 seansa bakıyor; 8 hem
#: yeterli tarihsel bağlam veriyor hem de sorguyu küçük tutuyor.
HISTORY_DEPTH = 8


async def load_history(
    session: AsyncSession, user_id: uuid.UUID, exercise_id: uuid.UUID, *, depth: int = HISTORY_DEPTH
) -> list[SessionPerformance]:
    """Bir hareketin son `depth` seansını eskiden yeniye sıralı döndürür."""
    stmt = (
        select(SetLog, WorkoutSession.started_at)
        .join(WorkoutSession, SetLog.workout_session_id == WorkoutSession.id)
        .where(
            SetLog.user_id == user_id,
            SetLog.exercise_id == exercise_id,
            WorkoutSession.completed_at.isnot(None),
        )
        .order_by(WorkoutSession.started_at.desc(), SetLog.set_number)
    )
    rows = (await session.execute(stmt)).all()

    grouped: dict[uuid.UUID, list[tuple[SetLog, object]]] = defaultdict(list)
    for set_log, started_at in rows:
        grouped[set_log.workout_session_id].append((set_log, started_at))

    performances: list[SessionPerformance] = []
    for entries in list(grouped.values())[:depth]:
        started_at = entries[0][1]
        performances.append(
            SessionPerformance(
                performed_on=started_at.date(),
                sets=tuple(
                    PerformedSet(
                        weight_kg=s.weight_kg, reps=s.reps, rir=s.rir, is_warmup=s.is_warmup
                    )
                    for s, _ in entries
                ),
            )
        )
    performances.reverse()  # motor eskiden yeniye bekliyor
    return performances


async def progression_for_exercise(
    session: AsyncSession, user_id: uuid.UUID, exercise_id: uuid.UUID
) -> ProgressionSuggestion | None:
    """Hareketin bir sonraki hedefini hesaplar.

    Hedef aralığı kullanıcının aktif programından okunur; program satırı yoksa
    makul bir varsayılan (3x8-12 hipertrofi aralığı) kullanılır — kullanıcı
    programsız serbest antrenman da yapabilir.
    """
    exercise = await session.get(Exercise, exercise_id)
    if exercise is None:
        return None

    program_exercise = (
        await session.execute(
            select(ProgramExercise)
            .join(ProgramDay, ProgramExercise.program_day_id == ProgramDay.id)
            .where(ProgramExercise.exercise_id == exercise_id)
            .options(selectinload(ProgramExercise.day))
            .limit(1)
        )
    ).scalar_one_or_none()

    if program_exercise is not None:
        target = ExerciseTarget(
            sets=program_exercise.target_sets,
            rep_min=program_exercise.target_rep_min,
            rep_max=program_exercise.target_rep_max,
            technique=program_exercise.technique,
            equipment=exercise.equipment,
        )
    else:
        target = ExerciseTarget(sets=3, rep_min=8, rep_max=12, equipment=exercise.equipment)

    history = await load_history(session, user_id, exercise_id)
    return suggest_next_target(target, history)


async def detect_new_records(
    session: AsyncSession, workout_session: WorkoutSession
) -> list[PersonalRecord]:
    """Tamamlanan seansta kırılan rekorları bulur ve kaydeder.

    Her rekor türü ayrı değerlendirilir çünkü farklı şeyler ölçerler; bir seansta
    aynı anda birden fazla tür kırılabilir.
    """
    new_records: list[PersonalRecord] = []
    by_exercise: dict[uuid.UUID, list[SetLog]] = defaultdict(list)
    for s in workout_session.set_logs:
        if not s.is_warmup:
            by_exercise[s.exercise_id].append(s)

    for exercise_id, sets in by_exercise.items():
        if not sets:
            continue

        candidates: dict[PRType, tuple[Decimal, int | None]] = {
            PRType.max_weight: (max(s.weight_kg for s in sets), None),
            PRType.max_reps: (Decimal(max(s.reps for s in sets)), None),
            PRType.session_volume: (sum((s.volume for s in sets), Decimal(0)), None),
            PRType.estimated_1rm: (max(s.estimated_1rm for s in sets), None),
        }
        # max_weight rekorunda kaç tekrarla yapıldığı bağlamı da saklanır.
        heaviest = max(sets, key=lambda s: (s.weight_kg, s.reps))
        candidates[PRType.max_weight] = (heaviest.weight_kg, heaviest.reps)

        for pr_type, (value, reps) in candidates.items():
            previous_best = (
                await session.execute(
                    select(PersonalRecord.value)
                    .where(
                        PersonalRecord.user_id == workout_session.user_id,
                        PersonalRecord.exercise_id == exercise_id,
                        PersonalRecord.type == pr_type,
                    )
                    .order_by(PersonalRecord.value.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()

            if previous_best is not None and value <= previous_best:
                continue

            record = PersonalRecord(
                user_id=workout_session.user_id,
                exercise_id=exercise_id,
                type=pr_type,
                value=value,
                reps=reps,
                achieved_at=workout_session.completed_at or workout_session.started_at,
                workout_session_id=workout_session.id,
            )
            session.add(record)
            new_records.append(record)

    return new_records
