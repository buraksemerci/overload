"""Program yönetimi ve hareket kütüphanesi endpoint'leri.

Bölüm 4.1'in "üç kaynaklı program" modeli burada görünür hâle geliyor: manuel
oluşturma, şablondan klonlama ve AI önerisinin onaylanması **aynı** satırları
üretiyor. AI yolu bu router'da değil (`features/chat`'te, onay akışıyla) ama
ürettiği şey buradaki `Program → ProgramDay → ProgramExercise` ağacının ta kendisi.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from overload_api.core.deps import CurrentUser, DbSession
from overload_api.db.models.exercise import Equipment, Exercise, MuscleRole
from overload_api.db.models.program import (
    IntensityTechnique,
    Program,
    ProgramDay,
    ProgramExercise,
    ProgramGoal,
    ProgramLevel,
)

router = APIRouter(tags=["programs"])


# --- Şemalar -----------------------------------------------------------------


class ExerciseOut(BaseModel):
    id: uuid.UUID
    name: str
    equipment: Equipment
    is_custom: bool
    is_unilateral: bool
    primary_muscles: list[str] = Field(default_factory=list)
    secondary_muscles: list[str] = Field(default_factory=list)


class ProgramExerciseOut(BaseModel):
    id: uuid.UUID
    exercise_id: uuid.UUID
    exercise_name: str
    equipment: Equipment
    order_index: int
    target_sets: int
    target_rep_min: int
    target_rep_max: int
    technique: IntensityTechnique
    superset_group: int | None
    rest_seconds: int | None
    notes: str | None
    #: Yüzde tabanlı programlarda antrenman maksimumunun yüzdesi; yoksa None.
    target_percent_1rm: Decimal | None
    target_label: str


class ProgramDayOut(BaseModel):
    id: uuid.UUID
    order_index: int
    label: str
    exercises: list[ProgramExerciseOut]


class ProgramSummaryOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    goal: ProgramGoal
    level: ProgramLevel
    days_per_week: int
    is_template: bool
    is_active: bool
    source_name: str | None
    source_url: str | None

    model_config = {"from_attributes": True}


class ProgramDetailOut(ProgramSummaryOut):
    days: list[ProgramDayOut]


class ProgramExerciseIn(BaseModel):
    exercise_id: uuid.UUID
    target_sets: int = Field(ge=1, le=20)
    target_rep_min: int = Field(ge=1, le=100)
    target_rep_max: int = Field(ge=1, le=100)
    technique: IntensityTechnique = IntensityTechnique.straight
    superset_group: int | None = None
    rest_seconds: int | None = Field(default=None, ge=0, le=900)
    notes: str | None = Field(default=None, max_length=500)
    target_percent_1rm: Decimal | None = Field(default=None, ge=30, le=120)

    @field_validator("target_rep_max")
    @classmethod
    def _max_gte_min(cls, v: int, info: object) -> int:
        rep_min = info.data.get("target_rep_min")  # type: ignore[attr-defined]
        if rep_min is not None and v < rep_min:
            raise ValueError("target_rep_max, target_rep_min'den küçük olamaz")
        return v


class ProgramDayIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    exercises: list[ProgramExerciseIn] = Field(default_factory=list, max_length=20)


class ProgramIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    goal: ProgramGoal = ProgramGoal.hypertrophy
    level: ProgramLevel = ProgramLevel.intermediate
    days: list[ProgramDayIn] = Field(min_length=1, max_length=7)


class ProgramPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    goal: ProgramGoal | None = None
    level: ProgramLevel | None = None


# --- Dönüştürücüler ----------------------------------------------------------


def _exercise_out(exercise: Exercise) -> ExerciseOut:
    return ExerciseOut(
        id=exercise.id,
        name=exercise.name,
        equipment=exercise.equipment,
        is_custom=exercise.is_custom,
        is_unilateral=exercise.is_unilateral,
        primary_muscles=[
            m.muscle_group.name_tr for m in exercise.muscle_map if m.role is MuscleRole.primary
        ],
        secondary_muscles=[
            m.muscle_group.name_tr for m in exercise.muscle_map if m.role is MuscleRole.secondary
        ],
    )


def _detail_out(program: Program) -> ProgramDetailOut:
    return ProgramDetailOut(
        id=program.id,
        name=program.name,
        description=program.description,
        goal=program.goal,
        level=program.level,
        days_per_week=program.days_per_week,
        is_template=program.is_template,
        is_active=program.is_active,
        source_name=program.source_name,
        source_url=program.source_url,
        days=[
            ProgramDayOut(
                id=day.id,
                order_index=day.order_index,
                label=day.label,
                exercises=[
                    ProgramExerciseOut(
                        id=px.id,
                        exercise_id=px.exercise_id,
                        exercise_name=px.exercise.name,
                        equipment=px.exercise.equipment,
                        order_index=px.order_index,
                        target_sets=px.target_sets,
                        target_rep_min=px.target_rep_min,
                        target_rep_max=px.target_rep_max,
                        technique=px.technique,
                        superset_group=px.superset_group,
                        rest_seconds=px.rest_seconds,
                        notes=px.notes,
                        target_percent_1rm=px.target_percent_1rm,
                        target_label=px.target_label,
                    )
                    for px in day.exercises
                ],
            )
            for day in program.days
        ],
    )


async def _load_program(db: DbSession, program_id: uuid.UUID) -> Program:
    program = (
        await db.execute(
            select(Program)
            .where(Program.id == program_id)
            .options(selectinload(Program.days).selectinload(ProgramDay.exercises))
        )
    ).scalar_one_or_none()
    if program is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program bulunamadı.")
    return program


def _require_own(program: Program, user: CurrentUser) -> None:
    """Şablonlar salt-okunur. Düzenlemek isteyen önce klonlamalı."""
    if program.is_template:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Şablon programlar düzenlenemez. Önce /programs/{id}/clone ile kendi kopyanı çıkar.",
        )
    if program.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program bulunamadı.")


async def _validate_exercises(db: DbSession, user: CurrentUser, ids: set[uuid.UUID]) -> None:
    """Her hareket var mı ve bu kullanıcı erişebiliyor mu."""
    if not ids:
        return
    found = set(
        (
            await db.execute(
                select(Exercise.id).where(
                    Exercise.id.in_(ids),
                    (Exercise.owner_id.is_(None)) | (Exercise.owner_id == user.id),
                )
            )
        )
        .scalars()
        .all()
    )
    if missing := ids - found:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Şu hareketler kütüphanede yok ya da erişilemiyor: {sorted(str(m) for m in missing)}",
        )


# --- Hareket kütüphanesi -----------------------------------------------------


@router.get("/exercises", response_model=list[ExerciseOut], tags=["exercises"])
async def search_exercises(
    db: DbSession,
    user: CurrentUser,
    q: Annotated[str | None, Query(max_length=120)] = None,
    equipment: Equipment | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[ExerciseOut]:
    stmt = (
        select(Exercise)
        .where((Exercise.owner_id.is_(None)) | (Exercise.owner_id == user.id))
        .options(selectinload(Exercise.muscle_map))
        .order_by(Exercise.name)
        .limit(limit)
    )
    if q:
        stmt = stmt.where(Exercise.search_name.ilike(f"%{q.strip().lower()}%"))
    if equipment is not None:
        stmt = stmt.where(Exercise.equipment == equipment)

    rows = (await db.execute(stmt)).scalars().unique().all()
    return [_exercise_out(e) for e in rows]


# --- Programlar --------------------------------------------------------------


@router.get("/programs", response_model=list[ProgramSummaryOut])
async def list_programs(db: DbSession, user: CurrentUser) -> list[Program]:
    rows = await db.execute(
        select(Program)
        .where(Program.owner_id == user.id)
        .order_by(Program.is_active.desc(), Program.created_at.desc())
    )
    return list(rows.scalars().all())


@router.get("/programs/templates", response_model=list[ProgramSummaryOut])
async def list_templates(db: DbSession, user: CurrentUser) -> list[Program]:
    """Hazır şablon kütüphanesi (bölüm 9). Salt-okunur; `source_name` zorunlu."""
    rows = await db.execute(
        select(Program).where(Program.is_template).order_by(Program.level, Program.name)
    )
    return list(rows.scalars().all())


@router.get("/programs/{program_id}", response_model=ProgramDetailOut)
async def get_program(program_id: uuid.UUID, db: DbSession, user: CurrentUser) -> ProgramDetailOut:
    program = await _load_program(db, program_id)
    # Şablonlar herkese açık; kullanıcı programı sadece sahibine.
    if not program.is_template and program.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program bulunamadı.")
    return _detail_out(program)


@router.post("/programs", response_model=ProgramDetailOut, status_code=201)
async def create_program(payload: ProgramIn, db: DbSession, user: CurrentUser) -> ProgramDetailOut:
    await _validate_exercises(
        db, user, {ex.exercise_id for d in payload.days for ex in d.exercises}
    )

    program = Program(
        owner_id=user.id,
        is_template=False,
        name=payload.name,
        description=payload.description,
        goal=payload.goal,
        level=payload.level,
        days_per_week=len(payload.days),
    )
    db.add(program)
    await db.flush()

    for day_index, day_in in enumerate(payload.days):
        day = ProgramDay(program_id=program.id, order_index=day_index, label=day_in.label)
        db.add(day)
        await db.flush()
        for ex_index, ex_in in enumerate(day_in.exercises):
            db.add(
                ProgramExercise(
                    program_day_id=day.id,
                    order_index=ex_index,
                    **ex_in.model_dump(),
                )
            )

    await db.flush()
    return _detail_out(await _load_program(db, program.id))


@router.post("/programs/{program_id}/clone", response_model=ProgramDetailOut, status_code=201)
async def clone_program(
    program_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> ProgramDetailOut:
    """Şablondan (ya da kendi programından) derin kopya çıkarır.

    Şablonlar salt-okunur olduğu için "başlat" demek kopyalamak demek. Kopya
    `cloned_from_id` ile kaynağa bağlanıyor; ileride "şablon güncellendi,
    programını yenilemek ister misin" gibi bir özellik bunu kullanabilir.
    """
    source = await _load_program(db, program_id)
    if not source.is_template and source.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program bulunamadı.")

    clone = Program(
        owner_id=user.id,
        is_template=False,
        name=source.name if source.is_template else f"{source.name} (kopya)",
        description=source.description,
        goal=source.goal,
        level=source.level,
        days_per_week=source.days_per_week,
        # Atıf kopyaya da taşınır — kimin programı olduğu kaybolmasın.
        source_name=source.source_name,
        source_url=source.source_url,
        cloned_from_id=source.id,
    )
    db.add(clone)
    await db.flush()

    for day in source.days:
        new_day = ProgramDay(program_id=clone.id, order_index=day.order_index, label=day.label)
        db.add(new_day)
        await db.flush()
        for px in day.exercises:
            db.add(
                ProgramExercise(
                    program_day_id=new_day.id,
                    exercise_id=px.exercise_id,
                    order_index=px.order_index,
                    target_sets=px.target_sets,
                    target_rep_min=px.target_rep_min,
                    target_rep_max=px.target_rep_max,
                    technique=px.technique,
                    superset_group=px.superset_group,
                    rest_seconds=px.rest_seconds,
                    notes=px.notes,
                    target_percent_1rm=px.target_percent_1rm,
                )
            )

    await db.flush()
    return _detail_out(await _load_program(db, clone.id))


@router.post("/programs/{program_id}/activate", response_model=ProgramSummaryOut)
async def activate_program(program_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Program:
    """Programı aktif yapar.

    Önce diğerlerini pasifleştiriyoruz — veritabanındaki kısmi tekil indeks
    (`uq_program_one_active_per_owner`) ikinci bir aktif programa zaten izin
    vermez, ama o bir güvenlik ağı; doğru sırayı burada kuruyoruz ki kullanıcı
    anlamsız bir kısıt ihlali hatası görmesin.
    """
    program = await _load_program(db, program_id)
    _require_own(program, user)

    await db.execute(
        update(Program)
        .where(Program.owner_id == user.id, Program.is_active)
        .values(is_active=False)
    )
    await db.flush()
    program.is_active = True
    await db.flush()
    return program


@router.patch("/programs/{program_id}", response_model=ProgramSummaryOut)
async def update_program(
    program_id: uuid.UUID, payload: ProgramPatch, db: DbSession, user: CurrentUser
) -> Program:
    program = await _load_program(db, program_id)
    _require_own(program, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(program, field, value)
    await db.flush()
    return program


@router.delete("/programs/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_program(program_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    program = await _load_program(db, program_id)
    _require_own(program, user)
    await db.delete(program)
    await db.flush()


# --- Gün ve hareket düzenleme ------------------------------------------------


@router.put("/programs/{program_id}/days", response_model=ProgramDetailOut)
async def replace_days(
    program_id: uuid.UUID,
    payload: list[ProgramDayIn],
    db: DbSession,
    user: CurrentUser,
) -> ProgramDetailOut:
    """Programın gün/hareket ağacını tümüyle değiştirir.

    Drag & drop düzenleme için tek tek PATCH yerine tam değiştirme seçildi:
    sürükle-bırak sonrası sıra numaralarının yarısı değişiyor ve bunları tek
    tek göndermek hem çok istek hem de yarı-uygulanmış sıralama riski demek.
    Tek istek, tek transaction, tutarlı sonuç.
    """
    program = await _load_program(db, program_id)
    _require_own(program, user)

    if not payload:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "En az bir gün gerekli.")
    await _validate_exercises(db, user, {ex.exercise_id for d in payload for ex in d.exercises})

    for day in list(program.days):
        await db.delete(day)
    await db.flush()

    for day_index, day_in in enumerate(payload):
        day = ProgramDay(program_id=program.id, order_index=day_index, label=day_in.label)
        db.add(day)
        await db.flush()
        for ex_index, ex_in in enumerate(day_in.exercises):
            db.add(
                ProgramExercise(program_day_id=day.id, order_index=ex_index, **ex_in.model_dump())
            )

    program.days_per_week = len(payload)
    await db.flush()
    return _detail_out(await _load_program(db, program.id))
