"""Başlangıç ağırlığı tahmini.

Bu modülün çıktısı kullanıcının salonda gerçekten kaldıracağı ağırlık, yani
hata bedeli somut. Testler iki şeyi kolluyor: sayının makul bir aralıkta
olması ve modülün ilan ettiği "kasıtlı olarak DÜŞÜK tahmin" ilkesinin her
basamakta tutması.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from overload_api.db.models.exercise import Equipment
from overload_api.db.models.user import Sex, TrainingExperience
from overload_api.services.starting_weight import EXPERIENCE_LEVEL, estimate, infer_level
from overload_api.services.strength_standards import StrengthLevel

D = Decimal


def guess(
    *,
    muscle: str = "chest",
    equipment: Equipment = Equipment.barbell,
    isolation: bool = False,
    reps: int = 8,
    bodyweight: str | None = "80",
    sex: Sex = Sex.male,
    level: StrengthLevel = StrengthLevel.untrained,
) -> Decimal | None:
    return estimate(
        primary_muscle=muscle,
        equipment=equipment,
        is_isolation=isolation,
        target_reps=reps,
        bodyweight_kg=None if bodyweight is None else D(bodyweight),
        sex=sex,
        level=level,
    )


class TestRefusesToGuess:
    """Tahmin üretilemeyecek durumlarda sayı UYDURULMUYOR."""

    def test_without_bodyweight(self) -> None:
        # Bütün hesap vücut ağırlığına dayanıyor; onsuz sayı üretmek uydurmak olur.
        assert guess(bodyweight=None) is None

    def test_without_sex(self) -> None:
        # Erkek ve kadın tabloları belirgin biçimde farklı; ortalama almak
        # kimseyi doğru temsil etmiyor.
        assert guess(sex=Sex.unspecified) is None

    def test_bodyweight_exercise(self) -> None:
        # Şınavda "kaç kilo" sorusunun cevabı yok.
        assert guess(equipment=Equipment.bodyweight) is None

    def test_unknown_muscle(self) -> None:
        assert guess(muscle="uyduruk_kas") is None

    def test_negative_bodyweight(self) -> None:
        assert guess(bodyweight="-5") is None


class TestConservativeBias:
    """Modülün ana ilkesi: hafif gelsin, ağır gelmesin."""

    def test_untrained_male_bench_is_modest(self) -> None:
        """80 kg, hiç antrenmansız erkek, 8 tekrar hedefli barbell göğüs.

        Tablo: erkek bench untrained oranı 0.50 -> 1RM 40 kg.
        Barbell katsayısı 0.85 -> 34. Ters Epley (8 tekrar): 34/1.267 = 26.8.
        2.5'e aşağı yuvarlanınca 25 kg.

        25 kg bir başlangıç olarak makul; hafifse kullanıcı ilk sette artırır.
        """
        assert guess() == D("25.00")

    def test_rounds_down_never_up(self) -> None:
        """Yuvarlama daima aşağı: yarım adım fazla ağırlık istemiyoruz."""
        for reps in range(5, 15):
            value = guess(reps=reps)
            assert value is not None
            # Sonuç plaka adımının tam katı ve ham değerin üstünde değil.
            assert value % D("2.5") == 0

    def test_more_reps_means_less_weight(self) -> None:
        """Aynı güçte 12 tekrar hedefi, 5 tekrardan hafif olmalı."""
        light = guess(reps=12)
        heavy = guess(reps=5)
        assert light is not None and heavy is not None
        assert light < heavy

    def test_isolation_is_lighter_than_compound(self) -> None:
        compound = guess(equipment=Equipment.cable, isolation=False)
        isolation = guess(equipment=Equipment.cable, isolation=True)
        assert compound is not None and isolation is not None
        assert isolation < compound

    def test_dumbbell_is_per_hand_so_much_lighter(self) -> None:
        """Dambıl katsayısı tek kol başına; barbell toplamının çok altında."""
        barbell = guess(equipment=Equipment.barbell)
        dumbbell = guess(equipment=Equipment.dumbbell)
        assert barbell is not None and dumbbell is not None
        assert dumbbell < barbell / 2

    def test_never_returns_zero(self) -> None:
        """Çok hafif çıkan tahmin bile en az bir plaka adımı olmalı;
        0 kg bir öneri değil."""
        value = guess(bodyweight="40", equipment=Equipment.dumbbell, isolation=True, reps=15)
        assert value is not None and value > 0


class TestLevelScaling:
    def test_stronger_level_means_heavier_start(self) -> None:
        values = [
            guess(level=level)
            for level in (
                StrengthLevel.untrained,
                StrengthLevel.novice,
                StrengthLevel.intermediate,
                StrengthLevel.advanced,
            )
        ]
        assert all(v is not None for v in values)
        assert values == sorted(values)  # type: ignore[type-var]

    def test_female_table_is_used(self) -> None:
        """Kadın oranları erkekten düşük; tahmin de düşük olmalı."""
        male = guess(sex=Sex.male)
        female = guess(sex=Sex.female)
        assert male is not None and female is not None
        assert female < male


class TestInferLevel:
    def test_no_history_is_untrained(self) -> None:
        assert infer_level(best_ratios={}, sex=Sex.male) is StrengthLevel.untrained

    def test_unspecified_sex_is_untrained(self) -> None:
        assert (
            infer_level(best_ratios={"barbell deadlift": D("2.0")}, sex=Sex.unspecified)
            is StrengthLevel.untrained
        )

    def test_one_strong_lift_does_not_promote_everything(self) -> None:
        """Gerçek veriyle çıkan hata.

        Overhead press'i elit (1.50 >= 1.35), deadlift'i acemi (1.62 >= 1.50)
        olan bir kullanıcıda ÜST medyan alınıyordu ve seviye ELİT çıkıyordu;
        72 kilo biri için 90 kg'lık chest press başlangıcı öneriliyordu.
        """
        level = infer_level(
            best_ratios={
                "barbell overhead press": D("1.50"),
                "barbell deadlift": D("1.62"),
            },
            sex=Sex.male,
        )
        assert level is StrengthLevel.novice

    def test_consistent_strength_is_recognised(self) -> None:
        """Her harekette orta seviyedeyse sonuç da orta olmalı."""
        level = infer_level(
            best_ratios={
                "barbell bench press": D("1.30"),  # orta esigi 1.25
                "barbell back squat": D("1.80"),  # orta esigi 1.75
                "barbell deadlift": D("2.10"),  # orta esigi 2.00
            },
            sex=Sex.male,
        )
        assert level is StrengthLevel.intermediate

    def test_unknown_lift_keys_are_ignored(self) -> None:
        assert (
            infer_level(best_ratios={"leg press": D("3.0")}, sex=Sex.male)
            is StrengthLevel.untrained
        )


class TestDeclaredExperience:
    """Geçmiş yokken kullanıcının beyan ettiği antrenman süresi.

    Önce hiç sorulmuyordu: üç yıllık biri de ilk haftasında hiç antrenman
    yapmamış biriyle aynı ağırlıkları görüyordu.
    """

    def test_experience_seeds_the_level_without_history(self) -> None:
        level = infer_level(best_ratios={}, sex=Sex.male, experience=TrainingExperience.over_three)
        assert level is StrengthLevel.intermediate

    def test_every_step_is_one_below_the_natural_mapping(self) -> None:
        """Beyan ölçüm değil: 1-3 yıl çoğu tabloda orta, burada acemi."""
        assert EXPERIENCE_LEVEL[TrainingExperience.one_to_three] is StrengthLevel.novice
        assert EXPERIENCE_LEVEL[TrainingExperience.under_1y] is StrengthLevel.untrained

    def test_declaration_never_reaches_advanced(self) -> None:
        """İleri ve elit seviyeye yalnızca gerçek setlerle çıkılıyor."""
        ceiling = {StrengthLevel.advanced, StrengthLevel.elite}
        assert not ceiling & set(EXPERIENCE_LEVEL.values())

    def test_real_history_overrides_the_declaration(self) -> None:
        """Ölçüm beyandan her zaman üstün — aşağı yönde de."""
        level = infer_level(
            best_ratios={"barbell bench press": D("0.50")},  # acemi eşiğinin altı
            sex=Sex.male,
            experience=TrainingExperience.over_three,
        )
        assert level is StrengthLevel.untrained

    def test_declared_experience_makes_the_guess_heavier_but_below_advanced(self) -> None:
        """Etkiyi sayıyla gör: aynı kişi, aynı hareket."""
        new = guess(level=EXPERIENCE_LEVEL[TrainingExperience.new])
        veteran = guess(level=EXPERIENCE_LEVEL[TrainingExperience.over_three])
        advanced = guess(level=StrengthLevel.advanced)
        assert new is not None and veteran is not None and advanced is not None
        assert new < veteran < advanced


@pytest.mark.parametrize(
    ("muscle", "anchor_hint"),
    [
        ("chest", "bench"),
        ("quads", "squat"),
        ("lats", "deadlift"),
        ("front_delts", "overhead"),
    ],
)
def test_every_muscle_group_reaches_an_anchor(muscle: str, anchor_hint: str) -> None:
    """Kas grubu -> çapa eşlemesi eksiksiz olmalı; eksik eşleme sessizce
    "tahmin yok" demek olur ve kullanıcı yine cevapsız kalır."""
    assert guess(muscle=muscle) is not None


def test_all_seeded_muscle_slugs_are_mapped() -> None:
    """Seed'deki 18 kas grubunun hepsi bir çapaya bağlı olmalı."""
    from overload_api.seed.data import MUSCLE_GROUPS

    unmapped = [mg.slug for mg in MUSCLE_GROUPS if guess(muscle=mg.slug) is None]
    assert unmapped == [], f"çapası olmayan kas grupları: {unmapped}"
