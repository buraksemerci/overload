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
