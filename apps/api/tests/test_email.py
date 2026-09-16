"""E-posta gönderimi ve kimlik doğrulama kancaları.

Bu dosyanın asıl işi bir regresyonu sabitlemek: parola sıfırlama ve e-posta
doğrulama token ÜRETİYORDU ama kimseye ulaşmıyordu. `fastapi-users`ın
kancaları boştu ve akış sonuna kadar sessizce çalışıyordu.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import pytest

from overload_api.services import email


@pytest.mark.asyncio
async def test_smtp_yapilandirilmamisken_gunluge_yaziliyor(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Geliştirmede bağlantı terminalden kopyalanabilmeli.

    Gövdenin TAMAMI yazılıyor: token'ı kırpmak akışı denenemez hâle getirirdi.
    """
    with caplog.at_level(logging.INFO, logger="overload_api.services.email"):
        await email.send("kime@ornek.test", "konu", "gövde-içinde-token-123")

    assert "kime@ornek.test" in caplog.text
    assert "gövde-içinde-token-123" in caplog.text


@pytest.mark.asyncio
async def test_gonderim_hatasi_akisi_kirmiyor(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """SMTP ulaşılamazsa istisna YUKARI ÇIKMIYOR.

    "Parolamı unuttum" ucu, adres kayıtlı olsa da olmasa da aynı yanıtı
    vermek zorunda. Gönderim hatasında 500 dönmek, bir adresin kayıtlı olup
    olmadığını dışarıdan öğrenmenin yolu olurdu.
    """
    from overload_api.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "yok.ornek.test", raising=False)

    def _boom(_message: Any) -> None:
        raise OSError("bağlantı kurulamadı")

    monkeypatch.setattr(email, "_send_smtp", _boom)

    with caplog.at_level(logging.ERROR, logger="overload_api.services.email"):
        await email.send("kime@ornek.test", "konu", "gövde")

    assert "gönderilemedi" in caplog.text


def test_sifirlama_baglantisi_frontend_adresine_gidiyor() -> None:
    from overload_api.config import get_settings

    subject, body = email.reset_password_body("tok3n")

    assert "parola" in subject.lower()
    assert f"{get_settings().frontend_url}/reset-password?token=tok3n" in body
    # Kullanıcı ne kadar süresi olduğunu bilmeli.
    assert "saat" in body
    # İsteği yapmayan kişi ne yapacağını bilmeli.
    assert "yok sayabilirsin" in body


def test_dogrulama_baglantisi_frontend_adresine_gidiyor() -> None:
    from overload_api.config import get_settings

    subject, body = email.verify_body("tok3n")

    assert "doğrula" in subject.lower()
    assert f"{get_settings().frontend_url}/verify?token=tok3n" in body


@pytest.mark.asyncio
async def test_kayittan_sonra_dogrulama_istegi_yapiliyor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Kullanıcının ayrıca "doğrulama gönder" demesi gerekmiyor: kaydolmak
    zaten adresi sahiplendiğini söylemek."""
    from overload_api.core.security import UserManager

    called: list[str] = []

    async def _request_verify(self: UserManager, user: Any, request: Any = None) -> None:
        called.append(str(user.id))

    monkeypatch.setattr(UserManager, "request_verify", _request_verify)

    manager = UserManager.__new__(UserManager)  # __init__ veritabanı istiyor
    user = type("U", (), {"id": uuid.uuid4(), "email": "a@b.test"})()

    await UserManager.on_after_register(manager, user)  # type: ignore[arg-type]

    assert called == [str(user.id)]


@pytest.mark.asyncio
async def test_sifirlama_kancasi_eposta_gonderiyor(monkeypatch: pytest.MonkeyPatch) -> None:
    """Kancanın boş olduğu hâl tam olarak buydu: token üretiliyor, hiçbir şey
    gönderilmiyordu."""
    from overload_api.core.security import UserManager

    sent: list[tuple[str, str, str]] = []

    async def _send(to: str, subject: str, body: str) -> None:
        sent.append((to, subject, body))

    monkeypatch.setattr(email, "send", _send)

    manager = UserManager.__new__(UserManager)
    user = type("U", (), {"id": uuid.uuid4(), "email": "a@b.test"})()

    await UserManager.on_after_forgot_password(manager, user, "tok3n")  # type: ignore[arg-type]

    assert len(sent) == 1
    assert sent[0][0] == "a@b.test"
    assert "tok3n" in sent[0][2]
