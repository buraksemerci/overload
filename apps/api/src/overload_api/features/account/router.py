"""Hesap silme.

--------------------------------------------------------------------------
NEDEN AYRI BİR UÇ
--------------------------------------------------------------------------
`fastapi-users`ın kullanıcı router'ı `DELETE /users/{id}` sunuyor ama yalnızca
süper kullanıcıya. Kendi hesabını silmek bir yönetim işlemi değil, bir HAK:
kullanıcı verisini geri alabilmeli ve bırakabilmeli.

--------------------------------------------------------------------------
PAROLA İSTENİYOR
--------------------------------------------------------------------------
Geri alınamaz ve tek tıkla yapılmamalı. Açık bir oturumu ele geçiren birinin
hesabı silebilmesi de kabul edilemez. Parola, o oturumun gerçekten hesap
sahibine ait olduğunun tek kanıtı.

--------------------------------------------------------------------------
NE SİLİNİYOR
--------------------------------------------------------------------------
Kullanıcı satırı siliniyor; bütün ilişkili kayıtlar `ON DELETE CASCADE` ile
gidiyor (antrenman, beslenme, ölçüm, sohbet, kendi hareketleri ve programları).

Nesne deposu yabancı anahtar tanımıyor: R2'deki fotoğraflar ayrıca siliniyor.
Silme veritabanından ÖNCE yapılıyor — sırası tersi olsaydı ve dosya silme
başarısız olsaydı, artık sahibi olmayan dosyaların kime ait olduğunu bulmanın
yolu kalmazdı.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from overload_api.core.deps import CurrentUser, DbSession
from overload_api.core.security import UserManager, get_user_manager
from overload_api.db.models.user import User
from overload_api.services.media import r2

logger = logging.getLogger(__name__)

router = APIRouter(tags=["account"])


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1)


@router.delete("/users/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_own_account(
    payload: DeleteAccountIn,
    user: CurrentUser,
    db: DbSession,
    user_manager: UserManager = Depends(get_user_manager),
) -> None:
    verified, _ = user_manager.password_helper.verify_and_update(
        payload.password, user.hashed_password
    )
    if not verified:
        # 403, 401 DEĞİL: oturum geçerli, reddedilen şey bu işlem.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Parola doğrulanamadı."
        )

    try:
        removed = await r2.delete_user_objects(user.id)
        if removed:
            logger.info("Hesap silme: %s nesne kaldırıldı (%s)", removed, user.id)
    except r2.MediaError:
        # Dosyalar silinemezse hesap da SİLİNMİYOR. Yarım bırakılmış bir
        # silme, kullanıcıya "verin gitti" deyip dosyalarını tutmak demek.
        logger.exception("Hesap silme durduruldu: dosyalar kaldırılamadı (%s)", user.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dosyaların şu anda silinemiyor. Biraz sonra tekrar dene.",
        ) from None

    # Satır BU oturumda tazeleniyor: `user` kimlik doğrulama oturumundan
    # geliyor ve başka bir oturuma ait bir nesneyi silmeye çalışmak
    # SQLAlchemy'de hata.
    row = await db.get(User, user.id)
    if row is not None:
        await db.delete(row)
