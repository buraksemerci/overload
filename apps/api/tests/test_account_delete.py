"""Hesap silme.

Kullanıcı verisini bırakabilmeli ve bıraktığında gerçekten gitmeli. Test
etmesi gereken üç şey var:

1. Parola olmadan silinmiyor — açık bir oturumu ele geçiren biri hesabı yok
   edememeli.
2. Yanlış parolayla silinmiyor.
3. Silinince İLİŞKİLİ KAYITLAR da gidiyor. `ON DELETE CASCADE` şemada yazılı
   ama yazılı olması çalıştığı anlamına gelmiyor: bir tablo o cümle olmadan
   eklenirse hesap silme yarım kalır ve kimsenin sahibi olmadığı satırlar
   kalır.
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from tests.conftest import requires_db

PASSWORD = "silinecek-parola-123"  # noqa: S105 - testte kullanılan sabit


pytestmark = requires_db


@pytest.fixture
def _password_hash() -> str:
    from fastapi_users.password import PasswordHelper

    return PasswordHelper().hash(PASSWORD)


async def _make_user(password_hash: str) -> uuid.UUID:
    from overload_api.db.models.user import User
    from overload_api.db.session import session_scope

    new_id = uuid.uuid4()
    async with session_scope(assume_app_role=False) as session:
        session.add(
            User(
                id=new_id,
                email=f"delete-{new_id}@overload.test",
                hashed_password=password_hash,
                is_active=True,
                is_superuser=False,
                is_verified=True,
            )
        )
    return new_id


async def _add_bodyweight(user_id: uuid.UUID) -> None:
    """Silinmesi gereken ilişkili bir kayıt."""
    from datetime import date

    from overload_api.db.models.body import BodyWeightLog
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        session.add(BodyWeightLog(user_id=user_id, date=date(2026, 9, 1), weight_kg=80))


async def _count_bodyweight(user_id: uuid.UUID) -> int:
    """Tablo adı sorguya SABİT giriyor: parametreyle geçirmek, tablo adının
    parametre olamadığı yerde string birleştirme demek olurdu."""
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        result = await session.execute(
            sa.text("SELECT count(*) FROM body_weight_log WHERE user_id = :u"),
            {"u": str(user_id)},
        )
        return int(result.scalar_one())


async def _client_for(user_id: uuid.UUID) -> tuple[AsyncClient, object]:
    from overload_api.core.security import current_active_user
    from overload_api.db.models.user import User
    from overload_api.db.session import session_scope
    from overload_api.main import app

    async with session_scope(assume_app_role=False) as session:
        user = await session.get(User, user_id)
        assert user is not None
        session.expunge(user)

    app.dependency_overrides[current_active_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), app


@pytest.mark.asyncio
async def test_dogru_parolayla_hesap_ve_verisi_siliniyor(_password_hash: str) -> None:
    user_id = await _make_user(_password_hash)
    await _add_bodyweight(user_id)
    assert await _count_bodyweight(user_id) == 1

    client, app = await _client_for(user_id)
    try:
        async with client:
            response = await client.request("DELETE", "/users/me", json={"password": PASSWORD})
        assert response.status_code == 204
    finally:
        from overload_api.core.security import current_active_user

        app.dependency_overrides.pop(current_active_user, None)  # type: ignore[attr-defined]

    # Kullanıcı gitti…
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        remaining = await session.execute(
            sa.text('SELECT count(*) FROM "user" WHERE id = :i'), {"i": str(user_id)}
        )
        assert remaining.scalar_one() == 0

    # …ve ilişkili kayıt da. `ON DELETE CASCADE`in gerçekten çalıştığı yer bu.
    assert await _count_bodyweight(user_id) == 0


@pytest.mark.asyncio
async def test_yanlis_parola_reddediliyor(_password_hash: str) -> None:
    user_id = await _make_user(_password_hash)

    client, app = await _client_for(user_id)
    try:
        async with client:
            response = await client.request(
                "DELETE", "/users/me", json={"password": "yanlis-parola"}
            )
        # 403: oturum geçerli, reddedilen şey bu işlem.
        assert response.status_code == 403
    finally:
        from overload_api.core.security import current_active_user

        app.dependency_overrides.pop(current_active_user, None)  # type: ignore[attr-defined]

    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        alive = await session.execute(
            sa.text('SELECT count(*) FROM "user" WHERE id = :i'), {"i": str(user_id)}
        )
        assert alive.scalar_one() == 1
        await session.execute(sa.text('DELETE FROM "user" WHERE id = :i'), {"i": str(user_id)})


@pytest.mark.asyncio
async def test_parolasiz_istek_reddediliyor(_password_hash: str) -> None:
    user_id = await _make_user(_password_hash)

    client, app = await _client_for(user_id)
    try:
        async with client:
            response = await client.request("DELETE", "/users/me", json={})
        # Gövde doğrulaması: parola alanı zorunlu.
        assert response.status_code == 422
    finally:
        from overload_api.core.security import current_active_user

        app.dependency_overrides.pop(current_active_user, None)  # type: ignore[attr-defined]

    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        await session.execute(sa.text('DELETE FROM "user" WHERE id = :i'), {"i": str(user_id)})
