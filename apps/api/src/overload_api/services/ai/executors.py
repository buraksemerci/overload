"""Tool'ların gerçek işi: deterministik veritabanı kodu.

Bu dosyadaki hiçbir fonksiyon modele güvenmez. Model yalnızca *argüman* üretir;
ne yazılacağına burası karar verir. Özellikle `apply_pending_action`:

    Onay kartındaki "Onayla" butonu AI'ya değil, REST endpoint'ine gider.
    Endpoint bu fonksiyonu çağırır. Fonksiyon, `PendingAction.payload` alanını —
    ki o alan **modelin yazdığı, dolayısıyla güvenilmez veridir** — Pydantic
    şemasıyla YENİDEN doğrular. Şemaya uymayan hiçbir şey veritabanına geçemez;
    payload'a onay anı ile öneri anı arasında bir şey karışmış olsa bile.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from overload_api.db.models.ai import ActionType, PendingAction, PendingActionStatus
from overload_api.db.models.body import (
    BodyWeightLog,
    SorenessCheckin,
    Supplement,
    SupplementIntake,
)
from overload_api.db.models.exercise import (
    Equipment,
    Exercise,
    ExerciseMuscleMap,
    MuscleGroup,
    MuscleRole,
)
from overload_api.db.models.nutrition import (
    ActivityLog,
    ActivitySource,
    ActivityType,
    MealType,
    NutritionLog,
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
from overload_api.services.ai.tools import FORBIDDEN_ENTITIES


class ToolExecutionError(Exception):
    """Beklenen türden hata — modele geri bildirilir, kullanıcıya 500 dönmez."""


def _parse_date(value: Any) -> date:
    if not value:
        return datetime.now(UTC).date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise ToolExecutionError(f"Geçersiz tarih: {value!r}. YYYY-AA-GG bekleniyor.") from exc


async def _muscle_by_slug(session: AsyncSession, slug: str) -> MuscleGroup:
    result = await session.execute(select(MuscleGroup).where(MuscleGroup.slug == slug))
    mg = result.scalar_one_or_none()
    if mg is None:
        known = await session.execute(select(MuscleGroup.slug).order_by(MuscleGroup.slug))
        raise ToolExecutionError(
            f"'{slug}' diye bir kas grubu yok. Geçerli slug'lar: "
            + ", ".join(known.scalars().all())
        )
    return mg


# =============================================================================
# Otomatik tool'lar
# =============================================================================


async def execute_auto_tool(
    session: AsyncSession, user: User, action: ActionType, payload: dict[str, Any]
) -> str:
    """Onay gerektirmeyen tool'u çalıştırır ve modele dönecek metni üretir."""
    match action:
        case ActionType.search_exercise_library:
            return await _search_exercises(session, user, payload)
        case ActionType.get_progression_suggestion:
            return await _progression_suggestion(session, user, payload)
        case ActionType.log_food_item:
            return await _log_food(session, user, payload)
        case ActionType.log_activity:
            return await _log_activity(session, user, payload)
        case ActionType.log_bodyweight:
            return await _log_bodyweight(session, user, payload)
        case ActionType.log_soreness:
            return await _log_soreness(session, user, payload)
        case ActionType.log_supplement:
            return await _log_supplement(session, user, payload)
        case _:  # pragma: no cover
            raise ToolExecutionError(f"'{action.value}' otomatik çalıştırılamaz.")


