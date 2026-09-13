"""Gerçek besin veritabanları: USDA FoodData Central + Open Food Facts.

Akış: **önce yerel önbellek**, yoksa dış API, sonuç önbelleğe yazılır.

Önbellek (`food_database_entry`) kullanıcıya ait değil — herkes aynı "chicken breast"
satırını paylaşır. Bu hem USDA kotasını korur (ücretsiz katman saatte 1000 istek)
hem de aynı besini her seferinde yeniden çekmeyi önler.

Makrolar **100 gram başına** normalize edilir; iki kaynağın porsiyon tanımları
tutarsız, 100g tek ortak payda.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from overload_api.config import get_settings
from overload_api.db.models.nutrition import FoodDatabaseEntry, FoodSource

logger = logging.getLogger(__name__)

USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
OFF_BARCODE_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

#: USDA besin madde numaraları.
_USDA_NUTRIENT_IDS = {
    "calories": 1008,  # Energy (kcal)
    "protein": 1003,
    "fat": 1004,
    "carbs": 1005,
    "fiber": 1079,
}


def _dec(value: Any, default: str = "0") -> Decimal:
    try:
        return Decimal(str(value if value is not None else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


async def resolve_food(session: AsyncSession, name: str) -> FoodDatabaseEntry | None:
    """Ada göre besin bulur: önbellek -> USDA. Bulamazsa None."""
    search = name.strip().lower()
    if not search:
        return None

    cached = (
        await session.execute(
            select(FoodDatabaseEntry)
            .where(FoodDatabaseEntry.search_name.ilike(f"%{search}%"))
            .order_by(FoodDatabaseEntry.search_name)
            .limit(1)
        )
    ).scalar_one_or_none()
    if cached is not None:
        return cached

    entry = await _fetch_from_usda(search)
    if entry is None:
        return None

    session.add(entry)
    await session.flush()
    return entry


async def _fetch_from_usda(query: str) -> FoodDatabaseEntry | None:
    settings = get_settings()
    if settings.usda_api_key is None:
        logger.warning("USDA_API_KEY yok — besin araması yapılamıyor (%s)", query)
        return None

    params = {
        "api_key": settings.usda_api_key.get_secret_value(),
        "query": query,
        "pageSize": 1,
        # Foundation/SR Legacy en güvenilir temel gıda verisi; Branded gürültülü.
        "dataType": "Foundation,SR Legacy",
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(USDA_SEARCH_URL, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        logger.warning("USDA isteği başarısız (%s): %s", query, exc)
        return None

    foods = data.get("foods") or []
    if not foods:
        return None
    food = foods[0]

    macros: dict[str, Decimal] = {}
    for nutrient in food.get("foodNutrients", []):
        for key, nid in _USDA_NUTRIENT_IDS.items():
            if nutrient.get("nutrientId") == nid:
                macros[key] = _dec(nutrient.get("value"))

    # Kalorisi olmayan kayıt işe yaramaz.
    if "calories" not in macros:
        return None

    name = str(food.get("description", query)).title()
    return FoodDatabaseEntry(
        source=FoodSource.usda,
        external_id=str(food.get("fdcId")),
        name=name,
        search_name=name.lower(),
        calories_per_100g=macros["calories"],
        protein_g=macros.get("protein", Decimal(0)),
        carbs_g=macros.get("carbs", Decimal(0)),
        fat_g=macros.get("fat", Decimal(0)),
        fiber_g=macros.get("fiber"),
    )


async def resolve_barcode(session: AsyncSession, barcode: str) -> FoodDatabaseEntry | None:
    """Barkod okuma (bölüm 4.2). Open Food Facts anahtar istemez ama
    kullanım politikası gereği tanımlayıcı bir User-Agent zorunlu."""
    barcode = barcode.strip()
    if not barcode.isdigit():
        return None

    cached = (
        await session.execute(
            select(FoodDatabaseEntry).where(
                FoodDatabaseEntry.source == FoodSource.open_food_facts,
                FoodDatabaseEntry.external_id == barcode,
            )
        )
    ).scalar_one_or_none()
    if cached is not None:
        return cached

    settings = get_settings()
    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT, headers={"User-Agent": settings.off_user_agent}
        ) as client:
            response = await client.get(OFF_BARCODE_URL.format(barcode=barcode))
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        logger.warning("Open Food Facts isteği başarısız (%s): %s", barcode, exc)
        return None

    if data.get("status") != 1:
        return None

    product = data.get("product", {})
    nutriments = product.get("nutriments", {})
    calories = nutriments.get("energy-kcal_100g")
    if calories is None:
        return None

    name = str(product.get("product_name") or f"Barkod {barcode}")
    entry = FoodDatabaseEntry(
        source=FoodSource.open_food_facts,
        external_id=barcode,
        name=name,
        search_name=name.lower(),
        brand=product.get("brands"),
        calories_per_100g=_dec(calories),
        protein_g=_dec(nutriments.get("proteins_100g")),
        carbs_g=_dec(nutriments.get("carbohydrates_100g")),
        fat_g=_dec(nutriments.get("fat_100g")),
        fiber_g=_dec(nutriments.get("fiber_100g")) if "fiber_100g" in nutriments else None,
    )
    session.add(entry)
    await session.flush()
    return entry
