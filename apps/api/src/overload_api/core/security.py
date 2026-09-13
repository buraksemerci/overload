"""Kimlik doğrulama — fastapi-users + JWT.

Bölüm 5'in gereği. Bu modül bilinçli olarak ince: kimlik doğrulamayı elle yazmak
(şifre hash'leme, token üretimi, süre yönetimi) hata yapmanın en kolay yollarından
biri. `fastapi-users` bu işi denenmiş biçimde yapıyor.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from overload_api.config import get_settings
from overload_api.db.models.user import User
from overload_api.db.session import SessionFactory


async def _auth_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        yield session


async def get_user_db(
    session: Annotated[AsyncSession, Depends(_auth_session)],
) -> AsyncIterator[SQLAlchemyUserDatabase]:
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    @property
    def reset_password_token_secret(self) -> str:
        return get_settings().jwt_secret.get_secret_value()

    @property
    def verification_token_secret(self) -> str:
        return get_settings().jwt_secret.get_secret_value()

    async def on_after_register(self, user: User, request: Request | None = None) -> None:
        # Yeni kullanıcıya başlangıç verisi (hareket kütüphanesi zaten paylaşımlı;
        # burada kullanıcıya özel bir şey kurulmuyor). Kancayı ileride
        # "hoş geldin programı" için kullanabiliriz.
        return None


async def get_user_manager(
    user_db: Annotated[SQLAlchemyUserDatabase, Depends(get_user_db)],
) -> AsyncIterator[UserManager]:
    yield UserManager(user_db)


def get_jwt_strategy() -> JWTStrategy:
    settings = get_settings()
    return JWTStrategy(
        secret=settings.jwt_secret.get_secret_value(),
        lifetime_seconds=settings.jwt_lifetime_seconds,
    )


# Bearer token: PWA'da Authorization başlığı cookie'den daha öngörülebilir
# (servis worker ve çapraz köken davranışı cookie'lerde sürprizli).
bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")

auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