async def _search_exercises(session: AsyncSession, user: User, payload: dict[str, Any]) -> str:
    query = str(payload.get("query", "")).strip().lower()
    if not query:
        raise ToolExecutionError("Arama terimi boş olamaz.")

    stmt = (
        select(Exercise)
        .where(
            Exercise.search_name.ilike(f"%{query}%"),
            # Kütüphane hareketleri (owner NULL) + kullanıcının kendi hareketleri
            (Exercise.owner_id.is_(None)) | (Exercise.owner_id == user.id),
        )
        .limit(15)
    )
    if equipment := payload.get("equipment"):
        stmt = stmt.where(Exercise.equipment == Equipment(equipment))

    rows = (await session.execute(stmt)).scalars().unique().all()

    if slug := payload.get("muscle_group_slug"):
        mg = await _muscle_by_slug(session, str(slug))
        rows = [e for e in rows if any(m.muscle_group_id == mg.id for m in e.muscle_map)]

    if not rows:
        return (
            f"'{query}' için kütüphanede eşleşme yok. "
            "Gerçekten yoksa add_exercise_to_library ile eklemeyi önerebilirsin."
        )

    lines = []
    for e in rows:
        primary = [m.muscle_group.name_tr for m in e.muscle_map if m.role is MuscleRole.primary]
        lines.append(f"- id={e.id} | {e.name} | {e.equipment.value} | birincil: {', '.join(primary) or '-'}")
    return f"{len(rows)} sonuç:\n" + "\n".join(lines)


async def _progression_suggestion(
    session: AsyncSession, user: User, payload: dict[str, Any]
) -> str:
    from overload_api.features.workouts.service import progression_for_exercise

    try:
        exercise_id = uuid.UUID(str(payload["exercise_id"]))
    except (KeyError, ValueError) as exc:
        raise ToolExecutionError("Geçerli bir exercise_id (UUID) gerekli.") from exc

    suggestion = await progression_for_exercise(session, user.id, exercise_id)
    if suggestion is None:
        raise ToolExecutionError("Bu hareket bulunamadı ya da programda hedefi tanımlı değil.")

    parts = [suggestion.message, f"Önerilen: {suggestion.primary.label}"]
    if suggestion.alternative:
        parts.append(f"Alternatif: {suggestion.alternative.label}")
    if suggestion.plateau:
        parts.append(
            f"PLATO: {suggestion.plateau.stalled_sessions} seanstır {suggestion.plateau.metric} artmıyor."
        )
    parts.extend(suggestion.warnings)
    return "\n".join(parts)


async def _log_food(session: AsyncSession, user: User, payload: dict[str, Any]) -> str:
    from overload_api.services.nutrition.sources import resolve_food

    name = str(payload.get("food_name", "")).strip()
    if not name:
        raise ToolExecutionError("Besin adı boş olamaz.")
    quantity = Decimal(str(payload.get("quantity_g", 0)))
    if quantity <= 0:
        raise ToolExecutionError("Miktar sıfırdan büyük olmalı.")

    entry = await resolve_food(session, name)
    if entry is None:
        raise ToolExecutionError(
            f"'{name}' besin veritabanlarında bulunamadı. Farklı/daha genel bir "
            "İngilizce ad dene (ör. 'chicken breast')."
        )

    log = NutritionLog(
        user_id=user.id,
        date=_parse_date(payload.get("date")),
        food_database_entry_id=entry.id,
        quantity_g=quantity,
        meal_type=MealType(payload.get("meal_type", "snack")),
        source_text=name,
    )
    log.food_entry = entry
    session.add(log)
    return (
        f"Kaydedildi: {entry.name} {quantity}g — "
        f"{log.calories:.0f} kcal (P {log.protein_g:.0f}g / K {log.carbs_g:.0f}g / Y {log.fat_g:.0f}g)"
    )


async def _log_activity(session: AsyncSession, user: User, payload: dict[str, Any]) -> str:
    session.add(
        ActivityLog(
            user_id=user.id,
            date=_parse_date(payload.get("date")),
            activity_type=ActivityType(payload.get("activity_type", "other")),
            duration_min=int(payload.get("duration_min", 0)),
            source=ActivitySource.ai_parsed,
            notes=payload.get("notes"),
        )
    )
    return f"Aktivite kaydedildi: {payload.get('activity_type')} {payload.get('duration_min')} dk."


