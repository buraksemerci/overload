"""İlk kez yapılan bir hareket için başlangıç ağırlığı tahmini.

Progresif overload motoru geçmişi olan hareketlerde somut bir hedef veriyor.
Ama geçmiş yoksa söyleyecek bir şeyi yoktu: "formu bozmadan yapabileceğin bir
ağırlık seç" diyordu. Kullanıcının sorusu ise net — *kaç kilo kaldırmalıyım?*
Bu modül o soruya bir sayı veriyor.

--------------------------------------------------------------------------
KASITLI OLARAK DÜŞÜK TAHMİN EDİYOR
--------------------------------------------------------------------------
Bu modülün en önemli tasarım kararı bu. Hafif gelen bir tahminin bedeli bir
kolay set: kullanıcı ilk sette fark eder, ağırlığı artırır, motor bir sonraki
seansta doğru yerden devam eder. Ağır gelen bir tahminin bedeli form
bozulması, kötü bir ilk deneyim, sakatlık.

Dolayısıyla her basamakta alt sınır seçiliyor: seviye bilinmiyorsa `untrained`
oranı, ekipman katsayıları muhafazakâr, yuvarlama aşağıya.

--------------------------------------------------------------------------
NEREDEN GELİYOR
--------------------------------------------------------------------------
Uydurulmuş bir tablo DEĞİL. Zaten kodda bulunan güç standardı oranları
(`strength_standards._RATIOS`) taban alınıyor — yayımlanmış standart
tablolarının ortak eğilimi. Adımlar:

1. Hareketin **çapa hareketi** bulunuyor: birincil kas grubuna göre bench
   press / squat / deadlift / overhead press'ten biri.
2. Çapanın tahmini 1RM'i = vücut ağırlığı x o seviyenin oranı.
3. **Ekipman katsayısı** uygulanıyor — hareketin çapaya göre ne kadar ağırlık
   taşıdığı.
4. Ters Epley ile hedef tekrar sayısına çevriliyor.
5. Ekipmanın plaka adımına AŞAĞI yuvarlanıyor.

Katsayılar kaba ve bunu saklamıyoruz. Örneğin leg press gerçekte squat'ın
1.5-2.5 katı kaldırılır; buradaki katsayı onu belirgin biçimde hafif tahmin
ediyor. Bilinçli: yukarıdaki gerekçe geçerli.

Vücut ağırlığı ya da cinsiyet bilinmiyorsa tahmin ÜRETİLMİYOR. Ortalama almak
kimseyi doğru temsil etmiyor ve sahte kesinlik üretmek, hiçbir şey söylememekten
kötü.
"""

from __future__ import annotations

from decimal import ROUND_FLOOR, Decimal

from overload_api.db.models.exercise import Equipment
from overload_api.db.models.user import Sex, TrainingExperience
from overload_api.services.strength_standards import (
    _LEVELS,
    _RATIOS,
    StrengthLevel,
)

#: Birincil kas grubu -> çapa hareket (`strength_standards` anahtarı).
#:
#: Kol ve karın kaslarının doğrudan çapası yok; bench press'e bağlanıyorlar
#: çünkü itme/çekme yardımcı hareketlerinin ağırlığı üst gövde gücüyle
#: ilişkili ve bench press dört çapadan en iyi kalibre edilmiş olanı.
_ANCHOR_BY_MUSCLE: dict[str, str] = {
    # Göğüs ve itiş
    "chest": "barbell bench press",
    "triceps": "barbell bench press",
    # Omuz
    "front_delts": "barbell overhead press",
    "side_delts": "barbell overhead press",
    "rear_delts": "barbell overhead press",
    "traps": "barbell overhead press",
    # Sırt ve çekiş
    "lats": "barbell deadlift",
    "mid_back": "barbell deadlift",
    "lower_back": "barbell deadlift",
    "biceps": "barbell bench press",
    "forearms": "barbell bench press",
    # Alt gövde
    "quads": "barbell back squat",
    "glutes": "barbell back squat",
    "hamstrings": "barbell back squat",
    "adductors": "barbell back squat",
    "calves": "barbell back squat",
    # Gövde
    "abs": "barbell bench press",
    "obliques": "barbell bench press",
}

#: Ekipmana göre, çapa 1RM'inin ne kadarının kaldırılabileceği.
#:
#: Dambıl katsayısı TEK KOL başına: barbell toplamının kabaca üçte biri.
#: Vücut ağırlığı hareketlerinde ek ağırlık 0.
_EQUIPMENT_FACTOR: dict[Equipment, Decimal] = {
    Equipment.barbell: Decimal("0.85"),
    Equipment.smith_machine: Decimal("0.80"),
    Equipment.plate_loaded: Decimal("0.75"),
    Equipment.machine: Decimal("0.70"),
    Equipment.cable: Decimal("0.45"),
    Equipment.dumbbell: Decimal("0.30"),
    Equipment.bodyweight: Decimal("0"),
    Equipment.other: Decimal("0.50"),
}

#: İzole hareketler (tek kas grubu, yardımcı kas yok) daha hafif.
#: Bileşik hareketin yarısı civarı.
_ISOLATION_FACTOR = Decimal("0.55")

#: Ekipman başına gerçekçi plaka adımı. `progression.PLATE_INCREMENT` ile aynı
#: olmak zorunda; ayrışırsa tahmin salonda bulunmayan bir ağırlık söyler.
_PLATE_STEP: dict[Equipment, Decimal] = {
    Equipment.barbell: Decimal("2.5"),
    Equipment.smith_machine: Decimal("2.5"),
    Equipment.plate_loaded: Decimal("2.5"),
    Equipment.dumbbell: Decimal("2.0"),
    Equipment.machine: Decimal("5.0"),
    Equipment.cable: Decimal("2.5"),
    Equipment.bodyweight: Decimal("0"),
    Equipment.other: Decimal("2.5"),
}


