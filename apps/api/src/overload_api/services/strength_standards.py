"""Güç standartları — vücut ağırlığına göre seviye karşılaştırması (Bölüm 4.1).

**Oranlar yaklaşıktır.** Yayımlanmış güç standardı tablolarının (Lon Kilgore'un
çalışması, ExRx ve strengthlevel.com gibi topluluk veri setleri) ortak eğilimini
temsil ediyorlar; tek bir otoritenin resmi tablosu değiller. Amaç kesin bir
sınıflandırma değil, kabaca "neredeyim" hissi vermek.

Kasıtlı sınırlar:
- Yaş düzeltmesi YOK. Yaşa göre katsayı eklemek tabloyu daha isabetli yapardı
  ama veri kaynakları bu konuda tutarsız; uydurulmuş bir katsayı sahte kesinlik olur.
- `Sex.unspecified` için sonuç üretilmiyor. Erkek/kadın tabloları belirgin
  biçimde farklı ve ortalama almak kimseyi doğru temsil etmez.
- 1RM **tahmini** (Epley) kullanılıyor; gerçek tek tekrar maksimumu test edilmediyse
  sonuç da tahmindir. Çıktıda bu açıkça belirtiliyor.

Saf modül: veritabanı bağımlılığı yok.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

from overload_api.db.models.user import Sex


class StrengthLevel(StrEnum):
    untrained = "untrained"
    novice = "novice"
    intermediate = "intermediate"
    advanced = "advanced"
    elite = "elite"


#: Kullanıcıya gösterilecek Türkçe etiketler.
LEVEL_LABEL: dict[StrengthLevel, str] = {
    StrengthLevel.untrained: "Başlangıç",
    StrengthLevel.novice: "Acemi",
    StrengthLevel.intermediate: "Orta",
    StrengthLevel.advanced: "İleri",
    StrengthLevel.elite: "Elit",
}

#: Standart karşılaştırması yapılan hareketler. Anahtar, `exercise.search_name`
#: ile eşleşir — bu yüzden seed'deki adlarla birebir aynı olmalı.
TRACKED_LIFTS: dict[str, str] = {
    "barbell bench press": "Bench Press",
    "barbell back squat": "Squat",
    "barbell deadlift": "Deadlift",
    "barbell overhead press": "Overhead Press",
}

#: 1RM / vücut ağırlığı oranları. Sıra: untrained, novice, intermediate, advanced, elite.
_RATIOS: dict[Sex, dict[str, tuple[Decimal, ...]]] = {
    Sex.male: {
        "barbell bench press": tuple(map(Decimal, ("0.50", "0.75", "1.25", "1.75", "2.00"))),
        "barbell back squat": tuple(map(Decimal, ("0.75", "1.25", "1.75", "2.50", "3.00"))),
        "barbell deadlift": tuple(map(Decimal, ("1.00", "1.50", "2.00", "2.75", "3.25"))),
        "barbell overhead press": tuple(map(Decimal, ("0.35", "0.55", "0.80", "1.10", "1.35"))),
    },
    Sex.female: {
        "barbell bench press": tuple(map(Decimal, ("0.35", "0.50", "0.75", "1.00", "1.35"))),
        "barbell back squat": tuple(map(Decimal, ("0.50", "0.75", "1.25", "1.75", "2.25"))),
        "barbell deadlift": tuple(map(Decimal, ("0.50", "1.00", "1.25", "1.75", "2.50"))),
        "barbell overhead press": tuple(map(Decimal, ("0.20", "0.35", "0.50", "0.75", "1.00"))),
    },
}

_LEVELS: tuple[StrengthLevel, ...] = (
    StrengthLevel.untrained,
    StrengthLevel.novice,
    StrengthLevel.intermediate,
    StrengthLevel.advanced,
    StrengthLevel.elite,
)


@dataclass(frozen=True, slots=True)
class StandardResult:
    lift_key: str
    lift_label: str
    estimated_1rm: Decimal
    bodyweight_ratio: Decimal
    level: StrengthLevel
    level_label: str
    #: Bir sonraki seviyeye ulaşmak için gereken 1RM. Elit seviyede None.
    next_level: StrengthLevel | None
    #: Bir sonraki seviyenin Türkçe adı. Etiketler backend'de duruyor;
    #: `next_level` ham slug olduğu için ekran onu kendi haritasıyla
    #: çevirmek zorunda kalıyordu — aynı sözlüğün ikinci kopyası.
    next_level_label: str | None
    next_level_kg: Decimal | None
    #: Mevcut seviye ile bir sonraki arasındaki ilerleme (0.0-1.0).
    progress_to_next: float


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def classify(
    *, lift_key: str, estimated_1rm: Decimal, bodyweight_kg: Decimal, sex: Sex
) -> StandardResult | None:
    """Tek bir hareket için seviye sınıflandırması.

    Bilinmeyen hareket, `Sex.unspecified` ya da geçersiz vücut ağırlığında
    `None` döner — tahmin üretmek yerine sessizce atlanır.
    """
    if sex is Sex.unspecified or bodyweight_kg <= 0:
        return None
    table = _RATIOS.get(sex, {}).get(lift_key)
    if table is None:
        return None

    ratio = estimated_1rm / bodyweight_kg

    # En yüksek geçilen eşik hangisiyse o seviye.
    level_index = 0
    for i, threshold in enumerate(table):
        if ratio >= threshold:
            level_index = i
    # Untrained eşiğinin de altındaysa yine "untrained" — negatif seviye yok.

    level = _LEVELS[level_index]
    next_level = _LEVELS[level_index + 1] if level_index + 1 < len(_LEVELS) else None
    next_kg = _q2(table[level_index + 1] * bodyweight_kg) if next_level else None

    if next_level is None:
        progress = 1.0
    else:
        current_threshold = table[level_index]
        span = table[level_index + 1] - current_threshold
        progress = float((ratio - current_threshold) / span) if span > 0 else 1.0
        progress = max(0.0, min(1.0, progress))

    return StandardResult(
        lift_key=lift_key,
        lift_label=TRACKED_LIFTS.get(lift_key, lift_key),
        estimated_1rm=_q2(estimated_1rm),
        bodyweight_ratio=_q2(ratio),
        level=level,
        level_label=LEVEL_LABEL[level],
        next_level=next_level,
        next_level_label=LEVEL_LABEL[next_level] if next_level else None,
        next_level_kg=next_kg,
        progress_to_next=round(progress, 3),
    )