async def _log_bodyweight(session: AsyncSession, user: User, payload: dict[str, Any]) -> str:
    on_date = _parse_date(payload.get("date"))
    weight = Decimal(str(payload.get("weight_kg", 0)))

    existing = (
        await session.execute(
            select(BodyWeightLog).where(
                BodyWeightLog.user_id == user.id, BodyWeightLog.date == on_date
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        # Aynı güne ikinci kayıt: üzerine yaz (gün içi dalgalanma trendi bozar).
        previous = existing.weight_kg
        existing.weight_kg = weight
        return f"{on_date} kilosu güncellendi: {previous} -> {weight} kg."

    session.add(BodyWeightLog(user_id=user.id, date=on_date, weight_kg=weight))
    return f"{on_date} için {weight} kg kaydedildi."


async def _log_soreness(session: AsyncSession, user: User, payload: dict[str, Any]) -> str:
    mg = await _muscle_by_slug(session, str(payload.get("muscle_group_slug", "")))
    on_date = _parse_date(payload.get("date"))
    level = int(payload.get("level", 0))

    existing = (
        await session.execute(
            select(SorenessCheckin).where(
                SorenessCheckin.user_id == user.id,
                SorenessCheckin.date == on_date,
                SorenessCheckin.muscle_group_id == mg.id,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.level = level
    else:
        session.add(
            SorenessCheckin(
                user_id=user.id, date=on_date, muscle_group_id=mg.id, level=level
            )
        )
    return f"{mg.name_tr} ağrı seviyesi {level}/4 olarak kaydedildi ({on_date})."


async def _log_supplement(session: AsyncSession, user: User, payload: dict[str, Any]) -> str:
    name = str(payload.get("supplement_name", "")).strip()
    supp = (
        await session.execute(
            select(Supplement).where(Supplement.user_id == user.id, Supplement.name.ilike(name))
        )
    ).scalar_one_or_none()
    if supp is None:
        raise ToolExecutionError(
            f"'{name}' adlı supplement tanımlı değil. Önce Supplement Takibi "
            "ekranından ekle."
        )

    on_date = _parse_date(payload.get("date"))
    taken = bool(payload.get("taken", True))
    existing = (
        await session.execute(
            select(SupplementIntake).where(
                SupplementIntake.supplement_id == supp.id, SupplementIntake.date == on_date
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.taken = taken
    else:
        session.add(
            SupplementIntake(
                user_id=user.id, supplement_id=supp.id, date=on_date, taken=taken
            )
        )
    return f"{supp.name}: {on_date} tarihinde {'alındı' if taken else 'alınmadı'}."


# =============================================================================
# Onay gerektiren tool'ların doğrulama şemaları
#
# Bunlar `tools.py`'deki JSON şemalarının ikizi DEĞİL — ikinci bir savunma
# katmanı. `strict: True` modelin şemaya uymasını sağlar, bu şemalar ise
# veritabanına yazılmadan hemen önce aynı veriyi bağımsız olarak doğrular.
# =============================================================================


class _ProgramExerciseIn(BaseModel):
    exercise_id: uuid.UUID
    target_sets: int = Field(ge=1, le=20)
    target_rep_min: int = Field(ge=1, le=100)
    target_rep_max: int = Field(ge=1, le=100)
    technique: IntensityTechnique = IntensityTechnique.straight
    superset_group: int | None = None
    rest_seconds: int | None = Field(default=None, ge=0, le=900)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("target_rep_max")
    @classmethod
    def _max_gte_min(cls, v: int, info: Any) -> int:
        rep_min = info.data.get("target_rep_min")
        if rep_min is not None and v < rep_min:
            raise ValueError("target_rep_max, target_rep_min'den küçük olamaz")
        return v


class _ProgramDayIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    exercises: list[_ProgramExerciseIn] = Field(min_length=1, max_length=20)


class ProposeProgramPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    goal: ProgramGoal
    level: ProgramLevel
    days: list[_ProgramDayIn] = Field(min_length=1, max_length=7)
    rationale: str = Field(default="", max_length=2000)


class ProposeUpdatePayload(BaseModel):
    entity: str
    operation: Literal["update", "delete"]
    entity_id: uuid.UUID
    changes: dict[str, Any] | None = None
    reason: str = Field(default="", max_length=500)

    @field_validator("entity")
    @classmethod
    def _not_forbidden(cls, v: str) -> str:
        # İkinci savunma katmanı: JSON şemasındaki enum zaten kapalı ama
        # payload'a başka bir yoldan değer girme ihtimaline karşı burada da bak.
        if v in FORBIDDEN_ENTITIES:
            raise ValueError(f"'{v}' tablosu AI üzerinden değiştirilemez")
        return v


class AddExercisePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    equipment: Equipment
    primary_muscle_slugs: list[str] = Field(min_length=1, max_length=4)
    secondary_muscle_slugs: list[str] = Field(default_factory=list, max_length=6)
    is_unilateral: bool = False
    notes: str | None = Field(default=None, max_length=1000)


# =============================================================================
# Onay uygulayıcısı
# =============================================================================


async def apply_pending_action(
    session: AsyncSession, user: User, pending: PendingAction
) -> uuid.UUID | None:
    """Onaylanmış aksiyonu uygular. Dönüş: oluşan/etkilenen kaydın id'si.

    Çağıran endpoint'in garanti etmesi gerekenler (bkz. `features/chat/router.py`):
    `pending.user_id == user.id` ve `pending.status is pending`.
    """
    if pending.user_id != user.id:
        raise ToolExecutionError("Bu onay kaydı sana ait değil.")
    if pending.status is not PendingActionStatus.pending:
        raise ToolExecutionError(f"Bu aksiyon zaten '{pending.status.value}' durumunda.")

    match pending.action_type:
        case ActionType.propose_program:
            return await _apply_propose_program(session, user, pending.payload)
        case ActionType.add_exercise_to_library:
            return await _apply_add_exercise(session, user, pending.payload)
        case ActionType.propose_update:
            return await _apply_update(session, user, pending.payload)
        case _:
            raise ToolExecutionError(
                f"'{pending.action_type.value}' onay akışına ait değil."
            )


def _validate(model: type[BaseModel], payload: dict[str, Any]) -> Any:
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise ToolExecutionError(
            "Öneri geçerli değil, uygulanmadı. Ayrıntı: "
            + "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:5])
        ) from exc


async def _apply_propose_program(
    session: AsyncSession, user: User, payload: dict[str, Any]
) -> uuid.UUID:
    data: ProposeProgramPayload = _validate(ProposeProgramPayload, payload)

    # Her exercise_id gerçekten var mı ve bu kullanıcı erişebiliyor mu?
    # Model uydurmuş ya da başkasının özel hareketini göstermiş olabilir.
    wanted = {e.exercise_id for d in data.days for e in d.exercises}
    found = set(
        (
            await session.execute(
                select(Exercise.id).where(
                    Exercise.id.in_(wanted),
                    (Exercise.owner_id.is_(None)) | (Exercise.owner_id == user.id),
                )
            )
        )
        .scalars()
        .all()
    )
    if missing := wanted - found:
        raise ToolExecutionError(
            f"{len(missing)} hareket kütüphanede yok ya da erişilemiyor; program "
            "kaydedilmedi. Asistandan hareketleri yeniden aramasını iste."
        )

    program = Program(
        owner_id=user.id,
        is_template=False,
        name=data.name,
        description=data.description,
        goal=data.goal,
        level=data.level,
        days_per_week=len(data.days),
    )
    session.add(program)
    await session.flush()

    for day_index, day_in in enumerate(data.days):
        day = ProgramDay(program_id=program.id, order_index=day_index, label=day_in.label)
        session.add(day)
        await session.flush()
        for ex_index, ex_in in enumerate(day_in.exercises):
            session.add(
                ProgramExercise(
                    program_day_id=day.id,
                    exercise_id=ex_in.exercise_id,
                    order_index=ex_index,
                    target_sets=ex_in.target_sets,
                    target_rep_min=ex_in.target_rep_min,
                    target_rep_max=ex_in.target_rep_max,
                    technique=ex_in.technique,
                    superset_group=ex_in.superset_group,
                    rest_seconds=ex_in.rest_seconds,
                    notes=ex_in.notes,
                )
            )
    return program.id


async def _apply_add_exercise(
    session: AsyncSession, user: User, payload: dict[str, Any]
) -> uuid.UUID:
    data: AddExercisePayload = _validate(AddExercisePayload, payload)

    exercise = Exercise(
        owner_id=user.id,
        name=data.name,
        search_name=data.name.strip().lower(),
        equipment=data.equipment,
        notes=data.notes,
        is_custom=True,
        is_unilateral=data.is_unilateral,
    )
    session.add(exercise)
    await session.flush()

    for slug in data.primary_muscle_slugs:
        mg = await _muscle_by_slug(session, slug)
        session.add(
            ExerciseMuscleMap(
                exercise_id=exercise.id, muscle_group_id=mg.id, role=MuscleRole.primary
            )
        )
    for slug in data.secondary_muscle_slugs:
        mg = await _muscle_by_slug(session, slug)
        session.add(
            ExerciseMuscleMap(
                exercise_id=exercise.id, muscle_group_id=mg.id, role=MuscleRole.secondary
            )
        )
    return exercise.id


#: `propose_update` ile dokunulabilen tablolar ve o tablolarda değiştirilebilen
#: alanlar. Beyaz liste — listede olmayan alan sessizce atlanmaz, hata verir.
_UPDATABLE: dict[str, tuple[type, frozenset[str]]] = {
    "nutrition_log": (NutritionLog, frozenset({"quantity_g", "meal_type", "date"})),
    "activity_log": (ActivityLog, frozenset({"duration_min", "activity_type", "date", "notes"})),
    "body_weight_log": (BodyWeightLog, frozenset({"weight_kg", "date", "notes"})),
    "soreness_checkin": (SorenessCheckin, frozenset({"level"})),
    "supplement": (Supplement, frozenset({"name", "dose", "schedule", "is_active"})),
}


async def _apply_update(
    session: AsyncSession, user: User, payload: dict[str, Any]
) -> uuid.UUID | None:
    data: ProposeUpdatePayload = _validate(ProposeUpdatePayload, payload)

    if data.entity not in _UPDATABLE:
        raise ToolExecutionError(
            f"'{data.entity}' bu akışla değiştirilemez. Değiştirilebilir tablolar: "
            + ", ".join(sorted(_UPDATABLE))
        )
    model_cls, allowed_fields = _UPDATABLE[data.entity]

    row = await session.get(model_cls, data.entity_id)
    # Sahiplik kontrolü: RLS zaten filtreliyor ama burada da açıkça bakıyoruz ki
    # hata mesajı "bulunamadı" olsun, sessiz bir no-op değil.
    if row is None or getattr(row, "user_id", None) != user.id:
        raise ToolExecutionError("Kayıt bulunamadı ya da sana ait değil.")

    if data.operation == "delete":
        await session.delete(row)
        return data.entity_id

    changes = data.changes or {}
    if not changes:
        raise ToolExecutionError("Güncelleme için en az bir alan gerekli.")
    if unknown := set(changes) - allowed_fields:
        raise ToolExecutionError(
            f"Şu alanlar değiştirilemez: {', '.join(sorted(unknown))}. "
            f"İzin verilenler: {', '.join(sorted(allowed_fields))}"
        )

    for field, value in changes.items():
        if field == "date":
            value = _parse_date(value)
        elif field in {"quantity_g", "weight_kg"}:
            value = Decimal(str(value))
        setattr(row, field, value)
    return data.entity_id
