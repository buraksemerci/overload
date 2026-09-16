"""Cloudflare R2 (S3 uyumlu) medya deposu — yemek ve ilerleme fotoğrafları.

--------------------------------------------------------------------------------
NEDEN ÖN-İMZALI URL (presigned URL)
--------------------------------------------------------------------------------
Fotoğraf backend'den GEÇMİYOR. İstemci bizden bir ön-imzalı PUT adresi alıyor ve
dosyayı doğrudan R2'ye yüklüyor. Alternatif — dosyayı backend'e gönderip oradan
R2'ye yazmak — üç sorun getiriyordu:

  1. Telefon fotoğrafı 3-5 MB; her yükleme backend'in bellek ve bant genişliğini
     tüketir, Railway/Render'ın istek boyutu sınırlarına takılır.
  2. Yükleme süresince bir worker bloke olur.
  3. Zayıf salon bağlantısında yarıda kalan yükleme backend'i de meşgul eder.

Ön-imzalı URL'de backend sadece birkaç milisaniyelik imza üretiyor.

--------------------------------------------------------------------------------
ANAHTAR (key) DÜZENİ
--------------------------------------------------------------------------------
    {user_id}/{kind}/{yyyy}/{mm}/{uuid}.{ext}

Kullanıcı kimliği **önde** çünkü: (a) bir kullanıcının tüm medyasını silmek tek
prefix silme işlemi, (b) ileride bucket seviyesinde erişim politikası yazmak
gerekirse prefix bazlı kural yeterli olur. Tarih segmentleri listeleme
performansı için — R2/S3'te tek bir prefix altında yüz binlerce nesne
listelemek yavaş.

--------------------------------------------------------------------------------
BOTO3 SENKRON
--------------------------------------------------------------------------------
Ön-imzalı URL üretimi **ağ isteği yapmaz** — yerel bir imzalama işlemi, mikrosaniye
mertebesinde. Bu yüzden async fonksiyondan doğrudan çağrılması sorun değil.
Gerçek ağ işlemleri (silme) `asyncio.to_thread` ile event loop'un dışına alınıyor.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import date
from enum import StrEnum
from functools import lru_cache
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from overload_api.config import get_settings

logger = logging.getLogger(__name__)

#: Ön-imzalı URL'lerin geçerlilik süresi.
#: Yükleme için kısa (istemci hemen kullanacak), okuma için biraz daha uzun
#: (Anthropic API görseli çekerken kullanıyor, ağ gecikmesi payı gerekiyor).
UPLOAD_URL_TTL_SECONDS = 300  # 5 dakika
DOWNLOAD_URL_TTL_SECONDS = 3600  # 1 saat

#: İzin verilen tipler. Beyaz liste — kullanıcının gönderdiği content-type'a
#: güvenmiyoruz ama en azından hangi uzantıyla saklayacağımızı buradan seçiyoruz.
ALLOWED_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",  # iPhone varsayılanı
}

#: Telefon fotoğrafı için fazlasıyla yeterli; daha büyüğü muhtemelen hata.
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


class MediaKind(StrEnum):
    meal = "meal"  # yemek fotoğrafı (AI ayrıştırma)
    progress = "progress"  # ilerleme fotoğrafı


class MediaError(Exception):
    """Beklenen türden medya hatası — istemciye anlamlı mesaj döner."""


@lru_cache
def _client() -> Any:
    settings = get_settings()
    if not (settings.r2_endpoint and settings.r2_access_key_id and settings.r2_secret_access_key):
        raise MediaError(
            "R2 yapılandırılmamış. Fotoğraf özelliği için .env dosyasına "
            "R2_ENDPOINT, R2_ACCESS_KEY_ID ve R2_SECRET_ACCESS_KEY ekle."
        )
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id.get_secret_value(),
        aws_secret_access_key=settings.r2_secret_access_key.get_secret_value(),
        # R2 imza sürümü olarak s3v4 bekliyor; varsayılan bırakılırsa
        # bazı bölgelerde 403 dönüyor.
        config=Config(signature_version="s3v4", region_name="auto"),
    )


def is_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.r2_endpoint and settings.r2_access_key_id and settings.r2_secret_access_key
    )


def build_key(user_id: uuid.UUID, kind: MediaKind, content_type: str, on: date) -> str:
    extension = ALLOWED_TYPES.get(content_type)
    if extension is None:
        raise MediaError(
            f"Desteklenmeyen dosya tipi: {content_type}. "
            f"İzin verilenler: {', '.join(sorted(ALLOWED_TYPES))}"
        )
    return f"{user_id}/{kind.value}/{on.year:04d}/{on.month:02d}/{uuid.uuid4()}.{extension}"


def presigned_put(key: str, content_type: str) -> str:
    """İstemcinin doğrudan R2'ye yükleyeceği tek kullanımlık PUT adresi.

    `ContentType` imzaya dahil — istemci farklı bir tiple yüklemeye çalışırsa
    R2 reddediyor. Böylece "image/jpeg diyip .exe yükleme" yolu kapanıyor.
    """
    settings = get_settings()
    try:
        # boto3 tip belirteçleri `Any` döndürüyor; açık bir değişken, dönüş
        # tipinin sessizce Any'ye kaymasını engelliyor.
        url: str = _client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=UPLOAD_URL_TTL_SECONDS,
        )
        return url
    except (BotoCoreError, ClientError) as exc:
        logger.error("Ön-imzalı PUT üretilemedi (%s): %s", key, exc)
        raise MediaError("Yükleme adresi üretilemedi.") from exc


def presigned_get(key: str, *, ttl: int = DOWNLOAD_URL_TTL_SECONDS) -> str:
    """Okuma adresi. Anthropic görseli bu URL'den çekiyor, bu yüzden bucket'ın
    herkese açık olmasına gerek yok."""
    settings = get_settings()
    try:
        url: str = _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket_name, "Key": key},
            ExpiresIn=ttl,
        )
        return url
    except (BotoCoreError, ClientError) as exc:
        logger.error("Ön-imzalı GET üretilemedi (%s): %s", key, exc)
        raise MediaError("Görsel adresi üretilemedi.") from exc


def owns_key(user_id: uuid.UUID, key: str) -> bool:
    """Anahtar bu kullanıcıya mı ait.

    Anahtar düzeni `{user_id}/...` olduğu için sahiplik kontrolü prefix
    karşılaştırmasına iniyor. İstemciden gelen her anahtar için ÇAĞRILMALI —
    aksi halde kullanıcı başkasının anahtarını gönderip okuma adresi alabilir.
    """
    return key.startswith(f"{user_id}/")


async def delete(key: str) -> None:
    """Nesneyi siler. Ağ isteği olduğu için thread'e alınıyor."""
    settings = get_settings()

    def _delete() -> None:
        _client().delete_object(Bucket=settings.r2_bucket_name, Key=key)

    try:
        await asyncio.to_thread(_delete)
    except (BotoCoreError, ClientError) as exc:
        logger.error("R2 silme başarısız (%s): %s", key, exc)
        raise MediaError("Dosya silinemedi.") from exc


