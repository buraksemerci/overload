"""Oturum iptali — gerçek giriş/çıkış akışı.

Bu dosya, diğer HTTP testlerinden farklı olarak `current_active_user`
bağımlılığını GEÇERSİZ KILMIYOR: sınanan şey tam olarak kimlik doğrulamanın
kendisi. Kullanıcı gerçek bir parolayla giriş yapıyor, dönen jetonla korumalı
bir uca gidiyor, çıkış yapıyor ve AYNI jetonla tekrar deniyor.

Eski JWT stratejisinde son adım BAŞARIYLA sonuçlanıyordu: imzası geçerli bir
jeton süresi dolana kadar kabul ediliyor ve "çıkış yap" yalnızca tarayıcıdaki
kopyayı siliyordu.
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from tests.conftest import requires_db

pytestmark = requires_db

PASSWORD = "oturum-parolasi-123"  # noqa: S105 - testte kullanılan sabit


@pytest.fixture
def _password_hash() -> str:
    from fastapi_users.password import PasswordHelper

    return PasswordHelper().hash(PASSWORD)


async def _make_user(password_hash: str) -> tuple[uuid.UUID, str]:
    from overload_api.db.models.user import User
    from overload_api.db.session import session_scope

    new_id = uuid.uuid4()
    # `.test` KULLANILMIYOR: `EmailStr` özel amaçlı üst düzey alan adlarını
    # (test, example, invalid, localhost) reddediyor ve bu testler gerçek
    # `/users/me` serileştirmesinden geçiyor — diğer testler o bağımlılığı
    # geçersiz kıldığı için oraya hiç uğramıyor.
    address = f"oturum-{new_id}@overload-test.dev"
    async with session_scope(assume_app_role=False) as session:
        session.add(
            User(
                id=new_id,
                email=address,
                hashed_password=password_hash,
                is_active=True,
                is_superuser=False,
                is_verified=True,
            )
        )
    return new_id, address


async def _drop_user(user_id: uuid.UUID) -> None:
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        await session.execute(
            sa.text('DELETE FROM "user" WHERE id = :i'), {"i": str(user_id)}
        )


def _client() -> AsyncClient:
    from overload_api.main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _login(client: AsyncClient, address: str) -> str:
    response = await client.post(
        "/auth/jwt/login",
        data={"username": address, "password": PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200, response.text
    token: str = response.json()["access_token"]
    return token


@pytest.mark.asyncio
async def test_cikis_jetonu_gercekten_gecersiz_kiliyor(_password_hash: str) -> None:
    user_id, address = await _make_user(_password_hash)
    try:
        async with _client() as client:
            token = await _login(client, address)
            auth = {"Authorization": f"Bearer {token}"}

            assert (await client.get("/users/me", headers=auth)).status_code == 200

            assert (await client.post("/auth/jwt/logout", headers=auth)).status_code == 204

            # ESKİ DAVRANIŞ: bu satır 200 dönüyordu. JWT geri alınamıyor.
            assert (await client.get("/users/me", headers=auth)).status_code == 401
    finally:
        await _drop_user(user_id)


@pytest.mark.asyncio
async def test_bir_oturumun_kapanmasi_digerini_etkilemiyor(_password_hash: str) -> None:
    """Telefonda çıkış yapmak bilgisayardaki oturumu kapatmamalı."""
    user_id, address = await _make_user(_password_hash)
    try:
        async with _client() as client:
            telefon = {"Authorization": f"Bearer {await _login(client, address)}"}
            bilgisayar = {"Authorization": f"Bearer {await _login(client, address)}"}

            await client.post("/auth/jwt/logout", headers=telefon)

            assert (await client.get("/users/me", headers=telefon)).status_code == 401
            assert (await client.get("/users/me", headers=bilgisayar)).status_code == 200
    finally:
        await _drop_user(user_id)


@pytest.mark.asyncio
async def test_hesap_silinince_jeton_da_gidiyor(_password_hash: str) -> None:
    """Hesabı silinen kullanıcının jetonu çalışmaya devam etmemeli.

    `ON DELETE CASCADE` bunu sağlıyor ama şemada yazılı olması çalıştığı
    anlamına gelmiyor.
    """
    # `user_id` GEREKMİYOR: test hesabı zaten siliyor, temizlik yapılacak bir
    # şey kalmıyor.
    _, address = await _make_user(_password_hash)
    async with _client() as client:
        auth = {"Authorization": f"Bearer {await _login(client, address)}"}

        response = await client.request(
            "DELETE", "/users/me", headers=auth, json={"password": PASSWORD}
        )
        assert response.status_code == 204

        assert (await client.get("/users/me", headers=auth)).status_code == 401


@pytest.mark.asyncio
async def test_gecersiz_jeton_reddediliyor(_password_hash: str) -> None:
    user_id, _ = await _make_user(_password_hash)
    try:
        async with _client() as client:
            auth = {"Authorization": "Bearer uydurma-jeton"}
            assert (await client.get("/users/me", headers=auth)).status_code == 401
    finally:
        await _drop_user(user_id)
