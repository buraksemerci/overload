"""Besin arama uçlarının HTTP seviyesinde testleri.

Önbellek önceden doldurularak koşuyor: böylece testler USDA'ya ağ isteği
yapmıyor ve dış servisin durumuna bağlı kalmıyor.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from httpx import AsyncClient
from tests.conftest import requires_db

pytestmark = requires_db


async def _cache(*rows: tuple[str, str, str]) -> None:
    """(ad, veri kümesi, kalori) üçlülerini besin önbelleğine yazar."""
    from overload_api.db.models.nutrition import FoodDatabaseEntry, FoodSource
    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        for name, dataset, calories in rows:
            session.add(
                FoodDatabaseEntry(
                    source=FoodSource.usda,
                    external_id=str(uuid.uuid4().int % 10**9),
                    name=name,
                    search_name=name.lower(),
                    source_dataset=dataset,
                    calories_per_100g=Decimal(calories),
                    protein_g=Decimal(0),
                    carbs_g=Decimal(0),
                    fat_g=Decimal(0),
                )
            )


async def _clear() -> None:
    import sqlalchemy as sa

    from overload_api.db.session import session_scope

    async with session_scope(assume_app_role=False) as session:
        await session.execute(sa.text("DELETE FROM food_database_entry"))


class TestFoodSearch:
    async def test_finds_a_comma_separated_name(self, client: AsyncClient) -> None:
        """USDA'nın en iyi kayıtları virgüllü: "Chicken, breast, boneless...".

        Önbellek sorgusu cümlenin tamamını (`%chicken breast%`) arıyordu ve
        aradaki virgül yüzünden tam da istenen kayıtları ıskalıyordu; geriye
        yalnızca "Chicken breast tenders, breaded" gibi işlenmiş ürünler
        kalıyordu. Üstelik önbellek dolu sayıldığı için USDA'ya da
        gidilmiyordu — arama ilk sorgudan sonra kalıcı olarak bozuluyordu.
        """
        await _clear()
        await _cache(
            ("Chicken, Breast, Boneless, Skinless, Raw", "Foundation", "106"),
            ("Chicken Breast Tenders, Breaded, Uncooked", "SR Legacy", "263"),
        )

        response = await client.get("/foods/search", params={"q": "chicken breast"})
        assert response.status_code == 200, response.text

        names = [row["name"] for row in response.json()]
        assert "Chicken, Breast, Boneless, Skinless, Raw" in names

    async def test_foundation_entry_comes_first(self, client: AsyncClient) -> None:
        """Foundation temel gıda kümesi; "chicken breast" yazan onu kastediyor."""
        await _clear()
        await _cache(
            ("Chicken Breast Tenders, Breaded, Uncooked", "SR Legacy", "263"),
            ("Chicken, Breast, Boneless, Skinless, Raw", "Foundation", "106"),
        )

        rows = (await client.get("/foods/search", params={"q": "chicken breast"})).json()
        assert rows[0]["name"] == "Chicken, Breast, Boneless, Skinless, Raw"

    async def test_returns_several_candidates(self, client: AsyncClient) -> None:
        """Tek sonuç döndürmek yanlış besini sessizce kaydettiriyordu."""
        await _clear()
        await _cache(
            ("Rice, White, Long Grain, Unenriched, Raw", "Foundation", "359"),
            ("Rice Flour, White, Unenriched", "SR Legacy", "366"),
            ("Rice, White, Steamed, Chinese Restaurant", "SR Legacy", "151"),
        )

        rows = (await client.get("/foods/search", params={"q": "white rice"})).json()
        assert len(rows) >= 3
        # Temel gıda, ondan türetilmiş unun önünde.
        names = [r["name"] for r in rows]
        assert names.index("Rice, White, Long Grain, Unenriched, Raw") < names.index(
            "Rice Flour, White, Unenriched"
        )

    async def test_unknown_food_returns_an_empty_list(self, client: AsyncClient) -> None:
        """Ağ isteğine düşse bile 200 + boş liste dönmeli, hata değil."""
        await _clear()
        await _cache(("Chicken, Breast, Raw", "Foundation", "106"))

        response = await client.get("/foods/search", params={"q": "chicken"})
        assert response.status_code == 200
        assert isinstance(response.json(), list)
