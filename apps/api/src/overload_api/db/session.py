"""Async veritabanı motoru ve RLS kapsamlı oturum yönetimi.

**Savunma derinliği.** Uygulama kodu her sorguyu `user_id` ile filtreler (repository
katmanı), ama bir yerde `.where(...)` unutulursa bu tek başına sessiz bir veri sızıntısı
olur. Bu yüzden ikinci bir katman var: her istek kendi transaction'ında
`SET LOCAL app.user_id = '<uuid>'` çalıştırır ve Postgres RLS politikaları bu değeri
okur. Uygulamada filtre unutulsa bile veritabanı satırı döndürmez.

`SET LOCAL` kritik: transaction bitince değer otomatik sıfırlanır, dolayısıyla
havuzdan (pool) aynı bağlantıyı alan bir sonraki istek önceki kullanıcının kimliğini
devralamaz.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from overload_api.config import get_settings

_settings = get_settings()

engine: AsyncEngine = create_async_engine(
    _settings.database_url,
    echo=False,
    pool_pre_ping=True,  # Neon serverless bağlantıyı uyku sonrası kesebilir
    pool_size=5,
    max_overflow=10,
    # Neon/pgbouncer prepared statement cache'iyle çakışmasın
    connect_args={"statement_cache_size": 0} if "neon.tech" in _settings.database_url else {},
)

SessionFactory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # commit sonrası nesneler response serileştirmede kullanılabilsin
    autoflush=False,
)

# RLS oturum değişkeninin adı. Politikalar bunu current_setting() ile okur.
RLS_USER_KEY = "app.user_id"

#: Migration 0002'de oluşturulan, tablo sahibi OLMAYAN uygulama rolü.
#: Postgres'te tablo sahibi RLS'i baypas eder; uygulama sahibin kimliğiyle
#: bağlanırsa politikalar sessizce etkisiz kalır. Bu yüzden her istek
#: transaction'ında bu role geçiyoruz.
APP_ROLE = "overload_app"


async def set_rls_user(
    session: AsyncSession, user_id: uuid.UUID | None, *, assume_app_role: bool = True
) -> None:
    """Aktif transaction'a kullanıcı kimliğini ve kısıtlı rolü bağlar.

    İki ayar da `LOCAL`: transaction bitince ikisi de düşer. Bu, bağlantı havuzunda
    kimlik sızmasını engelleyen asıl mekanizma — aynı fiziksel bağlantıyı alan
    sonraki istek temiz başlar.

    `assume_app_role=False` yalnızca migration ve seed için: onlar sahip rolüyle
    koşup paylaşılan referans veriyi (kas grupları, hareket kütüphanesi, şablon
    programlar) yazabilmeli.
    """
    if assume_app_role:
        # Rol adı bir tanımlayıcı; bind parametresi kabul etmez. Güvenli çünkü
        # APP_ROLE modül sabiti, kullanıcı girdisi değil.
        await session.execute(text(f"SET LOCAL ROLE {APP_ROLE}"))

    await session.execute(
        text("SELECT set_config(:key, :value, true)"),
        {"key": RLS_USER_KEY, "value": str(user_id) if user_id else ""},
    )


@asynccontextmanager
async def session_scope(
    user_id: uuid.UUID | None = None, *, assume_app_role: bool = True
) -> AsyncIterator[AsyncSession]:
    """Arka plan işleri (seed, haftalık rapor, cron) için oturum bağlamı.

    HTTP istekleri bunu değil, `core/deps.py` içindeki `get_db` bağımlılığını kullanır.
    """
    async with SessionFactory() as session:
        async with session.begin():
            await set_rls_user(session, user_id, assume_app_role=assume_app_role)
            yield session


async def dispose_engine() -> None:
    """Uygulama kapanırken bağlantı havuzunu temiz kapat."""
    await engine.dispose()
