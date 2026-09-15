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
    "protein": 1003,
    "fat": 1004,
    "carbs": 1005,
    "fiber": 1079,
}

#: Enerji birden fazla numara altında gelebiliyor ve sıra önemli.
#:
#: 1008 "Energy (kcal)" SR Legacy kayıtlarının standardı. Foundation
#: kayıtlarında ise 1008 YOK; enerji yalnızca Atwater faktörleriyle hesaplanmış
#: 2047/2048 altında duruyor. Sadece 1008'e bakmak USDA'nın EN KALİTELİ veri
#: kümesini tamamen eliyordu: "chicken breast" araması, tam aradığımız
#: "Chicken, breast, boneless, skinless, raw" kaydını bulup sessizce atıyordu.
#: 2047 (General Factors) 2048'e tercih ediliyor — daha yaygın ve tutarlı.
_ENERGY_NUTRIENT_IDS = (1008, 2047, 2048)

#: USDA'dan kaç sonuç istenir. Gösterilecek sayıdan fazlası çekiliyor çünkü
#: sonuçların bir kısmı hiç besin değeri taşımıyor ve elenecek.
_USDA_PAGE_SIZE = 25

#: Kullanıcıya kaç aday gösterilir.
SEARCH_RESULT_LIMIT = 8

#: Önbellekten kaç satır çekilip sıralanır. Gösterilecek sayıdan fazla:
#: sıralama Python tarafında yapıldığı için, SQL'in döndürdüğü ilk 8 satır
#: en iyi 8 aday olmayabilir.
_CACHE_SCAN_LIMIT = 50

#: Foundation = USDA'nın özenle derlenmiş temel gıda kümesi (çiğ tavuk göğsü,
#: pirinç, yumurta). SR Legacy işlenmiş/markalı ürünlerle dolu. "chicken breast"
#: yazan biri neredeyse her zaman Foundation kaydını kastediyor.
_FOUNDATION = "Foundation"

#: Suyu alınmış formlar geri plana atılır.
#:
#: Liste bilerek KISA ve tek bir ölçüte dayanıyor: bunlar 100 gram başına
#: besin yoğunluğunu birkaç katına çıkarıyor, yani yanlış seçilmelerinin
#: bedeli en yüksek. "egg" araması "Egg, White, Dried"i (376 kcal) birinci
#: getiriyordu; kullanıcının kastettiği bütün yumurta 148 kcal.
#: Bu bir "işlenmiş gıda" listesi DEĞİL — öyle bir liste açık uçlu olurdu ve
#: sürekli büyürdü. Sadece kurutma/toz haline getirme.
_DEHYDRATED_MARKERS = ("dried", "dehydrated", "powder", "powdered")


