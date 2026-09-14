"""Progresif overload motorunun birim testleri.

Veritabanı gerektirmez — motor saf fonksiyonlardan oluşuyor.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from overload_api.db.models.exercise import Equipment
from overload_api.db.models.program import IntensityTechnique
from overload_api.services.progression import (
    ExerciseTarget,
    PerformedSet,
    SessionPerformance,
    SuggestionKind,
    detect_plateau,
    next_weight,
    should_suggest_deload_week,
    suggest_next_target,
)

D = Decimal
BASE_DAY = date(2026, 9, 1)


def session(*sets: PerformedSet, day_offset: int = 0) -> SessionPerformance:
    return SessionPerformance(performed_on=BASE_DAY + timedelta(days=day_offset), sets=tuple(sets))


def target(
    sets: int = 2,
    rep_min: int = 6,
    rep_max: int = 8,
    technique: IntensityTechnique = IntensityTechnique.rir1,
    equipment: Equipment = Equipment.plate_loaded,
) -> ExerciseTarget:
    return ExerciseTarget(
        sets=sets, rep_min=rep_min, rep_max=rep_max, technique=technique, equipment=equipment
    )


# --- Ağırlık adımı -----------------------------------------------------------


class TestNextWeight:
    @pytest.mark.parametrize(
        ("current", "equipment", "expected"),
        [
            # %3.75 hedef -> 1.5 kg; 2.5'lik adıma yuvarlanır -> 42.5
            (D("40"), Equipment.plate_loaded, D("42.50")),
            (D("100"), Equipment.barbell, D("102.50")),  # 3.75 -> 1 adım (2.5)
            (D("20"), Equipment.dumbbell, D("22.00")),  # 0.75 -> en az 1 adım (2.0)
            (D("60"), Equipment.machine, D("65.00")),  # 2.25 -> 5'lik blok
            (D("10"), Equipment.cable, D("12.50")),  # 0.375 -> en az 1 adım
        ],
    )
    def test_snaps_to_real_plate_steps(
        self, current: Decimal, equipment: Equipment, expected: Decimal
    ) -> None:
        assert next_weight(current, equipment) == expected

    def test_always_increases_even_when_percentage_rounds_to_zero(self) -> None:
        """Küçük ağırlıklarda %3.75 bir adımın altında kalır; yine de artmalı."""
        assert next_weight(D("5"), Equipment.barbell) > D("5")

    def test_bodyweight_never_adds_load(self) -> None:
        assert next_weight(D("0"), Equipment.bodyweight) == D("0")


# --- Temel akışlar -----------------------------------------------------------


class TestSuggestNextTarget:
    def test_no_history_asks_for_a_baseline(self) -> None:
        result = suggest_next_target(target(), history=[])
        assert result.primary.kind is SuggestionKind.establish_baseline
        assert "İlk kez" in result.message

    def test_prompt_example_reproduced(self) -> None:
        """Bölüm 3'teki örnek: 40kg x 8 RIR1 -> '40kg x 9 veya 42.5kg x 8'.

        Hedef aralık 6-8; 8 tekrar aralığın tepesi ve RIR1 -> ağırlık artışı hak edildi.
        """
        history = [session(PerformedSet(D("40"), 8, rir=1))]
        result = suggest_next_target(target(rep_min=6, rep_max=8), history)

        assert result.primary.kind is SuggestionKind.add_weight
        assert result.primary.weight_kg == D("42.50")
        assert result.alternative is not None
        assert result.alternative.kind is SuggestionKind.add_reps
        assert result.alternative.weight_kg == D("40")
        assert result.alternative.reps == 9
        assert "42.5kg" in result.message and "40kg x 9" in result.message

    def test_mid_range_adds_a_rep(self) -> None:
        history = [session(PerformedSet(D("40"), 7, rir=1))]
        result = suggest_next_target(target(rep_min=6, rep_max=8), history)
        assert result.primary.kind is SuggestionKind.add_reps
        assert (result.primary.weight_kg, result.primary.reps) == (D("40"), 8)

    def test_high_rir_blocks_the_weight_jump(self) -> None:
        """Tekrar hedefi aşılmış ama RIR3 -> set kolaydı; önce RIR'ı düşür."""
        history = [session(PerformedSet(D("40"), 9, rir=3))]
        result = suggest_next_target(target(rep_min=6, rep_max=8), history)
        assert result.primary.kind is SuggestionKind.add_reps
        assert result.warnings and "RIR3" in result.warnings[0]

    def test_unknown_rir_still_allows_progress(self) -> None:
        """RIR girilmemişse motor takılıp kalmamalı (karar defteri #3)."""
        history = [session(PerformedSet(D("40"), 8, rir=None))]
        result = suggest_next_target(target(rep_min=6, rep_max=8), history)
        assert result.primary.kind is SuggestionKind.add_weight

    def test_below_range_holds_the_weight(self) -> None:
        history = [session(PerformedSet(D("60"), 4, rir=0))]
        result = suggest_next_target(target(rep_min=6, rep_max=8), history)
        assert result.primary.kind is SuggestionKind.hold
        assert result.primary.weight_kg == D("60")
        assert result.primary.reps == 6

    def test_top_set_ignores_warmups(self) -> None:
        history = [
            session(
                PerformedSet(D("80"), 12, is_warmup=True),  # ısınma daha çok tekrar
                PerformedSet(D("40"), 7, rir=1),
            )
        ]
        result = suggest_next_target(target(rep_min=6, rep_max=8), history)
        assert result.primary.weight_kg == D("40")

    def test_bodyweight_progresses_through_reps_only(self) -> None:
        history = [session(PerformedSet(D("0"), 12, rir=1))]
        result = suggest_next_target(
            target(rep_min=8, rep_max=12, equipment=Equipment.bodyweight), history
        )
        assert result.primary.kind is SuggestionKind.add_reps
        assert result.primary.reps == 13


