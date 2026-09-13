"""Ortam yapılandırması.

Tek kaynak: `.env` dosyası (apps/api/.env). Kökteki `.env.example` şablon.
Ayarlar süreç başında bir kez okunur ve `get_settings()` ile paylaşılır.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Ortam ---
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # --- Veritabanı ---
    # Uygulama async sürücü (asyncpg), Alembic senkron sürücü (psycopg) kullanır.
    database_url: str = Field(
        default="postgresql+asyncpg://overload:overload@localhost:5432/overload"
    )
    database_url_sync: str = Field(
        default="postgresql+psycopg://overload:overload@localhost:5432/overload"
    )

    # --- Auth ---
    jwt_secret: SecretStr = SecretStr("dev-only-insecure-secret-change-me")
    jwt_lifetime_seconds: int = 604_800  # 7 gün

    # --- Anthropic ---
    anthropic_api_key: SecretStr | None = None
    # Model katmanları. Not: SDK tarih ekli kimlikleri kabul etmez — "claude-haiku-4-5"
    # doğru biçim, "claude-haiku-4-5-20251001" değil.
    anthropic_model_fast: str = "claude-haiku-4-5"      # foto/metin ayrıştırma, yüksek hacim
    anthropic_model_smart: str = "claude-sonnet-5"      # sohbet, koç raporu
    anthropic_max_tool_iterations: int = 8              # sonsuz tool döngüsüne karşı tavan

    # --- Cloudflare R2 ---
    r2_access_key_id: SecretStr | None = None
    r2_secret_access_key: SecretStr | None = None
    r2_bucket_name: str = "overload-media"
    r2_endpoint: str | None = None

    # --- Besin veritabanları ---
    usda_api_key: SecretStr | None = None
    off_user_agent: str = "overload/0.1 (github.com/kabese/overload)"

    # --- URL'ler ---
    frontend_url: str = "http://localhost:3000"

    @field_validator("database_url")
    @classmethod
    def _require_async_driver(cls, v: str) -> str:
        """asyncpg olmadan uygulama sessizce senkron sürücüye düşer ve event loop'u bloklar."""
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL 'postgresql+asyncpg://' ile başlamalı. "
                f"Alınan: {v.split('://')[0] if '://' in v else v!r}"
            )
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cors_origins(self) -> list[str]:
        if self.is_production:
            return [self.frontend_url]
        return [self.frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"]

    def require_anthropic_key(self) -> str:
        if self.anthropic_api_key is None:
            raise RuntimeError(
                "ANTHROPIC_API_KEY tanımlı değil — AI özellikleri kullanılamaz. "
                "console.anthropic.com'dan anahtar alıp .env'e ekle."
            )
        return self.anthropic_api_key.get_secret_value()


@lru_cache
def get_settings() -> Settings:
    return Settings()
