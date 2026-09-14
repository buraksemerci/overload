"""Haftalık AI koç raporu (Bölüm 4.3).

**İki aşamalı çalışır: gönder, sonra topla.** Anthropic Batch API senkron değil —
sonuçlar dakikalar ile 24 saat arasında hazır oluyor. Tek bir "raporu üret"
fonksiyonu yazıp sonucu beklemek, gece çalışan bir işi saatlerce ayakta tutmak
demek olurdu.

    1. `submit_weekly_batch()`  — haftanın verisini toplar, batch'i gönderir,
                                   batch id'sini döndürür
    2. `collect_weekly_batch()` — hazır olan sonuçları CoachReport satırlarına yazar

Neden Batch API: rapor gecikmeye duyarlı değil (kullanıcı sabah okuyacak) ve
batch anlık API'nin yarı fiyatına çalışıyor. Haftada bir, kullanıcı başına bir
istek için bile bu doğru araç — çünkü gerçek maliyet, raporu üretmek için
gönderilen kalın bağlamda.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from overload_api.config import get_settings
from overload_api.core.time import now_utc
from overload_api.db.models.ai import CoachReport
from overload_api.db.models.body import BodyWeightLog
from overload_api.db.models.exercise import Exercise
from overload_api.db.models.nutrition import NutritionLog
from overload_api.db.models.user import User
from overload_api.db.models.workout import PersonalRecord, SetLog, WorkoutSession
from overload_api.features.workouts.service import compute_streak, weekly_muscle_volume
from overload_api.services.ai.client import collect_batch_results, submit_weekly_report_batch

logger = logging.getLogger(__name__)

#: Raporun sistem promptu. Sohbet promptundan ayrı ve çok daha dar — bu iş
#: tool kullanmıyor, tek seferlik bir analiz üretiyor.
REPORT_SYSTEM_PROMPT = """\
Sen "overload" uygulamasının haftalık koçusun. Sana bir kullanıcının o haftaki \
antrenman, beslenme ve vücut verisi veriliyor. Kısa bir haftalık değerlendirme yaz.

Biçim (markdown, başlıklar kullan):
- **Bu hafta**: 2-3 cümlelik özet. Sayılara dayan.
- **İyi giden**: 1-3 madde. Somut ol ("bench press'te 2.5 kg ekledin"), genel geçme \
("iyi çalıştın" gibi boş övgü yok).
- **Dikkat**: 1-3 madde. Eksik kalan hacim, düşen tonaj, kaçan protein hedefi, plato.
- **Önümüzdeki hafta**: 2-3 somut, sayısal öneri.

Kurallar:
- Veride olmayan bir şey hakkında yorum yapma. Veri eksikse "bu hafta X kaydı yok" de.
- Toplam 250 kelimeyi geçme. Kullanıcı bunu telefonda okuyacak.
- Teşhis koyma, ilaç önerme. Ağrı/sakatlık işareti varsa profesyonele yönlendir.
- Motive edici ol ama abartma; ilerlemenin kendisini göster.
"""

#: Batch isteklerinde kullanıcıyı sonuçla eşleştiren anahtar öneki.
#: Sonuçlar gönderim sırasıyla GELMEZ — eşleştirme custom_id ile yapılır.
CUSTOM_ID_PREFIX = "coach"


def week_start_for(day: date) -> date:
    """Haftanın Pazartesi'si."""
    return day - timedelta(days=day.weekday())


