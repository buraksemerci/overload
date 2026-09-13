"""SQLAlchemy taban sınıfı, adlandırma kuralları ve ortak mixin'ler.

İki karar burada bilinçli olarak alındı:

1. **Adlandırma kuralı (naming_convention).** Postgres kısıtlamalarına otomatik ad
   vermezsek Alembic autogenerate, isimsiz kısıtlamaları güvenilir biçimde
   `DROP`/`ALTER` edemez ve migration'lar zamanla kırılır. Bunu baştan sabitliyoruz.

2. **Native olmayan enum.** `native_enum=False` ile enum'lar VARCHAR + CHECK olarak
   saklanır. Postgres'in gerçek ENUM tipine yeni değer eklemek `ALTER TYPE` gerektirir;
   bu da migration'ları gereksiz yere kırılgan yapar. Bir enum'a değer eklemek bizde
   sadece CHECK kısıtını güncellemek demek.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, MetaData, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    # RUF012 (ClassVar olmalı) burada geçerli değil: `type_annotation_map`
    # SQLAlchemy'nin DeclarativeBase API'sinin parçası ve sınıf değişkeni
    # olarak sözlük bekliyor; ClassVar ile sarmalamak SQLAlchemy'nin
    # okumasını bozmuyor ama tip belirteci gürültüsü ekliyor.
    type_annotation_map = {  # noqa: RUF012
        dict[str, Any]: JSONB,
        list[Any]: JSONB,
        datetime: DateTime(timezone=True),
        date: Date,
        uuid.UUID: UUID(as_uuid=True),
    }

    def __repr__(self) -> str:
        pk = getattr(self, "id", None)
        return f"<{type(self).__name__} id={pk}>"


def pk_column() -> Mapped[uuid.UUID]:
    """Birincil anahtar. UUID seçildi çünkü istemci çevrimdışıyken (PWA) kayıt
    oluşturup sonra senkronlayabilmeli — sıralı integer bunu imkânsız kılar."""
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )


def enum_column(enum_cls: type[StrEnum], **kwargs: Any) -> Any:
    """VARCHAR + CHECK olarak saklanan enum (yukarıdaki 2 numaralı karar)."""
    return mapped_column(
        Enum(enum_cls, native_enum=False, length=32, validate_strings=True), **kwargs
    )


class TimestampMixin:
    """Her satırın ne zaman oluştuğu/değiştiği. Denetim ve senkronizasyon için."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


def non_empty(column: str) -> CheckConstraint:
    """Boş string'i engelle — NOT NULL tek başına '' değerine izin verir."""
    return CheckConstraint(f"length(trim({column})) > 0", name=f"{column}_not_blank")


__all__ = [
    "Base",
    "CheckConstraint",
    "String",
    "TimestampMixin",
    "enum_column",
    "non_empty",
    "pk_column",
]
