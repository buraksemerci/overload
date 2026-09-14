"""Güç standardı sınıflandırmasının testleri (veritabanı gerektirmez)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from overload_api.db.models.user import Sex
from overload_api.services import strength_standards as std

D = Decimal
BW = D("80")  # 80 kg referans vücut ağırlığı


def classify(ratio: str, *, sex: Sex = Sex.male, lift: str = "barbell bench press"):  # type: ignore[no-untyped-def]
    """Verilen vücut ağırlığı oranına karşılık gelen sonucu üretir."""
    return std.classify(lift_key=lift, estimated_1rm=BW * D(ratio), bodyweight_kg=BW, sex=sex)


class TestClassification:
    @pytest.mark.parametrize(
        ("ratio", "expected"),
        [
            ("0.30", std.StrengthLevel.untrained),  # en alt eşiğin de altı
            ("0.50", std.StrengthLevel.untrained),  # tam untrained eşiği
            ("0.75", std.StrengthLevel.novice),
            ("1.00", std.StrengthLevel.novice),  # iki eşik arası
            ("1.25", std.StrengthLevel.intermediate),
            ("1.75", std.StrengthLevel.advanced),
            ("2.00", std.StrengthLevel.elite),
            ("3.00", std.StrengthLevel.elite),  # tavanın çok üstü
        ],
    )
    def test_male_bench_thresholds(self, ratio: str, expected: std.StrengthLevel) -> None:
        result = classify(ratio)
        assert result is not None
        assert result.level is expected

    def test_female_table_differs_from_male(self) -> None:
        """Aynı oran, iki cinsiyette farklı seviyeye denk gelmeli —
        aksi halde ayrı tablo tutmanın anlamı olmazdı."""
        male = classify("0.75", sex=Sex.male)
        female = classify("0.75", sex=Sex.female)
        assert male is not None and female is not None
        assert male.level is not female.level

    def test_unspecified_sex_returns_none(self) -> None:
        assert classify("1.25", sex=Sex.unspecified) is None

    def test_unknown_lift_returns_none(self) -> None:
        assert classify("1.25", lift="lateral raise") is None

    def test_zero_bodyweight_returns_none_instead_of_dividing(self) -> None:
        """Sıfıra bölme hatası yerine sessiz None."""
        assert (
            std.classify(
                lift_key="barbell bench press",
                estimated_1rm=D("100"),
                bodyweight_kg=D("0"),
                sex=Sex.male,
            )
            is None
        )


class TestNextLevel:
    def test_next_level_target_is_computed_in_kilograms(self) -> None:
        result = classify("0.75")  # novice
        assert result is not None
        assert result.next_level is std.StrengthLevel.intermediate
        # intermediate eşiği 1.25 x 80 kg = 100 kg
        assert result.next_level_kg == D("100.00")

    def test_elite_has_no_next_level(self) -> None:
        result = classify("2.50")
        assert result is not None
        assert result.level is std.StrengthLevel.elite
        assert result.next_level is None
        assert result.next_level_kg is None
        assert result.progress_to_next == 1.0

    def test_progress_is_zero_at_threshold_and_grows(self) -> None:
        at_threshold = classify("0.75")
        halfway = classify("1.00")  # 0.75 ile 1.25 arasının ortası
        assert at_threshold is not None and halfway is not None
        assert at_threshold.progress_to_next == pytest.approx(0.0)
        assert halfway.progress_to_next == pytest.approx(0.5)

    def test_progress_stays_within_bounds(self) -> None:
        for ratio in ("0.10", "0.50", "1.24", "1.99", "5.00"):
            result = classify(ratio)
            assert result is not None
            assert 0.0 <= result.progress_to_next <= 1.0


class TestTableIntegrity:
    @pytest.mark.parametrize("sex", [Sex.male, Sex.female])
    def test_thresholds_increase_monotonically(self, sex: Sex) -> None:
        """Eşikler artan sırada olmalı; sıralama bozulursa sınıflandırma
        sessizce yanlış seviye döndürür."""
        for lift, ratios in std._RATIOS[sex].items():
            assert list(ratios) == sorted(ratios), f"{sex.value}/{lift}"
            assert len(ratios) == len(std._LEVELS)

    def test_tracked_lifts_are_covered_by_both_tables(self) -> None:
        for sex in (Sex.male, Sex.female):
            assert set(std._RATIOS[sex]) == set(std.TRACKED_LIFTS)

    def test_every_level_has_a_turkish_label(self) -> None:
        assert set(std.LEVEL_LABEL) == set(std.StrengthLevel)

    def test_male_thresholds_are_at_or_above_female(self) -> None:
        """Yayımlanmış tablolarda erkek eşikleri her seviyede kadın eşiklerine
        eşit ya da üstünde. Bir tabloyu güncellerken diğerini unutmayı yakalar."""
        for lift in std.TRACKED_LIFTS:
            for male, female in zip(
                std._RATIOS[Sex.male][lift], std._RATIOS[Sex.female][lift], strict=True
            ):
                assert male >= female, lift
