"""Giriş uçlarındaki deneme sınırı.

Veritabanı gerekmiyor: sınır tamamen süreç içi ve `RULES`taki yollara bakıyor.
Testler gerçek uygulamayı değil, aynı yollara sahip küçük bir uygulamayı
kullanıyor — böylece kimlik doğrulama akışına girmeden sınırın kendisi
ölçülüyor.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from overload_api.core.rate_limit import RULES, RateLimitMiddleware, Rule, window


@pytest.fixture(autouse=True)
def _reset_window() -> None:
    """Sayaç süreç ömrü boyunca yaşıyor; testler arasında sızmasın."""
    window.reset()
    yield
    window.reset()


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)

    @app.post("/auth/jwt/login")
    async def login(fail: bool = False) -> JSONResponse:
        # Gerçek uçta olduğu gibi: yanlış parola 400 döndürüyor.
        return JSONResponse({"ok": not fail}, status_code=400 if fail else 200)

    @app.post("/auth/register")
    async def register() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    return app


async def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=_app()), base_url="http://test")


@pytest.mark.asyncio
async def test_basarili_girisler_sayilmiyor() -> None:
    """Aynı ağdan bağlanan iki kişi birbirine ceza yazdırmamalı."""
    async with await _client() as client:
        for _ in range(30):
            response = await client.post("/auth/jwt/login")
            assert response.status_code == 200


@pytest.mark.asyncio
async def test_basarisiz_girisler_sinira_takiliyor() -> None:
    rule = RULES[("POST", "/auth/jwt/login")]
    async with await _client() as client:
        for _ in range(rule.limit):
            assert (await client.post("/auth/jwt/login?fail=true")).status_code == 400

        blocked = await client.post("/auth/jwt/login?fail=true")
        assert blocked.status_code == 429
        # İstemci ne kadar bekleyeceğini bilmeli.
        assert int(blocked.headers["Retry-After"]) > 0
        # Mesaj son kullanıcıya gösterilebilir olmalı: "rate limit exceeded"
        # kimseye bir şey anlatmıyor.
        assert "dakika sonra" in blocked.json()["detail"]


@pytest.mark.asyncio
async def test_sinir_asilinca_dogru_parola_da_kabul_edilmiyor() -> None:
    """Sınır KAPI: doğru parola da beklemek zorunda.

    Aksi halde saldırgan sınırı ölçüt olarak kullanıp doğru parolayı
    ayırt edebilirdi.
    """
    rule = RULES[("POST", "/auth/jwt/login")]
    async with await _client() as client:
        for _ in range(rule.limit):
            await client.post("/auth/jwt/login?fail=true")
        assert (await client.post("/auth/jwt/login")).status_code == 429


@pytest.mark.asyncio
async def test_kayit_her_denemeyi_sayiyor() -> None:
    rule = RULES[("POST", "/auth/register")]
    async with await _client() as client:
        for _ in range(rule.limit):
            assert (await client.post("/auth/register")).status_code == 200
        assert (await client.post("/auth/register")).status_code == 429


@pytest.mark.asyncio
async def test_diger_uclara_dokunulmuyor() -> None:
    async with await _client() as client:
        for _ in range(50):
            assert (await client.get("/health")).status_code == 200


def test_pencere_kaydiriyor() -> None:
    """Sabit pencere değil KAYAN pencere: pencerenin bittiği anı bekleyen
    bir saldırgan sınırı iki katına çıkarmamalı."""
    rule = Rule(limit=3, window_seconds=60)

    for step in range(3):
        window.record("k", now=float(step))
    assert window.retry_after("k", rule, now=3.0) is not None

    # İlk deneme pencereden çıktığı anda yer açılıyor — pencerenin tamamının
    # dolmasını beklemeye gerek yok.
    assert window.retry_after("k", rule, now=61.0) is None


def test_retry_after_en_eski_denemeye_gore() -> None:
    rule = Rule(limit=2, window_seconds=100)
    window.record("k", now=0.0)
    window.record("k", now=50.0)

    # En eski deneme 100. saniyede düşüyor; 10. saniyede 90 saniye kaldı.
    retry = window.retry_after("k", rule, now=10.0)
    assert retry is not None
    assert 89 <= retry <= 92


def test_gercek_uygulamada_kurulu() -> None:
    """Yukarıdaki testler kendi uygulamalarını kuruyor; bu, sınırın GERÇEK
    uygulamaya bağlı olduğunu söylüyor. Middleware kaydı silinse yukarıdaki
    sekiz test yine yeşil kalırdı."""
    from overload_api.main import app

    classes = [layer.cls for layer in app.user_middleware]
    assert RateLimitMiddleware in classes

    # CORS DIŞTA olmalı: 429 yanıtı da CORS başlıklarını taşımalı, yoksa
    # tarayıcı yanıtı okuyamıyor ve kullanıcı ağ hatası görüyor.
    from fastapi.middleware.cors import CORSMiddleware

    assert classes.index(CORSMiddleware) < classes.index(RateLimitMiddleware)


def test_bos_kuyruklar_birikmiyor() -> None:
    """Her IP için sonsuza kadar bir girdi tutmak bellek sızıntısı."""
    rule = Rule(limit=5, window_seconds=10)
    window.record("gecici", now=0.0)
    window.retry_after("gecici", rule, now=100.0)
    # İç duruma kasıtlı bakılıyor: sızıntı ancak buradan görülüyor.
    assert "gecici" not in window._hits
