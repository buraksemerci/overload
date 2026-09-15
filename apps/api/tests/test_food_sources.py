"""USDA cevabının ayrıştırılması ve aday sıralaması.

Ağ gerektirmez: fonksiyonlar USDA'nın JSON gövdesini alan saf fonksiyonlar,
testler gerçek cevaplardan alınmış temsili sözlüklerle çalışıyor.

Bu dosyanın var olma sebebi, besin aramasının canlı anahtarla denendiğinde
tamamen çalışmadığının görülmesi. "chicken breast" gibi en temel sorgu bile
hiçbir sonuç döndürmüyordu; sebebi tek tek zararsız görünen üç varsayımdı.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from overload_api.services.nutrition.sources import (
    SEARCH_RESULT_LIMIT,
    _build_entry,
    _energy_of,
    _rank,
)


def food(
    description: str,
    *,
    data_type: str = "SR Legacy",
    nutrients: dict[int, float] | None = None,
    fdc_id: int = 1,
) -> dict[str, Any]:
    return {
        "fdcId": fdc_id,
        "description": description,
        "dataType": data_type,
        "foodNutrients": [
            {"nutrientId": nid, "value": value} for nid, value in (nutrients or {}).items()
        ],
    }


class TestEnergyLookup:
    """Enerji tek bir numarada değil."""

    def test_prefers_the_standard_kcal_nutrient(self) -> None:
        assert _energy_of(food("x", nutrients={1008: 263, 2047: 999})) == Decimal("263")

    def test_falls_back_to_atwater_general(self) -> None:
        """Foundation kayıtlarında 1008 YOK — eski kod bu yüzden onları eliyordu."""
        assert _energy_of(food("x", nutrients={2047: 106.034, 2048: 112.2})) == Decimal("106.034")

    def test_falls_back_to_atwater_specific(self) -> None:
        assert _energy_of(food("x", nutrients={2048: 112.2})) == Decimal("112.2")

    def test_no_energy_at_all(self) -> None:
        """Gerçekten boş kayıtlar var; bunlar elenmeli, aramayı öldürmemeli."""
        assert _energy_of(food("Lunchmeat, chicken breast, sliced")) is None
        assert _energy_of(food("x", nutrients={1003: 20.0})) is None


class TestRanking:
    def sort(self, foods: list[dict[str, Any]], query: str) -> list[str]:
        tokens = query.split()
        ordered = sorted(enumerate(foods), key=lambda pair: (_rank(pair[1], tokens), pair[0]))
        return [str(f["description"]) for _, f in ordered]

    def test_base_food_beats_a_product_derived_from_it(self) -> None:
        """USDA açıklaması temel gıdayla başlar: "Rice, white..." ama "Flour, rice...".

        Bu ayrım olmadan "white rice" araması pirinç ununu (359 kcal) birinci
        getiriyordu; kullanıcının kastettiği pişmiş pirinç 130 kcal.
        """
        order = self.sort(
            [
                food("Flour, rice, white, unenriched"),
                food("Rice, white, long grain, unenriched, raw"),
            ],
            "white rice",
        )
        assert order[0].startswith("Rice,")

    def test_foundation_beats_sr_legacy(self) -> None:
        """Foundation temel gıda kümesi; SR Legacy işlenmiş ürünlerle dolu."""
        order = self.sort(
            [
                food("Chicken breast tenders, breaded, uncooked"),
                food("Chicken, breast, boneless, skinless, raw", data_type="Foundation"),
            ],
            "chicken breast",
        )
        assert order[0] == "Chicken, breast, boneless, skinless, raw"

    def test_dehydrated_forms_sink(self) -> None:
        """Kurutulmuş form 100g'da birkaç kat kalori taşır — yanlış seçimin
        en pahalı olduğu yer burası."""
        order = self.sort(
            [
                food("Egg, white, dried", data_type="Foundation"),
                food("Eggs, Grade A, Large, egg whole", data_type="Foundation"),
            ],
            "egg",
        )
        assert order[0] == "Eggs, Grade A, Large, egg whole"

    def test_missing_query_words_sink_hardest(self) -> None:
        order = self.sort(
            [
                food("Oil, coconut", data_type="Foundation"),
                food("Oil, olive, salad or cooking"),
            ],
            "olive oil",
        )
        assert order[0] == "Oil, olive, salad or cooking"

    def test_usda_order_breaks_ties(self) -> None:
        """Eşit puanlı adaylarda USDA'nın kendi alaka sırası korunmalı."""
        order = self.sort(
            [food("Yogurt, plain, nonfat"), food("Yogurt, plain, whole milk")],
            "yogurt",
        )
        assert order == ["Yogurt, plain, nonfat", "Yogurt, plain, whole milk"]


class TestBuildEntry:
    def test_maps_macros_and_normalises_the_name(self) -> None:
        entry = _build_entry(
            food(
                "chicken, breast, boneless, skinless, raw",
                nutrients={1003: 22.5, 1004: 1.93, 1005: 0.0, 1079: 0.4},
                fdc_id=2646170,
            ),
            Decimal("106.03"),
        )
        assert entry.external_id == "2646170"
        assert entry.name == "Chicken, Breast, Boneless, Skinless, Raw"
        assert entry.search_name == entry.name.lower()
        assert entry.calories_per_100g == Decimal("106.03")
        assert entry.protein_g == Decimal("22.5")
        assert entry.fat_g == Decimal("1.93")
        assert entry.fiber_g == Decimal("0.4")

    def test_absent_macros_become_zero_not_none(self) -> None:
        """Sütunlar NOT NULL; eksik makro kaydı reddettirmemeli."""
        entry = _build_entry(food("x", nutrients={1003: 5.0}), Decimal("50"))
        assert entry.carbs_g == Decimal(0)
        assert entry.fat_g == Decimal(0)
        assert entry.fiber_g is None

    def test_negative_carbs_are_clamped(self) -> None:
        """USDA karbonhidratı farktan hesaplıyor ve eksiye düşebiliyor.

        Çiğ tavuk göğsü için -0.428 g dönüyor. Kırpılmazsa `macros_non_negative`
        kısıtı INSERT'i reddediyor ve arama isteğinin tamamı hata veriyordu.
        """
        entry = _build_entry(
            food("Chicken, breast, meat and skin, raw", nutrients={1003: 21.4, 1005: -0.428}),
            Decimal("127"),
        )
        assert entry.carbs_g == Decimal(0)
        assert entry.protein_g == Decimal("21.4")


def test_result_limit_is_small_enough_to_choose_from() -> None:
    """Liste seçilebilir kalmalı; 25 aday göstermek seçimi kolaylaştırmaz."""
    assert 3 <= SEARCH_RESULT_LIMIT <= 10
