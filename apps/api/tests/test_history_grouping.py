"""`_history_session` biriminin testleri — veritabanı yok.

--------------------------------------------------------------------------
NEDEN AYRI BİR BİRİM TESTİ
--------------------------------------------------------------------------
Hareket sırası hatası HTTP testiyle güvenilir biçimde yakalanamıyor.

`WorkoutSession.set_logs` ilişkisi bütün hareketleri birlikte `set_number`'a
göre sıralıyor; eşit set numaraları arasındaki sıra PostgreSQL'e bırakılmış
durumda. Yani hata "bazen" ortaya çıkıyor — tarayıcıda üçüncü yapılan
hareket listenin başında göründü, aynı veriyle koşan test ise geçti.
Tanımsız sıralamanın anlamı tam olarak bu.

Burada sıralama GİRDİ olarak veriliyor: liste kasten karıştırılmış geliyor
ve fonksiyonun onu yapılma sırasına göre düzelttiği sınanıyor. Sonuç
deterministik.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

from overload_api.db.models.program import IntensityTechnique
from overload_api.features.workouts.router import _history_session

START = datetime(2026, 9, 15, 18, 0)


def _set(
    exercise_id: uuid.UUID,
    name: str,
    set_number: int,
    *,
    minute: int,
    weight: str = "80",
    reps: int = 8,
    is_warmup: bool = False,
) -> Any:
    return SimpleNamespace(
        id=uuid.uuid4(),
        exercise_id=exercise_id,
        exercise=SimpleNamespace(name=name),
        set_number=set_number,
        weight_kg=Decimal(weight),
        reps=reps,
        rir=None,
        is_warmup=is_warmup,
        technique=IntensityTechnique.straight,
        completed_at=START + timedelta(minutes=minute),
    )


def _session(set_logs: list[Any]) -> Any:
    return SimpleNamespace(
        id=uuid.uuid4(),
        program_day_id=None,
        started_at=START,
        completed_at=START + timedelta(minutes=60),
        notes=None,
        is_deload=False,
        set_logs=set_logs,
    )


class TestExerciseOrder:
    def test_order_follows_when_the_sets_were_done(self) -> None:
        squat, bench = uuid.uuid4(), uuid.uuid4()
        # İlişkinin döndürdüğü sıra: set numarasına göre, hareketler karışık.
        # Squat önce YAPILDI ama listede Bench'in 1. seti başta geliyor.
        scrambled = [
            _set(bench, "Bench Press", 1, minute=20),
            _set(squat, "Squat", 1, minute=0),
            _set(bench, "Bench Press", 2, minute=25),
            _set(squat, "Squat", 2, minute=5),
        ]

        result = _history_session(_session(scrambled), {}, [])

        assert [e.name for e in result.exercises] == ["Squat", "Bench Press"]

    def test_sets_inside_an_exercise_are_numbered_in_order(self) -> None:
        """Bir set sonradan düzeltilirse `completed_at` güncelleniyor.

        Sıralama yalnızca ona bakarsa düzeltilen set listenin SONUNA kayıyor
        ve kullanıcı "2, 3, 1" gibi bir sıra görüyor.
        """
        squat = uuid.uuid4()
        result = _history_session(
            _session(
                [
                    _set(squat, "Squat", 2, minute=5),
                    _set(squat, "Squat", 3, minute=10),
                    _set(squat, "Squat", 1, minute=40),  # sonradan düzeltildi
                ]
            ),
            {},
            [],
        )

        assert [s.set_number for s in result.exercises[0].sets] == [1, 2, 3]

    def test_a_set_without_a_timestamp_falls_back_to_the_session_start(self) -> None:
        # `completed_at` NULL olabiliyor (eski kayıtlar). `None` ile sıralama
        # TypeError veriyordu; geri düşüş seansın başlangıcı.
        squat = uuid.uuid4()
        orphan = _set(squat, "Squat", 1, minute=0)
        orphan.completed_at = None

        result = _history_session(_session([orphan]), {}, [])
        assert result.exercises[0].name == "Squat"


class TestArithmetic:
    def test_volume_sums_working_sets_only(self) -> None:
        squat = uuid.uuid4()
        result = _history_session(
            _session(
                [
                    _set(squat, "Squat", 1, minute=0, weight="40", reps=10, is_warmup=True),
                    _set(squat, "Squat", 2, minute=5, weight="100", reps=5),
                    _set(squat, "Squat", 3, minute=10, weight="100", reps=4),
                ]
            ),
            {},
            [],
        )

        assert result.volume_kg == Decimal("900.00")  # 500 + 400
        assert result.total_sets == 2
        assert len(result.exercises[0].sets) == 3  # ısınma listede duruyor

    def test_zero_volume_keeps_two_decimals(self) -> None:
        # Aynı alanın biçimi veriye göre değişmemeli: ekran bunu metin alıyor.
        squat = uuid.uuid4()
        result = _history_session(
            _session([_set(squat, "Squat", 1, minute=0, is_warmup=True)]), {}, []
        )
        assert str(result.volume_kg) == "0.00"

    def test_top_set_breaks_ties_with_reps(self) -> None:
        squat = uuid.uuid4()
        result = _history_session(
            _session(
                [
                    _set(squat, "Squat", 1, minute=0, weight="80", reps=5),
                    _set(squat, "Squat", 2, minute=5, weight="80", reps=8),
                ]
            ),
            {},
            [],
        )
        assert result.exercises[0].top_reps == 8

    def test_duration_is_whole_minutes(self) -> None:
        squat = uuid.uuid4()
        session = _session([_set(squat, "Squat", 1, minute=0)])
        session.completed_at = START + timedelta(minutes=47, seconds=50)

        # Saniyeler aşağı yuvarlanıyor: "47 dk" yazmak "48 dk" yazmaktan
        # dürüst, çünkü 48. dakika tamamlanmadı.
        assert _history_session(session, {}, []).duration_min == 47

    def test_an_open_session_has_no_duration(self) -> None:
        squat = uuid.uuid4()
        session = _session([_set(squat, "Squat", 1, minute=0)])
        session.completed_at = None

        assert _history_session(session, {}, []).duration_min is None


class TestDayLabel:
    def test_label_and_program_come_from_the_lookup(self) -> None:
        day_id = uuid.uuid4()
        session = _session([])
        session.program_day_id = day_id

        result = _history_session(session, {day_id: ("Pazartesi — Göğüs", "5 Günlük Split")}, [])

        assert result.day_label == "Pazartesi — Göğüs"
        assert result.program_name == "5 Günlük Split"

    def test_a_free_workout_has_no_label(self) -> None:
        result = _history_session(_session([]), {}, [])
        assert result.day_label is None
        assert result.program_name is None

    def test_a_deleted_program_day_does_not_crash(self) -> None:
        """`program_day_id` FK'si `SET NULL` ama arama sözlüğünde eksik bir
        kimlik de olabiliyor (silinmiş gün, aynı istekte yarış)."""
        session = _session([])
        session.program_day_id = uuid.uuid4()

        result = _history_session(session, {}, [])
        assert result.day_label is None
