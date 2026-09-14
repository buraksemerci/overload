"""Medya yükleme endpoint'leri — ön-imzalı R2 adresleri.

Akış:
    1. İstemci  POST /media/upload-url   -> {key, upload_url}
    2. İstemci  PUT  <upload_url>        -> dosya doğrudan R2'ye gider
    3. İstemci  POST /media/confirm      -> backend dosyanın gerçekten
                                            yüklendiğini doğrular
    4. İstemci  key'i ilgili kayda yazar (nutrition_log.photo_url gibi)

3. adım atlanabilir gibi görünüyor ama atlanmamalı: istemci "yükledim" der,
yükleme yarıda kesilmiştir ve veritabanına kırık bir anahtar yazılır. `confirm`
R2'ye `head_object` atıp gerçekten orada mı diye bakıyor.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from overload_api.core.deps import CurrentUser
from overload_api.core.time import today_in
from overload_api.services.media import r2

router = APIRouter(prefix="/media", tags=["media"])


class UploadUrlIn(BaseModel):
    kind: r2.MediaKind
    content_type: str = Field(min_length=3, max_length=60)
    size_bytes: int = Field(gt=0, le=r2.MAX_UPLOAD_BYTES)


class UploadUrlOut(BaseModel):
    key: str
    upload_url: str
    #: İstemci PUT isteğinde bu başlığı BİREBİR göndermeli; imzaya dahil.
    required_content_type: str
    expires_in_seconds: int


class ConfirmIn(BaseModel):
    key: str = Field(min_length=1, max_length=500)


class MediaUrlOut(BaseModel):
    key: str
    url: str
    expires_in_seconds: int


def _require_r2() -> None:
    if not r2.is_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Fotoğraf depolama yapılandırılmamış. .env dosyasına R2 anahtarlarını ekle "
            "(bkz. docs/kurulum.md, adım 5).",
        )


@router.post("/upload-url", response_model=UploadUrlOut)
async def create_upload_url(payload: UploadUrlIn, user: CurrentUser) -> UploadUrlOut:
    _require_r2()
    try:
        key = r2.build_key(user.id, payload.kind, payload.content_type, today_in(user.timezone))
        url = r2.presigned_put(key, payload.content_type)
    except r2.MediaError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return UploadUrlOut(
        key=key,
        upload_url=url,
        required_content_type=payload.content_type,
        expires_in_seconds=r2.UPLOAD_URL_TTL_SECONDS,
    )


@router.post("/confirm", response_model=MediaUrlOut)
async def confirm_upload(payload: ConfirmIn, user: CurrentUser) -> MediaUrlOut:
    """Yüklemenin gerçekten tamamlandığını doğrular ve okuma adresi döndürür."""
    _require_r2()
    # Sahiplik: anahtar {user_id}/ ile başlamalı. Bu kontrol olmadan kullanıcı
    # başkasının anahtarını gönderip okuma adresi alabilirdi.
    if not r2.owns_key(user.id, payload.key):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu dosya sana ait değil.")

    try:
        if not await r2.exists(payload.key):
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Dosya R2'de bulunamadı. Yükleme tamamlanmamış olabilir; tekrar dene.",
            )
        url = r2.presigned_get(payload.key)
    except r2.MediaError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    return MediaUrlOut(key=payload.key, url=url, expires_in_seconds=r2.DOWNLOAD_URL_TTL_SECONDS)


@router.get("/url", response_model=MediaUrlOut)
async def get_media_url(key: str, user: CurrentUser) -> MediaUrlOut:
    """Saklanan bir anahtar için taze okuma adresi.

    Adresler süreli olduğu için veritabanına URL değil **anahtar** yazılıyor;
    görüntüleme anında burada taze URL üretiliyor.
    """
    _require_r2()
    if not r2.owns_key(user.id, key):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu dosya sana ait değil.")
    try:
        url = r2.presigned_get(key)
    except r2.MediaError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return MediaUrlOut(key=key, url=url, expires_in_seconds=r2.DOWNLOAD_URL_TTL_SECONDS)


@router.delete("/{key:path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(key: str, user: CurrentUser) -> None:
    _require_r2()
    if not r2.owns_key(user.id, key):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu dosya sana ait değil.")
    try:
        await r2.delete(key)
    except r2.MediaError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
