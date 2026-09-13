"""Kullanıcının saat dilimine göre "bugün".

UTC kullanmak Türkiye'de gece yarısından sonra 3 saat boyunca yanlış güne yazardı:
saat 01:00'de yenen bir şey UTC'de hâlâ "dün"e düşer ve günlük kalori toplamı
yanlışlanır. Antrenman kayıtları için de aynı sorun geçerli.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)


def today_in(timezone: str) -> date:
    """Verilen saat dilimindeki bugünün tarihi.

    Geçersiz saat dilimi kaydı akışı durdurmamalı — UTC'ye düşülür ve uyarı
    kaydedilir. Kullanıcı profilinde bozuk bir string yüzünden beslenme günlüğü
    açılmaz hâle gelmesin.
    """
    try:
        return datetime.now(ZoneInfo(timezone)).date()
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("Geçersiz saat dilimi %r — UTC kullanılıyor", timezone)
        return datetime.now(UTC).date()


def now_utc() -> datetime:
    return datetime.now(UTC)
