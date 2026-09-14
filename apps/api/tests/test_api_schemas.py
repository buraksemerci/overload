"""API şemalarının ORM nesnelerinden doğru okuduğunu doğrular.

Veritabanı gerektirmez: Pydantic `from_attributes` ile herhangi bir nesneden
okuduğu için sahte nesneler yeterli.

Bu dosyanın var olma sebebi somut bir hata: `SessionOut.sets` alanı ORM'deki
`set_logs` ilişkisiyle eşleşmiyordu. Pydantic eşleşmeyen alanda HATA VERMEZ,
`default_factory`'ye düşer — yani endpoint 200 dönüyor, veritabanında setler
duruyor, cevapta `"sets": []` geliyordu. Sessiz olduğu için ne tip denetimi ne
de servis testleri yakalayabildi; ancak arayüzde fark edildi.
"""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from overload_api.db.models.program import IntensityTechnique
from overload_api.features.workouts.router import SessionOut


class _FakeSetLog:
    """`SetLog` ORM satırının şema için gereken yüzeyi."""

    def __init__(self, set_number: int) -> None:
        self.id = uuid.uuid4()
        self.exercise_id = uuid.uuid4()
        self.set_number = set_number
        self.weight_kg = Decimal("100.00")
        self.reps = 5
        self.rir = 1
        self.is_warmup = False
        self.technique = IntensityTechnique.straight


class _FakeSession:
    """`WorkoutSession` ORM satırı — ilişkinin adı `set_logs`, `sets` DEĞİL."""

    def __init__(self, set_count: int) -> None:
        self.id = uuid.uuid4()
        self.program_day_id = uuid.uuid4()
        self.started_at = datetime.datetime.now(datetime.UTC)
        self.completed_at = None
        self.notes = None
        self.is_deload = False
        self.set_logs = [_FakeSetLog(i + 1) for i in range(set_count)]


class TestSessionOut:
    def test_reads_the_set_logs_relationship(self) -> None:
        out = SessionOut.model_validate(_FakeSession(set_count=3))
        assert len(out.sets) == 3
        assert [s.set_number for s in out.sets] == [1, 2, 3]
        assert out.sets[0].weight_kg == Decimal("100.00")

    def test_empty_session_stays_empty(self) -> None:
        assert SessionOut.model_validate(_FakeSession(set_count=0)).sets == []

    def test_public_field_name_is_sets(self) -> None:
        """Alias yalnızca OKUMA tarafında; dışarıya çıkan anahtar `sets` kalmalı
        (frontend ve üretilen TS tipleri bu adı bekliyor)."""
        dumped = SessionOut.model_validate(_FakeSession(set_count=1)).model_dump()
        assert "sets" in dumped
        assert "set_logs" not in dumped

    def test_can_still_be_built_by_field_name(self) -> None:
        """`populate_by_name` olmadan alias, alan adıyla kurmayı bozardı."""
        built = SessionOut(
            id=uuid.uuid4(),
            program_day_id=None,
            started_at=datetime.datetime.now(datetime.UTC),
            completed_at=None,
            notes=None,
            is_deload=False,
            sets=[],
        )
        assert built.sets == []