async def exists(key: str) -> bool:
    """Nesne gerçekten yüklendi mi.

    İstemci "yükledim" dediğinde ona körü körüne inanmıyoruz: yükleme yarıda
    kesilmiş olabilir ve veritabanına var olmayan bir anahtar yazmak, sonradan
    kırık görsel olarak geri döner.
    """
    settings = get_settings()

    def _head() -> bool:
        try:
            _client().head_object(Bucket=settings.r2_bucket_name, Key=key)
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise

    try:
        return await asyncio.to_thread(_head)
    except (BotoCoreError, ClientError) as exc:
        logger.error("R2 head_object başarısız (%s): %s", key, exc)
        raise MediaError("Dosya doğrulanamadı.") from exc


async def delete_user_objects(user_id: uuid.UUID) -> int:
    """Bir kullanıcının bütün nesnelerini siler; silinen sayısını döndürür.

    Hesap silme akışı için. Anahtar düzeni `{user_id}/...` olduğu için tek bir
    ön ekle listelenip toplu silinebiliyor.

    **Veritabanı değil, nesne deposu.** Kullanıcı satırı silinince ilişkili
    kayıtlar `ON DELETE CASCADE` ile gidiyor ama R2'deki dosyalar yabancı
    anahtar tanımıyor: kimsenin işaret etmediği fotoğraflar orada kalırdı.

    Yapılandırma yoksa sessizce 0 dönüyor — geliştirme kurulumunda R2 hiç
    bağlanmamış olabiliyor ve bu, hesap silmeyi engellememeli.
    """
    if not is_configured():
        return 0

    settings = get_settings()
    prefix = f"{user_id}/"

    def _purge() -> int:
        client = _client()
        removed = 0
        token: str | None = None
        while True:
            kwargs: dict[str, Any] = {"Bucket": settings.r2_bucket_name, "Prefix": prefix}
            if token is not None:
                kwargs["ContinuationToken"] = token
            page = client.list_objects_v2(**kwargs)
            keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            if keys:
                # `delete_objects` çağrı başına en fazla 1000 anahtar alıyor;
                # `list_objects_v2` da zaten en fazla 1000 döndürüyor.
                client.delete_objects(
                    Bucket=settings.r2_bucket_name, Delete={"Objects": keys, "Quiet": True}
                )
                removed += len(keys)
            if not page.get("IsTruncated"):
                return removed
            token = page.get("NextContinuationToken")

    try:
        return await asyncio.to_thread(_purge)
    except (BotoCoreError, ClientError) as exc:
        logger.error("R2 kullanıcı nesneleri silinemedi (%s): %s", user_id, exc)
        raise MediaError("Dosyalar silinemedi.") from exc
