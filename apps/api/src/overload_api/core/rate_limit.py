"""Giriş uçlarına deneme sınırı.

--------------------------------------------------------------------------
NEDEN GEREKLİ
--------------------------------------------------------------------------
Giriş ucu internete açık ve parola tahmini ucuz: saniyede yüzlerce istek
atan bir betik, zayıf bir parolayı bulana kadar durmaz. Uygulamayı on kişiye
açmak da internete açmak demek — adres bilinmiyor diye korunmuş olmuyor.

Sınır üç yerde:

* **Giriş** — sayılan şey BAŞARISIZ denemeler. Başarılı girişi saymak, aynı
  ağdan bağlanan iki kişiyi (ev, spor salonu wifi'si) birbirine ceza
  yazdırır.
* **Kayıt** — her denemeyi sayıyor. Otomatik hesap üretimini yavaşlatıyor.
* **Parola sıfırlama** — her denemeyi sayıyor. Aksi halde bir e-posta
  adresine istendiği kadar posta gönderilebiliyor.

--------------------------------------------------------------------------
SÜREÇ İÇİ SAYAÇ, REDIS DEĞİL
--------------------------------------------------------------------------
Sayaçlar bellekte. Bunun iki sonucu var ve ikisi de bilinçli:

1. Sunucu yeniden başlarsa sayaçlar sıfırlanıyor.
2. Birden fazla işçi süreci varsa her biri kendi sayacını tutuyor; gerçek
   sınır işçi sayısıyla çarpılıyor.

On kişilik, tek süreçli bir kurulum için bu yeterli ve bir Redis bağımlılığı
eklemekten iyi. Dağıtım büyürse doğru yer burası: `_Window` arayüzü aynı
kalır, içi paylaşımlı bir sayaca bağlanır.

--------------------------------------------------------------------------
KİMLİK: IP ADRESİ
--------------------------------------------------------------------------
Anahtar `request.client.host`. Ters vekil arkasında bu vekilin adresi olur —
o yüzden uvicorn `--proxy-headers --forwarded-allow-ips=<vekil>` ile
koşmalı; o zaman Starlette gerçek istemci adresini yazıyor. `X-Forwarded-For`
başlığını burada elle okumak YANLIŞ olurdu: vekil doğrulamadan güvenilen bir
başlık, saldırganın sınırı istediği gibi atlamasını sağlar.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response


@dataclass(frozen=True)
class Rule:
    """Bir uç için sınır."""

    limit: int
    window_seconds: int
    #: `True` ise yalnızca 4xx/5xx yanıtlar sayılıyor (giriş denemeleri).
    only_failures: bool = False


#: Yol -> kural. Yollar `main.py`deki router ön ekleriyle birebir aynı.
RULES: dict[tuple[str, str], Rule] = {
    ("POST", "/auth/jwt/login"): Rule(limit=10, window_seconds=900, only_failures=True),
    ("POST", "/auth/register"): Rule(limit=5, window_seconds=3600),
    ("POST", "/auth/forgot-password"): Rule(limit=5, window_seconds=3600),
    # Doğrulama e-postası da gönderim: aksi halde bir adrese istendiği kadar
    # posta atılabiliyor ve gönderen alan adı spam olarak işaretleniyor.
    ("POST", "/auth/request-verify-token"): Rule(limit=5, window_seconds=3600),
}


class _Window:
    """Kayan pencere sayacı.

    Her anahtar için zaman damgaları tutuluyor ve pencere dışına çıkanlar
    okuma anında atılıyor. Sayaç sayı yerine damga tutuyor çünkü "son 15
    dakikada kaç deneme" sorusunun sabit pencereyle (ör. saat başı sıfırlanan)
    cevabı yanlış: pencerenin bittiği anı bekleyen bir saldırgan sınırı iki
    katına çıkarır.
    """

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, window_seconds: int, now: float) -> deque[float]:
        hits = self._hits[key]
        cutoff = now - window_seconds
        while hits and hits[0] < cutoff:
            hits.popleft()
        if not hits:
            # Boş kuyruk bırakmak sözlüğü sınırsız büyütüyor: her IP bir
            # girdi ve hiçbiri silinmiyor.
            del self._hits[key]
            return deque()
        return hits

    def retry_after(self, key: str, rule: Rule, now: float | None = None) -> int | None:
        """Sınır aşıldıysa kaç saniye sonra tekrar denenebileceği, yoksa `None`."""
        now = time.monotonic() if now is None else now
        hits = self._prune(key, rule.window_seconds, now)
        if len(hits) < rule.limit:
            return None
        # En eski denemenin pencereden çıkmasına kalan süre.
        return max(1, int(hits[0] + rule.window_seconds - now) + 1)

    def record(self, key: str, now: float | None = None) -> None:
        self._hits[key].append(time.monotonic() if now is None else now)

    def reset(self) -> None:
        """Yalnızca testler için: süreç içi durum testler arasında sızıyor."""
        self._hits.clear()


#: Süreç ömrü boyunca tek sayaç.
window = _Window()


def _client_key(request: Request, path: str) -> str:
    host = request.client.host if request.client else "bilinmeyen"
    return f"{path}|{host}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """`RULES` içindeki uçlara sınır uyguluyor, diğerlerine dokunmuyor."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        rule = RULES.get((request.method, request.url.path))
        if rule is None:
            return await call_next(request)

        key = _client_key(request, request.url.path)
        retry_after = window.retry_after(key, rule)
        if retry_after is not None:
            # 429 + `Retry-After`: istemci ne kadar bekleyeceğini biliyor.
            # Gövdedeki metin kullanıcıya gösterilebilecek hâlde; "rate limit
            # exceeded" bir son kullanıcıya hiçbir şey anlatmıyor.
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        "Çok fazla deneme yapıldı. "
                        f"{max(1, retry_after // 60)} dakika sonra tekrar dene."
                    )
                },
                headers={"Retry-After": str(retry_after)},
            )

        response = await call_next(request)

        if not rule.only_failures or response.status_code >= 400:
            window.record(key)

        return response
