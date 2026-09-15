"""Beslenme günlüğü: düzeltme ve sık kullanılan besinler.

İki uç da "profesyonel beslenme uygulaması" hissinin teknik karşılığı.
Grafikler değil, günlük kullanımdaki sürtünmeyi kaldıran şeyler:
kaydettiğin kalemi düzeltebilmek ve her sabah aynı yemeği baştan aramamak.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from httpx import AsyncClient
from tests.conftest import requires_db

pytestmark = requires_db


async def _food(name: str, calories: str = "200") -> str:
    """Önbelleğe bir besin yazar, kimliğini döndürür."""
    from overload_api.db.models.nutrition import FoodDatabaseEntry, FoodSource
    from overload_api.db.session import session_scope

    food_id = uuid.uuid4()
    async with session_scope(assume_app_role=False) as session:
        session.add(
            FoodDatabaseEntry(
                id=food_id,
                source=FoodSource.usda,
                external_id=str(uuid.uuid4().int % 10**9),
                name=name,
                search_name=name.lower(),
                source_dataset="Foundation",
                calories_per_100g=Decimal(calories),
                protein_g=Decimal("20"),
                carbs_g=Decimal("10"),
                fat_g=Decimal("5"),
            )
        )
    return str(food_id)


class TestEditingALoggedItem:
    async def test_quantity_can_be_corrected(self, client: AsyncClient) -> None:
        """Bu uç olmadan düzeltmenin tek yolu silip yeniden eklemekti:
        besini yeniden ara, miktarı yeniden gir. Günlük kullanımda insanları
        besin takibinden vazgeçiren şey tam olarak bu."""
        food = await _food("Tavuk Göğsü", calories="100")
        created = await client.post(
            "/nutrition/log",
            json={"food_database_entry_id": food, "quantity_g": 200, "meal_type": "lunch"},
        )
        assert created.status_code == 201, created.text
        log_id = created.json()["id"]
        assert created.json()["calories"] == "200.00"

        patched = await client.patch(f"/nutrition/log/{log_id}", json={"quantity_g": 250})
        assert patched.status_code == 200, patched.text
        body = patched.json()
        assert body["quantity_g"] == "250.0"
        # Makrolar miktardan TÜRETİLİYOR, kopyalanmıyor: 100 kcal/100g x 250g.
        assert body["calories"] == "250.00"

    async def test_meal_can_be_moved(self, client: AsyncClient) -> None:
        food = await _food("Yulaf")
        log_id = (
            await client.post(
                "/nutrition/log",
                json={"food_database_entry_id": food, "quantity_g": 80, "meal_type": "snack"},
            )
        ).json()["id"]

        patched = await client.patch(f"/nutrition/log/{log_id}", json={"meal_type": "breakfast"})
        assert patched.status_code == 200
        assert patched.json()["meal_type"] == "breakfast"

    async def test_partial_patch_leaves_the_rest_alone(self, client: AsyncClient) -> None:
        food = await _food("Pirinç")
        log_id = (
            await client.post(
                "/nutrition/log",
                json={"food_database_entry_id": food, "quantity_g": 150, "meal_type": "dinner"},
            )
        ).json()["id"]

        body = (await client.patch(f"/nutrition/log/{log_id}", json={"quantity_g": 160})).json()
        assert body["meal_type"] == "dinner"  # dokunulmadı

    async def test_someone_elses_entry_is_not_found(self, client: AsyncClient) -> None:
        response = await client.patch(f"/nutrition/log/{uuid.uuid4()}", json={"quantity_g": 100})
        assert response.status_code == 404

    async def test_zero_quantity_is_refused(self, client: AsyncClient) -> None:
        food = await _food("Zeytinyağı")
        log_id = (
            await client.post(
                "/nutrition/log",
                json={"food_database_entry_id": food, "quantity_g": 10, "meal_type": "lunch"},
            )
        ).json()["id"]
        assert (
            await client.patch(f"/nutrition/log/{log_id}", json={"quantity_g": 0})
        ).status_code == 422


class TestRecentFoods:
    async def test_empty_history_returns_empty(self, client: AsyncClient) -> None:
        assert (await client.get("/nutrition/foods/recent")).json() == []

    async def test_frequency_beats_recency(self, client: AsyncClient) -> None:
        """Her gün yenen yulaf, dün bir kez yenen tatlıdan önce gelmeli.

        Sıralama yalnızca tazeliğe bakarsa listenin başı her gün değişiyor ve
        "tek dokunuşla tekrarla" fikri işlemiyor — kullanıcı alışkanlığını
        listenin başında bulmalı.
        """
        oats = await _food("Yulaf Ezmesi")
        cake = await _food("Kek")

        for _ in range(3):
            await client.post(
                "/nutrition/log",
                json={"food_database_entry_id": oats, "quantity_g": 80, "meal_type": "breakfast"},
            )
        await client.post(
            "/nutrition/log",
            json={"food_database_entry_id": cake, "quantity_g": 120, "meal_type": "snack"},
        )

        rows = (await client.get("/nutrition/foods/recent")).json()
        names = [r["food"]["name"] for r in rows]
        assert names.index("Yulaf Ezmesi") < names.index("Kek")

    async def test_carries_last_quantity_and_meal(self, client: AsyncClient) -> None:
        """Tek dokunuşla tekrar eklemenin anlamlı olması için "ne kadar" ve
        "hangi öğün" bilgisi de gelmeli."""
        food = await _food("Yoğurt")
        await client.post(
            "/nutrition/log",
            json={"food_database_entry_id": food, "quantity_g": 150, "meal_type": "snack"},
        )
        # Daha yeni kayıt farklı miktarla: dönen değer EN SONUNCUSU olmalı.
        await client.post(
            "/nutrition/log",
            json={"food_database_entry_id": food, "quantity_g": 200, "meal_type": "breakfast"},
        )

        row = next(
            r
            for r in (await client.get("/nutrition/foods/recent")).json()
            if r["food"]["name"] == "Yoğurt"
        )
        assert row["times_logged"] == 2
        assert row["last_quantity_g"] == "200.0"
        assert row["last_meal_type"] == "breakfast"

    async def test_each_food_appears_once(self, client: AsyncClient) -> None:
        food = await _food("Yumurta")
        for _ in range(4):
            await client.post(
                "/nutrition/log",
                json={"food_database_entry_id": food, "quantity_g": 60, "meal_type": "breakfast"},
            )
        rows = (await client.get("/nutrition/foods/recent")).json()
        assert [r["food"]["name"] for r in rows].count("Yumurta") == 1
