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
from dataclasses import asdict
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
    #: ORM'de ilişkinin adı `set_logs`; dışarıya `sets` olarak çıkıyor.
    #: `validation_alias` OLMAZSA Pydantic `sets` özniteliğini arar, bulamaz ve
    #: SESSİZCE `default_factory`'ye düşer — yani kaydedilmiş setleri olan bir
    #: seans API'den `"sets": []` olarak döner. Hata vermediği için fark edilmesi
    #: zor: POST 201 dönüyor, satır veritabanında duruyor, ekran boş görünüyor.
    sets: list[SetOut] = Field(default_factory=list, validation_alias="set_logs")

    # `populate_by_name`: alias eklendiği için `SessionOut(sets=[...])` biçiminde
    # alan adıyla kurmak da geçerli kalsın.
    model_config = {"from_attributes": True, "populate_by_name": True}


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


# --- Geçmiş ------------------------------------------------------------------
#
# Geçmiş ekranının ihtiyacı `SessionOut`'tan farklı: orada setler düz bir liste
# hâlinde ve hareket adı hiç yok. Ekran "Set 1 / Set 2 / Set 3" gösteriyordu —
# hangi harekete ait olduğu yazmadan. Kullanıcının kendi antrenmanını
# tanıyamadığı bir geçmiş kaydının değeri yok.
#
# Gruplama ve hacim aritmetiği SUNUCUDA yapılıyor. Alternatifi setleri düz
# gönderip tarayıcıda gruplamak olurdu; o zaman ısınma setini ayıklama ve
# tonaj hesabı iki dilde birden yazılmış olurdu (ve zaten öyleydi —
# `history/page.tsx` kendi tonaj hesabını yapıyordu).


class HistorySetOut(BaseModel):
    id: uuid.UUID
    set_number: int
    weight_kg: Decimal
    reps: int
    rir: int | None
    is_warmup: bool
    technique: IntensityTechnique


class HistoryExerciseOut(BaseModel):
    """Bir seans içindeki tek hareket ve o hareketin setleri."""

    exercise_id: uuid.UUID
    name: str
    sets: list[HistorySetOut]
    #: Isınma setleri HARİÇ tonaj. Isınma dahil edilse ilerleme grafiği
    #: kullanıcının daha çok ısındığı haftalarda yükselirdi.
    volume_kg: Decimal
    #: Seansın en ağır çalışma seti — "o gün ne kaldırdım" sorusunun yanıtı.
    top_weight_kg: Decimal
    top_reps: int


