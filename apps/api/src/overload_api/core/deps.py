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

    Transaction burada açılır ve istek sonunda commit/rollback edilir. `SET LOCAL`
    ile ayarlanan rol ve kullanıcı kimliği transaction bitince düşer; havuzdan
    aynı bağlantıyı alan sonraki istek temiz başlar.
    """
    async with SessionFactory() as session:
        async with session.begin():
            await set_rls_user(session, user.id)
            yield session


DbSession = Annotated[AsyncSession, Depends(get_scoped_db)]
CurrentUser = Annotated[User, Depends(current_active_user)]
