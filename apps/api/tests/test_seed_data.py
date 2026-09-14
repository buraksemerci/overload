"""Seed verisinin iç tutarlılığı.

Bu testler veritabanı gerektirmez ama en sinir bozucu hata sınıfını yakalar:
seed yüklenirken yarıda patlayan yazım hataları. Bir program var olmayan bir
harekete ya da bir hareket var olmayan bir kas grubuna atıfta bulunuyorsa
burada, migration çalıştırmadan önce öğreniriz.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from overload_api.db.models.exercise import Equipment
from overload_api.db.models.program import IntensityTechnique, ProgramGoal, ProgramLevel
from overload_api.seed.data import (
    EXERCISES,
    MUSCLE_GROUPS,
    TEMPLATES,
    USER_PROGRAM,
    ProgramSeed,
)

MUSCLE_SLUGS = {m.slug for m in MUSCLE_GROUPS}
EXERCISE_NAMES = {e.name.lower() for e in EXERCISES}
ALL_PROGRAMS: list[ProgramSeed] = [USER_PROGRAM, *TEMPLATES]


class TestMuscleGroups:
    def test_slugs_are_unique(self) -> None:
        assert len(MUSCLE_SLUGS) == len(MUSCLE_GROUPS)

    def test_svg_ids_are_unique(self) -> None:
        """İki kas aynı SVG yolunu paylaşırsa ısı haritası yanlış boyanır."""
        svg_ids = [m.svg_id for m in MUSCLE_GROUPS]
        assert len(set(svg_ids)) == len(svg_ids)

    def test_regions_are_valid(self) -> None:
        assert {m.region for m in MUSCLE_GROUPS} <= {"front", "back"}

    def test_both_views_are_populated(self) -> None:
        """Ön ve arka görünümün ikisi de boş kalmamalı."""
        regions = {m.region for m in MUSCLE_GROUPS}
        assert regions == {"front", "back"}


class TestExercises:
    def test_names_are_unique(self) -> None:
        assert len(EXERCISE_NAMES) == len(EXERCISES)

    @pytest.mark.parametrize("exercise", EXERCISES, ids=lambda e: e.name)
    def test_muscle_slugs_exist(self, exercise) -> None:  # type: ignore[no-untyped-def]
        unknown = (set(exercise.primary) | set(exercise.secondary)) - MUSCLE_SLUGS
        assert not unknown, f"{exercise.name}: bilinmeyen kas grubu {unknown}"

    @pytest.mark.parametrize("exercise", EXERCISES, ids=lambda e: e.name)
    def test_equipment_is_valid(self, exercise) -> None:  # type: ignore[no-untyped-def]
        Equipment(exercise.equipment)

    @pytest.mark.parametrize("exercise", EXERCISES, ids=lambda e: e.name)
    def test_has_at_least_one_primary_muscle(self, exercise) -> None:  # type: ignore[no-untyped-def]
        """Birincil kası olmayan hareket ısı haritasında görünmez."""
        assert exercise.primary

    @pytest.mark.parametrize("exercise", EXERCISES, ids=lambda e: e.name)
    def test_primary_and_secondary_do_not_overlap(self, exercise) -> None:  # type: ignore[no-untyped-def]
        """Aynı kas hem birincil hem ikincil olursa hacim iki kez sayılır."""
        assert not (set(exercise.primary) & set(exercise.secondary))


class TestPrograms:
    @pytest.mark.parametrize("program", ALL_PROGRAMS, ids=lambda p: p.name)
    def test_all_referenced_exercises_exist(self, program: ProgramSeed) -> None:
        missing = {
            px.exercise
            for day in program.days
            for px in day.exercises
            if px.exercise.lower() not in EXERCISE_NAMES
        }
        assert not missing, f"{program.name}: kütüphanede olmayan hareket {missing}"

    @pytest.mark.parametrize("program", ALL_PROGRAMS, ids=lambda p: p.name)
    def test_enums_are_valid(self, program: ProgramSeed) -> None:
        ProgramGoal(program.goal)
        ProgramLevel(program.level)
        for day in program.days:
            for px in day.exercises:
                IntensityTechnique(px.technique)

    @pytest.mark.parametrize("program", ALL_PROGRAMS, ids=lambda p: p.name)
    def test_rep_ranges_are_sane(self, program: ProgramSeed) -> None:
        for day in program.days:
            for px in day.exercises:
                assert 1 <= px.rep_min <= px.rep_max <= 100, f"{program.name}/{px.exercise}"
                assert 1 <= px.sets <= 20

    @pytest.mark.parametrize("template", TEMPLATES, ids=lambda p: p.name)
    def test_templates_carry_attribution(self, template: ProgramSeed) -> None:
        """Bölüm 9 şartı: her şablonda orijinal yaratıcı belirtilmeli.
        Veritabanı CHECK kısıtı da bunu zorluyor; burada seed aşamasında yakalıyoruz."""
        assert template.is_template
        assert template.source_name, f"{template.name}: source_name eksik"

    def test_user_program_is_not_a_template(self) -> None:
        assert not USER_PROGRAM.is_template
        assert USER_PROGRAM.source_name is None

    def test_supersets_are_paired(self) -> None:
        """Bir superset grubunda tek hareket varsa superset değildir —
        muhtemelen eşi yanlışlıkla düşmüştür."""
        for program in ALL_PROGRAMS:
            for day in program.days:
                groups: dict[int, int] = {}
                for px in day.exercises:
                    if px.superset_group is not None:
                        groups[px.superset_group] = groups.get(px.superset_group, 0) + 1
                for group_id, count in groups.items():
                    assert count >= 2, (
                        f"{program.name}/{day.label}: superset grubu {group_id} "
                        f"tek hareket içeriyor"
                    )

    def test_days_per_week_matches_day_count(self) -> None:
        for program in ALL_PROGRAMS:
            assert 1 <= len(program.days) <= 7, program.name

    @pytest.mark.parametrize("program", ALL_PROGRAMS, ids=lambda p: p.name)
    def test_percentages_are_within_database_constraint(self, program: ProgramSeed) -> None:
        """Veritabanı CHECK kısıtı %30-120 arası istiyor. Seed yüklenirken
        patlamak yerine burada yakalansın."""
        for day in program.days:
            for px in day.exercises:
                if px.percent is None:
                    continue
                value = Decimal(px.percent)
                assert Decimal(30) <= value <= Decimal(120), (
                    f"{program.name}/{px.exercise}: %{value} kısıt dışı"
                )

    def test_percentage_programs_actually_carry_percentages(self) -> None:
        """5/3/1 ve nSuns yüzde tabanlı programlar. Yüzdesiz kaydedilirlerse
        kullanıcı ağırlığı kendi uydurur ve programın mantığı kaybolur —
        bu testin amacı o regresyonu yakalamak."""
        percentage_based = {"5/3/1 Boring But Big", "nSuns 5/3/1 LP", "GZCLP"}
        for template in TEMPLATES:
            if template.name not in percentage_based:
                continue
            has_percent = any(
                px.percent is not None for day in template.days for px in day.exercises
            )
            assert has_percent, f"{template.name}: yüzde tabanlı ama hiç yüzde yok"

    def test_all_section_nine_templates_are_present(self) -> None:
        """Bölüm 9'daki şablon listesinin tamamı kütüphanede olmalı."""
        names = {t.name for t in TEMPLATES}
        expected_fragments = [
            "StrongLifts",
            "Starting Strength",
            "Greg Nuckols",
            "5/3/1",
            "GZCLP",
            "Candito",
            "PHUL",
            "PHAT",
            "PPL",
            "Nuñez",
            "nSuns",
        ]
        for fragment in expected_fragments:
            assert any(fragment in name for name in names), f"eksik şablon: {fragment}"
