"""Antrenman servisi — veritabanı ile progresif overload motoru arasındaki köprü.

Motor (`services/progression.py`) saf; bu katman ona veri taşır ve sonucu geri yazar.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from overload_api.db.models.exercise import (
    Exercise,
    ExerciseMuscleMap,
    MuscleGroup,
    MuscleRole,
)
from overload_api.db.models.program import Program, ProgramDay, ProgramExercise
from overload_api.db.models.workout import PersonalRecord, PRType, SetLog, WorkoutSession
from overload_api.services.progression import (
    ExerciseTarget,
    PerformedSet,
    ProgressionSuggestion,
    SessionPerformance,
    should_suggest_deload_week,
    suggest_next_target,
)


def should_suggest_deload(intact_weeks: int) -> bool:
    """Deload haftası önerilmeli mi.

    Motordaki saf fonksiyonu servis yüzeyine bağlıyor; router'ların
    `services.progression`'a doğrudan bağımlı olmasını istemiyoruz — algoritma
    değişirse tek yer güncellenmeli.
    """
    return should_suggest_deload_week(intact_weeks)


#: Motora kaç seans geçmiş verilir. Plato tespiti 3 seansa bakıyor; 8 hem
#: yeterli tarihsel bağlam veriyor hem de sorguyu küçük tutuyor.
HISTORY_DEPTH = 8

#: Aktif program yoksa varsayılan haftalık hedef.
DEFAULT_WEEKLY_TARGET = 3

#: Seri hesabında kaç hafta geriye bakılır.
STREAK_LOOKBACK_WEEKS = 52


@dataclass(frozen=True, slots=True)
class StreakInfo:
    """Antrenman serisi.

    **Takvim tabanlı değil, programa göre ölçülür.** "3 gündür ara vermedin"
    demek 5 günlük bir programda anlamsız: haftada iki gün dinlenmek planın
    parçası ve seriyi kırmamalı. Ölçüt "planlanan günü kaçırmamak", yani
    haftalık hedef set sayısını tutturmak.

    Bu hafta henüz bitmediği için seriyi KIRMAZ — sadece tamamlanmış haftalara
    bakılır. Aksi halde Pazartesi sabahı herkesin serisi sıfırlanırdı.
    """

    intact_weeks: int
    this_week_sessions: int
    weekly_target: int
    sessions_in_streak: int

    @property
    def label(self) -> str:
        if self.intact_weeks == 0:
            return f"Bu hafta {self.this_week_sessions}/{self.weekly_target}"
        return (
            f"{self.intact_weeks} hafta kesintisiz "
            f"(bu hafta {self.this_week_sessions}/{self.weekly_target})"
        )


def _week_start(day: date) -> date:
    """Haftanın Pazartesi'si. ISO haftası kullanılıyor (Pazartesi = 1)."""
    return day - timedelta(days=day.weekday())


async def compute_streak(session: AsyncSession, user_id: uuid.UUID, today: date) -> StreakInfo:
    """Haftalık hedefi tutturarak geçirilen kesintisiz hafta sayısı."""
    target = (
        await session.execute(
            select(Program.days_per_week).where(Program.owner_id == user_id, Program.is_active)
        )
    ).scalar_one_or_none() or DEFAULT_WEEKLY_TARGET

    since = _week_start(today) - timedelta(weeks=STREAK_LOOKBACK_WEEKS)
    rows = await session.execute(
        select(WorkoutSession.started_at).where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.completed_at.isnot(None),
            WorkoutSession.started_at >= since,
        )
    )

    per_week: dict[date, int] = defaultdict(int)
    for (started_at,) in rows.all():
        per_week[_week_start(started_at.date())] += 1

    current_week = _week_start(today)
    this_week = per_week.get(current_week, 0)

    # Bu haftayı atlayarak geriye yürü — henüz bitmedi, yargılanamaz.
    intact = 0
    sessions = 0
    cursor = current_week - timedelta(weeks=1)
    while cursor >= since:
        done = per_week.get(cursor, 0)
        if done < target:
            break
        intact += 1
        sessions += done
        cursor -= timedelta(weeks=1)

    return StreakInfo(
        intact_weeks=intact,
        this_week_sessions=this_week,
        weekly_target=target,
        sessions_in_streak=sessions + this_week,
    )


