"""Tanışma akışı (onboarding) — hesap açıldıktan sonra bir kez.

--------------------------------------------------------------------------
NE SORULUYOR VE NEDEN
--------------------------------------------------------------------------
Her alanın uygulamada BİR tüketicisi var. Tüketicisi olmayan hiçbir şey
sorulmuyor: soru başına bir özellik, özellik başına bir soru.

    Alan                      Tüketen
    ------------------------  -------------------------------------------
    cinsiyet                  kalori hedefi, güç standartları, başlangıç
    doğum tarihi              kalori hedefi (yaş)
    boy                       kalori hedefi
    kilo                      kalori hedefi, güç standartları, başlangıç
    günlük hareket            kalori hedefi (aktivite çarpanı)
    antrenman süresi          başlangıç ağırlığı (geçmiş yokken seviye)
    antrenman hedefi          program önerisi, asistan
    haftada kaç gün           program önerisi, haftalık seri hedefi
    beslenme hedefi           kalori hedefinin varsayılanı, asistan

Onboarding'den önce yeni bir kullanıcının kalori hedefi, güç standartları ve
başlangıç ağırlıkları BOŞTU: hepsi cinsiyet, boy ve kiloyu şart koşuyor ve
bunlar yalnızca hesap ekranının derinlerinde soruluyordu. Başlangıç ağırlığı
ise antrenman geçmişi olmadığı için herkeste en düşük seviyeden hesaplanıyordu.

--------------------------------------------------------------------------
TEK İSTEK
--------------------------------------------------------------------------
Akışın tamamı sonda tek istekle yazılıyor. Adım adım kaydetmek yarım kalan
bir akışta yarım bir profil bırakırdı: cinsiyet kaydedilmiş, kilo yok — kalori
hedefi hâlâ hesaplanamıyor ama kullanıcı bir daha sorulmuyor.

Her alan boş gelebilir: kullanıcı bir soruyu atlayabilir. Atlanan alanın
tüketicisi bugünkü muhafazakâr davranışında kalıyor ve bu dürüst: tahmin
üretilmiyor, sayı uydurulmuyor.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from overload_api.core.deps import CurrentUser, DbSession
from overload_api.core.time import today_in
from overload_api.db.models.body import BodyWeightLog
from overload_api.db.models.program import ProgramGoal
from overload_api.db.models.user import (
    ActivityLevel,
    NutritionGoal,
    Sex,
    TrainingExperience,
    User,
)

router = APIRouter(tags=["account"])


class OnboardingIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    sex: Sex = Sex.unspecified
    birth_date: date | None = None
    height_cm: int | None = Field(default=None, ge=80, le=260)
    #: Profilde DEĞİL, kilo kaydında tutuluyor: kilo her hafta değişir ve
    #: kalori hedefi en son kayıttan hesaplanıyor.
    weight_kg: Decimal | None = Field(default=None, ge=20, le=400)
    activity_level: ActivityLevel = ActivityLevel.moderate
    training_experience: TrainingExperience | None = None
    training_goal: ProgramGoal | None = None
    training_days_per_week: int | None = Field(default=None, ge=1, le=7)
    nutrition_goal: NutritionGoal | None = None


class OnboardingOut(BaseModel):
    completed_at: datetime


def _plausible_birth_date(value: date | None, today: date) -> date | None:
    """13 yaşından küçük ya da 100 yaşından büyük doğum tarihi reddediliyor.

    Tarih girişindeki bir yazım hatası (2025 yerine 1995) kalori hedefini
    bir çocuğun metabolizmasına göre hesaplatırdı. Reddetmek, sessizce
    düzeltmekten doğru: hangi yılın kastedildiğini bilemeyiz.
    """
    if value is None:
        return None
    age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
    if age < 13 or age > 100:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Doğum tarihi geçerli görünmüyor. Yılı kontrol eder misin?",
        )
    return value


@router.post("/users/me/onboarding", response_model=OnboardingOut)
async def complete_onboarding(
    payload: OnboardingIn, db: DbSession, user: CurrentUser
) -> OnboardingOut:
    today = today_in(user.timezone)

    row = await db.get(User, user.id)
    if row is None:  # pragma: no cover - oturum geçerliyse kullanıcı var
        raise RuntimeError("Oturumdaki kullanıcı bulunamadı.")

    # Boşluktan ibaret bir ad "ad yok" demek: selamlamada boş bir yer kalmasın.
    name = (payload.display_name or "").strip()
    row.display_name = name or None
    row.sex = payload.sex
    row.birth_date = _plausible_birth_date(payload.birth_date, today)
    row.height_cm = payload.height_cm
    row.activity_level = payload.activity_level
    row.training_experience = payload.training_experience
    row.training_goal = payload.training_goal
    row.training_days_per_week = payload.training_days_per_week
    row.nutrition_goal = payload.nutrition_goal
    completed_at = datetime.now(UTC)
    row.onboarding_completed_at = completed_at

    if payload.weight_kg is not None:
        # Günde tek kayıt: aynı gün tekrar girilirse üzerine yazılıyor
        # (`POST /bodyweight` ile aynı kural).
        existing = (
            await db.execute(
                select(BodyWeightLog).where(
                    BodyWeightLog.user_id == user.id, BodyWeightLog.date == today
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.weight_kg = payload.weight_kg
        else:
            db.add(BodyWeightLog(user_id=user.id, date=today, weight_kg=payload.weight_kg))

    await db.flush()
    return OnboardingOut(completed_at=completed_at)
