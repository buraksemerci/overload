"""Antrenman endpoint'lerinin HTTP seviyesinde testleri.

Gerçek veritabanına, gerçek RLS'e ve gerçek FastAPI serileştirmesine karşı
koşar. Serileştirme kısmı önemli: bu katmanda ortaya çıkan iki hata (bkz.
`conftest.py`) yalnızca cevap GÖVDESİNE bakınca görünüyordu — ikisinde de
endpoint'in durum kodu doğruydu.
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from tests.conftest import UNUSABLE_PASSWORD_HASH, requires_db

pytestmark = requires_db


async def _an_exercise_id() -> uuid.UUID:
    """Seed'den paylaşılan kütüphanedeki ilk hareket."""
    from overload_api.db.models.exercise import Exercise
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        row = (
            await session.execute(
                sa.select(Exercise.id).where(Exercise.owner_id.is_(None)).limit(1)
            )
        ).scalar_one_or_none()

    if row is None:
        pytest.skip("Test veritabanında hareket kütüphanesi yok (seed yüklenmemiş).")
    return row


class TestSessionLifecycle:
    async def test_new_session_serialises_with_an_empty_set_list(self, client: AsyncClient) -> None:
        """Yeni seansta `set_logs` yüklü değil.

        Doldurulmazsa FastAPI cevabı serileştirirken — handler döndükten, RLS
        oturumu kapandıktan sonra — tembel yükleme tetikliyor ve endpoint
        MissingGreenlet ile 500 dönüyordu.
        """
        response = await client.post("/workouts/sessions", json={})
        assert response.status_code == 201, response.text
        assert response.json()["sets"] == []

    async def test_a_logged_set_comes_back_when_the_session_is_read(
        self, client: AsyncClient
    ) -> None:
        """`SessionOut.sets` ORM'deki `set_logs` ilişkisini okumalı.

        Eşleşme kurulmadığında Pydantic HATA VERMİYOR, sessizce
        `default_factory`'ye düşüyordu: set veritabanına yazılıyor, POST 201
        dönüyor, ama seansı okuyan her istek `"sets": []` alıyordu.
        """
        exercise_id = await _an_exercise_id()
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]

        logged = await client.post(
            f"/workouts/sessions/{session_id}/sets",
            json={
                "exercise_id": str(exercise_id),
                "set_number": 1,
                "weight_kg": 100,
                "reps": 5,
                "rir": 1,
                "technique": "straight",
            },
        )
        assert logged.status_code == 201, logged.text

        body = (await client.get(f"/workouts/sessions/{session_id}")).json()
        assert len(body["sets"]) == 1
        assert body["sets"][0]["reps"] == 5
        assert body["sets"][0]["set_number"] == 1

    async def test_second_open_session_is_rejected(self, client: AsyncClient) -> None:
        """Kullanıcı başına tek açık seans; ikincisi 409 olmalı, 500 değil."""
        first = await client.post("/workouts/sessions", json={})
        assert first.status_code == 201

        second = await client.post("/workouts/sessions", json={})
        assert second.status_code == 409

    async def test_completing_without_sets_is_refused(self, client: AsyncClient) -> None:
        session_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        response = await client.post(f"/workouts/sessions/{session_id}/complete")
        assert response.status_code == 422

    async def test_repeating_a_set_does_not_invent_a_record(self, client: AsyncClient) -> None:
        """Aynı performans ikinci kez yapıldığında yeni rekor OLMAMALI.

        Tahmini 1RM sonsuz ondalık veriyor (100kg x 4 -> 113.3333...), sütun
        `Numeric(10,2)`. Ham değer saklanmış değerle karşılaştırıldığında aynı
        set her seferinde "yeni rekor" sayılıyordu.
        """
        exercise_id = await _an_exercise_id()
        payload = {
            "exercise_id": str(exercise_id),
            "set_number": 1,
            "weight_kg": 100,
            "reps": 4,  # 113.333... -> 113.33
            "rir": 1,
            "technique": "straight",
        }

        first_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await client.post(f"/workouts/sessions/{first_id}/sets", json=payload)
        first = (await client.post(f"/workouts/sessions/{first_id}/complete")).json()
        assert first["new_records"], "ilk seans rekor kırmalıydı"

        second_id = (await client.post("/workouts/sessions", json={})).json()["id"]
        await client.post(f"/workouts/sessions/{second_id}/sets", json=payload)
        second = (await client.post(f"/workouts/sessions/{second_id}/complete")).json()
        assert second["new_records"] == [], "aynı set tekrar edildi, rekor olmamalı"


class TestIsolation:
    async def test_another_users_session_is_not_visible(self, client: AsyncClient) -> None:
        """RLS + açık sahiplik kontrolü: başkasının seansı 404."""
        from overload_api.core.time import now_utc
        from overload_api.db.models.user import User
        from overload_api.db.models.workout import WorkoutSession
        from overload_api.db.session import session_scope

        stranger_id = uuid.uuid4()
        foreign_session = uuid.uuid4()
        async with session_scope(assume_app_role=False) as session:
            # ORM üzerinden: ham INSERT, `sex` gibi varsayılanı model katmanında
            # tanımlı NOT NULL sütunları atlıyor.
            session.add(
                User(
                    id=stranger_id,
                    email=f"stranger-{stranger_id}@overload.test",
                    hashed_password=UNUSABLE_PASSWORD_HASH,
                    is_active=True,
                    is_superuser=False,
                    is_verified=True,
                )
            )
            await session.flush()
            session.add(
                WorkoutSession(
                    id=foreign_session,
                    user_id=stranger_id,
                    started_at=now_utc(),
                    set_logs=[],
                )
            )

        try:
            response = await client.get(f"/workouts/sessions/{foreign_session}")
            assert response.status_code == 404
        finally:
            async with session_scope(assume_app_role=False) as session:
                await session.execute(
                    sa.text('DELETE FROM "user" WHERE id = :i'), {"i": str(stranger_id)}
                )
