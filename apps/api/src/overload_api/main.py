"""FastAPI uygulaması.

Router'lar özellik bazlı klasörlerden toplanır (bölüm 6.3: MVC değil, feature-based).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_users import schemas
from pydantic import BaseModel, Field

from overload_api.config import get_settings
from overload_api.core.security import auth_backend, fastapi_users
from overload_api.db.models.user import ActivityLevel, Sex
from overload_api.db.session import dispose_engine
from overload_api.features.body.router import router as body_router
from overload_api.features.chat.router import router as chat_router
from overload_api.features.coach.router import router as coach_router
from overload_api.features.media.router import router as media_router
from overload_api.features.nutrition.router import router as nutrition_router
from overload_api.features.programs.router import router as programs_router
from overload_api.features.progress.router import router as progress_router
from overload_api.features.workouts.router import router as workouts_router

settings = get_settings()
logging.basicConfig(level=settings.log_level)


# --- Kullanıcı şemaları ------------------------------------------------------


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str | None = None
    timezone: str = "Europe/Istanbul"
    # TDEE ve güç standartları bu üç alana bağlı; olmadan hesap yapılamıyor.
    birth_date: date | None = None
    sex: Sex = Sex.unspecified
    height_cm: int | None = None
    activity_level: ActivityLevel = ActivityLevel.moderate


class UserCreate(schemas.BaseUserCreate):
    display_name: str | None = None


class UserUpdate(schemas.BaseUserUpdate):
    """Hesap ayarları — AI'nın erişemediği bölge (Bölüm 4.3'ün sabit sınırı).

    Bu alanları değiştiren tek yol bu endpoint; karşılık gelen bir AI tool'u
    yok ve olmayacak.
    """

    display_name: str | None = None
    timezone: str | None = None
    birth_date: date | None = None
    sex: Sex | None = None
    height_cm: int | None = Field(default=None, ge=80, le=260)
    activity_level: ActivityLevel | None = None


class Health(BaseModel):
    status: str
    environment: str
    version: str


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


app = FastAPI(
    title="overload API",
    description="Progresif overload merkezli antrenman, beslenme ve sağlık takip sistemi.",
    version="0.1.0",
    lifespan=lifespan,
    # OpenAPI şeması frontend'in TypeScript tiplerini üretir (bölüm 6.1,
    # "tip güvenliği köprüsü"): pnpm gen:types
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=Health, tags=["meta"])
async def health() -> Health:
    return Health(status="ok", environment=settings.environment, version=app.version)


# --- Kimlik doğrulama --------------------------------------------------------
app.include_router(fastapi_users.get_auth_router(auth_backend), prefix="/auth/jwt", tags=["auth"])
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate), prefix="/auth", tags=["auth"]
)
app.include_router(fastapi_users.get_reset_password_router(), prefix="/auth", tags=["auth"])
# Hesap ayarları (bölüm 4.3'ün sabit sınırı): SADECE buradan değişir.
# AI'nın bu endpoint'lere karşılık gelen bir tool'u yok.
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/users", tags=["account"]
)

# --- Özellik router'ları -----------------------------------------------------
app.include_router(programs_router)
app.include_router(workouts_router)
app.include_router(progress_router)
app.include_router(nutrition_router)
app.include_router(body_router)
app.include_router(coach_router)
app.include_router(media_router)
app.include_router(chat_router)