# --- Plato ve deload ---------------------------------------------------------


class TestPlateau:
    def test_three_stalled_sessions_trigger_deload(self) -> None:
        history = [
            session(PerformedSet(D("50"), 8, rir=1), day_offset=0),  # zirve
            session(PerformedSet(D("50"), 7, rir=0), day_offset=7),
            session(PerformedSet(D("50"), 7, rir=0), day_offset=14),
            session(PerformedSet(D("47.5"), 8, rir=0), day_offset=21),
        ]
        result = suggest_next_target(target(rep_min=6, rep_max=8), history)

        assert result.plateau is not None
        assert result.plateau.stalled_sessions == 3
        assert result.primary.kind is SuggestionKind.deload
        # 47.5 x 0.90 = 42.75 -> 2.5'lik adıma yuvarlanır -> 42.5
        assert result.primary.weight_kg == D("42.50")
        assert "deload" in result.message.lower()

    def test_steady_progress_is_not_a_plateau(self) -> None:
        history = [
            session(PerformedSet(D("40"), 6, rir=1), day_offset=0),
            session(PerformedSet(D("42.5"), 6, rir=1), day_offset=7),
            session(PerformedSet(D("45"), 6, rir=1), day_offset=14),
            session(PerformedSet(D("47.5"), 6, rir=1), day_offset=21),
        ]
        assert detect_plateau(history, IntensityTechnique.rir1) is None

    def test_too_little_history_cannot_be_a_plateau(self) -> None:
        history = [session(PerformedSet(D("50"), 8)) for _ in range(3)]
        assert detect_plateau(history, IntensityTechnique.rir1) is None


# --- Failure teknikleri ------------------------------------------------------


class TestFailureTechniques:
    def test_volume_is_the_metric_for_failure_sets(self) -> None:
        history = [
            session(PerformedSet(D("30"), 10), PerformedSet(D("30"), 8)),
            session(PerformedSet(D("30"), 9), PerformedSet(D("30"), 7)),  # hacim düştü
        ]
        result = suggest_next_target(
            target(rep_min=8, rep_max=10, technique=IntensityTechnique.failure), history
        )
        assert result.warnings
        assert "hacim" in result.warnings[0].lower()

    def test_exceeding_rep_target_on_failure_raises_weight(self) -> None:
        history = [session(PerformedSet(D("30"), 12))]
        result = suggest_next_target(
            target(rep_min=8, rep_max=10, technique=IntensityTechnique.failure), history
        )
        assert result.primary.kind is SuggestionKind.add_weight
        assert result.primary.weight_kg == D("32.50")

    def test_plateau_on_failure_sets_uses_volume_metric(self) -> None:
        history = [
            session(PerformedSet(D("30"), 12), PerformedSet(D("30"), 10), day_offset=0),
            session(PerformedSet(D("30"), 10), PerformedSet(D("30"), 9), day_offset=7),
            session(PerformedSet(D("30"), 10), PerformedSet(D("30"), 8), day_offset=14),
            session(PerformedSet(D("30"), 9), PerformedSet(D("30"), 9), day_offset=21),
        ]
        info = detect_plateau(history, IntensityTechnique.failure)
        assert info is not None
        assert info.metric == "toplam hacim"