@dataclass(slots=True)
class WeeklyMetrics:
    """Rapora giren ham sayılar. `CoachReport.metrics` alanına da yazılır ki
    'bu sayı nereden geldi' sorusu cevaplanabilsin."""

    week_start: date
    week_end: date
    sessions: int
    total_volume_kg: Decimal
    total_sets: int
    streak_label: str
    new_records: list[str] = field(default_factory=list)
    top_lifts: list[str] = field(default_factory=list)
    undertrained_muscles: list[str] = field(default_factory=list)
    overtrained_muscles: list[str] = field(default_factory=list)
    weight_change_kg: Decimal | None = None
    weight_latest_kg: Decimal | None = None
    avg_calories: int | None = None
    avg_protein_g: int | None = None
    days_with_nutrition_log: int = 0

    def to_json(self) -> dict[str, Any]:
        return {
            "week_start": self.week_start.isoformat(),
            "week_end": self.week_end.isoformat(),
            "sessions": self.sessions,
            "total_volume_kg": float(self.total_volume_kg),
            "total_sets": self.total_sets,
            "streak": self.streak_label,
            "new_records": self.new_records,
            "top_lifts": self.top_lifts,
            "undertrained_muscles": self.undertrained_muscles,
            "overtrained_muscles": self.overtrained_muscles,
            "weight_change_kg": float(self.weight_change_kg)
            if self.weight_change_kg is not None
            else None,
            "weight_latest_kg": float(self.weight_latest_kg)
            if self.weight_latest_kg is not None
            else None,
            "avg_calories": self.avg_calories,
            "avg_protein_g": self.avg_protein_g,
            "days_with_nutrition_log": self.days_with_nutrition_log,
        }

    def to_prompt(self) -> str:
        lines = [
            f"Hafta: {self.week_start.isoformat()} — {self.week_end.isoformat()}",
            "",
            "## Antrenman",
            f"- Tamamlanan seans: {self.sessions}",
            f"- Toplam çalışma seti: {self.total_sets}",
            f"- Toplam tonaj: {self.total_volume_kg:.0f} kg",
            f"- Seri: {self.streak_label}",
        ]
        if self.top_lifts:
            lines.append("- Öne çıkan setler: " + "; ".join(self.top_lifts))
        if self.new_records:
            lines.append("- Yeni rekorlar: " + "; ".join(self.new_records))
        else:
            lines.append("- Yeni rekor yok.")

        lines.append("")
        lines.append("## Kas hacmi dengesi")
        lines.append(
            "- Hedefin altında: "
            + (", ".join(self.undertrained_muscles) if self.undertrained_muscles else "yok")
        )
        lines.append(
            "- Hedefin belirgin üstünde: "
            + (", ".join(self.overtrained_muscles) if self.overtrained_muscles else "yok")
        )

        lines.append("")
        lines.append("## Vücut")
        if self.weight_latest_kg is not None:
            change = (
                f"{self.weight_change_kg:+.2f} kg"
                if self.weight_change_kg is not None
                else "değişim hesaplanamadı"
            )
            lines.append(f"- Güncel kilo: {self.weight_latest_kg} kg ({change})")
        else:
            lines.append("- Bu hafta kilo kaydı yok.")

        lines.append("")
        lines.append("## Beslenme")
        if self.days_with_nutrition_log:
            lines.append(f"- {self.days_with_nutrition_log}/7 gün kayıt girilmiş")
            lines.append(
                f"- Günlük ortalama: {self.avg_calories} kcal, {self.avg_protein_g} g protein"
            )
        else:
            lines.append("- Bu hafta beslenme kaydı yok.")

        return "\n".join(lines)


async def gather_metrics(session: AsyncSession, user: User, week_start: date) -> WeeklyMetrics:
    """Bir kullanıcının o haftaki verisini toplar."""
    week_end = week_start + timedelta(days=6)

    session_rows = (
        (
            await session.execute(
                select(WorkoutSession).where(
                    WorkoutSession.user_id == user.id,
                    WorkoutSession.completed_at.isnot(None),
                    func.date(WorkoutSession.started_at) >= week_start,
                    func.date(WorkoutSession.started_at) <= week_end,
                )
            )
        )
        .scalars()
        .all()
    )
    session_ids = [s.id for s in session_rows]

    total_volume = Decimal(0)
    total_sets = 0
    top_lifts: list[str] = []

    if session_ids:
        set_rows = (
            await session.execute(
                select(Exercise.name, SetLog.weight_kg, SetLog.reps)
                .join(Exercise, SetLog.exercise_id == Exercise.id)
                .where(
                    SetLog.workout_session_id.in_(session_ids),
                    SetLog.is_warmup.is_(False),
                )
            )
        ).all()
        total_sets = len(set_rows)
        total_volume = sum((w * r for _, w, r in set_rows), Decimal(0))

        best_per_exercise: dict[str, tuple[Decimal, int]] = {}
        for name, weight, reps in set_rows:
            current = best_per_exercise.get(name)
            if current is None or (weight, reps) > current:
                best_per_exercise[name] = (weight, reps)
        top_lifts = [
            f"{name} {w:g}kg x {r}"
            for name, (w, r) in sorted(
                best_per_exercise.items(), key=lambda kv: kv[1][0], reverse=True
            )[:6]
        ]

    record_rows = (
        await session.execute(
            select(PersonalRecord.type, PersonalRecord.value, Exercise.name)
            .join(Exercise, PersonalRecord.exercise_id == Exercise.id)
            .where(
                PersonalRecord.user_id == user.id,
                func.date(PersonalRecord.achieved_at) >= week_start,
                func.date(PersonalRecord.achieved_at) <= week_end,
            )
        )
    ).all()
    new_records = [f"{name}: {pr_type.value} {value:g}" for pr_type, value, name in record_rows]

    volumes = await weekly_muscle_volume(session, user.id, week_end, days=7)
    undertrained = [v.name_tr for v in volumes if v.sets < v.target * 0.5]
    overtrained = [v.name_tr for v in volumes if v.sets > v.target * 1.5]

    weight_rows = (
        await session.execute(
            select(BodyWeightLog.date, BodyWeightLog.weight_kg)
            .where(
                BodyWeightLog.user_id == user.id,
                BodyWeightLog.date >= week_start - timedelta(days=7),
                BodyWeightLog.date <= week_end,
            )
            .order_by(BodyWeightLog.date)
        )
    ).all()
    weight_latest = weight_rows[-1][1] if weight_rows else None
    weight_change = weight_rows[-1][1] - weight_rows[0][1] if len(weight_rows) >= 2 else None

    nutrition_rows = (
        (
            await session.execute(
                select(NutritionLog).where(
                    NutritionLog.user_id == user.id,
                    NutritionLog.date >= week_start,
                    NutritionLog.date <= week_end,
                )
            )
        )
        .scalars()
        .unique()
        .all()
    )

    days_logged = len({r.date for r in nutrition_rows})
    avg_calories = avg_protein = None
    if days_logged:
        avg_calories = int(sum((r.calories for r in nutrition_rows), Decimal(0)) / days_logged)
        avg_protein = int(sum((r.protein_g for r in nutrition_rows), Decimal(0)) / days_logged)

    streak = await compute_streak(session, user.id, week_end)

    return WeeklyMetrics(
        week_start=week_start,
        week_end=week_end,
        sessions=len(session_rows),
        total_volume_kg=total_volume,
        total_sets=total_sets,
        streak_label=streak.label,
        new_records=new_records,
        top_lifts=top_lifts,
        undertrained_muscles=undertrained,
        overtrained_muscles=overtrained,
        weight_change_kg=weight_change,
        weight_latest_kg=weight_latest,
        avg_calories=avg_calories,
        avg_protein_g=avg_protein,
        days_with_nutrition_log=days_logged,
    )


