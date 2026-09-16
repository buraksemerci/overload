"""Kullanıcı başına günlük AI bütçesi.

Fatura kullanıma göre çıkıyor ve uygulamayı birkaç kişiye açmak o faturayı
başkalarının eline vermek demek. Test etmesi gereken üç şey:

1. Kullanım **birikiyor** — her çağrı bugünün satırına ekleniyor.
2. Sınır dolunca sohbet **başlamıyor** ve dönen şey gerçek bir 429.
3. Önbellekten okunan token bütçeye **girmiyor**: ücretin onda birine geliyor
   ve saymak, maliyeti düşürmek için var olan prompt önbelleğini sınırı
   hızlandıran bir şeye çevirirdi.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from tests.conftest import requires_db

pytestmark = requires_db

TZ = "Europe/Istanbul"


async def _record(user_id: uuid.UUID, **kwargs: int) -> None:
    from overload_api.db.session import session_scope
    from overload_api.services.ai import budget

    async with session_scope(user_id) as session:
        await budget.record(session, user_id, TZ, budget.Usage(**kwargs))


async def _current(user_id: uuid.UUID):  # type: ignore[no-untyped-def]
    from overload_api.db.session import session_scope
    from overload_api.services.ai import budget

    async with session_scope(user_id) as session:
        return await budget.current(session, user_id, TZ)


@pytest.mark.asyncio
async def test_kullanim_birikiyor(user_id: uuid.UUID) -> None:
    await _record(user_id, input_tokens=100, output_tokens=50)
    await _record(user_id, input_tokens=200, output_tokens=10)

    state = await _current(user_id)
    assert state.requests == 2
    assert state.tokens == 360


@pytest.mark.asyncio
async def test_onbellek_tokeni_butceye_girmiyor(user_id: uuid.UUID) -> None:
    await _record(user_id, input_tokens=10, output_tokens=10, cache_read_tokens=50_000)

    state = await _current(user_id)
    # 50 bin önbellek tokeni sayılsaydı bütçenin altıda biri tek çağrıda giderdi.
    assert state.tokens == 20


@pytest.mark.asyncio
async def test_sinir_dolunca_sohbet_baslamiyor(
    client: AsyncClient, user_id: uuid.UUID
) -> None:
    from overload_api.config import get_settings

    limit = get_settings().ai_daily_request_limit
    for _ in range(limit):
        await _record(user_id, input_tokens=1, output_tokens=1)

    response = await client.post("/chat/stream", json={"message": "merhaba"})

    # Gerçek 429: akış içinde bir SSE hatası olsaydı istemci 200 alırdı ve
    # sıradan bir hata gibi ele alamazdı.
    assert response.status_code == 429
    # Mesaj ne zaman açılacağını söylüyor; "kota doldu" tek başına çıkmaz.
    assert "Yarın" in response.json()["detail"]


@pytest.mark.asyncio
async def test_sinirin_altinda_engel_yok(client: AsyncClient, user_id: uuid.UUID) -> None:
    await _record(user_id, input_tokens=1, output_tokens=1)
    response = await client.post("/chat/stream", json={"message": "merhaba"})
    # Anahtar yoksa akış içinde "yapılandırılmadı" hatası geliyor ama HTTP
    # katmanı yine 200: bütçe kapısı geçildi.
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_kullanim_ucu_bugunu_donduruyor(
    client: AsyncClient, user_id: uuid.UUID
) -> None:
    await _record(user_id, input_tokens=120, output_tokens=30)

    body = (await client.get("/users/me/ai-usage")).json()
    assert body["requests"] == 1
    assert body["tokens"] == 150
    # Sınırın VARLIĞI gizlenmiyor: sınıra takılan kullanıcı "uygulama bozuldu"
    # sanmamalı.
    assert body["request_limit"] > 0
    assert body["token_limit"] > 0


@pytest.mark.asyncio
async def test_dogrulanmamis_hesap_smtp_varken_engelleniyor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Atılabilir adreslerle sınırsız model çağrısı, faturayı büyütmenin en
    kolay yolu."""
    from fastapi import HTTPException

    from overload_api.config import get_settings
    from overload_api.services.ai import budget

    monkeypatch.setattr(get_settings(), "smtp_host", "smtp.ornek.test", raising=False)

    with pytest.raises(HTTPException) as caught:
        budget.ensure_verified(False)
    assert caught.value.status_code == 403
    # Kullanıcı ne yapacağını bilmeli.
    assert "doğrulama" in str(caught.value.detail).lower()

    # Doğrulanmış hesap geçiyor.
    budget.ensure_verified(True)


@pytest.mark.asyncio
async def test_smtp_yokken_dogrulama_sart_kosulmuyor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Doğrulama e-postası gönderilemiyorken doğrulama şart koşmak,
    kullanıcıyı yerine getiremeyeceği bir koşula bağlamak olurdu."""
    from overload_api.config import get_settings
    from overload_api.services.ai import budget

    monkeypatch.setattr(get_settings(), "smtp_host", None, raising=False)
    budget.ensure_verified(False)  # istisna YOK
