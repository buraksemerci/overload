"""E-posta gönderimi.

--------------------------------------------------------------------------
NEDEN VAR
--------------------------------------------------------------------------
Parola sıfırlama ve e-posta doğrulama token ÜRETİYORDU ama token kimseye
ulaşmıyordu: `fastapi-users` kancaları boştu. Yani "parolamı unuttum" akışı
sonuna kadar çalışıyor, kullanıcıya hiçbir şey gelmiyordu. Sessizce çalışan
bir hiçlik, açıkça kırık bir düğmeden kötü.

--------------------------------------------------------------------------
İKİ ARKA UÇ
--------------------------------------------------------------------------
* **console** — varsayılan. Mesajı günlüğe yazıyor. Geliştirmede SMTP
  kurmak zorunda kalmadan akışın tamamı denenebiliyor: bağlantı terminalden
  kopyalanıp tarayıcıya yapıştırılıyor.
* **smtp** — gerçek gönderim. `SMTP_HOST` tanımlandığı anda devreye giriyor;
  ayrı bir "açık/kapalı" ayarı YOK çünkü iki ayarın çelişmesi (host var ama
  kapalı) hata ayıklaması en zor durumlardan biri.

--------------------------------------------------------------------------
STDLIB `smtplib`, YENİ BAĞIMLILIK DEĞİL
--------------------------------------------------------------------------
`aiosmtplib` daha zarif olurdu ama gönderilen e-posta sayısı ayda birkaç
düzine: bir bağımlılık eklemeye değmiyor. Senkron `smtplib` bir iş parçacığına
alınıyor, olay döngüsü bloklanmıyor.

--------------------------------------------------------------------------
GÖNDERİM HATASI AKIŞI KIRMIYOR
--------------------------------------------------------------------------
SMTP sunucusu ulaşılamazsa istisna YUKARI ÇIKMIYOR, günlüğe yazılıyor.
Sebebi: "parolamı unuttum" ucu, e-posta gönderilip gönderilemediğine
bakılmaksızın aynı yanıtı vermek zorunda. Farklı yanıt vermek, bir adresin
kayıtlı olup olmadığını dışarıdan öğrenmenin yolu olurdu.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from overload_api.config import get_settings

logger = logging.getLogger(__name__)


def _compose(to: str, subject: str, body: str) -> EmailMessage:
    settings = get_settings()
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    return message


def _send_smtp(message: EmailMessage) -> None:
    settings = get_settings()
    host = settings.smtp_host
    if host is None:  # pragma: no cover - çağrı yeri zaten kontrol ediyor
        return

    with smtplib.SMTP(host, settings.smtp_port, timeout=15) as server:
        if settings.smtp_starttls:
            server.starttls()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password.get_secret_value())
        server.send_message(message)


async def send(to: str, subject: str, body: str) -> None:
    """E-postayı gönderir. Hata fırlatmaz — yalnızca günlüğe yazar."""
    settings = get_settings()

    if settings.smtp_host is None:
        # Geliştirme: bağlantı terminalde. Gövdenin tamamı yazılıyor çünkü
        # asıl iş orada — token'ı kırpmak akışı denenemez hâle getirirdi.
        logger.info("E-POSTA (konsol arka ucu)\nKime: %s\nKonu: %s\n\n%s", to, subject, body)
        return

    try:
        await asyncio.to_thread(_send_smtp, _compose(to, subject, body))
    except Exception:
        # Çağıran taraf akışı SÜRDÜRÜYOR: "parolamı unuttum" ucu, adres
        # kayıtlı olsa da olmasa da aynı yanıtı vermek zorunda.
        logger.exception("E-posta gönderilemedi (%s / %s)", to, subject)


def reset_password_body(token: str) -> tuple[str, str]:
    """Parola sıfırlama e-postası: (konu, gövde)."""
    settings = get_settings()
    link = f"{settings.frontend_url}/reset-password?token={token}"
    return (
        "overload — parola sıfırlama",
        (
            "Parolanı sıfırlamak için aşağıdaki bağlantıya git:\n\n"
            f"{link}\n\n"
            "Bağlantı bir saat geçerli.\n\n"
            "Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; "
            "parolan değişmez."
        ),
    )


def verify_body(token: str) -> tuple[str, str]:
    """E-posta doğrulama e-postası: (konu, gövde)."""
    settings = get_settings()
    link = f"{settings.frontend_url}/verify?token={token}"
    return (
        "overload — e-posta adresini doğrula",
        (
            "Hesabını kullanmaya başlamak için e-posta adresini doğrula:\n\n"
            f"{link}\n\n"
            "Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin."
        ),
    )
