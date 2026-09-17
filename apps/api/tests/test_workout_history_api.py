"""Geçmiş ucu: hareket hareket gruplama, özetler ve rekor işaretleri.

Ekran önceden setleri düz bir liste hâlinde, hareket adı olmadan
gösteriyordu — "Set 1 / Set 2 / Set 3". Kullanıcının kendi antrenmanını
tanıyamadığı bir geçmişin değeri yok. Buradaki testler gruplamanın ve
aritmetiğin doğruluğunu sabitliyor.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from tests.conftest import requires_db

pytestmark = requires_db


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


async def _log(
    client: AsyncClient,
    session_id: str,
    exercise_id: uuid.UUID,
    set_number: int,
    weight: str,
    reps: int,
    *,
    is_warmup: bool = False,
) -> None:
    response = await client.post(
        f"/workouts/sessions/{session_id}/sets",
        json={
            "exercise_id": str(exercise_id),
            "set_number": set_number,
            "weight_kg": weight,
            "reps": reps,
            "is_warmup": is_warmup,
        },
    )
    assert response.status_code == 201, response.text


class TestGrouping:
    async def test_sets_are_grouped_under_their_exercise(self, client: AsyncClient) -> None:
        first, second = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, first, 1, "80", 8)
        await _log(client, session_id, first, 2, "80", 7)
        await _log(client, session_id, second, 1, "40", 12)
        await client.post(f"/workouts/sessions/{session_id}/complete")

        history = (await client.get("/workouts/history")).json()
        assert len(history) == 1
        exercises = history[0]["exercises"]

        assert len(exercises) == 2
        assert [len(e["sets"]) for e in exercises] == [2, 1]
        # Hareket ADI dönüyor: ekranın tek başına anlamlı olması için şart.
        assert all(e["name"] for e in exercises)

    async def test_exercises_keep_the_order_they_were_performed(self, client: AsyncClient) -> None:
        """Sıra `completed_at`'ten gelmeli, ilişkinin `set_number` sırasından
        değil.

        `set_logs` ilişkisi BÜTÜN hareketleri birlikte `set_number`'a göre
        sıralıyor: önce her hareketin 1. seti, sonra her hareketin 2. seti.
        Eşit set numaraları arasındaki sıra PostgreSQL'e bırakılmış, yani
        gruplama "ilk görülen önce" mantığıyla çalıştığında hareket sırası
        rastgele çıkıyor.

        Bu test setleri İÇ İÇE kaydederek o durumu kuruyor: ikinci hareket
        önce başlıyor ama birinci hareketin 1. seti araya giriyor.
        """
        first, second = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, second, 1, "40", 12)
        await _log(client, session_id, first, 1, "80", 8)
        await _log(client, session_id, second, 2, "40", 11)
        await client.post(f"/workouts/sessions/{session_id}/complete")

        exercises = (await client.get("/workouts/history")).json()[0]["exercises"]
        assert [e["exercise_id"] for e in exercises] == [str(second), str(first)]
        # Hareket içinde setler kendi numaralarına göre sıralı kalıyor.
        assert [s["set_number"] for s in exercises[0]["sets"]] == [1, 2]

    async def test_sets_stay_in_order_after_a_correction(self, client: AsyncClient) -> None:
        """Bir set düzeltilince `completed_at` güncelleniyor.

        Sıralama yalnızca ona bakarsa düzeltilen set listenin SONUNA kayıyor
        ve kullanıcı "3, 1, 2" gibi bir sıra görüyordu.
        """
        exercise, _ = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, exercise, 1, "80", 8)
        await _log(client, session_id, exercise, 2, "80", 7)
        await _log(client, session_id, exercise, 3, "80", 6)
        # 1. seti düzelt: aynı slota tekrar POST üzerine yazıyor.
        await _log(client, session_id, exercise, 1, "82.5", 8)
        await client.post(f"/workouts/sessions/{session_id}/complete")

        group = (await client.get("/workouts/history")).json()[0]["exercises"][0]
        assert [s["set_number"] for s in group["sets"]] == [1, 2, 3]
        assert group["sets"][0]["weight_kg"] == "82.50"


class TestSummaries:
    async def test_volume_excludes_warmup_sets(self, client: AsyncClient) -> None:
        """Isınma tonaja girse ilerleme grafiği, kullanıcının daha çok ısındığı
        haftalarda yükselirdi — yani ölçtüğü şey güç olmazdı."""
        exercise, _ = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, exercise, 1, "40", 10, is_warmup=True)
        await _log(client, session_id, exercise, 2, "100", 5)
        await client.post(f"/workouts/sessions/{session_id}/complete")

        session_row = (await client.get("/workouts/history")).json()[0]
        assert session_row["total_sets"] == 1  # ısınma sayılmıyor
        assert session_row["volume_kg"] == "500.00"  # 100 x 5, ısınma yok
        # Set yine de LİSTEDE: kullanıcı ne yaptığını görebilmeli.
        assert len(session_row["exercises"][0]["sets"]) == 2

    async def test_top_set_prefers_more_reps_at_equal_weight(self, client: AsyncClient) -> None:
        """ "80x8" ile "80x5" aynı zirve değil."""
        exercise, _ = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, exercise, 1, "80", 5)
        await _log(client, session_id, exercise, 2, "80", 8)
        await _log(client, session_id, exercise, 3, "80", 6)
        await client.post(f"/workouts/sessions/{session_id}/complete")

        group = (await client.get("/workouts/history")).json()[0]["exercises"][0]
        assert group["top_weight_kg"] == "80.00"
        assert group["top_reps"] == 8

    async def test_heavier_weight_wins_over_more_reps(self, client: AsyncClient) -> None:
        exercise, _ = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, exercise, 1, "60", 15)
        await _log(client, session_id, exercise, 2, "100", 3)
        await client.post(f"/workouts/sessions/{session_id}/complete")

        group = (await client.get("/workouts/history")).json()[0]["exercises"][0]
        assert group["top_weight_kg"] == "100.00"
        assert group["top_reps"] == 3

    async def test_warmup_only_session_reports_zero_not_null(self, client: AsyncClient) -> None:
        exercise, _ = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, exercise, 1, "40", 10, is_warmup=True)
        await client.post(f"/workouts/sessions/{session_id}/complete")

        session_row = (await client.get("/workouts/history")).json()[0]
        assert session_row["volume_kg"] == "0.00"  # "0" degil: bicim veriye gore degismiyor
        assert session_row["total_sets"] == 0

    async def test_duration_comes_from_the_session_span(self, client: AsyncClient) -> None:
        from overload_api.db.models.workout import WorkoutSession
        from overload_api.db.session import session_scope

        exercise, _ = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, exercise, 1, "80", 8)
        await client.post(f"/workouts/sessions/{session_id}/complete")

        # Süreyi öngörülebilir yapmak için başlangıcı geriye alıyoruz; test
        # gerçek zamana bağlı olursa sıfır dakika ölçer ve hiçbir şey sınamaz.
        async with session_scope(assume_app_role=False) as session:
            row = await session.get(WorkoutSession, uuid.UUID(session_id))
            assert row is not None and row.completed_at is not None
            row.started_at = row.completed_at - timedelta(minutes=73)

        assert (await client.get("/workouts/history")).json()[0]["duration_min"] == 73


class TestWhatIsIncluded:
    async def test_an_open_session_is_not_history_yet(self, client: AsyncClient) -> None:
        """Yarım seans geçmişe girdiğinde tonajı da süresi de yanıltıcı oluyor."""
        exercise, _ = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, exercise, 1, "80", 8)

        assert (await client.get("/workouts/history")).json() == []

    async def test_empty_history_returns_empty_list(self, client: AsyncClient) -> None:
        assert (await client.get("/workouts/history")).json() == []

    async def test_newest_session_comes_first(self, client: AsyncClient) -> None:
        from overload_api.db.models.workout import WorkoutSession
        from overload_api.db.session import session_scope

        exercise, _ = await _two_exercises()
        ids = []
        for weight in ("80", "85"):
            session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
            await _log(client, session_id, exercise, 1, weight, 8)
            await client.post(f"/workouts/sessions/{session_id}/complete")
            ids.append(session_id)

        # İki seans aynı saniyede kapanabiliyor; sıralamayı sınamak için
        # ilkini açıkça geçmişe alıyoruz.
        async with session_scope(assume_app_role=False) as session:
            row = await session.get(WorkoutSession, uuid.UUID(ids[0]))
            assert row is not None
            row.started_at = datetime(2020, 1, 1, tzinfo=UTC).replace(tzinfo=None)

        history = (await client.get("/workouts/history")).json()
        assert [s["id"] for s in history] == [ids[1], ids[0]]

    async def test_limit_is_honoured(self, client: AsyncClient) -> None:
        exercise, _ = await _two_exercises()
        for _ in range(3):
            session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
            await _log(client, session_id, exercise, 1, "80", 8)
            await client.post(f"/workouts/sessions/{session_id}/complete")

        assert len((await client.get("/workouts/history?limit=2")).json()) == 2


class TestRecords:
    async def test_records_are_attached_to_the_session_that_set_them(
        self, client: AsyncClient
    ) -> None:
        """Motive edici olan, listede kaç satır olduğu değil — hangi günün bir
        şeyi ilk kez başardığı."""
        exercise, _ = await _two_exercises()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, session_id, exercise, 1, "100", 5)
        completed = await client.post(f"/workouts/sessions/{session_id}/complete")
        assert completed.status_code == 200, completed.text
        # İlk seans her zaman rekor kırar: karşılaştırılacak geçmiş yok.
        assert completed.json()["new_records"], "ilk seans rekor üretmeliydi"

        session_row = (await client.get("/workouts/history")).json()[0]
        assert len(session_row["records"]) == len(completed.json()["new_records"])
        assert {r["type"] for r in session_row["records"]} == {
            r["type"] for r in completed.json()["new_records"]
        }

    async def test_a_session_without_records_reports_an_empty_list(
        self, client: AsyncClient
    ) -> None:
        exercise, _ = await _two_exercises()
        # İlk seans rekorları kurar.
        first = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, first, exercise, 1, "100", 5)
        await client.post(f"/workouts/sessions/{first}/complete")

        # İkincisi daha hafif: hiçbir rekor kırılmıyor.
        second = (await client.post("/workouts/sessions", json={})).json()["id"]
        await _log(client, second, exercise, 1, "60", 5)
        await client.post(f"/workouts/sessions/{second}/complete")

        history = (await client.get("/workouts/history")).json()
        newest = next(s for s in history if s["id"] == second)
        assert newest["records"] == []
