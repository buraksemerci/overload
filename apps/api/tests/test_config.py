"""Ortam yapılandırmasının sınır davranışları."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from overload_api.config import Settings


def _settings(**overrides: str) -> Settings:
    """`.env` dosyasını devre dışı bırakıp yalnızca verilen değerlerle kurar."""
    return Settings(_env_file=None, **overrides)  # type: ignore[call-arg]


class TestBlankSecretsAreAbsent:
    """Boş bir `.env` satırı "anahtar yok" demektir, "anahtar boş dize" değil.

    Ayrım önemliydi: `SecretStr("")` üretildiğinde `require_anthropic_key()`
    içindeki açıklayıcı uyarı hiç tetiklenmiyor, istemci boş anahtarla kuruluyor
    ve kullanıcı sohbet ekranında SDK'nın ham İngilizce hatasını görüyordu.
    """

    @pytest.mark.parametrize("blank", ["", "   ", "\t"])
    def test_blank_anthropic_key_becomes_none(self, blank: str) -> None:
        settings = _settings(anthropic_api_key=blank)
        assert settings.anthropic_api_key is None
        assert settings.ai_enabled is False

    def test_blank_values_for_every_optional_secret(self) -> None:
        settings = _settings(
            anthropic_api_key="",
            usda_api_key="",
            r2_access_key_id="",
            r2_secret_access_key="",
        )
        assert settings.anthropic_api_key is None
        assert settings.usda_api_key is None
        assert settings.r2_access_key_id is None
        assert settings.r2_secret_access_key is None

    def test_a_real_key_survives(self) -> None:
        settings = _settings(anthropic_api_key="sk-ant-example")
        assert settings.ai_enabled is True
        assert settings.require_anthropic_key() == "sk-ant-example"

    def test_missing_key_raises_an_actionable_message(self) -> None:
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
            _settings(anthropic_api_key="").require_anthropic_key()


class TestDatabaseUrl:
    def test_sync_driver_is_refused(self) -> None:
        """asyncpg olmadan uygulama event loop'u bloklar; erken patlaması iyi."""
        with pytest.raises(ValidationError, match="asyncpg"):
            _settings(database_url="postgresql://overload:overload@localhost/overload")


class TestProductionChecks:
    """Üretimde kabul edilemez ayarlar açılışı DURDURUYOR.

    Bu ayarların yanlış olması sessiz: varsayılan JWT sırrıyla ayağa kalkan
    bir sunucu kusursuz çalışıyor gibi görünüyor — ta ki birisi depodaki
    `.env.example`ı okuyup kendine jeton üretene kadar.
    """

    def _settings(self, **overrides: object):  # type: ignore[no-untyped-def]
        from overload_api.config import Settings

        base: dict[str, object] = {
            "environment": "production",
            "jwt_secret": "gercekten-rastgele-bir-sir-xyz",
            "frontend_url": "https://overload.example.org",
            "database_url": "postgresql+asyncpg://u:p@db.ornek.net:5432/overload",
            "smtp_host": "smtp.ornek.net",
            "anthropic_api_key": "sk-test",
        }
        base.update(overrides)
        return Settings(**base)  # type: ignore[arg-type]

    def test_dogru_yapilandirmada_hata_yok(self) -> None:
        errors, _ = self._settings().production_problems()
        assert errors == []

    def test_varsayilan_jwt_sirri_hata(self) -> None:
        from overload_api.config import _DEFAULT_JWT_SECRET

        errors, _ = self._settings(jwt_secret=_DEFAULT_JWT_SECRET).production_problems()
        # Değer depoda yazılı: herkes kendine geçerli bir jeton üretebilir.
        assert any("JWT_SECRET" in problem for problem in errors)

    def test_yerel_frontend_adresi_hata(self) -> None:
        errors, _ = self._settings(frontend_url="http://localhost:3000").production_problems()
        # CORS yalnızca bu adresi kabul ediyor; tarayıcı her isteği engeller.
        assert any("FRONTEND_URL" in problem for problem in errors)

    def test_smtp_eksikligi_uyari_hata_degil(self) -> None:
        errors, warnings = self._settings(smtp_host=None).production_problems()
        # E-posta olmadan uygulama çalışmaya devam ediyor; varsayılan bir
        # sırla çalışmamalı. Ayrım tam olarak bu.
        assert errors == []
        assert any("SMTP_HOST" in problem for problem in warnings)

    def test_ai_anahtari_eksikligi_uyari(self) -> None:
        errors, warnings = self._settings(anthropic_api_key=None).production_problems()
        assert errors == []
        assert any("ANTHROPIC_API_KEY" in problem for problem in warnings)
