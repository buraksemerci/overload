"""Sohbet geçmişini ve taze veritabanı bağlamını Anthropic mesaj biçimine çevirir.

**Bağlam bloğu neden sistem promptunda değil:** Anthropic önbelleği önek eşleşmesi
yapar. Her turda değişen bir metni sistem promptuna koymak, sistem promptu + tool
tanımlarının oluşturduğu (~6-8 bin token) öneki her istekte geçersizler. Bağlamı
en son kullanıcı mesajına koyduğumuzda önek sabit kalır ve önbellekten okunur.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from overload_api.core.time import today_in
from overload_api.db.models.ai import ChatMessage, ChatRole
from overload_api.db.models.body import BodyWeightLog, InjuryNote
from overload_api.db.models.exercise import MuscleGroup
from overload_api.db.models.nutrition import NutritionLog
from overload_api.db.models.program import Program
from overload_api.db.models.user import User
from overload_api.db.models.workout import SetLog, WorkoutSession
from overload_api.features.workouts.service import compute_streak
from overload_api.services.ai.prompts import build_context_block

#: Modele kaç geçmiş mesaj gönderilir. Daha fazlası önbelleğe girse de
#: token maliyeti doğrusal artıyor; 30 mesaj pratikte yeterli bağlam veriyor.
HISTORY_LIMIT = 30


async def _recent_sessions(db: AsyncSession, user: User) -> list[dict[str, Any]]:
    rows = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user.id, WorkoutSession.completed_at.isnot(None))
        .options(selectinload(WorkoutSession.set_logs).selectinload(SetLog.session))
        .order_by(WorkoutSession.started_at.desc())
        .limit(5)
    )
    sessions = rows.scalars().unique().all()

    out: list[dict[str, Any]] = []
    for s in sessions:
        best_by_exercise: dict[Any, SetLog] = {}
        for log in s.set_logs:
            if log.is_warmup:
                continue
            current = best_by_exercise.get(log.exercise_id)
            if current is None or (log.weight_kg, log.reps) > (current.weight_kg, current.reps):
                best_by_exercise[log.exercise_id] = log

        highlights = [
            f"{log.weight_kg}kg x {log.reps}" for log in list(best_by_exercise.values())[:5]
        ]
        out.append(
            {
                "date": s.started_at.date().isoformat(),
                "label": s.notes or "Antrenman",
                "highlights": highlights or ["set kaydı yok"],
            }
        )
    return out


async def _todays_nutrition(db: AsyncSession, user: User, today: date) -> dict[str, Any] | None:
    rows = await db.execute(
        select(NutritionLog)
        .where(NutritionLog.user_id == user.id, NutritionLog.date == today)
        .options(selectinload(NutritionLog.food_entry))
    )
    logs = rows.scalars().unique().all()
    if not logs:
        return None
    return {
        "calories": sum((log.calories for log in logs), Decimal(0)),
        "protein_g": sum((log.protein_g for log in logs), Decimal(0)),
        "carbs_g": sum((log.carbs_g for log in logs), Decimal(0)),
        "fat_g": sum((log.fat_g for log in logs), Decimal(0)),
    }


async def build_history(
    db: AsyncSession, user: User, new_message: str, image_url: str | None = None
) -> list[dict[str, Any]]:
    """Anthropic `messages` dizisini kurar.

    Geçmiş asistan mesajları `content_blocks` ham hâliyle geri gönderilir; sadece
    metni göndermek `tool_use` bloklarını düşürür ve bir sonraki `tool_result`
    eşleşmediği için API 400 verir.
    """
    today = today_in(user.timezone)

    rows = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(HISTORY_LIMIT)
    )
    past = list(reversed(rows.scalars().all()))

    messages: list[dict[str, Any]] = []
    for msg in past:
        if msg.role is ChatRole.assistant and msg.content_blocks:
            messages.append({"role": "assistant", "content": msg.content_blocks})
        elif msg.content:
            messages.append({"role": msg.role.value, "content": msg.content})

    # --- Taze bağlam + yeni mesaj (önbellek kesme noktasından SONRA) ---
    weights = await db.execute(
        select(BodyWeightLog.date, BodyWeightLog.weight_kg)
        .where(BodyWeightLog.user_id == user.id)
        .order_by(BodyWeightLog.date.desc())
        .limit(5)
    )
    active_program = (
        await db.execute(select(Program.name).where(Program.owner_id == user.id, Program.is_active))
    ).scalar_one_or_none()

    injuries = (
        await db.execute(
            select(MuscleGroup.name_tr, InjuryNote.description)
            .join(InjuryNote, InjuryNote.muscle_group_id == MuscleGroup.id)
            .where(InjuryNote.user_id == user.id, InjuryNote.resolved_on.is_(None))
        )
    ).all()

    context_text = build_context_block(
        today=today,
        display_name=user.display_name,
        # `.all()` Row nesneleri döndürüyor; tuple'a çevirip ters çeviriyoruz
        # (sorgu yeniden eskiye sıralı, grafik eskiden yeniye bekliyor).
        bodyweight_trend=[(row[0], row[1]) for row in reversed(list(weights.all()))],
        recent_sessions=await _recent_sessions(db, user),
        todays_nutrition=await _todays_nutrition(db, user, today),
        active_program_name=active_program,
        streak_label=(await compute_streak(db, user.id, today)).label,
        open_injuries=[f"{name}: {desc}" for name, desc in injuries],
    )

    content: list[dict[str, Any]] = [{"type": "text", "text": context_text}]
    if image_url:
        # R2 nesnesi için ön-imzalı URL; Anthropic doğrudan çeker.
        content.append({"type": "image", "source": {"type": "url", "url": image_url}})
    content.append({"type": "text", "text": new_message})

    messages.append({"role": "user", "content": content})
    return messages
