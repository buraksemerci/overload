"""Program modeli — üç kaynaklı, tek veri yapısı.

Bölüm 4.1'in gereği: manuel oluşturulan, şablondan klonlanan ve AI'nın ürettiği
programların **hepsi** aynı `Program -> ProgramDay -> ProgramExercise` ağacını kullanır.
Kaynak farkı sadece iki alanda görünür: `is_template` ve `source_name`.

Böylece "AI programı" diye ayrı bir kod yolu oluşmaz; AI'nın ürettiği şey de
kullanıcının elle kurduğu şeyle birebir aynı satırlardır ve aynı ekranda düzenlenir.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from overload_api.db.base import Base, TimestampMixin, enum_column, non_empty, pk_column


class ProgramGoal(StrEnum):
    strength = "strength"
    hypertrophy = "hypertrophy"
    powerbuilding = "powerbuilding"
    general_fitness = "general_fitness"


class ProgramLevel(StrEnum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class IntensityTechnique(StrEnum):
    """Seed verisindeki `yontem` alanının karşılığı."""

    straight = "straight"  # teknik belirtilmemiş
    rir1 = "rir1"  # bitişe 1 tekrar kala bırak
    failure = "failure"  # tam kas yorgunluğuna kadar
    rir1_to_failure = "rir1_to_failure"  # ilk setler RIR1, son set failure
    superset_failure = "superset_failure"  # superset olarak failure'a kadar
    drop_set = "drop_set"
    myo_reps = "myo_reps"


class Program(TimestampMixin, Base):
    """`owner_id` NULL + `is_template` True -> kütüphane şablonu (salt-okunur).
    Kullanıcı 'başlat' dediğinde derin kopya çıkarılıp `owner_id` atanır."""

    __tablename__ = "program"

    id: Mapped[uuid.UUID] = pk_column()
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    is_template: Mapped[bool] = mapped_column(default=False, nullable=False)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000))
    goal: Mapped[ProgramGoal] = enum_column(ProgramGoal, nullable=False)
    level: Mapped[ProgramLevel] = enum_column(ProgramLevel, nullable=False)
    days_per_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    # Şablonun orijinal yaratıcısı/topluluğu (bölüm 9 şartı — atıf zorunlu).
    source_name: Mapped[str | None] = mapped_column(String(120))
    source_url: Mapped[str | None] = mapped_column(String(500))
    # Bu program bir şablondan klonlandıysa hangisinden.
    cloned_from_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("program.id", ondelete="SET NULL")
    )
    # Ana paneldeki "bugünkü antrenman" bunu okur. Kullanıcı başına en fazla bir
    # tane olabilir — aşağıdaki kısmi tekil indeks bunu zorunlu kılıyor.
    is_active: Mapped[bool] = mapped_column(default=False, nullable=False)

    days: Mapped[list[ProgramDay]] = relationship(
        back_populates="program",
        cascade="all, delete-orphan",
        order_by="ProgramDay.order_index",
        lazy="selectin",
    )

    __table_args__ = (
        non_empty("name"),
        CheckConstraint("days_per_week BETWEEN 1 AND 7", name="days_per_week_range"),
        # Şablonun sahibi olmaz; kullanıcı programı şablon olamaz.
        CheckConstraint(
            "(is_template AND owner_id IS NULL) OR (NOT is_template AND owner_id IS NOT NULL)",
            name="template_xor_owned",
        ),
        # Atıf zorunlu: şablon kaynak adı olmadan eklenemez.
        CheckConstraint("NOT is_template OR source_name IS NOT NULL", name="template_needs_source"),
        # Şablon "aktif" olamaz — aktiflik kullanıcıya ait bir durum.
        CheckConstraint("NOT (is_template AND is_active)", name="template_not_active"),
        Index("ix_program_owner_id", "owner_id"),
        # Kısmi tekil indeks: kullanıcı başına en fazla BİR aktif program.
        # Uygulama kodunda "önce eskisini pasifleştir" unutulsa bile veritabanı
        # ikinci bir aktif programa izin vermez.
        Index(
            "uq_program_one_active_per_owner",
            "owner_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )


class ProgramDay(Base):
    """Programın bir günü. `label` serbest metin ('Pazartesi — Göğüs/Omuz/Triceps')
    çünkü herkes haftanın aynı gününde antrenman yapmıyor."""

    __tablename__ = "program_day"

    id: Mapped[uuid.UUID] = pk_column()
    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("program.id", ondelete="CASCADE"), nullable=False
    )
    order_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)

    program: Mapped[Program] = relationship(back_populates="days")
    exercises: Mapped[list[ProgramExercise]] = relationship(
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="ProgramExercise.order_index",
        lazy="selectin",
    )

    __table_args__ = (
        non_empty("label"),
        UniqueConstraint("program_id", "order_index", name="uq_program_day_order"),
    )


class ProgramExercise(Base):
    """Bir gündeki tek hareket satırı.

    **Superset modeli.** Kaynak veride 'Hammer curl + Reverse barbell curl' tek satır
    gibi görünüyor ama bu iki ayrı harekettir. Tek satıra sıkıştırırsak kas eşlemesi
    (dolayısıyla ısı haritası ve hacim dengesi) bozulur. Bu yüzden iki ayrı satır
    yazılır ve aynı `superset_group` değeri verilir; aynı grup numarasını paylaşan
    satırlar arka arkaya, dinlenmeden yapılır.
    """

    __tablename__ = "program_exercise"

    id: Mapped[uuid.UUID] = pk_column()
    program_day_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("program_day.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercise.id", ondelete="RESTRICT"), nullable=False
    )
    order_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    target_sets: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    target_rep_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    target_rep_max: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # Yüzde tabanlı programlar (5/3/1, nSuns, Candito) için antrenman maksimumunun
    # yüzdesi. NULL ise ağırlık progresif overload motoruna bırakılır.
    #
    # Bu alan olmadan 5/3/1'i kaydetmek yanlış veri üretirdi: program "%85 x 5+"
    # diyor, biz "5 tekrar" yazsak kullanıcı ağırlığı kendi uydururdu ve
    # programın bütün mantığı (yüzde döngüsü) kaybolurdu.
    target_percent_1rm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    technique: Mapped[IntensityTechnique] = enum_column(
        IntensityTechnique, default=IntensityTechnique.straight, nullable=False
    )
    # Aynı değeri paylaşan satırlar superset. NULL -> bağımsız hareket.
    superset_group: Mapped[int | None] = mapped_column(SmallInteger)
    rest_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    notes: Mapped[str | None] = mapped_column(String(500))

    day: Mapped[ProgramDay] = relationship(back_populates="exercises")
    exercise: Mapped[Exercise] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint("target_sets BETWEEN 1 AND 20", name="sets_range"),
        CheckConstraint("target_rep_min BETWEEN 1 AND 100", name="rep_min_range"),
        CheckConstraint("target_rep_max BETWEEN target_rep_min AND 100", name="rep_max_gte_min"),
        CheckConstraint(
            "rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 900", name="rest_range"
        ),
        # %30 altı ısınma, %120 üstü gerçekçi değil (supramaksimal çalışma
        # bu uygulamanın kapsamı dışında).
        CheckConstraint(
            "target_percent_1rm IS NULL OR target_percent_1rm BETWEEN 30 AND 120",
            name="percent_range",
        ),
        UniqueConstraint("program_day_id", "order_index", name="uq_program_exercise_order"),
        Index("ix_program_exercise_exercise_id", "exercise_id"),
    )

    @property
    def target_label(self) -> str:
        """'2x5-6', '3x8' ya da yüzde tabanlıysa '1x5 @%85' biçiminde etiket."""
        reps = (
            str(self.target_rep_min)
            if self.target_rep_min == self.target_rep_max
            else f"{self.target_rep_min}-{self.target_rep_max}"
        )
        label = f"{self.target_sets}x{reps}"
        if self.target_percent_1rm is not None:
            # normalize(): 85.00 -> 85, 67.50 -> 67.5
            percent = format(self.target_percent_1rm.normalize(), "f")
            label += f" @%{percent}"
        return label


from overload_api.db.models.exercise import Exercise  # noqa: E402  (döngüsel import kaçınması)