class HistorySessionOut(BaseModel):
    id: uuid.UUID
    day_label: str | None
    program_name: str | None
    started_at: datetime
    completed_at: datetime | None
    notes: str | None
    is_deload: bool
    duration_min: int | None
    total_sets: int
    volume_kg: Decimal
    exercises: list[HistoryExerciseOut]
    #: O seansta kırılan rekorlar. Motive edici olan tek şey listede kaç satır
    #: olduğu değil, hangi günün bir şeyi ilk kez başardığı.
    records: list[RecordOut]


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

    # `scalar_one_or_none()` DEĞİL: iki açık seans bu endpoint'i — uygulamanın
    # ana endpoint'ini — 500'e düşürürdü. 0004'teki kısmi tekil indeks artık
    # bunu engelliyor, ama okuma tarafı yine de tek satıra bağlı kalmamalı.
    active_session = (
        await db.execute(
            select(WorkoutSession.id)
            .where(WorkoutSession.user_id == user.id, WorkoutSession.completed_at.is_(None))
            .order_by(WorkoutSession.started_at.desc())
            .limit(1)
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

    # Güç bağlamı (kilo, cinsiyet, seviye) BİR KEZ yükleniyor: ilk kez yapılan
    # hareketlerde başlangıç ağırlığı tahmini için gerekiyor ve gün sekiz
    # hareket içerebiliyor. Hareket başına yüklemek aynı veriyi sekiz kez
    # çekmek olurdu.
    strength = await service.load_strength_context(db, user)

    planned: list[PlannedExerciseOut] = []
    for px in day.exercises:
        exercise = px.exercise
        # Satır kimliği ZORUNLU olarak geçiliyor: 5/3/1 gibi programlarda aynı
        # hareket bir günde birden çok kez, farklı hedeflerle geçiyor.
        suggestion = await service.progression_for_exercise(
            db, user.id, px.exercise_id, program_exercise_id=px.id, context=strength
        )
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
            select(WorkoutSession)
            .where(WorkoutSession.user_id == user.id, WorkoutSession.completed_at.is_(None))
            .order_by(WorkoutSession.started_at.desc())
            .limit(1)
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
        # `set_logs=[]` ŞART, süs değil. FastAPI cevabı handler döndükten SONRA
        # serileştiriyor; o noktada `get_scoped_db` oturumu çoktan kapanmış
        # oluyor. Koleksiyon burada doldurulmazsa `SessionOut.sets` okunurken
        # tembel yükleme tetikleniyor ve MissingGreenlet ile 500 dönüyor.
        # Yeni seansın seti zaten yok — doğru değer boş liste.
        set_logs=[],
    )
    db.add(session_row)
    try:
        await db.flush()
    except IntegrityError as exc:
        # Yukarıdaki kontrol ile bu INSERT arasına eşzamanlı bir istek girdiyse
        # `uq_workout_session_one_open_per_user` devreye girer (bkz. 0004).
        # Kullanıcıya 500 yerine aynı anlamlı 409 dönmeli.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Devam eden bir antrenman var. Önce onu bitir ya da sil.",
        ) from exc
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
        await db.flush()
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
    await db.flush()
    return set_log


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_set(set_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    set_log = await db.get(SetLog, set_id)
    if set_log is None or set_log.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Set kaydı bulunamadı.")
    await db.delete(set_log)
    await db.flush()


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
    await db.flush()

    return CompleteOut(
        session=SessionOut.model_validate(workout),
        new_records=[RecordOut.model_validate(r) for r in records],
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    workout = await _owned_session(db, user, session_id)
    await db.delete(workout)
    await db.flush()


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


#: Tonaj ve ağırlıklar iki ondalığa sabitleniyor.
#:
#: Sütun `Numeric(6, 2)`, yani DB'den gelen her ağırlık iki ondalıklı. Ama
#: `Decimal(0)` başlangıç değeri "0" olarak serileşiyor; hiç çalışma seti
#: olmayan bir seans `"volume_kg": "0"` dönerken diğerleri `"500.00"`
#: dönüyordu. Aynı alanın biçimi veriye göre değişmemeli — ekran bunları
#: metin olarak alıyor.
_Q2 = Decimal("0.01")


def _history_session(
    session_row: WorkoutSession,
    day_labels: dict[uuid.UUID, tuple[str, str]],
    records: list[PersonalRecord],
) -> HistorySessionOut:
    """Bir seansı hareket hareket gruplar ve özetlerini hesaplar.

    Hareketler YAPILDIKLARI sırayla diziliyor ve bu sıra `completed_at`'ten
    geliyor, ilişkinin kendi sırasından değil.

    `WorkoutSession.set_logs` ilişkisi `set_number`'a göre sıralı — ama bu
    sıralama BÜTÜN hareketleri birlikte kapsıyor. Yani önce her hareketin 1.
    seti, sonra her hareketin 2. seti geliyor ve eşit `set_number`'lar
    arasındaki sıra PostgreSQL'e bırakılmış durumda. Gruplama "ilk görülen
    hareket önce" mantığıyla çalıştığı için hareket sırası rastgele çıkıyordu:
    üçüncü yapılan hareket listenin başında görünüyordu.

    `completed_at` her set kaydedildiğinde yazılıyor, yani salonda yapılan
    sıranın birebir kaydı. `set_number` eşitlik bozucu olarak duruyor.
    """
    groups: dict[uuid.UUID, HistoryExerciseOut] = {}
    total_volume = Decimal(0)
    working_sets = 0

    in_order = sorted(
        session_row.set_logs,
        key=lambda s: (s.completed_at or session_row.started_at, s.set_number),
    )

    for set_log in in_order:
        group = groups.get(set_log.exercise_id)
        if group is None:
            group = HistoryExerciseOut(
                exercise_id=set_log.exercise_id,
                name=set_log.exercise.name,
                sets=[],
                volume_kg=Decimal(0),
                top_weight_kg=Decimal(0),
                top_reps=0,
            )
            groups[set_log.exercise_id] = group

        group.sets.append(HistorySetOut.model_validate(set_log, from_attributes=True))
        if set_log.is_warmup:
            continue

        working_sets += 1
        volume = set_log.weight_kg * set_log.reps
        group.volume_kg += volume
        total_volume += volume
        # Eşit ağırlıkta daha çok tekrar yapılan set daha iyi: "80x8" ile
        # "80x5" aynı zirve değil.
        if (set_log.weight_kg, set_log.reps) > (group.top_weight_kg, group.top_reps):
            group.top_weight_kg = set_log.weight_kg
            group.top_reps = set_log.reps

    for group in groups.values():
        group.volume_kg = group.volume_kg.quantize(_Q2)
        group.top_weight_kg = group.top_weight_kg.quantize(_Q2)
        # Hareket İÇİNDE sıra set numarası: üstteki sıralama yapılma anına
        # göre ve ikisi normalde aynı, ama bir set sonradan düzeltilirse
        # `completed_at` güncelleniyor ve set listesi karışık görünüyordu.
        group.sets.sort(key=lambda s: s.set_number)

    duration = None
    if session_row.completed_at is not None:
        seconds = (session_row.completed_at - session_row.started_at).total_seconds()
        duration = int(seconds // 60)

    label, program = (
        day_labels.get(session_row.program_day_id, (None, None))
        if session_row.program_day_id is not None
        else (None, None)
    )

    return HistorySessionOut(
        id=session_row.id,
        day_label=label,
        program_name=program,
        started_at=session_row.started_at,
        completed_at=session_row.completed_at,
        notes=session_row.notes,
        is_deload=session_row.is_deload,
        duration_min=duration,
        total_sets=working_sets,
        volume_kg=total_volume.quantize(_Q2),
        exercises=list(groups.values()),
        records=[RecordOut.model_validate(r, from_attributes=True) for r in records],
    )


@router.get("/history", response_model=list[HistorySessionOut])
async def workout_history(
    db: DbSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 40,
) -> list[HistorySessionOut]:
    """Tamamlanmış seanslar, hareket hareket gruplanmış.

    Açık (devam eden) seans DIŞARIDA: geçmiş bitmiş işlerin kaydı ve yarım bir
    seans oraya girdiğinde tonajı da süresi de yanıltıcı oluyor. Devam eden
    seansa antrenman ekranından dönülüyor.
    """
    sessions = list(
        (
            await db.execute(
                select(WorkoutSession)
                .where(
                    WorkoutSession.user_id == user.id,
                    WorkoutSession.completed_at.is_not(None),
                )
                # Hareket adı gerekiyor; ilişki tembel olduğu için AÇIKÇA
                # yükleniyor (bkz. SetLog.exercise).
                .options(selectinload(WorkoutSession.set_logs).selectinload(SetLog.exercise))
                .order_by(WorkoutSession.started_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .unique()
        .all()
    )
    if not sessions:
        return []

    ids = [s.id for s in sessions]

    # Gün etiketleri tek sorguda: seans başına ayrı sorgu N+1 olurdu.
    day_ids = {s.program_day_id for s in sessions if s.program_day_id is not None}
    day_labels: dict[uuid.UUID, tuple[str, str]] = {}
    if day_ids:
        rows = await db.execute(
            select(ProgramDay.id, ProgramDay.label, Program.name)
            .join(Program, Program.id == ProgramDay.program_id)
            .where(ProgramDay.id.in_(day_ids))
        )
        day_labels = {row[0]: (row[1], row[2]) for row in rows}

    by_session: dict[uuid.UUID, list[PersonalRecord]] = {}
    for record in (
        (
            await db.execute(
                select(PersonalRecord).where(
                    PersonalRecord.user_id == user.id,
                    PersonalRecord.workout_session_id.in_(ids),
                )
            )
        )
        .scalars()
        .all()
    ):
        assert record.workout_session_id is not None  # sorgu NULL'ları dışlıyor
        by_session.setdefault(record.workout_session_id, []).append(record)

    return [
        _history_session(s, day_labels, by_session.get(s.id, [])) for s in sessions
    ]


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
    # `asdict()` kullanılıyor, `__dict__` değil: kaynak dataclass'lar
    # `slots=True` ile tanımlı ve slots'lu sınıfların `__dict__`'i YOKTUR.
    return [MuscleVolumeOut(**asdict(row)) for row in rows]


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


# --- Rekorlar: hareket başına güncel en iyi --------------------------------
#
# `/records` en son 100 rekor SATIRINI döndürüyor. `personal_record` tablosu
# her yeni rekoru yeni satır olarak tutuyor (PR grafiği zaman serisi
# istiyor), yani o liste aynı hareketin aynı türündeki eski rekorlarını da
# içeriyor. İlerleme ekranı ondan ilk 20'yi alıp gösteriyordu; sonuç aynı
# etiketin tekrar tekrar sıralandığı bir listeydi:
#
#     En ağır set        80,0 kg x 8
#     En ağır set        77,5 kg x 8
#     Tahmini 1RM        96,0 kg
#
# Hangi harekete ait olduğu da yazmıyordu — `RecordOut` yalnızca
# `exercise_id` taşıyor. Kullanıcı için anlamlı olan "şu an elimdeki en iyi",
# hareket adıyla.


class BestRecordOut(BaseModel):
    type: PRType
    value: Decimal
    reps: int | None
    achieved_at: datetime


class ExerciseRecordsOut(BaseModel):
    exercise_id: uuid.UUID
    name: str
    records: list[BestRecordOut]
    #: En taze başarının tarihi. Sıralama buna göre: kullanıcı en son neyi
    #: kırdığını listenin başında görmeli.
    last_achieved_at: datetime


#: Dört rekor türünde de BÜYÜK olan iyi. `max_weight`'te eşitlik tekrar
#: sayısıyla bozuluyor: "100kg x 1" ile "100kg x 8" aynı rekor değil
#: (bkz. `PersonalRecord.reps` yorumu).
def _record_key(record: PersonalRecord) -> tuple[Decimal, int]:
    return (record.value, record.reps or 0)


#: Ekranda türlerin sırası. Sözlük sırası veriye bağlı olduğu için sabit bir
#: sıra gerekiyor; yoksa aynı ekranda hareketten harekete yer değiştiriyorlar.
_PR_ORDER = [
    PRType.max_weight,
    PRType.estimated_1rm,
    PRType.max_reps,
    PRType.session_volume,
]


@router.get("/records/best", response_model=list[ExerciseRecordsOut])
async def best_records(db: DbSession, user: CurrentUser) -> list[ExerciseRecordsOut]:
    """Hareket başına, tür başına güncel en iyi rekor."""
    rows = (
        await db.execute(
            select(PersonalRecord, Exercise.name)
            .join(Exercise, Exercise.id == PersonalRecord.exercise_id)
            .where(PersonalRecord.user_id == user.id)
            .order_by(PersonalRecord.achieved_at.asc())
        )
    ).all()

    # (hareket, tür) -> en iyi satır. Eşit değerde ÖNCE kırılan kalıyor:
    # rekorun kırıldığı tarih, en son tekrarlandığı tarih değil. Sorgu
    # `achieved_at` artan sırada geldiği için ilk gelen zaten en erken.
    best: dict[tuple[uuid.UUID, PRType], PersonalRecord] = {}
    names: dict[uuid.UUID, str] = {}

    for record, name in rows:
        names[record.exercise_id] = name
        key = (record.exercise_id, record.type)
        current = best.get(key)
        if current is None or _record_key(record) > _record_key(current):
            best[key] = record

    by_exercise: dict[uuid.UUID, list[PersonalRecord]] = {}
    for (exercise_id, _type), record in best.items():
        by_exercise.setdefault(exercise_id, []).append(record)

    result = [
        ExerciseRecordsOut(
            exercise_id=exercise_id,
            name=names[exercise_id],
            records=[
                BestRecordOut.model_validate(r, from_attributes=True)
                for r in sorted(records, key=lambda r: _PR_ORDER.index(r.type))
            ],
            last_achieved_at=max(r.achieved_at for r in records),
        )
        for exercise_id, records in by_exercise.items()
    ]
    result.sort(key=lambda row: row.last_achieved_at, reverse=True)
    return result

