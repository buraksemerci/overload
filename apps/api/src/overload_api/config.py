"""Ortam yapılandırması.

Tek kaynak: `.env` dosyası (apps/api/.env). Kökteki `.env.example` şablon.
Ayarlar süreç başında bir kez okunur ve `get_settings()` ile paylaşılır.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

#: Varsayılan sır. Üretimde bu değerle açılış DURDURULUYOR: değer depoda
#: yazılı, yani herkes kendine geçerli bir oturum jetonu üretebilir.
_DEFAULT_JWT_SECRET = "dev-only-insecure-secret-change-me"  # noqa: S105 - sır değil, tuzak


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
    jwt_secret: SecretStr = SecretStr(_DEFAULT_JWT_SECRET)
    jwt_lifetime_seconds: int = 604_800  # 7 gün

    # --- Anthropic ---
    anthropic_api_key: SecretStr | None = None
    # Model katmanları. Not: SDK tarih ekli kimlikleri kabul etmez — "claude-haiku-4-5"
    # doğru biçim, "claude-haiku-4-5-20251001" değil.
    anthropic_model_fast: str = "claude-haiku-4-5"  # foto/metin ayrıştırma, yüksek hacim
    anthropic_model_smart: str = "claude-sonnet-5"  # sohbet, koç raporu
    anthropic_max_tool_iterations: int = 8  # sonsuz tool döngüsüne karşı tavan

    # --- Kullanıcı başına günlük AI bütçesi ---
    # Fatura kullanıma göre çıkıyor ve uygulama birkaç kişiye açılınca o fatura
    # başkalarının eline geçiyor. İki sınır farklı şeyleri kesiyor: istek sayısı
    # hızlı döngüyü, token sayısı tek seferde devasa bağlam gönderen çağrıyı.
    #
    # Değerler normal bir günü rahatça geçirecek kadar yüksek: günde 60 asistan
    # turu, on binlerce token. Sınıra takılan biri ya bir şeyi otomatikleştirmiş
    # ya da bir döngüye girmiş demektir.
    ai_daily_request_limit: int = 60
    ai_daily_token_limit: int = 300_000

    # --- Cloudflare R2 ---
    r2_access_key_id: SecretStr | None = None
    r2_secret_access_key: SecretStr | None = None
    r2_bucket_name: str = "overload-media"
    r2_endpoint: str | None = None

    # --- Besin veritabanları ---
    usda_api_key: SecretStr | None = None
    off_user_agent: str = "overload/0.1 (github.com/kabese/overload)"

    # --- E-posta ---
    # `smtp_host` tanımlandığı anda gerçek gönderim devreye giriyor; ayrı bir
    # "açık/kapalı" ayarı YOK çünkü iki ayarın çelişmesi (host var ama kapalı)
    # hata ayıklaması en zor durumlardan biri. Tanımsızken mesajlar günlüğe
    # yazılıyor ve geliştirmede akışın tamamı SMTP kurmadan denenebiliyor.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = True
    email_from: str = "overload <noreply@localhost>"

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

    @field_validator(
        "anthropic_api_key",
        "usda_api_key",
        "r2_access_key_id",
        "r2_secret_access_key",
        "smtp_password",
        mode="before",
    )
    @classmethod
    def _blank_secret_is_absent(cls, v: object) -> object:
        """Boş `.env` satırı "anahtar yok" demektir, "anahtar boş dize" değil.

        `.env.example`'daki alanlar `ANTHROPIC_API_KEY=` biçiminde boş duruyor.
        Pydantic bunu `SecretStr("")` olarak okuyordu — `None` değil. Sonuç:
        `require_anthropic_key()` içindeki açıklayıcı Türkçe uyarı HİÇ
        tetiklenmiyor, istemci boş anahtarla kuruluyor ve kullanıcı sohbet
        ekranında SDK'nın ham İngilizce mesajını görüyordu:
        "Could not resolve authentication method...".
        """
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def ai_enabled(self) -> bool:
        return self.anthropic_api_key is not None

    @property
    def cors_origins(self) -> list[str]:
        if self.is_production:
            return [self.frontend_url]
        return [self.frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"]

    def production_problems(self) -> tuple[list[str], list[str]]:
        """Üretimde kabul edilemez ve dikkat isteyen ayarlar: (hatalar, uyarılar).

        --------------------------------------------------------------------
        NEDEN AÇILIŞTA
        --------------------------------------------------------------------
        Bu ayarların yanlış olması sessiz. Varsayılan JWT sırrıyla ayağa kalkan
        bir sunucu kusursuz çalışıyor gibi görünüyor — ta ki birisi depodaki
        `.env.example` dosyasını okuyup kendine jeton üretene kadar. Sessiz bir
        güvenlik açığını gürültülü bir açılış hatasına çevirmek, bu kontrolün
        tek işi.

        HATALAR açılışı durduruyor, UYARILAR yalnızca günlüğe yazılıyor:
        e-posta ya da AI olmadan uygulama çalışmaya devam ediyor, ama
        varsayılan bir sırla çalışmamalı.
        """
        errors: list[str] = []
        warnings: list[str] = []

        if self.jwt_secret.get_secret_value() == _DEFAULT_JWT_SECRET:
            errors.append(
                "JWT_SECRET varsayılan değerde. Bu değer depoda yazılı: "
                "herkes kendine geçerli bir oturum jetonu üretebilir. "
                "`python -c \"import secrets; print(secrets.token_urlsafe(48))\"` "
                "ile yeni bir tane üret."
            )

        if "localhost" in self.frontend_url or "127.0.0.1" in self.frontend_url:
            errors.append(
                f"FRONTEND_URL yerel bir adres ({self.frontend_url}). Üretimde "
                "CORS yalnızca bu adresi kabul ediyor; tarayıcı bütün istekleri "
                "engeller."
            )

        if "localhost" in self.database_url or "127.0.0.1" in self.database_url:
            warnings.append(
                "DATABASE_URL yerel bir adrese işaret ediyor. Konteyner ağı "
                "içinde doğru olabilir; değilse veritabanı bulunamaz."
            )

        if self.smtp_host is None:
            warnings.append(
                "SMTP_HOST tanımlı değil: parola sıfırlama ve doğrulama "
                "e-postaları GÖNDERİLMİYOR, yalnızca günlüğe yazılıyor. "
                "Parolasını unutan kullanıcı hesabına giremez."
            )

        if self.anthropic_api_key is None:
            warnings.append("ANTHROPIC_API_KEY tanımlı değil: asistan kapalı.")

        return errors, warnings

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
