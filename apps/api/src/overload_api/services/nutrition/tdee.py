"""TDEE ve makro hedefi hesabı (Bölüm 4.2).

**Mifflin-St Jeor** formülü kullanılıyor. Harris-Benedict'ten daha güncel ve
fazla kilolu bireylerde daha az sapıyor; Katch-McArdle daha isabetli olurdu ama
yağ oranı ölçümü gerektiriyor ve çoğu kullanıcıda o veri yok.

Saf fonksiyonlar — veritabanı bağımlılığı yok, test edilebilir.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

from overload_api.db.models.user import ActivityLevel, Sex

#: Aktivite çarpanları. Antrenman bunlara DAHİL — ayrıca `activity_log`
#: kayıtlarını da eklersek aynı eforu iki kez saymış oluruz.
ACTIVITY_MULTIPLIER: dict[ActivityLevel, Decimal] = {
    ActivityLevel.sedentary: Decimal("1.20"),  # masa başı, antrenman yok
    ActivityLevel.light: Decimal("1.375"),  # haftada 1-3 gün
    ActivityLevel.moderate: Decimal("1.55"),  # haftada 3-5 gün
    ActivityLevel.active: Decimal("1.725"),  # haftada 6-7 gün
    ActivityLevel.very_active: Decimal("1.90"),  # günde iki seans / fiziksel iş
}


class NutritionGoal(StrEnum):
    cut = "cut"  # yağ kaybı
    maintain = "maintain"  # koruma
    bulk = "bulk"  # kas kazanımı


#: Hedefe göre TDEE'ye uygulanan oran.
#: Agresif açık (%25+) kas kaybı riski taşıdığı için kasıtlı olarak ılımlı.
GOAL_FACTOR: dict[NutritionGoal, Decimal] = {
    NutritionGoal.cut: Decimal("0.80"),  # %20 açık
    NutritionGoal.maintain: Decimal("1.00"),
    NutritionGoal.bulk: Decimal("1.10"),  # %10 fazla — "lean bulk"
}

#: Güvenlik tabanı. Bunun altına inen hedef üretilmez.
MIN_SAFE_CALORIES = 1200


@dataclass(frozen=True, slots=True)
class MacroTarget:
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    bmr: int
    tdee: int
    floor_applied: bool


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def age_from(birth_date: date, today: date) -> int:
    """Tam yaş. Doğum günü henüz gelmediyse bir eksik."""
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return max(years, 0)


def bmr_mifflin_st_jeor(
    *, weight_kg: Decimal, height_cm: int, age: int, sex: Sex
) -> Decimal | None:
    """Bazal metabolizma hızı.

    `Sex.unspecified` durumunda `None` döner — formülün cinsiyete göre farklı
    sabiti var ve ortalama almak kimseyi doğru temsil etmez. O durumda kullanıcı
    hedefini elle girer.
    """
    if sex is Sex.unspecified:
        return None

    base = Decimal(10) * weight_kg + Decimal("6.25") * Decimal(height_cm) - Decimal(5) * age
    return base + (Decimal(5) if sex is Sex.male else Decimal(-161))


def macro_target(
    *,
    weight_kg: Decimal,
    height_cm: int,
    age: int,
    sex: Sex,
    activity: ActivityLevel,
    goal: NutritionGoal,
) -> MacroTarget | None:
    """Kalori ve makro hedefi.

    Makro dağılımı:
      - **Protein**: vücut ağırlığı başına 2.0 g. Kas koruma/kazanım için
        literatürdeki üst-orta bant; kesim (cut) sırasında özellikle kritik.
      - **Yağ**: kalorinin %25'i. Hormonal fonksiyon için taban; bunun altına
        inmek testosteron üretimini etkiliyor.
      - **Karbonhidrat**: kalan kalori. Antrenman performansının yakıtı,
        bu yüzden kısılacak son makro.
    """
    bmr = bmr_mifflin_st_jeor(weight_kg=weight_kg, height_cm=height_cm, age=age, sex=sex)
    if bmr is None:
        return None

    tdee = bmr * ACTIVITY_MULTIPLIER[activity]
    calories = tdee * GOAL_FACTOR[goal]

    floor_applied = calories < MIN_SAFE_CALORIES
    if floor_applied:
        calories = Decimal(MIN_SAFE_CALORIES)

    protein_g = weight_kg * Decimal("2.0")
    fat_calories = calories * Decimal("0.25")
    fat_g = fat_calories / Decimal(9)
    carb_calories = calories - (protein_g * Decimal(4)) - fat_calories
    carbs_g = max(carb_calories / Decimal(4), Decimal(0))

    return MacroTarget(
        calories=_round(calories),
        protein_g=_round(protein_g),
        carbs_g=_round(carbs_g),
        fat_g=_round(fat_g),
        bmr=_round(bmr),
        tdee=_round(tdee),
        floor_applied=floor_applied,
    )
