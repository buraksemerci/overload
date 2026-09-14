"""Öğün önerisi algoritmasının testleri (veritabanı gerektirmez)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from overload_api.services.nutrition.meal_suggestion import (
    MAX_PORTION_G,
    FoodOption,
    FoodRole,
    Remaining,
    suggest_meals,
)

D = Decimal

CHICKEN = FoodOption("1", "Chicken Breast", D("165"), D("31"), D("0"), D("3.6"))
RICE = FoodOption("2", "White Rice", D("130"), D("2.7"), D("28"), D("0.3"))
OLIVE_OIL = FoodOption("3", "Olive Oil", D("884"), D("0"), D("0"), D("100"))
ALMONDS = FoodOption("4", "Almonds", D("579"), D("21"), D("22"), D("50"))
EGG = FoodOption("5", "Egg", D("155"), D("13"), D("1.1"), D("11"))

PANTRY = [CHICKEN, RICE, OLIVE_OIL, ALMONDS, EGG]


class TestRoleClassification:
    @pytest.mark.parametrize(
        ("food", "expected"),
        [
            (CHICKEN, FoodRole.protein),
            (RICE, FoodRole.carb),
            (OLIVE_OIL, FoodRole.fat),
            (ALMONDS, FoodRole.fat),  # kalorisinin çoğu yağdan
        ],
    )
    def test_dominant_macro_decides_role(self, food: FoodOption, expected: FoodRole) -> None:
        assert food.role is expected

    def test_balanced_food_is_mixed(self) -> None:
        """Hiçbir makro kalorinin %40'ını geçmiyorsa rol atanamaz."""
        balanced = FoodOption("x", "Dengeli", D("200"), D("10"), D("20"), D("8"))
        # P 40 kcal, K 80 kcal, Y 72 kcal -> toplam 192, en büyük pay %41.6
        # Bu eşiği geçiyor; eşiğin altında kalan bir örnek kuralım:
        truly_mixed = FoodOption("y", "Dengeli", D("200"), D("13"), D("13"), D("6.5"))
        assert balanced.role is FoodRole.carb
        assert truly_mixed.role is FoodRole.mixed

    def test_zero_macro_food_is_mixed(self) -> None:
        water = FoodOption("z", "Su", D("0"), D("0"), D("0"), D("0"))
        assert water.role is FoodRole.mixed


class TestSuggestions:
    def test_produces_suggestions_for_a_normal_deficit(self) -> None:
        remaining = Remaining(calories=D("800"), protein_g=D("60"), carbs_g=D("70"), fat_g=D("20"))
        results = suggest_meals(PANTRY, remaining)

        assert results
        first = results[0]
        assert first.items
        # Protein kaynağı mutlaka olmalı — hedefin belirleyicisi o.
        assert any(item.food_id == CHICKEN.id for item in first.items)

    def test_protein_target_is_approximately_met(self) -> None:
        remaining = Remaining(calories=D("800"), protein_g=D("60"), carbs_g=D("70"), fat_g=D("20"))
        best = suggest_meals(PANTRY, remaining)[0]
        # Yuvarlama ve ikincil kaynakların katkısıyla sapma olur; %25 tolerans.
        assert 45 <= best.total_protein_g <= 80

    def test_results_are_sorted_by_fit(self) -> None:
        remaining = Remaining(calories=D("900"), protein_g=D("50"), carbs_g=D("80"), fat_g=D("25"))
        results = suggest_meals(PANTRY, remaining)
        scores = [r.fit_score for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_no_suggestion_when_target_is_met(self) -> None:
        """Hedef dolmuşsa cevap 'hiçbir şey' olmalı, uydurma bir öğün değil."""
        remaining = Remaining(calories=D("0"), protein_g=D("0"), carbs_g=D("0"), fat_g=D("0"))
        assert suggest_meals(PANTRY, remaining) == []

    def test_no_suggestion_when_calories_exceeded(self) -> None:
        remaining = Remaining(calories=D("-300"), protein_g=D("20"), carbs_g=D("10"), fat_g=D("5"))
        assert suggest_meals(PANTRY, remaining) == []

    def test_no_protein_source_yields_nothing(self) -> None:
        remaining = Remaining(calories=D("800"), protein_g=D("60"), carbs_g=D("70"), fat_g=D("20"))
        assert suggest_meals([RICE, OLIVE_OIL], remaining) == []

    def test_portions_stay_within_realistic_bounds(self) -> None:
        """Kimse tek öğünde 900 g pirinç yemiyor; porsiyon kırpılmalı."""
        huge = Remaining(calories=D("4000"), protein_g=D("300"), carbs_g=D("400"), fat_g=D("120"))
        for suggestion in suggest_meals(PANTRY, huge):
            for item in suggestion.items:
                assert item.quantity_g <= int(MAX_PORTION_G)

    def test_portions_are_rounded_to_five_grams(self) -> None:
        """Tartıda '137 g' saçma, '135 g' değil."""
        remaining = Remaining(calories=D("700"), protein_g=D("47"), carbs_g=D("55"), fat_g=D("18"))
        for suggestion in suggest_meals(PANTRY, remaining):
            for item in suggestion.items:
                assert item.quantity_g % 5 == 0

    def test_fit_score_is_bounded(self) -> None:
        remaining = Remaining(calories=D("800"), protein_g=D("60"), carbs_g=D("70"), fat_g=D("20"))
        for suggestion in suggest_meals(PANTRY, remaining):
            assert 0.0 <= suggestion.fit_score <= 1.0

    def test_limit_is_respected(self) -> None:
        remaining = Remaining(calories=D("800"), protein_g=D("60"), carbs_g=D("70"), fat_g=D("20"))
        assert len(suggest_meals(PANTRY, remaining, limit=1)) <= 1

    def test_totals_match_item_sums(self) -> None:
        remaining = Remaining(calories=D("800"), protein_g=D("60"), carbs_g=D("70"), fat_g=D("20"))
        for suggestion in suggest_meals(PANTRY, remaining):
            assert suggestion.total_calories == sum(i.calories for i in suggestion.items)
            assert suggestion.total_protein_g == sum(i.protein_g for i in suggestion.items)
            assert suggestion.total_carbs_g == sum(i.carbs_g for i in suggestion.items)
            assert suggestion.total_fat_g == sum(i.fat_g for i in suggestion.items)