@dataclass(frozen=True, slots=True)
class MuscleVolumeRow:
    slug: str
    name_tr: str
    svg_id: str
    region: str
    sets: float
    target: int


async def weekly_muscle_volume(
    session: AsyncSession, user_id: uuid.UUID, today: date, *, days: int = 7
) -> list[MuscleVolumeRow]:
    """Kas grubu bazında efektif set hacmi (ısı haritasının verisi).

    **Kesirli set (fractional set) yaklaşımı:** birincil kas 1.0, ikincil kas 0.5
    set sayılır. Hipertrofi literatüründe yaygın olan bu ağırlıklandırma,
    "bench press biceps çalıştırmaz ama triceps'i yarım sayar" sezgisini
    sayısallaştırıyor. Isınma setleri sayılmaz.

    Tek taraflı hareketlerde hacim iki katı sayılır — 10 tekrar sol + 10 tekrar
    sağ, çift taraflı 10 tekrarın iki katı iş demek.
    """
    since = today - timedelta(days=days - 1)

    rows = await session.execute(
        select(
            MuscleGroup.slug,
            MuscleGroup.name_tr,
            MuscleGroup.svg_id,
            MuscleGroup.region,
            MuscleGroup.weekly_set_target,
            ExerciseMuscleMap.role,
            Exercise.is_unilateral,
            func.count(SetLog.id),
        )
        .select_from(SetLog)
        .join(WorkoutSession, SetLog.workout_session_id == WorkoutSession.id)
        .join(Exercise, SetLog.exercise_id == Exercise.id)
        .join(ExerciseMuscleMap, ExerciseMuscleMap.exercise_id == Exercise.id)
        .join(MuscleGroup, ExerciseMuscleMap.muscle_group_id == MuscleGroup.id)
        .where(
            SetLog.user_id == user_id,
            SetLog.is_warmup.is_(False),
            WorkoutSession.completed_at.isnot(None),
            func.date(WorkoutSession.started_at) >= since,
        )
        .group_by(
            MuscleGroup.slug,
            MuscleGroup.name_tr,
            MuscleGroup.svg_id,
            MuscleGroup.region,
            MuscleGroup.weekly_set_target,
            ExerciseMuscleMap.role,
            Exercise.is_unilateral,
        )
    )

    totals: dict[str, MuscleVolumeRow] = {}
    for slug, name_tr, svg_id, region, target, role, unilateral, count in rows.all():
        weight = 1.0 if role is MuscleRole.primary else 0.5
        if unilateral:
            weight *= 2
        existing = totals.get(slug)
        accumulated = (existing.sets if existing else 0.0) + count * weight
        totals[slug] = MuscleVolumeRow(
            slug=slug,
            name_tr=name_tr,
            svg_id=svg_id,
            region=region.value if hasattr(region, "value") else str(region),
            sets=round(accumulated, 1),
            target=target,
        )

    # Hiç çalışılmamış kas grupları da dönmeli — ısı haritasında "0 set" olarak
    # görünmeleri, listede hiç olmamalarından daha bilgilendirici.
    all_groups = await session.execute(select(MuscleGroup).order_by(MuscleGroup.slug))
    for mg in all_groups.scalars().all():
        totals.setdefault(
            mg.slug,
            MuscleVolumeRow(
                slug=mg.slug,
                name_tr=mg.name_tr,
                svg_id=mg.svg_id,
                region=mg.region.value,
                sets=0.0,
                target=mg.weekly_set_target,
            ),
        )

    return sorted(totals.values(), key=lambda r: (-r.sets, r.slug))


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

    grouped: dict[uuid.UUID, list[tuple[SetLog, datetime]]] = defaultdict(list)
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
