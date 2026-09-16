"""Supplement takibi, kas ağrısı check-in'i ve sakatlık notları.

Bölüm 4.1 ve 4.2'nin kalan parçaları. Üçü de aynı router'da çünkü hepsi
"vücudun bugünkü durumu" ekseninde ve ortak bir tarih/kullanıcı deseni paylaşıyor.

**Sakatlık notunun antrenman moduna etkisi:** aktif bir sakatlık notu varsa,
o kas grubunu *birincil* olarak çalıştıran hareketler uyarı rozetiyle gösterilir.
Sadece birincil, çünkü ikincil kas eşlemesiyle uyarı verirsek neredeyse her
hareket işaretlenir ve uyarı anlamsızlaşır.
"""

from __future__ import annotations

import uuid
from datetime import date as date_t
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from overload_api.core.deps import CurrentUser, DbSession
from overload_api.core.time import today_in
from overload_api.db.models.body import (
    InjuryNote,
    SorenessCheckin,
    Supplement,
    SupplementIntake,
    SupplementSchedule,
)
from overload_api.db.models.exercise import (
    BodyRegion,
    Exercise,
    ExerciseMuscleMap,
    MuscleGroup,
    MuscleRole,
)

router = APIRouter(tags=["body"])


# --- Şemalar -----------------------------------------------------------------


class MuscleGroupOut(BaseModel):
    id: uuid.UUID
    slug: str
    name_tr: str
    name_en: str
    region: BodyRegion
    svg_id: str
    weekly_set_target: int

    model_config = {"from_attributes": True}


class SupplementIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    dose: str | None = Field(default=None, max_length=80)
    schedule: SupplementSchedule = SupplementSchedule.daily


class SupplementPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    dose: str | None = Field(default=None, max_length=80)
    schedule: SupplementSchedule | None = None
    is_active: bool | None = None


class SupplementOut(BaseModel):
    id: uuid.UUID
    name: str
    dose: str | None
    schedule: SupplementSchedule
    is_active: bool

    model_config = {"from_attributes": True}


class SupplementTodayOut(BaseModel):
    supplement: SupplementOut
    #: None = bugün için henüz işaretlenmemiş. True/False = alındı/atlandı.
    #: Üç durumu ayırmak önemli: "işaretlemedim" ile "almadım" farklı şeyler.
    taken: bool | None
    #: Bugün bu supplement alınmalı mı (schedule + antrenman günü mü).
    due_today: bool


class IntakeIn(BaseModel):
    taken: bool
    date: date_t | None = None


class SorenessIn(BaseModel):
    muscle_group_slug: str = Field(min_length=1, max_length=40)
    level: int = Field(ge=0, le=4)
    date: date_t | None = None


class SorenessOut(BaseModel):
    id: uuid.UUID
    date: date_t
    muscle_group_slug: str
    muscle_group_name: str
    level: int


class InjuryIn(BaseModel):
    muscle_group_slug: str = Field(min_length=1, max_length=40)
    description: str = Field(min_length=1, max_length=1000)
    started_on: date_t | None = None


class InjuryOut(BaseModel):
    id: uuid.UUID
    muscle_group_slug: str
    muscle_group_name: str
    description: str
    started_on: date_t
    resolved_on: date_t | None
    is_active: bool


class AffectedExerciseOut(BaseModel):
    exercise_id: uuid.UUID
    exercise_name: str
    muscle_group_name: str
    injury_description: str


# --- Yardımcılar -------------------------------------------------------------


async def _muscle_by_slug(db: DbSession, slug: str) -> MuscleGroup:
    mg = (
        await db.execute(select(MuscleGroup).where(MuscleGroup.slug == slug))
    ).scalar_one_or_none()
    if mg is None:
        known = (
            (await db.execute(select(MuscleGroup.slug).order_by(MuscleGroup.slug))).scalars().all()
        )
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"'{slug}' diye bir kas grubu yok. Geçerli slug'lar: {', '.join(known)}",
        )
    return mg


# --- Kas grupları (referans) -------------------------------------------------


@router.get("/muscle-groups", response_model=list[MuscleGroupOut], tags=["reference"])
async def list_muscle_groups(db: DbSession, user: CurrentUser) -> list[MuscleGroup]:
    """Kas haritası SVG'sinin ve check-in ekranlarının ihtiyaç duyduğu referans liste."""
    rows = await db.execute(select(MuscleGroup).order_by(MuscleGroup.region, MuscleGroup.slug))
    return list(rows.scalars().all())


# --- Supplement --------------------------------------------------------------