#: Beyan edilen antrenman süresi -> geçmiş YOKKEN kullanılacak seviye.
#:
#: Her basamak "doğal" eşleşmenin BİR ALTINDA: 1-3 yıl antrenman yapmış
#: biri çoğu tabloda orta seviye sayılır, burada acemi. İki sebep:
#:
#: 1. Beyan, ölçüm değil. İnsanlar antrenman sürelerini ve düzenliliklerini
#:    sistematik olarak fazla söylüyor ("3 yıldır" çoğu zaman "3 yıl önce
#:    başladım, arada bıraktım").
#: 2. Modülün kuralı: hafif tahminin bedeli bir kolay set, ağır tahminin
#:    bedeli sakatlık.
#:
#: İleri ve elit seviye BEYANLA HİÇ verilmiyor. Oraya yalnızca gerçek setlerle
#: çıkılıyor.
EXPERIENCE_LEVEL: dict[TrainingExperience, StrengthLevel] = {
    TrainingExperience.new: StrengthLevel.untrained,
    TrainingExperience.under_1y: StrengthLevel.untrained,
    TrainingExperience.one_to_three: StrengthLevel.novice,
    TrainingExperience.over_three: StrengthLevel.intermediate,
}


def infer_level(
    *,
    best_ratios: dict[str, Decimal],
    sex: Sex,
    experience: TrainingExperience | None = None,
) -> StrengthLevel:
    """Kullanıcının seviyesini bilinen çapa hareketlerindeki oranlardan çıkarır.

    `best_ratios`: çapa hareket anahtarı -> tahmini 1RM / vücut ağırlığı.

    Hiç veri yoksa BEYAN kullanılıyor (`EXPERIENCE_LEVEL`, bir basamak
    muhafazakâr); beyan da yoksa `untrained`. Önce beyan hiç sorulmuyordu ve
    üç yıllık biri de ilk haftasında hiç antrenman yapmamış biriyle aynı
    ağırlıkları görüyordu.

    Gerçek set varsa BEYAN YOK SAYILIYOR: ölçüm beyandan her zaman üstün.

    En YÜKSEK değil ALT MEDYAN seviye alınıyor: tek bir güçlü hareket
    kullanıcıyı her harekette ileri seviye saymaya yetmemeli.

    Çift sayıda harekette alt eleman seçiliyor, üst değil. Bu fark gerçek
    veriyle görüldü: overhead press'i elit, deadlift'i acemi seviyede olan bir
    kullanıcıda üst eleman seçilince seviye ELİT çıkıyor ve 72 kilo biri için
    90 kg'lık bir chest press başlangıcı öneriliyordu. Modülün tamamı düşük
    tahmin etmek üzerine kurulu; medyan da o yöne yuvarlanmalı.
    """
    fallback = EXPERIENCE_LEVEL[experience] if experience is not None else StrengthLevel.untrained

    table = _RATIOS.get(sex)
    if not table or not best_ratios:
        return fallback

    levels: list[int] = []
    for lift, ratio in best_ratios.items():
        thresholds = table.get(lift)
        if thresholds is None:
            continue
        index = 0
        for i, threshold in enumerate(thresholds):
            if ratio >= threshold:
                index = i
        levels.append(index)

    if not levels:
        return fallback

    levels.sort()
    return _LEVELS[levels[(len(levels) - 1) // 2]]


def estimate(
    *,
    primary_muscle: str | None,
    equipment: Equipment,
    is_isolation: bool,
    target_reps: int,
    bodyweight_kg: Decimal | None,
    sex: Sex,
    level: StrengthLevel,
) -> Decimal | None:
    """Tahmini çalışma ağırlığı. Tahmin üretilemiyorsa None.

    `target_reps` hedef aralığın ÜST sınırı olmalı: ilk seans referans kurmak
    için, ağırlığı düşük tutup tekrarı yüksek tutmak daha güvenli.
    """
    if bodyweight_kg is None or bodyweight_kg <= 0:
        return None
    if sex is Sex.unspecified:
        return None
    if equipment is Equipment.bodyweight:
        return None
    if primary_muscle is None:
        return None

    anchor = _ANCHOR_BY_MUSCLE.get(primary_muscle)
    if anchor is None:
        return None

    thresholds = _RATIOS.get(sex, {}).get(anchor)
    if thresholds is None:
        return None

    ratio = thresholds[_LEVELS.index(level)]
    anchor_1rm = bodyweight_kg * ratio

    factor = _EQUIPMENT_FACTOR.get(equipment, Decimal("0.5"))
    if is_isolation:
        factor *= _ISOLATION_FACTOR

    target_1rm = anchor_1rm * factor
    if target_1rm <= 0:
        return None

    # Ters Epley: 1RM = w x (1 + r/30)  =>  w = 1RM / (1 + r/30)
    working = target_1rm / (Decimal(1) + Decimal(target_reps) / Decimal(30))

    step = _PLATE_STEP.get(equipment, Decimal("2.5"))
    if step <= 0:
        return None

    # AŞAĞI yuvarlanıyor — modülün başındaki gerekçe.
    steps = (working / step).to_integral_value(rounding=ROUND_FLOOR)
    if steps < 1:
        # Bir adımın altına düşen tahmin anlamsız; en hafif gerçekçi ağırlık.
        steps = Decimal(1)
    return (steps * step).quantize(Decimal("0.01"))
