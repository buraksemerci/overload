"""Seed yükleyici — tekrar çalıştırılabilir (idempotent).

    python -m overload_api.seed.loader                    # referans veri + şablonlar
    python -m overload_api.seed.loader --user a@b.com     # + kullanıcının 5 günlük programı

**Sahip rolüyle koşar** (`assume_app_role=False`). Paylaşılan referans veriyi
(kas grupları, hareket kütüphanesi, şablon programlar) yazması gerekiyor; RLS
politikaları `owner_id IS NULL` satır eklemeyi kısıtlı uygulama rolüne kapatıyor.
Bu, migration 0002'deki tasarımın bilinçli bir sonucu.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from overload_api.db.models.exercise import (
    BodyRegion,
    Equipment,
    Exercise,
    ExerciseMuscleMap,
    MuscleGroup,
    MuscleRole,
)
from overload_api.db.models.program import (
    IntensityTechnique,
    Program,
    ProgramDay,
    ProgramExercise,
    ProgramGoal,
    ProgramLevel,
)
from overload_api.db.models.user import User
from overload_api.db.session import session_scope
from overload_api.seed.data import EXERCISES, MUSCLE_GROUPS, TEMPLATES, USER_PROGRAM, ProgramSeed

logger = logging.getLogger("seed")


async def seed_muscle_groups(session: AsyncSession) -> dict[str, MuscleGroup]:
    existing = {mg.slug: mg for mg in (await session.execute(select(MuscleGroup))).scalars().all()}
    for seed in MUSCLE_GROUPS:
        mg = existing.get(seed.slug)
        if mg is None:
            mg = MuscleGroup(slug=seed.slug)
            session.add(mg)
            existing[seed.slug] = mg
        # Var olanı da güncelle: svg_id / hedef set sayısı değişmiş olabilir.
        mg.name_tr = seed.name_tr
        mg.name_en = seed.name_en
        mg.region = BodyRegion(seed.region)
        mg.svg_id = seed.svg_id
        mg.weekly_set_target = seed.weekly_set_target

    await session.flush()
    logger.info("kas grubu: %d", len(existing))
    return existing


async def seed_exercises(
    session: AsyncSession, muscles: dict[str, MuscleGroup]
) -> dict[str, Exercise]:
    rows = (
        (await session.execute(select(Exercise).where(Exercise.owner_id.is_(None))))
        .scalars()
        .unique()
        .all()
    )
    existing = {e.search_name: e for e in rows}

    for seed in EXERCISES:
        key = seed.name.lower()
        exercise = existing.get(key)
        if exercise is None:
            exercise = Exercise(owner_id=None, search_name=key, is_custom=False)
            session.add(exercise)
            existing[key] = exercise
        exercise.name = seed.name
        exercise.equipment = Equipment(seed.equipment)
        exercise.is_unilateral = seed.unilateral
        await session.flush()

        # Kas eşlemesini sıfırdan kur — seed'de rol değişmiş olabilir.
        current = (
            (
                await session.execute(
                    select(ExerciseMuscleMap).where(ExerciseMuscleMap.exercise_id == exercise.id)
                )
            )
            .scalars()
            .all()
        )
        for row in current:
            await session.delete(row)
        await session.flush()

        for slug in seed.primary:
            session.add(
                ExerciseMuscleMap(
                    exercise_id=exercise.id,
                    muscle_group_id=muscles[slug].id,
                    role=MuscleRole.primary,
                )
            )
        for slug in seed.secondary:
            session.add(
                ExerciseMuscleMap(
                    exercise_id=exercise.id,
                    muscle_group_id=muscles[slug].id,
                    role=MuscleRole.secondary,
                )
            )

    await session.flush()
    logger.info("hareket: %d", len(existing))
    return existing


async def _build_program(
    session: AsyncSession,
    seed: ProgramSeed,
    exercises: dict[str, Exercise],
    owner_id: object | None = None,
) -> Program | None:
    """Programı kurar. Aynı ad + sahip zaten varsa atlar (idempotent)."""
    stmt = select(Program).where(Program.name == seed.name)
    stmt = stmt.where(
        Program.owner_id.is_(None) if owner_id is None else Program.owner_id == owner_id
    )
    if (await session.execute(stmt)).scalar_one_or_none() is not None:
        logger.info("atlandi (zaten var): %s", seed.name)
        return None

    program = Program(
        owner_id=owner_id,
        is_template=seed.is_template,
        name=seed.name,
        description=seed.description,
        goal=ProgramGoal(seed.goal),
        level=ProgramLevel(seed.level),
        days_per_week=len(seed.days),
        source_name=seed.source_name,
        source_url=seed.source_url,
    )
    session.add(program)
    await session.flush()

    for day_index, day_seed in enumerate(seed.days):
        day = ProgramDay(program_id=program.id, order_index=day_index, label=day_seed.label)
        session.add(day)
        await session.flush()

        for ex_index, px in enumerate(day_seed.exercises):
            exercise = exercises.get(px.exercise.lower())
            if exercise is None:
                raise RuntimeError(
                    f"'{seed.name}' programı '{px.exercise}' hareketini istiyor ama "
                    "kütüphanede yok. seed/data.py içindeki EXERCISES listesine ekle."
                )
            session.add(
                ProgramExercise(
                    program_day_id=day.id,
                    exercise_id=exercise.id,
                    order_index=ex_index,
                    target_sets=px.sets,
                    target_rep_min=px.rep_min,
                    target_rep_max=px.rep_max,
                    technique=IntensityTechnique(px.technique),
                    superset_group=px.superset_group,
                    target_percent_1rm=Decimal(px.percent) if px.percent else None,
                )
            )
    logger.info("program kuruldu: %s (%d gün)", seed.name, len(seed.days))
    return program


async def run(user_email: str | None = None) -> None:
    async with session_scope(assume_app_role=False) as session:
        muscles = await seed_muscle_groups(session)
        exercises = await seed_exercises(session, muscles)

        for template in TEMPLATES:
            await _build_program(session, template, exercises)

        if user_email:
            # `filter_by` kullanılıyor, `.where(User.email == ...)` değil:
            # fastapi-users'ın taban sınıfındaki `email` sütunu mypy'ye düz `str`
            # görünüyor ve karşılaştırma `bool` üretiyor, SQL ifadesi değil.
            user = (
                await session.execute(select(User).filter_by(email=user_email))
            ).scalar_one_or_none()
            if user is None:
                raise SystemExit(
                    f"'{user_email}' bulunamadı. Önce POST /auth/register ile kayıt ol."
                )
            program = await _build_program(session, USER_PROGRAM, exercises, owner_id=user.id)
            if program is not None:
                # Önce varsa eski aktif programı pasifleştir. `is_active` üzerinde
                # `uq_program_one_active_per_owner` kısmi tekil indeksi var; bu
                # adım olmadan, kullanıcının zaten aktif bir programı varsa
                # (şablon başlatmış herkes) yükleyici UniqueViolationError ile
                # çöküyor ve TÜM seed işlemi geri alınıyordu.
                previous = (
                    (
                        await session.execute(
                            select(Program).where(
                                Program.owner_id == user.id,
                                Program.is_active.is_(True),
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                for old in previous:
                    old.is_active = False
                    logger.info("aktiflik kaldırıldı: %s", old.name)
                # Indeksi ihlal etmeden sıraya girmesi için önce UPDATE'ler insin.
                await session.flush()

                program.is_active = True
                logger.info("aktif program atandı: %s -> %s", user_email, program.name)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description="overload seed yükleyici")
    parser.add_argument(
        "--user",
        dest="user_email",
        default=None,
        help="5 günlük başlangıç programının atanacağı kullanıcının e-postası",
    )
    args = parser.parse_args()
    asyncio.run(run(args.user_email))


if __name__ == "__main__":
    main()
