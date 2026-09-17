"""Tanışma akışı ucu.

Sınanması gereken, ucun "alanları kaydetmesi" değil — onu her ORM yazımı
yapıyor. Sınanan, akışın VAAT ETTİĞİ şey: bittiğinde, daha önce boş kalan
kalori hedefinin hesaplanabilir olması. Kilo profilde değil kilo kaydında
tutulduğu için bu bağ kendiliğinden değil; kopsa ekranlar sessizce boş kalırdı.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date

import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from tests.conftest import requires_db

pytestmark = requires_db

FULL = {
    "display_name": "  Deniz  ",
    "sex": "female",
    "birth_date": "1995-04-12",
    "height_cm": 168,
    "weight_kg": "63.5",
    "activity_level": "light",
    "training_experience": "under_1y",
    "training_goal": "hypertrophy",
    "training_days_per_week": 3,
    "nutrition_goal": "cut",
}


@asynccontextmanager
async def _fresh_client(user_id: uuid.UUID) -> AsyncIterator[AsyncClient]:
    """Kullanıcıyı veritabanından YENİDEN okuyan istemci.

    `client` fixture'ı kullanıcıyı test başında bir kez okuyor; onboarding
    sonrası başka bir ucun yeni alanları görmesi için güncel satır gerekiyor
    — gerçek uygulamada her istek oturumdan kullanıcıyı yeniden yüklüyor.
    `client` fixture'ıyla AYNI testte kullanılmamalı: çıkarken kimlik
    geçersiz kılmasını kaldırıyor ve fixture'ın istemcisi yetkisiz kalıyor.
    """
    from overload_api.core.security import current_active_user
    from overload_api.db.models.user import User
    from overload_api.db.session import session_scope
    from overload_api.main import app

    async with session_scope(assume_app_role=False) as session:
        user = await session.get(User, user_id)
        assert user is not None
        session.expunge(user)

    app.dependency_overrides[current_active_user] = lambda: user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.pop(current_active_user, None)


async def _row(user_id: uuid.UUID) -> sa.Row[tuple[object, ...]]:
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        result = await session.execute(
            sa.text(
                "SELECT display_name, sex, birth_date, height_cm, activity_level, "
                "training_experience, training_goal, training_days_per_week, "
                'nutrition_goal, onboarding_completed_at FROM "user" WHERE id = :i'
            ),
            {"i": str(user_id)},
        )
        return result.one()


async def _weights(user_id: uuid.UUID) -> list[str]:
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        result = await session.execute(
            sa.text("SELECT weight_kg FROM body_weight_log WHERE user_id = :u"),
            {"u": str(user_id)},
        )
        return [str(value) for value in result.scalars()]


class TestOnboarding:
    async def test_saves_profile_and_marks_complete(
        self, client: AsyncClient, user_id: uuid.UUID
    ) -> None:
        response = await client.post("/users/me/onboarding", json=FULL)
        assert response.status_code == 200, response.text

        row = await _row(user_id)
        assert row.display_name == "Deniz"  # kenar boşlukları kırpıldı
        assert row.sex == "female"
        assert row.birth_date == date(1995, 4, 12)
        assert row.height_cm == 168
        assert row.activity_level == "light"
        assert row.training_experience == "under_1y"
        assert row.training_goal == "hypertrophy"
        assert row.training_days_per_week == 3
        assert row.nutrition_goal == "cut"
        assert row.onboarding_completed_at is not None

    async def test_weight_goes_to_the_log_not_the_profile(
        self, client: AsyncClient, user_id: uuid.UUID
    ) -> None:
        await client.post("/users/me/onboarding", json=FULL)
        assert await _weights(user_id) == ["63.50"]

    async def test_repeating_the_same_day_overwrites_weight(
        self, client: AsyncClient, user_id: uuid.UUID
    ) -> None:
        """Akış iki kez gönderilirse (geri tuşu, çift tıklama) günde iki kayıt
        oluşmamalı — tabloda (kullanıcı, gün) tekil ve ikinci istek 500
        verirdi."""
        await client.post("/users/me/onboarding", json=FULL)
        response = await client.post("/users/me/onboarding", json={**FULL, "weight_kg": "64"})
        assert response.status_code == 200
        assert await _weights(user_id) == ["64.00"]

    async def test_every_question_can_be_skipped(
        self, client: AsyncClient, user_id: uuid.UUID
    ) -> None:
        """Boş gövde geçerli: kullanıcı hiçbir şey paylaşmadan geçebilmeli ve
        bir daha sorulmamalı."""
        response = await client.post("/users/me/onboarding", json={})
        assert response.status_code == 200

        row = await _row(user_id)
        assert row.sex == "unspecified"
        assert row.height_cm is None
        assert row.training_experience is None
        assert row.onboarding_completed_at is not None
        assert await _weights(user_id) == []

    async def test_implausible_birth_year_is_rejected(
        self, client: AsyncClient, user_id: uuid.UUID
    ) -> None:
        """1995 yerine 2025: kalori hedefi bir bebeğe göre hesaplanırdı."""
        this_year = date.today().year
        response = await client.post(
            "/users/me/onboarding", json={**FULL, "birth_date": f"{this_year - 1}-01-01"}
        )
        assert response.status_code == 422
        # Reddedilen istek akışı TAMAMLANMIŞ saymamalı.
        assert (await _row(user_id)).onboarding_completed_at is None

    async def test_out_of_range_days_are_rejected(self, client: AsyncClient) -> None:
        response = await client.post(
            "/users/me/onboarding", json={**FULL, "training_days_per_week": 8}
        )
        assert response.status_code == 422

    async def test_profile_exposes_the_new_fields(self, user_id: uuid.UUID) -> None:
        """İstemci yönlendirmeyi `onboarding_completed_at`e bakarak yapıyor:
        alan `/users/me` şemasında yoksa herkes her girişte akışa düşer."""
        from overload_api.db.models.user import User
        from overload_api.db.session import session_scope
        from overload_api.main import UserRead

        async with _fresh_client(user_id) as c:
            assert (await c.post("/users/me/onboarding", json=FULL)).status_code == 200

        async with session_scope(assume_app_role=False) as session:
            user = await session.get(User, user_id)
            assert user is not None
            session.expunge(user)
        # `EmailStr` test alan adı `.test`i reddediyor; yalnızca bellekte.
        user.email = "deniz@overload-test.dev"
        me = UserRead.model_validate(user, from_attributes=True).model_dump(mode="json")
        assert me["training_goal"] == "hypertrophy"
        assert me["nutrition_goal"] == "cut"
        assert me["onboarding_completed_at"] is not None

    async def test_calorie_target_becomes_available(self, user_id: uuid.UUID) -> None:
        """Akışın varlık sebebi: öncesinde hedef yoktu, sonrasında var ve
        açıkça bir hedef istenmeden kaydedilen beslenme hedefi kullanılıyor.

        Her adım kendi istemcisiyle: uç kullanıcıyı istekten alıyor ve
        onboarding sonrası alanları görmesi için güncel satır gerekiyor.
        """
        async with _fresh_client(user_id) as before:
            assert (await before.get("/nutrition/target")).status_code == 422
            assert (await before.post("/users/me/onboarding", json=FULL)).status_code == 200

        async with _fresh_client(user_id) as after:
            saved = await after.get("/nutrition/target")
            maintain = await after.get("/nutrition/target", params={"goal": "maintain"})
        assert saved.status_code == 200, saved.text
        # Kayıtlı hedef "cut": hedef belirtilmeyen istek, açık "maintain"den düşük.
        assert saved.json()["calories"] < maintain.json()["calories"]
