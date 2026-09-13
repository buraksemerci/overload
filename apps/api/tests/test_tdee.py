"""TDEE ve makro hedefi hesabının testleri (veritabanı gerektirmez)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from overload_api.db.models.user import ActivityLevel, Sex
from overload_api.services.nutrition.tdee import (
    MIN_SAFE_CALORIES,
    NutritionGoal,
    age_from,
    bmr_mifflin_st_jeor,
    macro_target,
)

D = Decimal


class TestAge:
    @pytest.mark.parametrize(
        ("birth", "today", "expected"),
        [
            (date(2000, 1, 1), date(2026, 1, 1), 26),   # tam doğum günü
            (date(2000, 6, 15), date(2026, 6, 14), 25),  # bir gün öncesi
            (date(2000, 6, 15), date(2026, 6, 15), 26),
            (date(2000, 12, 31), date(2026, 1, 1), 25),  # yıl farkı yanıltmasın
        ],
    )
    def test_full_years_only(self, birth: date, today: date, expected: int) -> None:
        assert age_from(birth, today) == expected


class TestBMR:
    def test_male_matches_published_formula(self) -> None:
        # 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
        result = bmr_mifflin_st_jeor(weight_kg=D("80"), height_cm=180, age=30, sex=Sex.male)
        assert result == D("1780")

    def test_female_matches_published_formula(self) -> None:
        # 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25
        result = bmr_mifflin_st_jeor(weight_kg=D("60"), height_cm=165, age=30, sex=Sex.female)
        assert result == D("1320.25")

    def test_unspecified_sex_returns_none_instead_of_guessing(self) -> None:
        """Formülün cinsiyete göre farklı sabiti var; ortalama almak kimseyi
        doğru temsil etmez. Hesap yapılamıyorsa açıkça None dönmeli."""
        assert (
            bmr_mifflin_st_jeor(
                weight_kg=D("70"), height_cm=175, age=30, sex=Sex.unspecified
            )
            is None
        )


class TestMacroTarget:
    def _target(self, goal: NutritionGoal, **kwargs: object):  # type: ignore[no-untyped-def]
        defaults = {
            "weight_kg": D("80"),
            "height_cm": 180,
            "age": 30,
            "sex": Sex.male,
            "activity": ActivityLevel.moderate,
            "goal": goal,
        }
        return macro_target(**{**defaults, **kwargs})  # type: ignore[arg-type]

    def test_maintain_equals_tdee(self) -> None:
        result = self._target(NutritionGoal.maintain)
        assert result is not None
        assert result.calories == result.tdee

    def test_cut_is_below_and_bulk_above_maintenance(self) -> None:
        cut = self._target(NutritionGoal.cut)
        maintain = self._target(NutritionGoal.maintain)
        bulk = self._target(NutritionGoal.bulk)
        assert cut and maintain and bulk
        assert cut.calories < maintain.calories < bulk.calories

    def test_protein_is_two_grams_per_kilo(self) -> None:
        result = self._target(NutritionGoal.maintain, weight_kg=D("80"))
        assert result is not None
        assert result.protein_g == 160

    def test_macros_reconstruct_the_calorie_target(self) -> None:
        """Protein*4 + karbonhidrat*4 + yağ*9 kalori hedefine çok yakın olmalı.
        Yuvarlama nedeniyle birkaç kalori sapma normal."""
        result = self._target(NutritionGoal.maintain)
        assert result is not None
        reconstructed = result.protein_g * 4 + result.carbs_g * 4 + result.fat_g * 9
        assert abs(reconstructed - result.calories) <= 10

    def test_safety_floor_is_applied_and_flagged(self) -> None:
        """Çok küçük bir vücutta agresif kesim 1200 kcal'in altına inebilir.
        Taban uygulanmalı VE kullanıcıya bildirilmeli — sessizce düzeltmek,
        hedefin neden beklenenden yüksek olduğunu açıklanamaz yapar."""
        result = self._target(
            NutritionGoal.cut,
            weight_kg=D("40"),
            height_cm=150,
            age=60,
            sex=Sex.female,
            activity=ActivityLevel.sedentary,
        )
        assert result is not None
        assert result.calories == MIN_SAFE_CALORIES
        assert result.floor_applied is True

    def test_normal_target_does_not_flag_the_floor(self) -> None:
        result = self._target(NutritionGoal.cut)
        assert result is not None
        assert result.floor_applied is False
        assert result.calories > MIN_SAFE_CALORIES

    def test_activity_level_scales_monotonically(self) -> None:
        values = [
            self._target(NutritionGoal.maintain, activity=level)
            for level in (
                ActivityLevel.sedentary,
                ActivityLevel.light,
                ActivityLevel.moderate,
                ActivityLevel.active,
                ActivityLevel.very_active,
            )
        ]
        calories = [v.calories for v in values if v]
        assert calories == sorted(calories)
        assert len(set(calories)) == 5  # her seviye farklı sonuç vermeli

    def test_unspecified_sex_yields_no_target(self) -> None:
        assert self._target(NutritionGoal.maintain, sex=Sex.unspecified) is None

    def test_carbs_never_go_negative(self) -> None:
        """Yüksek protein + düşük kalori kombinasyonunda karbonhidrat matematiksel
        olarak negatife düşebilir; sıfırda kırpılmalı."""
        result = self._target(
            NutritionGoal.cut,
            weight_kg=D("120"),
            height_cm=160,
            age=70,
            sex=Sex.female,
            activity=ActivityLevel.sedentary,
        )
        assert result is not None
        assert result.carbs_g >= 0
