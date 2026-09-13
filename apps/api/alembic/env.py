"""Alembic ortamı.

Uygulama asyncpg (async) kullanır ama migration'lar psycopg (senkron) ile koşar.
Sebep: Alembic'in DDL akışı senkron; async sürücüyü zorlamak `greenlet` sarmalayıcısı
gerektirir ve hata mesajlarını okunmaz hâle getirir. Aynı veritabanı, farklı sürücü.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from overload_api.config import get_settings

# Tüm modellerin metadata'ya kaydolması için paketin tamamı import edilmeli.
from overload_api.db.models import Base  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url_sync)

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to) -> bool:  # type: ignore[no-untyped-def]
    """Alembic'in yönetmeyeceği nesneleri ele — şu an hepsi yönetiliyor.

    İleride bir extension tablosu ya da elle kurulmuş bir view eklenirse
    autogenerate onu silmeye kalkmasın diye kanca burada hazır duruyor.
    """
    return True


def run_migrations_offline() -> None:
    """SQL'i çalıştırmadan dosyaya basar (`alembic upgrade head --sql`)."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Tip ve varsayılan değer değişikliklerini de yakala; varsayılan
            # olarak kapalılar ve sessizce kaçırılan şema farkları üretirler.
            compare_type=True,
            compare_server_default=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
