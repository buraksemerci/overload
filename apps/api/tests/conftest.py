"""HTTP seviyesinde testler için ortak altyapı.

`docker compose` zaten ayrı bir test veritabanı ayağa kaldırıyor (`db-test`,
port 5433, tmpfs — diske yazmaz). Bu dosya onu kullanılabilir hâle getiriyor.

**Neden gerekliydi:** testlerin tamamı saf servis/motor katmanını kapsıyordu ve
endpoint'lere hiç dokunmuyordu. İki gerçek hata bu boşluktan geçti:

  1. `SessionOut.sets` ORM'deki `set_logs` ilişkisiyle eşleşmiyordu; kaydedilmiş
     setler cevaba hiç girmiyordu (endpoint yine 200 dönüyordu).
  2. Yeni açılan seansta `set_logs` yüklü olmadığı için FastAPI cevabı
     serileştirirken — handler döndükten, oturum kapandıktan sonra — tembel
     yükleme tetikleniyor ve MissingGreenlet ile 500 dönüyordu.

İkisi de tek bir "seans aç, set yaz, geri oku" testiyle yakalanırdı.

Test veritabanı ayakta değilse tüm dosya atlanır; `pytest` Docker olmadan da
çalışmaya devam eder.
"""

from __future__ import annotations

import os

# Uygulama motoru `database_url`'i IMPORT ANINDA okuyor, bu yüzden ortam
# değişkeni `overload_api` içeri alınmadan ÖNCE kurulmalı.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://overload:overload@localhost:5433/overload_test"
os.environ["DATABASE_URL_SYNC"] = (
    "postgresql+psycopg://overload:overload@localhost:5433/overload_test"
)
os.environ.setdefault("ENVIRONMENT", "test")

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient

TEST_DSN = os.environ["DATABASE_URL_SYNC"]

#: Geçerli bir bcrypt hash'i DEĞİL ve olması da gerekmiyor: testler
#: `current_active_user` bağımlılığını geçersiz kılıyor, parola akışından
#: geçmiyor. Ünlem işaretiyle başlaması bcrypt'in asla üretemeyeceği bir
#: değer olduğunu garantiliyor — kazara doğrulanan bir parola olamaz.
UNUSABLE_PASSWORD_HASH = "!test-only-not-a-valid-hash"  # noqa: S105 - parola değil, sabit


def _database_is_reachable() -> bool:
    try:
        engine = sa.create_engine(TEST_DSN, connect_args={"connect_timeout": 3})
        with engine.connect() as conn:
            conn.execute(sa.text("SELECT 1"))
        engine.dispose()
    except Exception:
        return False
    return True


#: Docker kapalıysa bu dizindeki testler atlanır, hata vermez.
requires_db = pytest.mark.skipif(
    not _database_is_reachable(),
    reason=(
        "Test veritabanı erişilemiyor (localhost:5433). "
        "`docker compose up -d db-test` ile ayağa kaldır."
    ),
)


@pytest.fixture(scope="session", autouse=True)
def _migrate() -> None:
    """Şemayı bir kez kurar. `db-test` tmpfs kullanıyor: konteyner yeniden
    başlayınca veri gider, o yüzden her koşuda migration gerekebiliyor."""
    if not _database_is_reachable():
        return

    from alembic import command
    from alembic.config import Config

    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", TEST_DSN)
    command.upgrade(config, "head")

    # Paylaşılan referans veri (kas grupları, hareket kütüphanesi, şablonlar).
    # Testler gerçek seed'e karşı koşsun: uydurma bir hareket satırı, hareketin
    # ekipman/kas eşlemesine bağlı davranışları (ilerleme motoru, kas haritası)
    # sınamaz hâle getirirdi. Yükleyici idempotent.
    import asyncio

    async def _seed() -> None:
        from overload_api.db.session import dispose_engine
        from overload_api.seed.loader import run as load_seed

        try:
            await load_seed()
        finally:
            # `asyncio.run` kendi loop'unu açıp KAPATIYOR. Havuzda o loop'a
            # bağlı bağlantılar kalırsa ilk gerçek test onları kullanmaya
            # çalışıp "Event loop is closed" ile patlıyor. Havuzu boşalt.
            await dispose_engine()

    asyncio.run(_seed())


@pytest_asyncio.fixture
async def user_id() -> AsyncIterator[uuid.UUID]:
    """Her test kendi kullanıcısıyla koşar — RLS izolasyonu zaten bunu şart
    koşuyor ve testler arası sızıntıyı imkânsız kılıyor."""
    from overload_api.db.models.user import User
    from overload_api.db.session import session_scope

    new_id = uuid.uuid4()
    async with session_scope(assume_app_role=False) as session:
        session.add(
            User(
                id=new_id,
                email=f"test-{new_id}@overload.test",
                hashed_password=UNUSABLE_PASSWORD_HASH,
                is_active=True,
                is_superuser=False,
                is_verified=True,
            )
        )

    yield new_id

    async with session_scope(assume_app_role=False) as session:
        await session.execute(sa.text('DELETE FROM "user" WHERE id = :i'), {"i": str(new_id)})


@pytest_asyncio.fixture
async def client(user_id: uuid.UUID) -> AsyncIterator[AsyncClient]:
    """Kimliği `user_id` fixture'ına sabitlenmiş HTTP istemcisi.

    Parola akışından geçmek yerine `current_active_user` bağımlılığı doğrudan
    geçersiz kılınıyor: test edilen şey auth değil, endpoint davranışı. RLS
    katmanı `get_scoped_db` üzerinden GERÇEKTEN çalışmaya devam ediyor.
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
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http_client:
            yield http_client
    finally:
        app.dependency_overrides.pop(current_active_user, None)