@router.get("/supplements", response_model=list[SupplementOut])
async def list_supplements(
    db: DbSession, user: CurrentUser, include_inactive: bool = False
) -> list[Supplement]:
    stmt = select(Supplement).where(Supplement.user_id == user.id).order_by(Supplement.name)
    if not include_inactive:
        stmt = stmt.where(Supplement.is_active)
    return list((await db.execute(stmt)).scalars().all())


@router.post("/supplements", response_model=SupplementOut, status_code=201)
async def create_supplement(payload: SupplementIn, db: DbSession, user: CurrentUser) -> Supplement:
    existing = (
        await db.execute(
            select(Supplement).where(
                Supplement.user_id == user.id, Supplement.name.ilike(payload.name)
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"'{payload.name}' zaten tanımlı.")

    row = Supplement(user_id=user.id, **payload.model_dump())
    db.add(row)
    await db.flush()
    return row


@router.patch("/supplements/{supplement_id}", response_model=SupplementOut)
async def update_supplement(
    supplement_id: uuid.UUID, payload: SupplementPatch, db: DbSession, user: CurrentUser
) -> Supplement:
    row = await db.get(Supplement, supplement_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplement bulunamadı.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await db.flush()
    return row


@router.delete("/supplements/{supplement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplement(supplement_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    """Kalıcı siler. Geçmiş kayıtları korumak isteyen `is_active: false` kullanmalı —
    silmek `supplement_intake` satırlarını da CASCADE ile götürür."""
    row = await db.get(Supplement, supplement_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplement bulunamadı.")
    await db.delete(row)
    await db.flush()


@router.get("/supplements/today", response_model=list[SupplementTodayOut])
async def supplements_today(
    db: DbSession, user: CurrentUser, on: date_t | None = None
) -> list[SupplementTodayOut]:
    """Bugünün işaretleme listesi."""
    target = on or today_in(user.timezone)

    supplements = (
        (
            await db.execute(
                select(Supplement)
                .where(Supplement.user_id == user.id, Supplement.is_active)
                .options(selectinload(Supplement.intakes))
                .order_by(Supplement.name)
            )
        )
        .scalars()
        .unique()
        .all()
    )

    # Bugün antrenman yapıldı mı — training_days/rest_days planları buna bakıyor.
    from overload_api.db.models.workout import WorkoutSession

    trained = (
        await db.execute(
            select(WorkoutSession.id)
            .where(
                WorkoutSession.user_id == user.id,
                WorkoutSession.completed_at.isnot(None),
                WorkoutSession.started_at >= target,
            )
            .limit(1)
        )
    ).scalar_one_or_none() is not None

    out: list[SupplementTodayOut] = []
    for supp in supplements:
        intake = next((i for i in supp.intakes if i.date == target), None)
        match supp.schedule:
            case SupplementSchedule.daily:
                due = True
            case SupplementSchedule.training_days:
                due = trained
            case SupplementSchedule.rest_days:
                due = not trained
            case _:
                due = False  # as_needed: takvimde zorunlu değil
        out.append(
            SupplementTodayOut(
                supplement=SupplementOut.model_validate(supp),
                taken=intake.taken if intake else None,
                due_today=due,
            )
        )
    return out


@router.post("/supplements/{supplement_id}/intake", status_code=status.HTTP_204_NO_CONTENT)
async def mark_intake(
    supplement_id: uuid.UUID, payload: IntakeIn, db: DbSession, user: CurrentUser
) -> None:
    supp = await db.get(Supplement, supplement_id)
    if supp is None or supp.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplement bulunamadı.")

    target = payload.date or today_in(user.timezone)
    existing = (
        await db.execute(
            select(SupplementIntake).where(
                SupplementIntake.supplement_id == supp.id, SupplementIntake.date == target
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.taken = payload.taken
    else:
        db.add(
            SupplementIntake(
                user_id=user.id, supplement_id=supp.id, date=target, taken=payload.taken
            )
        )
    await db.flush()


# --- Kas ağrısı (soreness) ---------------------------------------------------


@router.get("/soreness", response_model=list[SorenessOut])
async def list_soreness(
    db: DbSession,
    user: CurrentUser,
    on: date_t | None = None,
    days: Annotated[int, Query(ge=1, le=90)] = 1,
) -> list[SorenessOut]:
    from datetime import timedelta

    target = on or today_in(user.timezone)
    since = target - timedelta(days=days - 1)

    rows = await db.execute(
        select(SorenessCheckin, MuscleGroup)
        .join(MuscleGroup, SorenessCheckin.muscle_group_id == MuscleGroup.id)
        .where(
            SorenessCheckin.user_id == user.id,
            SorenessCheckin.date >= since,
            SorenessCheckin.date <= target,
        )
        .order_by(SorenessCheckin.date.desc(), MuscleGroup.slug)
    )
    return [
        SorenessOut(
            id=c.id,
            date=c.date,
            muscle_group_slug=mg.slug,
            muscle_group_name=mg.name_tr,
            level=c.level,
        )
        for c, mg in rows.all()
    ]


@router.post("/soreness", response_model=SorenessOut, status_code=201)
async def log_soreness(payload: SorenessIn, db: DbSession, user: CurrentUser) -> SorenessOut:
    mg = await _muscle_by_slug(db, payload.muscle_group_slug)
    target = payload.date or today_in(user.timezone)

    existing = (
        await db.execute(
            select(SorenessCheckin).where(
                SorenessCheckin.user_id == user.id,
                SorenessCheckin.date == target,
                SorenessCheckin.muscle_group_id == mg.id,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.level = payload.level
        row = existing
    else:
        row = SorenessCheckin(
            user_id=user.id, date=target, muscle_group_id=mg.id, level=payload.level
        )
        db.add(row)
    await db.flush()

    return SorenessOut(
        id=row.id,
        date=row.date,
        muscle_group_slug=mg.slug,
        muscle_group_name=mg.name_tr,
        level=row.level,
    )


# --- Sakatlık notları --------------------------------------------------------


@router.get("/injuries", response_model=list[InjuryOut])
async def list_injuries(
    db: DbSession, user: CurrentUser, active_only: bool = True
) -> list[InjuryOut]:
    stmt = (
        select(InjuryNote, MuscleGroup)
        .join(MuscleGroup, InjuryNote.muscle_group_id == MuscleGroup.id)
        .where(InjuryNote.user_id == user.id)
        .order_by(InjuryNote.started_on.desc())
    )
    if active_only:
        stmt = stmt.where(InjuryNote.resolved_on.is_(None))

    return [
        InjuryOut(
            id=n.id,
            muscle_group_slug=mg.slug,
            muscle_group_name=mg.name_tr,
            description=n.description,
            started_on=n.started_on,
            resolved_on=n.resolved_on,
            is_active=n.is_active,
        )
        for n, mg in (await db.execute(stmt)).all()
    ]


@router.post("/injuries", response_model=InjuryOut, status_code=201)
async def create_injury(payload: InjuryIn, db: DbSession, user: CurrentUser) -> InjuryOut:
    mg = await _muscle_by_slug(db, payload.muscle_group_slug)
    row = InjuryNote(
        user_id=user.id,
        muscle_group_id=mg.id,
        description=payload.description,
        started_on=payload.started_on or today_in(user.timezone),
    )
    db.add(row)
    await db.flush()
    return InjuryOut(
        id=row.id,
        muscle_group_slug=mg.slug,
        muscle_group_name=mg.name_tr,
        description=row.description,
        started_on=row.started_on,
        resolved_on=row.resolved_on,
        is_active=row.is_active,
    )


@router.post("/injuries/{injury_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
async def resolve_injury(
    injury_id: uuid.UUID, db: DbSession, user: CurrentUser, on: date_t | None = None
) -> None:
    """Sakatlığı kapatır. Kayıt silinmiyor — geçmiş sakatlık bilgisi, ileride
    aynı bölge tekrar ağrırsa değerli bir bağlam."""
    row = await db.get(InjuryNote, injury_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sakatlık notu bulunamadı.")
    row.resolved_on = on or today_in(user.timezone)
    await db.flush()


@router.get("/injuries/affected-exercises", response_model=list[AffectedExerciseOut])
async def affected_exercises(db: DbSession, user: CurrentUser) -> list[AffectedExerciseOut]:
    """Aktif sakatlıkların uyarı vereceği hareketler.

    Yalnızca **birincil** kas eşleşmesi dikkate alınıyor. İkincil eşleşmeyi de
    saysaydık neredeyse her hareket işaretlenir ve uyarı anlamını yitirirdi.
    """
    rows = await db.execute(
        select(Exercise.id, Exercise.name, MuscleGroup.name_tr, InjuryNote.description)
        .select_from(InjuryNote)
        .join(MuscleGroup, InjuryNote.muscle_group_id == MuscleGroup.id)
        .join(ExerciseMuscleMap, ExerciseMuscleMap.muscle_group_id == MuscleGroup.id)
        .join(Exercise, ExerciseMuscleMap.exercise_id == Exercise.id)
        .where(
            InjuryNote.user_id == user.id,
            InjuryNote.resolved_on.is_(None),
            ExerciseMuscleMap.role == MuscleRole.primary,
            (Exercise.owner_id.is_(None)) | (Exercise.owner_id == user.id),
        )
        .order_by(Exercise.name)
    )
    return [
        AffectedExerciseOut(
            exercise_id=ex_id,
            exercise_name=ex_name,
            muscle_group_name=mg_name,
            injury_description=desc,
        )
        for ex_id, ex_name, mg_name, desc in rows.all()
    ]
