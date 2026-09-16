"""Kullanıcı başına günlük AI bütçesi.

--------------------------------------------------------------------------
NE KORUYOR
--------------------------------------------------------------------------
Anthropic faturası kullanıma göre çıkıyor ve uygulama birkaç kişiye açılınca
o fatura başkalarının eline geçiyor. Kötü niyet gerekmiyor: döngüye giren bir
istemci, arka arkaya denenen bir foto ayrıştırma ya da açık unutulan bir
sekme yeter.

--------------------------------------------------------------------------
İKİ AYRI SINIR
--------------------------------------------------------------------------
İstek ve token ayrı sayılıyor çünkü farklı şeyleri kesiyorlar:

* **İstek sayısı** hızlı döngüyü kesiyor. Her biri küçük olsa da.
* **Token sayısı** tek seferde devasa bağlam gönderen çağrıyı kesiyor.

Önbellekten okunan token (`cache_read`) ücretin onda birine geliyor; ayrı
sayılıyor ve bütçeye GİRMİYOR. Aksi halde prompt önbelleği — maliyeti
düşürmek için var olan şey — sınırı hızlandıran bir şeye dönerdi.

--------------------------------------------------------------------------
GÜN, KULLANICININ SAATİYLE
--------------------------------------------------------------------------
Sayaç kullanıcının kendi saat dilimindeki güne yazılıyor. UTC'ye sabitlemek
gün dönümünü Türkiye'de gecenin ortasına düşürürdü: akşam 03:00'te sınırı
dolan biri sabah beklemek zorunda kalır, oysa onun günü henüz bitmemiştir.

--------------------------------------------------------------------------
SAYIM ÇAĞRIDAN SONRA
--------------------------------------------------------------------------
Bir çağrının kaç token harcayacağı önceden bilinemiyor; ancak yanıt gelince
belli oluyor. Yani sınır bir çağrıyı yarıda kesmiyor, BİR SONRAKİNİ
engelliyor. Sonuç olarak günlük sınır tek bir çağrı kadar aşılabilir — bu
kabul edilmiş bir tolerans, alternatifi her istekte tahmin yürütmek.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from overload_api.config import get_settings
from overload_api.db.models.ai import AiUsage

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Usage:
    """Bir AI çağrısının maliyeti."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0


@dataclass(frozen=True)
class Budget:
    """Bugünün durumu — hesap ekranında gösteriliyor."""

    requests: int
    request_limit: int
    tokens: int
    token_limit: int

    @property
    def exhausted(self) -> bool:
        return self.requests >= self.request_limit or self.tokens >= self.token_limit


def _today(timezone: str) -> date:
    from overload_api.core.time import today_in

    return today_in(timezone)


async def current(session: AsyncSession, user_id: uuid.UUID, timezone: str) -> Budget:
    settings = get_settings()
    row = await session.get(AiUsage, (user_id, _today(timezone)))
    return Budget(
        requests=row.requests if row else 0,
        request_limit=settings.ai_daily_request_limit,
        # Önbellekten okunan token bütçeye girmiyor.
        tokens=(row.input_tokens + row.output_tokens) if row else 0,
        token_limit=settings.ai_daily_token_limit,
    )


async def ensure_available(
    session: AsyncSession, user_id: uuid.UUID, timezone: str
) -> None:
    """Bütçe dolmuşsa 429 fırlatıyor.

    Mesaj kullanıcıya gösterilebilir hâlde ve NE ZAMAN açılacağını söylüyor:
    "kota doldu" tek başına kullanıcıyı çıkmazda bırakıyor.
    """
    budget = await current(session, user_id, timezone)
    if not budget.exhausted:
        return

    logger.info(
        "AI bütçesi doldu: %s (istek %s/%s, token %s/%s)",
        user_id,
        budget.requests,
        budget.request_limit,
        budget.tokens,
        budget.token_limit,
    )
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(
            "Bugünlük AI kullanım sınırına ulaştın. "
            "Yarın sıfırlanıyor; uygulamanın geri kalanı çalışmaya devam ediyor."
        ),
    )


async def record(
    session: AsyncSession, user_id: uuid.UUID, timezone: str, usage: Usage
) -> None:
    """Kullanımı bugünün satırına ekliyor.

    `ON CONFLICT DO UPDATE`: iki eşzamanlı çağrı aynı anda ilk satırı yazmaya
    çalışırsa biri hata almak yerine diğerinin üstüne ekliyor. Okuyup-yazmak
    (SELECT sonra UPDATE) burada yanlış olurdu: iki akış aynı değeri okuyup
    biri diğerinin artışını siler.
    """
    statement = (
        pg_insert(AiUsage)
        .values(
            user_id=user_id,
            day=_today(timezone),
            requests=1,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read_tokens=usage.cache_read_tokens,
        )
        .on_conflict_do_update(
            index_elements=[AiUsage.user_id, AiUsage.day],
            set_={
                "requests": AiUsage.requests + 1,
                "input_tokens": AiUsage.input_tokens + usage.input_tokens,
                "output_tokens": AiUsage.output_tokens + usage.output_tokens,
                "cache_read_tokens": AiUsage.cache_read_tokens + usage.cache_read_tokens,
            },
        )
    )
    await session.execute(statement)


def usage_of(message: object) -> Usage:
    """Anthropic yanıtından kullanım çıkarıyor.

    Tip yerine `getattr`: SDK sürümleri arasında alan adları değişebiliyor ve
    eksik bir alan yüzünden SAYIM DURMAMALI — sayım durursa sınır da durur.
    """
    raw = getattr(message, "usage", None)
    if raw is None:
        return Usage()
    return Usage(
        input_tokens=int(getattr(raw, "input_tokens", 0) or 0),
        output_tokens=int(getattr(raw, "output_tokens", 0) or 0),
        cache_read_tokens=int(getattr(raw, "cache_read_input_tokens", 0) or 0),
    )