def _dec(value: Any, default: str = "0") -> Decimal:
    try:
        return Decimal(str(value if value is not None else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _non_negative(value: Decimal) -> Decimal:
    """Makroları sıfırın altına düşürmez.

    USDA karbonhidratı "farktan" hesaplıyor: 100 - su - protein - yağ - kül.
    Karbonhidratı sıfıra yakın gıdalarda (et, yağ, yumurta) ölçüm yuvarlamaları
    toplamı 100'ü biraz aşabiliyor ve sonuç eksiye düşüyor — ör. çiğ tavuk
    göğsü için -0.428 g. Bu bir bilgi değil, ölçüm artığı.

    Kırpılmazsa `macros_non_negative` kısıtı INSERT'i reddediyor ve arama
    isteği komple hata veriyordu.
    """
    return value if value > 0 else Decimal(0)


async def search_foods(session: AsyncSession, name: str) -> list[FoodDatabaseEntry]:
    """Ada göre besin ADAYLARI döndürür: önbellek -> USDA.

    **Tek sonuç değil liste döndürmesi bilinçli.** Hangi kaydın kastedildiğini
    sezgisel bir kural güvenle bilemiyor: "white rice" sorgusunda USDA'nın ilk
    sırası pirinç UNU (359 kcal), oysa kullanıcı büyük ihtimalle pişmiş pirinci
    (130 kcal) kastediyor. Beslenme takibinde sessizce yanlış besini kaydetmek,
    hiç kaydetmemekten kötü — bu yüzden seçimi kullanıcı yapıyor.
    """
    search = name.strip().lower()
    if not search:
        return []

    tokens = search.split()
    if not tokens:
        return []

    # Her kelime AYRI aranıyor, cümlenin tamamı değil.
    #
    # `ILIKE '%chicken breast%'` görünüşte doğru ama USDA'nın en iyi kayıtları
    # virgüllü: "chicken, breast, boneless, skinless, raw". Aradaki virgül
    # yüzünden bu kalıp eşleşmiyordu; eşleşenler ise tam da geri plana atmak
    # istediğimiz işlenmiş ürünlerdi ("chicken breast tenders, breaded").
    # Önbellek dolu sayıldığı için USDA'ya da gidilmiyordu — yani ilk aramadan
    # sonra sonuçlar kalıcı olarak kötüleşiyordu.
    stmt = select(FoodDatabaseEntry)
    for token in tokens:
        stmt = stmt.where(FoodDatabaseEntry.search_name.ilike(f"%{token}%"))

    cached = list((await session.execute(stmt.limit(_CACHE_SCAN_LIMIT))).scalars().all())
    if cached:
        # Taze sonuçlarla AYNI sıralamadan geçiyor; yoksa aynı sorgu ikinci
        # kez yapıldığında farklı sıra çıkardı.
        cached.sort(key=lambda e: rank_key(e.name, e.source_dataset, tokens))
        return cached[:SEARCH_RESULT_LIMIT]

    candidates = await _fetch_from_usda(search)
    return await _persist_new(session, candidates)


async def resolve_food(session: AsyncSession, name: str) -> FoodDatabaseEntry | None:
    """Tek bir besin döndürür — asistanın kullandığı yol.

    Sohbetin ortasına seçim ekranı koyamadığımız için burada en iyi aday
    seçiliyor. Yanlış eşleşme ihtimali duruyor; bu yüzden ÇAĞIRAN TARAF
    eşleşen kaydın adını kullanıcıya geri söylemeli (bkz. `executors._log_food`),
    yoksa kullanıcı neyin kaydedildiğini göremez.
    """
    candidates = await search_foods(session, name)
    return candidates[0] if candidates else None


async def _persist_new(
    session: AsyncSession, candidates: list[FoodDatabaseEntry]
) -> list[FoodDatabaseEntry]:
    """Önbellekte olmayanları yazar, olanları mevcut satırla değiştirir.

    `uq_food_source_external` kısıtı aynı dış kaydın iki kez yazılmasını
    engelliyor; bu kontrol olmadan ikinci arama IntegrityError'a düşerdi.
    """
    if not candidates:
        return []

    external_ids = [c.external_id for c in candidates if c.external_id]
    existing = {
        row.external_id: row
        for row in (
            (
                await session.execute(
                    select(FoodDatabaseEntry).where(
                        FoodDatabaseEntry.source == FoodSource.usda,
                        FoodDatabaseEntry.external_id.in_(external_ids),
                    )
                )
            )
            .scalars()
            .all()
        )
    }

    result: list[FoodDatabaseEntry] = []
    for candidate in candidates:
        found = existing.get(candidate.external_id)
        if found is not None:
            result.append(found)
        else:
            session.add(candidate)
            result.append(candidate)

    await session.flush()
    return result


def _energy_of(food: dict[str, Any]) -> Decimal | None:
    """Enerjiyi bilinen numaralardan ilk bulduğuyla döndürür."""
    values = {n.get("nutrientId"): n.get("value") for n in food.get("foodNutrients", [])}
    for nutrient_id in _ENERGY_NUTRIENT_IDS:
        value = values.get(nutrient_id)
        if value is not None:
            return _dec(value)
    return None


def rank_key(name: str, dataset: str | None, tokens: list[str]) -> tuple[int, int, int, int, int]:
    """Sıralama anahtarı — küçük olan önce.

    USDA açıklamaları temel gıdayla BAŞLIYOR: "Rice, white, long grain, raw"
    ama "Flour, rice, white". İlk bölüm ("head") sorgudaki bir kelimeyi
    içeriyorsa aranan şeyin kendisidir; içermiyorsa ondan türetilmiş başka bir
    üründür. "white rice" sorgusunda pirinç ununu geri plana atan kural bu.

    **Taze ve önbellekli sonuçlar aynı fonksiyondan geçiyor.** Ayrı sıralama
    mantıkları olsaydı arama, aynı sorgu ikinci kez yapıldığında farklı (ve
    daha kötü) sonuç verirdi.
    """
    lowered = name.lower()
    head = lowered.split(",")[0]

    missing = sum(1 for t in tokens if t not in lowered)
    head_miss = 0 if any(t in head for t in tokens) else 1
    dehydrated = 1 if any(m in lowered for m in _DEHYDRATED_MARKERS) else 0
    not_foundation = 0 if dataset == _FOUNDATION else 1
    qualifiers = lowered.count(",")
    return (missing, head_miss, dehydrated, not_foundation, qualifiers)


def _rank(food: dict[str, Any], tokens: list[str]) -> tuple[int, int, int, int, int]:
    """USDA'nın ham arama sonucu için `rank_key` sarmalayıcısı."""
    return rank_key(str(food.get("description", "")), str(food.get("dataType") or ""), tokens)


def _build_entry(food: dict[str, Any], calories: Decimal) -> FoodDatabaseEntry:
    macros: dict[str, Decimal] = {}
    for nutrient in food.get("foodNutrients", []):
        for key, nid in _USDA_NUTRIENT_IDS.items():
            if nutrient.get("nutrientId") == nid:
                macros[key] = _dec(nutrient.get("value"))

    name = str(food.get("description", "")).title()
    return FoodDatabaseEntry(
        source=FoodSource.usda,
        external_id=str(food.get("fdcId")),
        name=name,
        search_name=name.lower(),
        source_dataset=str(food.get("dataType") or "") or None,
        calories_per_100g=_non_negative(calories),
        protein_g=_non_negative(macros.get("protein", Decimal(0))),
        carbs_g=_non_negative(macros.get("carbs", Decimal(0))),
        fat_g=_non_negative(macros.get("fat", Decimal(0))),
        fiber_g=None if (fiber := macros.get("fiber")) is None else _non_negative(fiber),
    )


async def _fetch_from_usda(query: str) -> list[FoodDatabaseEntry]:
    settings = get_settings()
    if settings.usda_api_key is None:
        logger.warning("USDA_API_KEY yok — besin araması yapılamıyor (%s)", query)
        return []

    # Hepsi string: httpx karışık tipli sözlükleri kabul ediyor ama tip
    # denetleyicisi için tek tip daha net ve URL'de zaten string'e çevrilecekler.
    params: dict[str, str] = {
        "api_key": settings.usda_api_key.get_secret_value(),
        "query": query,
        "pageSize": str(_USDA_PAGE_SIZE),
        # Foundation/SR Legacy en güvenilir temel gıda verisi; Branded gürültülü.
        "dataType": "Foundation,SR Legacy",
        # `format=full` ŞART. Varsayılan (abridged) cevapta Foundation
        # kayıtlarının besin değerleri HİÇ gelmiyor — alan boş değil, yok.
        # Bu parametre olmadan arama, bulduğu en iyi kayıtları besin değeri
        # taşımadıkları için eliyor ve "sonuç yok" diyordu.
        "format": "full",
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(USDA_SEARCH_URL, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        logger.warning("USDA isteği başarısız (%s): %s", query, exc)
        return []

    tokens = [t for t in query.split() if t]
    scored: list[tuple[tuple[int, int, int, int, int], int, dict[str, Any], Decimal]] = []
    for order, food in enumerate(data.get("foods") or []):
        calories = _energy_of(food)
        # Enerjisi hiç olmayan kayıtlar gerçekten boş (ör. bazı lunchmeat
        # satırları); makro hesabı yapılamaz, gösterilmeleri anlamsız.
        if calories is None:
            continue
        scored.append((_rank(food, tokens), order, food, calories))

    scored.sort(key=lambda row: (row[0], row[1]))
    return [_build_entry(food, calories) for _, _, food, calories in scored[:SEARCH_RESULT_LIMIT]]


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
        # Aynı kırpma burada da gerekli: Open Food Facts verisi kullanıcı
        # katkısıyla oluşuyor, hatalı/negatif değer gelme ihtimali USDA'dan
        # daha yüksek.
        calories_per_100g=_non_negative(_dec(calories)),
        protein_g=_non_negative(_dec(nutriments.get("proteins_100g"))),
        carbs_g=_non_negative(_dec(nutriments.get("carbohydrates_100g"))),
        fat_g=_non_negative(_dec(nutriments.get("fat_100g"))),
        fiber_g=(
            _non_negative(_dec(nutriments.get("fiber_100g")))
            if "fiber_100g" in nutriments
            else None
        ),
    )
    session.add(entry)
    await session.flush()
    return entry
