"""`/workouts/records/best`: hareket başına güncel en iyi rekor.

`personal_record` her yeni rekoru yeni satır olarak tutuyor (PR grafiği zaman
serisi istiyor). İlerleme ekranı ham listeden ilk 20'yi alıp gösteriyordu;
sonuç aynı etiketin tekrar tekrar sıralandığı, hangi harekete ait olduğu
yazmayan bir listeydi. Bu uç "şu an elimdeki en iyi"yi hareket adıyla veriyor.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from tests.conftest import requires_db

pytestmark = requires_db

BASE = datetime(2026, 6, 1, 10, 0)


async def _two_exercises() -> tuple[uuid.UUID, uuid.UUID]:
    from overload_api.db.models.exercise import Exercise
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        rows = (
            (
                await session.execute(
                    sa.select(Exercise.id).where(Exercise.owner_id.is_(None)).limit(2)
                )
            )
            .scalars()
            .all()
        )
    if len(rows) < 2:
        pytest.skip("Test veritabanında yeterli hareket yok (seed yüklenmemiş).")
    return rows[0], rows[1]


async def _record(
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
    pr_type: str,
    value: str,
    *,
    reps: int | None = None,
    day: int = 0,
) -> None:
    """Doğrudan tabloya yazıyor: uç üzerinden rekor kurmak seans akışının
    tamamını gerektiriyor ve burada sınanan şey o değil.

    `user_id` AÇIKÇA alınıyor. Önce "tablodaki en eski kullanıcı" seçiliyordu
    ve testler kendi kullanıcılarıyla koştuğu için rekorlar BAŞKASININ hesabına
    yazılıyordu; RLS de doğru çalışıp boş liste döndürüyordu. Test veritabanı
    boşken ilk kullanıcı tesadüfen doğru olduğu için uzun süre fark edilmedi.
    """
    from overload_api.db.models.workout import PersonalRecord, PRType
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        session.add(
            PersonalRecord(
                user_id=user_id,
                exercise_id=exercise_id,
                type=PRType(pr_type),
                value=Decimal(value),
                reps=reps,
                achieved_at=BASE + timedelta(days=day),
            )
        )


class TestBestPerType:
    async def test_only_the_best_row_survives(self, client: AsyncClient, user_id: uuid.UUID) -> None:
        """Aynı türde üç rekor satırı var; listede bir tanesi görünmeli."""
        exercise, _ = await _two_exercises()
        await _record(user_id, exercise, "max_weight", "70", reps=8, day=0)
        await _record(user_id, exercise, "max_weight", "77.5", reps=8, day=7)
        await _record(user_id, exercise, "max_weight", "80", reps=8, day=14)

        rows = (await client.get("/workouts/records/best")).json()
        assert len(rows) == 1
        weights = [r for r in rows[0]["records"] if r["type"] == "max_weight"]
        assert len(weights) == 1
        assert weights[0]["value"] == "80.00"

    async def test_more_reps_wins_at_equal_weight(self, client: AsyncClient, user_id: uuid.UUID) -> None:
        """"100kg x 1" ile "100kg x 8" aynı rekor değil."""
        exercise, _ = await _two_exercises()
        await _record(user_id, exercise, "max_weight", "100", reps=1, day=0)
        await _record(user_id, exercise, "max_weight", "100", reps=8, day=7)

        rows = (await client.get("/workouts/records/best")).json()
        weight = next(r for r in rows[0]["records"] if r["type"] == "max_weight")
        assert weight["reps"] == 8

    async def test_each_type_kept_separately(self, client: AsyncClient, user_id: uuid.UUID) -> None:
        exercise, _ = await _two_exercises()
        await _record(user_id, exercise, "max_weight", "80", reps=8)
        await _record(user_id, exercise, "max_reps", "12")
        await _record(user_id, exercise, "estimated_1rm", "96")

        rows = (await client.get("/workouts/records/best")).json()
        assert {r["type"] for r in rows[0]["records"]} == {
            "max_weight",
            "max_reps",
            "estimated_1rm",
        }

    async def test_types_come_in_a_stable_order(self, client: AsyncClient, user_id: uuid.UUID) -> None:
        """Sözlük sırası veriye bağlı; sabitlenmezse aynı ekranda hareketten
        harekete yer değiştiriyorlar."""
        exercise, _ = await _two_exercises()
        # Tarihler kasten TERS: sorgu `achieved_at` artan sırada döndüğü için
        # sıralama yapılmazsa liste tam bu sırayla çıkıyor. Aynı tarihi
        # kullanmak yetmiyordu — eşit tarihlerde satır sırası PostgreSQL'e
        # kalıyor ve tesadüfen doğru çıkabiliyor.
        await _record(user_id, exercise, "session_volume", "9000", day=0)
        await _record(user_id, exercise, "max_reps", "12", day=1)
        await _record(user_id, exercise, "estimated_1rm", "96", day=2)
        await _record(user_id, exercise, "max_weight", "80", reps=8, day=3)

        rows = (await client.get("/workouts/records/best")).json()
        assert [r["type"] for r in rows[0]["records"]] == [
            "max_weight",
            "estimated_1rm",
            "max_reps",
            "session_volume",
        ]

    async def test_the_date_is_when_it_was_set_not_when_matched(
        self, client: AsyncClient, user_id: uuid.UUID
    ) -> None:
        """Aynı değer sonradan tekrarlanırsa rekorun tarihi değişmemeli:
        başarı ilk kez yapıldığında oldu."""
        exercise, _ = await _two_exercises()
        await _record(user_id, exercise, "max_weight", "80", reps=8, day=0)
        await _record(user_id, exercise, "max_weight", "80", reps=8, day=30)

        rows = (await client.get("/workouts/records/best")).json()
        weight = next(r for r in rows[0]["records"] if r["type"] == "max_weight")
        assert weight["achieved_at"].startswith("2026-06-01")


class TestGroupingAndOrder:
    async def test_grouped_by_exercise_with_its_name(self, client: AsyncClient, user_id: uuid.UUID) -> None:
        first, second = await _two_exercises()
        await _record(user_id, first, "max_weight", "80", reps=8)
        await _record(user_id, second, "max_weight", "40", reps=12)

        rows = (await client.get("/workouts/records/best")).json()
        assert len(rows) == 2
        # Hareket ADI dönüyor: ham `exercise_id` ekranda işe yaramıyor.
        assert all(row["name"] for row in rows)

    async def test_freshest_achievement_comes_first(self, client: AsyncClient, user_id: uuid.UUID) -> None:
        """Kullanıcı en son neyi kırdığını listenin başında görmeli."""
        first, second = await _two_exercises()
        await _record(user_id, first, "max_weight", "80", reps=8, day=0)
        await _record(user_id, second, "max_weight", "40", reps=12, day=20)

        rows = (await client.get("/workouts/records/best")).json()
        assert rows[0]["exercise_id"] == str(second)

    async def test_last_achieved_is_the_newest_in_the_group(
        self, client: AsyncClient, user_id: uuid.UUID
    ) -> None:
        exercise, _ = await _two_exercises()
        await _record(user_id, exercise, "max_weight", "80", reps=8, day=0)
        await _record(user_id, exercise, "max_reps", "12", day=40)

        rows = (await client.get("/workouts/records/best")).json()
        assert rows[0]["last_achieved_at"].startswith("2026-07-11")  # 1 Haziran + 40

    async def test_no_records_returns_empty(self, client: AsyncClient, user_id: uuid.UUID) -> None:
        assert (await client.get("/workouts/records/best")).json() == []
