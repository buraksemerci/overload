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
from fastapi_users.authentication import AuthenticationBackend, BearerTransport
from fastapi_users.authentication.strategy.db import (
    AccessTokenDatabase,
    DatabaseStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users_db_sqlalchemy.access_token import SQLAlchemyAccessTokenDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from overload_api.config import get_settings
from overload_api.db.models.user import AccessToken, User
from overload_api.db.session import SessionFactory
from overload_api.services import email


async def _auth_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        yield session


#: fastapi-users'ın veritabanı adaptörü jenerik; tip argümanları olmadan
#: `Any` sızdırıyor ve kullanıcı tipiyle uyumsuzluklar yakalanamıyor.
UserDatabase = SQLAlchemyUserDatabase[User, uuid.UUID]


async def get_user_db(
    session: Annotated[AsyncSession, Depends(_auth_session)],
) -> AsyncIterator[UserDatabase]:
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    """Şifre sıfırlama ve doğrulama token'ları JWT sırrından türetiliyor.

    Değerler `__init__` içinde atanıyor, property olarak DEĞİL: taban sınıf
    bunları yazılabilir sınıf niteliği olarak tanımlıyor ve salt-okunur
    property ile geçersiz kılmak tip uyumsuzluğu (Liskov ihlali) yaratıyor.
    """

    def __init__(self, user_db: UserDatabase) -> None:
        super().__init__(user_db)
        secret = get_settings().jwt_secret.get_secret_value()
        self.reset_password_token_secret = secret
        self.verification_token_secret = secret

    async def on_after_register(self, user: User, request: Request | None = None) -> None:
        """Kayıttan hemen sonra doğrulama e-postası.

        Kullanıcının ayrıca "doğrulama gönder" demesi gerekmiyor: kaydolmak
        zaten adresi sahiplendiğini söylemek. İstek başarısız olursa kayıt
        GERİ ALINMIYOR — hesap açıldı, yalnızca doğrulama bekliyor.
        """
        await self.request_verify(user, request)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        """Sıfırlama bağlantısını gönderir.

        Bu kanca boştu: token üretiliyor ama kimseye ulaşmıyordu. Yani
        "parolamı unuttum" akışı sonuna kadar çalışıyor, kullanıcıya hiçbir
        şey gelmiyordu.
        """
        subject, body = email.reset_password_body(token)
        await email.send(user.email, subject, body)

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        subject, body = email.verify_body(token)
        await email.send(user.email, subject, body)


async def get_user_manager(
    user_db: Annotated[UserDatabase, Depends(get_user_db)],
) -> AsyncIterator[UserManager]:
    yield UserManager(user_db)


async def get_access_token_db(
    session: Annotated[AsyncSession, Depends(_auth_session)],
) -> AsyncIterator[SQLAlchemyAccessTokenDatabase[AccessToken]]:
    yield SQLAlchemyAccessTokenDatabase(session, AccessToken)


def get_database_strategy(
    access_tokens: Annotated[
        AccessTokenDatabase[AccessToken], Depends(get_access_token_db)
    ],
) -> DatabaseStrategy[User, uuid.UUID, AccessToken]:
    """Oturumlar veritabanında — JWT DEĞİL.

    JWT geri alınamıyor: imzası geçerli bir jeton süresi dolana kadar (yedi
    gün) kabul edilir. Sonuçları somut:

    * "Çıkış yap" yalnızca tarayıcıdaki kopyayı siliyordu. Jeton başkasının
      eline geçtiyse çıkmak hiçbir işe yaramıyordu.
    * Hesabı silinen kullanıcının jetonu çalışmaya devam ediyordu.
    * Ortak bir bilgisayarda oturum kapatmak, kapatmış olmuyordu.

    Satır silinince jeton o anda geçersiz. Bedeli her istekte bir birincil
    anahtar okuması.

    Jetonun ömrü aynı kaldı (`jwt_secret` artık yalnızca parola sıfırlama ve
    doğrulama token'larını imzalıyor; `JWT_LIFETIME_SECONDS` oturum ömrü
    olarak kullanılmaya devam ediyor).
    """
    return DatabaseStrategy(
        access_tokens, lifetime_seconds=get_settings().jwt_lifetime_seconds
    )


# Bearer token: PWA'da Authorization başlığı cookie'den daha öngörülebilir
# (servis worker ve çapraz köken davranışı cookie'lerde sürprizli).
bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")

#: Adı "jwt" KALIYOR: `BearerTransport(tokenUrl="auth/jwt/login")` ve
#: istemcinin çağırdığı yollar bu adı taşıyor. Değiştirmek, çalışan bir
#: kurulumda herkesin oturumunu kesmek ve OpenAPI sözleşmesini bozmak
#: demek — teknoloji değişti, uç değişmedi.
auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_database_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
