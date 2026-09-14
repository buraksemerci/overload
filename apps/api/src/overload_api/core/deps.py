"""FastAPI bağımlılıkları — her isteğin veritabanı oturumu ve kimliği.

**Kritik sıra**: önce kullanıcı JWT'den çözülür, sonra oturum açılır ve o oturuma
kullanıcı kimliği bağlanır. `get_db` tek başına kullanılmaz; `get_scoped_db`
hem RLS değişkenini hem kısıtlı rolü ayarlar.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from overload_api.core.security import current_active_user
from overload_api.db.models.user import User
from overload_api.db.session import SessionFactory, set_rls_user


async def get_auth_db() -> AsyncIterator[AsyncSession]:
    """Kimlik doğrulama için oturum.

    Henüz bir kullanıcı kimliği yok (JWT çözülmeden önce e-postayla arama yapılır),
    bu yüzden RLS değişkeni boş bırakılır. `user` tablosunda RLS politikası yok —
    olsaydı giriş yapmak imkânsız olurdu (kendini görebilmek için önce kendini
    bulman gerekir).
    """
    async with SessionFactory() as session:
        yield session


async def get_scoped_db(
    user: Annotated[User, Depends(current_active_user)],
) -> AsyncIterator[AsyncSession]:
    """Kullanıcıya bağlanmış, RLS kapsamlı oturum.

    **İstek başına TEK transaction.** `SET LOCAL ROLE` ve `SET LOCAL app.user_id`
    yalnızca açık bir transaction içinde yaşıyor; transaction bitince ikisi de
    düşüyor. Havuzdan aynı bağlantıyı alan sonraki istek bu sayede temiz başlıyor.

    ------------------------------------------------------------------------
    HANDLER'LAR `commit()` ÇAĞIRMAZ — `flush()` ÇAĞIRIR
    ------------------------------------------------------------------------
    `session.begin()` bağlam yöneticisi transaction'ın sahibi. Bir handler
    içinde `await db.commit()` çağırmak o transaction'ı KAPATIYOR; sonrasındaki
    her sorgu şununla patlıyor:

        InvalidRequestError: Can't operate on closed transaction inside
        context manager.

    Bu hata yalnızca "commit'ten sonra tekrar okuyan" endpoint'lerde ortaya
    çıkıyor (ör. klonla-sonra-detayı-döndür), bu yüzden fark edilmesi kolay
    değil. Kural basit: handler'lar `await db.flush()` çağırır, commit'i bu
    bağlam yöneticisi istek sonunda yapar.

    `flush()` ayrıca kısıt ihlallerini handler'ın içinde yüzeye çıkarıyor —
    orada temiz bir 409/422 dönebiliyoruz; commit anında patlasa 500 olurdu.

    **Akış (StreamingResponse) endpoint'leri bu oturumu KULLANAMAZ:** üreteç
    gövdesi handler döndükten sonra çalışıyor ve bağımlılık o ana kadar
    kapanmış oluyor. Onlar `session_scope()` ile kendi oturumlarını açar.
    """
    async with SessionFactory() as session:
        async with session.begin():
            await set_rls_user(session, user.id)
            yield session


DbSession = Annotated[AsyncSession, Depends(get_scoped_db)]
CurrentUser = Annotated[User, Depends(current_active_user)]