# --- Vücut ağırlığı ----------------------------------------------------------


class TestBodyweightHasNoLoad:
    """Motorun metin ve ölçüt katmanı dış yük varsaymamalı.

    Hepsi aynı kökten çıkan hatalar: ağırlık 0 olduğunda "0kg x 12" yazmak,
    "bir ağırlık seç" demek ve hacmi 0 ölçüp platoyu hiç görmemek.
    """

    def bw(
        self,
        rep_min: int = 8,
        rep_max: int = 12,
        technique: IntensityTechnique = IntensityTechnique.rir1,
    ) -> ExerciseTarget:
        return target(
            rep_min=rep_min,
            rep_max=rep_max,
            technique=technique,
            equipment=Equipment.bodyweight,
        )

    def test_baseline_asks_for_reps_not_a_weight(self) -> None:
        result = suggest_next_target(self.bw(), history=[])
        assert "ağırlık seç" not in result.message
        assert "tekrar" in result.message

    def test_labels_never_say_zero_kilos(self) -> None:
        history = [session(PerformedSet(D("0"), 12, rir=1))]
        result = suggest_next_target(self.bw(), history)
        assert "0kg" not in result.primary.label
        assert result.primary.label == "13 tekrar"
        assert "0kg" not in result.message

    def test_weighted_variant_still_reports_kilos(self) -> None:
        """Ek ağırlıklı barfikste gerçek bir yük var — eski davranış korunmalı."""
        history = [session(PerformedSet(D("10"), 12, rir=1))]
        result = suggest_next_target(self.bw(), history)
        assert "10kg x 13" == result.primary.label

    def test_plateau_is_detectable_without_load(self) -> None:
        """Yük yoksa ölçüt tekrar; yoksa plato ASLA tetiklenmiyordu."""
        history = [
            session(PerformedSet(D("0"), 12), day_offset=0),  # zirve
            session(PerformedSet(D("0"), 11), day_offset=7),
            session(PerformedSet(D("0"), 11), day_offset=14),
            session(PerformedSet(D("0"), 10), day_offset=21),
        ]
        info = detect_plateau(history, IntensityTechnique.rir1)
        assert info is not None
        assert info.metric == "toplam tekrar"
        assert info.stalled_sessions == 3

    def test_deload_without_load_cuts_reps_not_kilos(self) -> None:
        history = [
            session(PerformedSet(D("0"), 20), day_offset=0),
            session(PerformedSet(D("0"), 18), day_offset=7),
            session(PerformedSet(D("0"), 18), day_offset=14),
            session(PerformedSet(D("0"), 17), day_offset=21),
        ]
        result = suggest_next_target(self.bw(rep_min=15, rep_max=20), history)
        assert result.primary.kind is SuggestionKind.deload
        assert result.primary.weight_kg == D("0")
        assert result.primary.reps == 15  # 17 * 0.90 -> 15
        assert "kg" not in result.message

    def test_failure_sets_measure_reps_when_there_is_no_load(self) -> None:
        history = [
            session(PerformedSet(D("0"), 10), PerformedSet(D("0"), 8)),
            session(PerformedSet(D("0"), 9), PerformedSet(D("0"), 6)),  # tekrar düştü
        ]
        result = suggest_next_target(
            self.bw(rep_min=8, rep_max=12, technique=IntensityTechnique.failure), history
        )
        assert result.warnings
        assert "tekrar" in result.warnings[0]
        assert "kg" not in result.warnings[0]

    def test_failure_above_range_without_load_adds_reps(self) -> None:
        """Ağırlık artamadığında add_weight önerip 0kg yazamaz."""
        history = [session(PerformedSet(D("0"), 14))]
        result = suggest_next_target(
            self.bw(rep_min=8, rep_max=12, technique=IntensityTechnique.failure), history
        )
        assert result.primary.kind is SuggestionKind.add_reps
        assert result.primary.reps == 15
        assert "0kg" not in result.primary.label


# --- Deload haftası ----------------------------------------------------------


class TestDeloadWeek:
    @pytest.mark.parametrize(
        ("weeks", "expected"), [(1, False), (3, False), (4, False), (5, True), (10, True)]
    )
    def test_cycle(self, weeks: int, expected: bool) -> None:
        assert should_suggest_deload_week(weeks) is expected
