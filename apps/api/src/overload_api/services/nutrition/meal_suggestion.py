"""Kalan makrolara göre öğün önerisi (Bölüm 4.2).

--------------------------------------------------------------------------------
NEDEN AI DEĞİL
--------------------------------------------------------------------------------
Bu iş deterministik: elimizde gerçek makro değerleri olan bir besin listesi ve
doldurulması gereken bir makro açığı var. Bir dil modeline sormak hem para ve
gecikme harcar hem de **daha kötü** sonuç verir — model porsiyon aritmetiğini
yaklaşık yapar, biz tam yapabiliriz.

AI'nın burada yeri var ama farklı bir yerde: kullanıcı "canım tatlı istiyor"
gibi bir şey söylediğinde asistan bu endpoint'i çağırıp sonucu yorumlayabilir.

--------------------------------------------------------------------------------
ALGORİTMA
--------------------------------------------------------------------------------
Öğün üç rolden oluşur: protein kaynağı, karbonhidrat kaynağı, yağ kaynağı.
Her besin makro dağılımına göre bir role atanır (hangi makro kalorisinin en
büyük payını oluşturuyorsa o rol).

1. Kalan proteini karşılayacak protein kaynağının gramajı hesaplanır.
2. O porsiyonun getirdiği karbonhidrat/yağ düşülür.
3. Kalan karbonhidrat için karbonhidrat kaynağının gramajı hesaplanır.
4. Kalan yağ için yağ kaynağının gramajı hesaplanır.
5. Porsiyonlar gerçekçi sınırlara kırpılır (kimse 900 g pirinç yemiyor).

Sonuç birden çok kombinasyon olarak döndürülür; kullanıcı beğendiğini seçer.

Saf modül — veritabanı bağımlılığı yok, test edilebilir.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from typing import Literal

#: Porsiyon sınırları (gram). Alt sınır "bunu ölçmeye değmez", üst sınır
#: "bunu tek öğünde kimse yemez" demek.
MIN_PORTION_G = Decimal(20)
MAX_PORTION_G = Decimal(400)

#: Bir makronun "baskın" sayılması için kalorisinin toplam içindeki asgari payı.
DOMINANCE_THRESHOLD = Decimal("0.40")

#: Kalan makro bu değerin altındaysa o rol için kaynak eklenmez.
NEGLIGIBLE_G = Decimal(5)


class FoodRole(StrEnum):
    protein = "protein"
    carb = "carb"
    fat = "fat"
    mixed = "mixed"


@dataclass(frozen=True, slots=True)
class FoodOption:
    """Öneriye girebilecek bir besin. 100 gram başına makrolar."""

    id: str
    name: str
    calories_per_100g: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal

    @property
    def role(self) -> FoodRole:
        """Kalorisinin en büyük payını hangi makro oluşturuyor."""
        protein_kcal = self.protein_g * 4
        carb_kcal = self.carbs_g * 4
        fat_kcal = self.fat_g * 9
        total = protein_kcal + carb_kcal + fat_kcal
        if total <= 0:
            return FoodRole.mixed

        shares = {
            FoodRole.protein: protein_kcal / total,
            FoodRole.carb: carb_kcal / total,
            FoodRole.fat: fat_kcal / total,
        }
        best_role, best_share = max(shares.items(), key=lambda kv: kv[1])
        return best_role if best_share >= DOMINANCE_THRESHOLD else FoodRole.mixed


@dataclass(frozen=True, slots=True)
class SuggestedItem:
    food_id: str
    name: str
    quantity_g: int
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int


@dataclass(frozen=True, slots=True)
class MealSuggestion:
    items: list[SuggestedItem]
    total_calories: int
    total_protein_g: int
    total_carbs_g: int
    total_fat_g: int
    #: Hedefe ne kadar yaklaştı (0.0-1.0). Sıralama için.
    fit_score: float


@dataclass(frozen=True, slots=True)
class Remaining:
    calories: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal


def _round_int(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _portion_for(
    food: FoodOption, target_g: Decimal, macro: Literal["protein", "carbs", "fat"]
) -> Decimal | None:
    """Verilen makrodan `target_g` kadar sağlayacak porsiyon (gram).

    `getattr` yerine açık eşleme: dinamik nitelik erişimi tip bilgisini
    kaybettiriyor ve yazım hatası ancak çalışma zamanında ortaya çıkıyor.
    """
    per_100 = {
        "protein": food.protein_g,
        "carbs": food.carbs_g,
        "fat": food.fat_g,
    }[macro]
    if per_100 <= 0:
        return None
    grams = target_g * 100 / per_100
    if grams < MIN_PORTION_G:
        return None
    return min(grams, MAX_PORTION_G)


def _item(food: FoodOption, grams: Decimal) -> SuggestedItem:
    factor = grams / 100
    return SuggestedItem(
        food_id=food.id,
        name=food.name,
        # 5 gramın katlarına yuvarla — "137 g tavuk" tartıda saçma, "135 g" değil.
        quantity_g=_round_int(grams / 5) * 5,
        calories=_round_int(food.calories_per_100g * factor),
        protein_g=_round_int(food.protein_g * factor),
        carbs_g=_round_int(food.carbs_g * factor),
        fat_g=_round_int(food.fat_g * factor),
    )


def _score(items: list[SuggestedItem], remaining: Remaining) -> float:
    """Hedefe yakınlık. 1.0 = tam isabet, 0.0 = tamamen ıska.

    Üç makronun bağıl hatasının ortalaması alınıyor; kalori ayrıca
    ölçülmüyor çünkü zaten makroların türevi.
    """
    totals = {
        "protein": Decimal(sum(i.protein_g for i in items)),
        "carbs": Decimal(sum(i.carbs_g for i in items)),
        "fat": Decimal(sum(i.fat_g for i in items)),
    }
    targets = {
        "protein": remaining.protein_g,
        "carbs": remaining.carbs_g,
        "fat": remaining.fat_g,
    }

    errors: list[Decimal] = []
    for key, target in targets.items():
        if target <= NEGLIGIBLE_G:
            continue  # bu makro zaten dolmuş, hatasını ölçmek anlamsız
        error = abs(totals[key] - target) / target
        errors.append(min(error, Decimal(1)))

    if not errors:
        return 1.0
    return round(float(1 - sum(errors) / len(errors)), 3)


def suggest_meals(
    foods: list[FoodOption], remaining: Remaining, *, limit: int = 3
) -> list[MealSuggestion]:
    """Kalan makroları dolduracak öğün kombinasyonları üretir.

    Hedef zaten dolmuşsa (ya da aşılmışsa) boş liste döner — "daha ne yiyeyim"
    sorusunun cevabı bazen "hiçbir şey".
    """
    if remaining.calories <= 0 or remaining.protein_g <= NEGLIGIBLE_G:
        return []

    by_role: dict[FoodRole, list[FoodOption]] = {role: [] for role in FoodRole}
    for food in foods:
        by_role[food.role].append(food)

    proteins = by_role[FoodRole.protein]
    carbs = by_role[FoodRole.carb] or by_role[FoodRole.mixed]
    fats = by_role[FoodRole.fat]

    if not proteins:
        return []

    suggestions: list[MealSuggestion] = []

    for protein_food in proteins[:6]:
        portion = _portion_for(protein_food, remaining.protein_g, "protein")
        if portion is None:
            continue

        items = [_item(protein_food, portion)]

        # Protein kaynağının getirdiklerini düş, kalanı diğer rollere dağıt.
        carb_deficit = remaining.carbs_g - Decimal(items[0].carbs_g)
        fat_deficit = remaining.fat_g - Decimal(items[0].fat_g)

        if carb_deficit > NEGLIGIBLE_G and carbs:
            carb_food = carbs[0]
            carb_portion = _portion_for(carb_food, carb_deficit, "carbs")
            if carb_portion is not None:
                items.append(_item(carb_food, carb_portion))
                fat_deficit -= Decimal(items[-1].fat_g)

        if fat_deficit > NEGLIGIBLE_G and fats:
            fat_food = fats[0]
            fat_portion = _portion_for(fat_food, fat_deficit, "fat")
            if fat_portion is not None:
                items.append(_item(fat_food, fat_portion))

        suggestions.append(
            MealSuggestion(
                items=items,
                total_calories=sum(i.calories for i in items),
                total_protein_g=sum(i.protein_g for i in items),
                total_carbs_g=sum(i.carbs_g for i in items),
                total_fat_g=sum(i.fat_g for i in items),
                fit_score=_score(items, remaining),
            )
        )

    suggestions.sort(key=lambda s: s.fit_score, reverse=True)
    return suggestions[:limit]
