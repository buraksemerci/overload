"""FastAPI uygulaması.

Router'lar özellik bazlı klasörlerden toplanır (bölüm 6.3: MVC değil, feature-based).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi_users import schemas

from overload_api.config import get_settings
from overload_api.core.security import auth_backend, fastapi_users
from overload_api.db.session import dispose_engine
from overload_api.features.chat.router import router as chat_router

settings = get_settings()
logging.basicConfig(level=settings.log_level)


# --- Kullanıcı şemaları ------------------------------------------------------


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str | None = None
    timezone: str = "Europe/Istanbul"


class UserCreate(schemas.BaseUserCreate):
    display_name: str | None = None


class UserUpdate(schemas.BaseUserUpdate):
    display_name: str | None = None
    timezone: str | None = None


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
app.include_router(
    fastapi_users.get_auth_router(auth_backend), prefix="/auth/jwt", tags=["auth"]
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate), prefix="/auth", tags=["auth"]
)
app.include_router(
    fastapi_users.get_reset_password_router(), prefix="/auth", tags=["auth"]
)
# Hesap ayarları (bölüm 4.3'ün sabit sınırı): SADECE buradan değişir.
# AI'nın bu endpoint'lere karşılık gelen bir tool'u yok.
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/users", tags=["account"]
)

# --- Özellik router'ları -----------------------------------------------------
app.include_router(chat_router)