def _custom_id(user_id: uuid.UUID, week_start: date) -> str:
    return f"{CUSTOM_ID_PREFIX}-{user_id}-{week_start.isoformat()}"


def _parse_custom_id(custom_id: str) -> tuple[uuid.UUID, date] | None:
    parts = custom_id.split("-")
    # coach-<uuid 5 parça>-<YYYY-MM-DD 3 parça>
    if len(parts) != 9 or parts[0] != CUSTOM_ID_PREFIX:
        return None
    try:
        return uuid.UUID("-".join(parts[1:6])), date.fromisoformat("-".join(parts[6:9]))
    except ValueError:
        return None


async def submit_weekly_batch(
    session: AsyncSession, week_start: date, *, dry_run: bool = False
) -> tuple[str | None, int]:
    """Raporu olmayan tüm kullanıcılar için batch gönderir.

    Dönüş: (batch_id, istek sayısı). Gönderilecek kimse yoksa (None, 0).
    """
    settings = get_settings()

    # `filter_by` kullanılıyor, `.where(User.is_active)` değil: fastapi-users'ın
    # taban sınıfındaki `is_active` mypy'ye düz `bool` görünüyor, SQL sütunu değil.
    users = (await session.execute(select(User).filter_by(is_active=True))).scalars().all()

    existing = set(
        (
            await session.execute(
                select(CoachReport.user_id).where(CoachReport.week_start == week_start)
            )
        )
        .scalars()
        .all()
    )

    requests: list[dict[str, Any]] = []
    for user in users:
        if user.id in existing:
            continue  # bu hafta için rapor zaten var (idempotent)

        metrics = await gather_metrics(session, user, week_start)
        # Hiç veri yoksa rapor üretmenin anlamı yok — hem token harcar hem de
        # "bu hafta hiçbir şey yapmadın" demekten ibaret olur.
        if metrics.sessions == 0 and metrics.days_with_nutrition_log == 0:
            logger.info("atlandi (veri yok): %s", user.email)
            continue

        requests.append(
            {
                "custom_id": _custom_id(user.id, week_start),
                "params": {
                    "model": settings.anthropic_model_smart,
                    "max_tokens": 2000,
                    "system": REPORT_SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": metrics.to_prompt()}],
                },
            }
        )

    if not requests:
        return None, 0
    if dry_run:
        logger.info("dry-run: %d istek hazirlandi, gonderilmedi", len(requests))
        return None, len(requests)

    batch_id = await submit_weekly_report_batch(requests)
    logger.info("batch gonderildi: %s (%d istek)", batch_id, len(requests))
    return batch_id, len(requests)


async def collect_weekly_batch(session: AsyncSession, batch_id: str) -> int:
    """Hazır batch sonuçlarını CoachReport satırlarına yazar. Dönüş: yazılan sayı."""
    results = await collect_batch_results(batch_id)
    written = 0

    for custom_id, content in results.items():
        parsed = _parse_custom_id(custom_id)
        if parsed is None:
            logger.warning("cozulemeyen custom_id: %s", custom_id)
            continue
        user_id, week_start = parsed

        already = (
            await session.execute(
                select(CoachReport).where(
                    CoachReport.user_id == user_id, CoachReport.week_start == week_start
                )
            )
        ).scalar_one_or_none()
        if already is not None:
            continue

        user = await session.get(User, user_id)
        if user is None:
            continue
        metrics = await gather_metrics(session, user, week_start)

        session.add(
            CoachReport(
                user_id=user_id,
                week_start=week_start,
                content=content,
                metrics=metrics.to_json(),
                generated_at=now_utc(),
            )
        )
        written += 1

    logger.info("%d rapor yazildi", written)
    return written
