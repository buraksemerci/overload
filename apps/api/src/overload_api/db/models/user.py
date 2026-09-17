"""Kullanıcı ve hedefler."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from fastapi_users_db_sqlalchemy.access_token import SQLAlchemyBaseAccessTokenTableUUID
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from overload_api.db.base import Base, TimestampMixin, enum_column, pk_column
from overload_api.db.models.program import ProgramGoal


class Sex(StrEnum):
    """TDEE (Mifflin-St Jeor) formülü biyolojik cinsiyete göre farklı sabit kullanır.
    `unspecified` seçilirse TDEE hesabı yapılmaz, kullanıcı hedefini elle girer."""

    male = "male"
    female = "female"
    unspecified = "unspecified"


class ActivityLevel(StrEnum):
    """TDEE çarpanları — `nutrition/tdee.py` içinde sayısal karşılıkları var."""

    sedentary = "sedentary"
    light = "light"
    moderate = "moderate"
    active = "active"
    very_active = "very_active"


class TrainingExperience(StrEnum):
    """Düzenli ağırlık antrenmanı süresi — kullanıcının KENDİ beyanı.

    "Seviyen ne?" diye SORULMUYOR, "ne kadar süredir?" diye soruluyor. Süre
    ölçülebilir bir şey; seviye bir öz değerlendirme ve insanlar kendini
    sistematik olarak olduğundan iyi değerlendiriyor. Başlangıç ağırlığı
    bu beyandan türetiliyor ve ağır bir tahminin bedeli sakatlık.
    """

    new = "new"  # hiç ya da birkaç haftadır
    under_1y = "under_1y"
    one_to_three = "one_to_three"
    over_three = "over_three"


class NutritionGoal(StrEnum):
    """Beslenme hedefi. `services/nutrition/tdee.py` aynı değerleri kullanıyor."""

    cut = "cut"
    maintain = "maintain"
    bulk = "bulk"


class GoalType(StrEnum):
    bodyweight = "bodyweight"
    body_fat_pct = "body_fat_pct"
    lift_1rm = "lift_1rm"
    weekly_sessions = "weekly_sessions"


class User(SQLAlchemyBaseUserTableUUID, TimestampMixin, Base):
    """fastapi-users tabanı: id, email, hashed_password, is_active, is_superuser,
    is_verified alanlarını sağlar. Altına profil alanları ekliyoruz.

    NOT: Bu tabloya RLS uygulanmaz — fastapi-users kimlik doğrulaması sırasında
    henüz bir `app.user_id` yokken e-postaya göre kullanıcı aramak zorunda.
    Erişim kontrolü router seviyesinde (`/users/me` dışında endpoint yok).
    """

    __tablename__ = "user"

    display_name: Mapped[str | None] = mapped_column(String(80))
    birth_date: Mapped[date | None]
    sex: Mapped[Sex] = enum_column(Sex, default=Sex.unspecified, nullable=False)
    height_cm: Mapped[int | None] = mapped_column(SmallInteger)
    activity_level: Mapped[ActivityLevel] = enum_column(
        ActivityLevel, default=ActivityLevel.moderate, nullable=False
    )
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Istanbul", nullable=False)

    # --- Onboarding'de toplanan ------------------------------------------------
    # Her alanın BİR tüketicisi var; tüketicisi olmayan hiçbir şey sorulmuyor.
    #
    #   training_experience     başlangıç ağırlığı (geçmiş yokken seviye)
    #   training_goal           program önerisi, asistan bağlamı
    #   training_days_per_week  program önerisi, program yokken haftalık hedef
    #   nutrition_goal          kalori hedefinin varsayılanı, asistan bağlamı
    #
    # Hepsi boş olabilir: kullanıcı bir adımı geçebilir ve o durumda ilgili
    # özellik bugünkü (muhafazakâr) davranışında kalıyor.
    training_experience: Mapped[TrainingExperience | None] = enum_column(TrainingExperience)
    training_goal: Mapped[ProgramGoal | None] = enum_column(ProgramGoal)
    training_days_per_week: Mapped[int | None] = mapped_column(SmallInteger)
    nutrition_goal: Mapped[NutritionGoal | None] = enum_column(NutritionGoal)
    #: Tanışma akışı bitti mi. Alanların dolu olmasından ÇIKARILMIYOR: kullanıcı
    #: bir soruyu bilerek boş bırakabilir ve ona her girişte yeniden sorulmamalı.
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # NOT: "aktif program" burada DEĞİL, `program.is_active` üzerinde tutulur.
    # Buraya bir `active_program_id` koymak user <-> program arasında karşılıklı
    # yabancı anahtar döngüsü yaratıyordu; migration hangi tabloyu önce
    # oluşturacağını çözemiyor. Program tarafındaki kısmi tekil indeks aynı
    # kuralı ("kullanıcı başına en fazla bir aktif program") veritabanı
    # seviyesinde, döngü olmadan garanti ediyor.

    __table_args__ = (
        CheckConstraint("height_cm IS NULL OR height_cm BETWEEN 80 AND 260", name="height_sane"),
        CheckConstraint(
            "training_days_per_week IS NULL OR training_days_per_week BETWEEN 1 AND 7",
            name="training_days_sane",
        ),
    )


class Goal(TimestampMixin, Base):
    """Kullanıcının sayısal hedefi (ör. 'Aralık'a kadar 78 kg')."""

    __tablename__ = "goal"

    id: Mapped[uuid.UUID] = pk_column()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[GoalType] = enum_column(GoalType, nullable=False)
    target_value: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    target_date: Mapped[date | None]
    # lift_1rm hedefi hangi harekete ait — diğer tiplerde NULL.
    exercise_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("exercise.id", ondelete="CASCADE")
    )
    achieved_at: Mapped[date | None]
    notes: Mapped[str | None] = mapped_column(String(500))

    __table_args__ = (
        Index("ix_goal_user_id_type", "user_id", "type"),
        CheckConstraint(
            "(type = 'lift_1rm') = (exercise_id IS NOT NULL)",
            name="lift_goal_needs_exercise",
        ),
    )


class AccessToken(SQLAlchemyBaseAccessTokenTableUUID, Base):
    """Açık oturumlar.

    --------------------------------------------------------------------------
    NEDEN VERİTABANI, NEDEN JWT DEĞİL
    --------------------------------------------------------------------------
    Önce JWT kullanılıyordu ve JWT **geri alınamıyor**: imzası geçerli olan bir
    jeton süresi dolana kadar (yedi gün) kabul edilir. Sonuçları:

    * "Çıkış yap" yalnızca tarayıcıdaki kopyayı siliyordu. Jeton başkasının
      eline geçtiyse çıkış yapmak hiçbir işe yaramıyordu.
    * Hesabı silinen ya da devre dışı bırakılan bir kullanıcının jetonu
      çalışmaya devam ediyordu.
    * Ortak bir bilgisayarda oturum kapatmak, kapatmış olmuyordu.

    Satır silinince jeton o anda geçersiz. Bedeli her istekte bir birincil
    anahtar okuması — on kişilik bir kurulumda ölçülemeyecek kadar küçük.

    --------------------------------------------------------------------------
    RLS YOK
    --------------------------------------------------------------------------
    `user` tablosuyla aynı sebeple: kimlik doğrulama sırasında henüz bir
    `app.user_id` yok — jetonu bulabilmek için önce jetonu bulmak gerekirdi.
    Jetonun kendisi rastgele 43 karakter ve tahmin edilemez; erişim kontrolü
    onun bilinmesine dayanıyor.
    """

    __tablename__ = "accesstoken"
