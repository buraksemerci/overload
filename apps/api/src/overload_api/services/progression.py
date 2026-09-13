"""Progresif overload motoru — bölüm 3'ün uygulaması.

Bu modül **saf**: veritabanı, ağ ya da zaman bağımlılığı yok. Girdi olarak geçmiş
seansların düz veri temsilini alır, çıktı olarak somut bir hedef üretir. Böylece
algoritmanın tamamı gerçek Postgres olmadan test edilebilir
(`tests/test_progression.py`).

Veriyi yükleyip bu fonksiyonları çağıran ince katman: `features/workouts/service.py`.

--------------------------------------------------------------------------------
KARAR DEFTERİ
--------------------------------------------------------------------------------
1. **Neden "top set" (en ağır set) baz alınıyor?** Ortalama almak yanıltıcı: 4. setteki
   yorgunluk kaynaklı düşüş, 1. setteki gerçek ilerlemeyi maskeler. Düz setlerde
   ilerlemenin en temiz sinyali en ağır çalışma setidir.

2. **Failure setlerinde neden hacim?** Failure'a giden bir sette tekrar sayısı günlük
   forma göre ±2 oynar; tek setin tekrarına bakmak gürültüyü ölçmek olur. Toplam hacim
   (Σ ağırlık x tekrar) o seansın gerçekten ne kadar iş yaptığını gösterir.

3. **RIR neden `None` olabilir?** Kullanıcı girmeyebilir ya da set failure'a gitmiştir.
   `None`'ı 0 saymak "bitişe 0 tekrar kaldı" demek olurdu ve motoru sahte biçimde
   agresifleştirirdi. `None` = "bilinmiyor" olarak ele alınır ve ağırlık artışı için
   tek başına yeterli kanıt sayılmaz.

4. **Neden yüzde değil de plaka adımı?** "%2.5 artır" 40 kg'da 1 kg eder; hiçbir salonda
   1 kg'lık adım yoktur. Yüzde hedefi hesaplanır, sonra ekipmanın gerçek adımına
   yuvarlanır ve en az bir adım artış garanti edilir.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal
from enum import StrEnum

from overload_api.db.models.exercise import Equipment
from overload_api.db.models.program import IntensityTechnique

# --- Sabitler ----------------------------------------------------------------

#: Ekipman başına gerçekçi en küçük ağırlık adımı (kg).
#: plate_loaded ve barbell'da 2.5 = her iki tarafa 1.25'lik plaka.
PLATE_INCREMENT: dict[Equipment, Decimal] = {
    Equipment.barbell: Decimal("2.5"),
    Equipment.smith_machine: Decimal("2.5"),
    Equipment.plate_loaded: Decimal("2.5"),
    Equipment.dumbbell: Decimal("2.0"),
    Equipment.machine: Decimal("5.0"),  # seçmeli ağırlık bloğu
    Equipment.cable: Decimal("2.5"),
    Equipment.bodyweight: Decimal("0"),  # ağırlık artmaz, tekrar artar
    Equipment.other: Decimal("2.5"),
}

#: Ağırlık artışının hedeflenen yüzde aralığı (bölüm 3: %2.5-5).
MIN_INCREASE_PCT = Decimal("0.025")
MAX_INCREASE_PCT = Decimal("0.05")

#: Kaç seans üst üste rekor kırılmazsa plato sayılır.
PLATEAU_SESSION_THRESHOLD = 3

#: Deload'da ağırlığın korunan oranı.
DELOAD_WEIGHT_FACTOR = Decimal("0.90")

#: Ağırlık artışına izin vermek için gereken en yüksek RIR.
#: RIR 2+ ise set zaten kolaydı; önce tekrarları doldurmak daha mantıklı.
MAX_RIR_FOR_WEIGHT_JUMP = 1

#: Failure tekniklerinde hacim baz alınır.
_FAILURE_TECHNIQUES = frozenset(
    {
        IntensityTechnique.failure,
        IntensityTechnique.rir1_to_failure,
        IntensityTechnique.superset_failure,
        IntensityTechnique.drop_set,
        IntensityTechnique.myo_reps,
    }
)


# --- Girdi tipleri -----------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PerformedSet:
    weight_kg: Decimal
    reps: int
    rir: int | None = None
    is_warmup: bool = False

    @property
    def volume(self) -> Decimal:
        return self.weight_kg * self.reps

    @property
    def estimated_1rm(self) -> Decimal:
        """Epley: w x (1 + r/30)."""
        return self.weight_kg * (Decimal(1) + Decimal(self.reps) / Decimal(30))


@dataclass(frozen=True, slots=True)
class SessionPerformance:
    """Tek bir seansta tek bir hareket için yapılanlar."""

    performed_on: date
    sets: tuple[PerformedSet, ...]

    @property
    def working_sets(self) -> tuple[PerformedSet, ...]:
        return tuple(s for s in self.sets if not s.is_warmup)

    @property
    def top_set(self) -> PerformedSet | None:
        """En ağır çalışma seti; eşit ağırlıkta olanlarda tekrarı fazla olan."""
        working = self.working_sets
        if not working:
            return None
        return max(working, key=lambda s: (s.weight_kg, s.reps))

    @property
    def total_volume(self) -> Decimal:
        return sum((s.volume for s in self.working_sets), Decimal(0))

    @property
    def best_estimated_1rm(self) -> Decimal:
        working = self.working_sets
        if not working:
            return Decimal(0)
        return max(s.estimated_1rm for s in working)


@dataclass(frozen=True, slots=True)
class ExerciseTarget:
    """Programdaki hedef — `ProgramExercise` satırının sade hâli."""

    sets: int
    rep_min: int
    rep_max: int
    technique: IntensityTechnique = IntensityTechnique.straight
    equipment: Equipment = Equipment.other


# --- Çıktı tipleri -----------------------------------------------------------


class SuggestionKind(StrEnum):
    establish_baseline = "establish_baseline"  # geçmiş yok
    add_reps = "add_reps"                      # aynı ağırlık, +1 tekrar
    add_weight = "add_weight"                  # ağırlık artır, tekrar aralığın altına in
    hold = "hold"                              # aynı ağırlık/tekrar, forma otur
    deload = "deload"                          # plato: ağırlığı düşür


@dataclass(frozen=True, slots=True)
class TargetOption:
    """Somut, sayısal bir hedef. Kullanıcıya doğrudan böyle gösterilir."""

    kind: SuggestionKind
    weight_kg: Decimal
    reps: int
    label: str

    def __str__(self) -> str:
        return self.label


@dataclass(frozen=True, slots=True)
class PlateauInfo:
    stalled_sessions: int
    best_value: Decimal
    metric: str  # "tahmini 1RM" | "toplam hacim"


@dataclass(frozen=True, slots=True)
class ProgressionSuggestion:
    """Motorun nihai çıktısı."""

    primary: TargetOption
    alternative: TargetOption | None = None
    plateau: PlateauInfo | None = None
    message: str = ""
    previous_summary: str | None = None
    warnings: tuple[str, ...] = field(default_factory=tuple)


# --- Yardımcılar -------------------------------------------------------------


def _q(value: Decimal) -> Decimal:
    """Ağırlıkları 0.01'e yuvarla (Numeric(6,2) ile uyumlu)."""
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _fmt_weight(value: Decimal) -> str:
    """40.00 -> '40', 42.50 -> '42.5' — salonda kimse '42.50 kg' demez."""
    normalized = _q(value).normalize()
    text = format(normalized, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def next_weight(current: Decimal, equipment: Equipment) -> Decimal:
    """Bir sonraki gerçekçi ağırlık.

    Hedef %2.5-5 artış; sonuç ekipmanın plaka adımına yuvarlanır.

    **Aşağı yuvarlanır (ROUND_FLOOR), yukarı değil.** Bandın ortası (%3.75) çoğu zaman
    iki plaka adımının tam arasına düşer — ör. 100 kg'da 103.75, yani 102.5 (%2.5) ile
    105 (%5) arasında. Küçük adımı seçmek geri dönüşte daha sürdürülebilir: fazla
    gelmeyen bir artış bir sonraki seans tekrar yapılabilir, fazla gelen bir artış ise
    formu bozup platoya sokar.

    Yuvarlama sonucu sıfır adım çıkarsa (hafif ağırlıklarda olur) en az bir adım
    eklenir — aksi halde motor sonsuza dek aynı ağırlığı önerirdi. Bu durumda artış
    %5'i aşabilir; salondaki en küçük plaka bunu dayatır, matematik değil.
    """
    step = PLATE_INCREMENT.get(equipment, Decimal("2.5"))
    if step == 0:  # vücut ağırlığı: ağırlık artmaz
        return current

    target = current * (Decimal(1) + (MIN_INCREASE_PCT + MAX_INCREASE_PCT) / 2)
    steps_up = ((target - current) / step).to_integral_value(rounding=ROUND_FLOOR)
    if steps_up < 1:
        steps_up = Decimal(1)
    return _q(current + steps_up * step)


def _describe_set(s: PerformedSet) -> str:
    rir_text = f" RIR{s.rir}" if s.rir is not None else ""
    return f"{_fmt_weight(s.weight_kg)}kg x {s.reps}{rir_text}"


def detect_plateau(
    history: list[SessionPerformance], technique: IntensityTechnique
) -> PlateauInfo | None:
    """Son `PLATEAU_SESSION_THRESHOLD` seanstır yeni rekor yoksa plato bildirir.

    Metrik tekniğe göre değişir (karar defteri #2): failure setlerinde toplam hacim,
    düz setlerde tahmini 1RM.
    """
    sessions = [s for s in history if s.working_sets]
    if len(sessions) <= PLATEAU_SESSION_THRESHOLD:
        return None

    uses_volume = technique in _FAILURE_TECHNIQUES
    metric_name = "toplam hacim" if uses_volume else "tahmini 1RM"

    def value_of(s: SessionPerformance) -> Decimal:
        return s.total_volume if uses_volume else s.best_estimated_1rm

    values = [value_of(s) for s in sessions]
    best = max(values)
    # En son hangi seansta zirveye ulaşıldı? Sonrasında kaç seans geçti?
    last_best_index = len(values) - 1 - values[::-1].index(best)
    stalled = len(values) - 1 - last_best_index

    if stalled >= PLATEAU_SESSION_THRESHOLD:
        return PlateauInfo(stalled_sessions=stalled, best_value=_q(best), metric=metric_name)
    return None


# --- Ana fonksiyon -----------------------------------------------------------


def suggest_next_target(
    target: ExerciseTarget,
    history: list[SessionPerformance],
) -> ProgressionSuggestion:
    """Bir hareket için bir sonraki seansın somut hedefini üretir.

    `history` eskiden yeniye sıralı olmalı; son eleman en güncel seans.
    """
    sessions = [s for s in history if s.working_sets]

    # --- 1. Geçmiş yok: başlangıç noktası belirle ---
    if not sessions:
        option = TargetOption(
            kind=SuggestionKind.establish_baseline,
            weight_kg=Decimal(0),
            reps=target.rep_max,
            label=f"{target.sets} set x {target.rep_min}-{target.rep_max} tekrar",
        )
        return ProgressionSuggestion(
            primary=option,
            message=(
                f"İlk kez yapıyorsun. {target.rep_max} tekrarı formu bozmadan "
                f"tamamlayabileceğin bir ağırlık seç — bu senin başlangıç referansın olacak."
            ),
        )

    last = sessions[-1]
    top = last.top_set
    assert top is not None  # working_sets boş olmayan seanslar filtrelendi

    previous_summary = ", ".join(_describe_set(s) for s in last.working_sets)
    plateau = detect_plateau(sessions, target.technique)
    warnings: list[str] = []

    # --- 2. Plato: deload öner ---
    if plateau is not None:
        deload_weight = _q(top.weight_kg * DELOAD_WEIGHT_FACTOR)
        step = PLATE_INCREMENT.get(target.equipment, Decimal("2.5"))
        if step > 0:  # gerçekçi bir ağırlığa yuvarla
            deload_weight = _q((deload_weight / step).quantize(Decimal("1"), ROUND_HALF_UP) * step)
        primary = TargetOption(
            kind=SuggestionKind.deload,
            weight_kg=deload_weight,
            reps=target.rep_max,
            label=f"{_fmt_weight(deload_weight)}kg x {target.rep_max}",
        )
        return ProgressionSuggestion(
            primary=primary,
            alternative=None,
            plateau=plateau,
            previous_summary=previous_summary,
            message=(
                f"{plateau.stalled_sessions} seanstır {plateau.metric} artmıyor. "
                f"Bu hafta {_fmt_weight(deload_weight)}kg'a in (%10 deload), "
                f"tekrarları temiz ve kontrollü yap. Alternatif: hareketi 2-3 hafta "
                f"benzer bir varyasyonla değiştir, sonra eski ağırlığa taze dön."
            ),
            warnings=tuple(warnings),
        )

    # --- 3. Failure teknikleri: hacim odaklı ---
    if target.technique in _FAILURE_TECHNIQUES:
        return _suggest_by_volume(target, sessions, previous_summary)

    # --- 4. Düz setler: tekrar aralığı mantığı ---
    return _suggest_by_rep_range(target, top, previous_summary, warnings)


def _suggest_by_rep_range(
    target: ExerciseTarget,
    top: PerformedSet,
    previous_summary: str,
    warnings: list[str],
) -> ProgressionSuggestion:
    """Double progression: önce tekrarı aralığın üstüne taşı, sonra ağırlığı artır."""
    weight = top.weight_kg
    reps = top.reps
    rir_known = top.rir is not None
    rir_low_enough = (top.rir is not None and top.rir <= MAX_RIR_FOR_WEIGHT_JUMP) or not rir_known

    # 4a. Aralığın ÜSTÜNE çıkmış: ağırlığı artır, tekrarı aralığın altına çek.
    if reps >= target.rep_max and rir_low_enough:
        heavier = next_weight(weight, target.equipment)
        if heavier == weight:  # vücut ağırlığı — ağırlık artamaz
            primary = TargetOption(
                SuggestionKind.add_reps, weight, reps + 1, f"{_fmt_weight(weight)}kg x {reps + 1}"
            )
            return ProgressionSuggestion(
                primary=primary,
                previous_summary=previous_summary,
                message=(
                    f"Geçen sefer {_describe_set(top)} yaptın. Ağırlık sabit olduğu için "
                    f"ilerleme tekrardan gelir: bugün {reps + 1} tekrar hedefle."
                ),
            )
        primary = TargetOption(
            SuggestionKind.add_weight,
            heavier,
            target.rep_min,
            f"{_fmt_weight(heavier)}kg x {target.rep_min}",
        )
        alternative = TargetOption(
            SuggestionKind.add_reps, weight, reps + 1, f"{_fmt_weight(weight)}kg x {reps + 1}"
        )
        return ProgressionSuggestion(
            primary=primary,
            alternative=alternative,
            previous_summary=previous_summary,
            message=(
                f"Geçen sefer {_describe_set(top)} yaptın — hedef aralığın üstündesin. "
                f"Bugün {primary.label} veya {alternative.label} dene."
            ),
        )

    # 4b. Aralığın üstünde ama RIR yüksek: set kolaydı, yine de ağırlık erken.
    if reps >= target.rep_max and not rir_low_enough:
        primary = TargetOption(
            SuggestionKind.add_reps, weight, reps + 1, f"{_fmt_weight(weight)}kg x {reps + 1}"
        )
        warnings.append(
            f"RIR{top.rir} bildirdin — set hâlâ kolay. Ağırlığı artırmadan önce "
            f"aynı ağırlıkta RIR 0-1'e yaklaş."
        )
        return ProgressionSuggestion(
            primary=primary,
            previous_summary=previous_summary,
            message=(
                f"Geçen sefer {_describe_set(top)} yaptın. Tekrar hedefini geçtin ama "
                f"bitişte {top.rir} tekrarlık pay bırakmışsın; bu ağırlıkta bir tekrar daha ekle."
            ),
            warnings=tuple(warnings),
        )

    # 4c. Aralık İÇİNDE: bir tekrar ekle (klasik double progression).
    if target.rep_min <= reps < target.rep_max:
        primary = TargetOption(
            SuggestionKind.add_reps, weight, reps + 1, f"{_fmt_weight(weight)}kg x {reps + 1}"
        )
        remaining = target.rep_max - reps
        return ProgressionSuggestion(
            primary=primary,
            previous_summary=previous_summary,
            message=(
                f"Geçen sefer {_describe_set(top)} yaptın. Bugün {primary.label} hedefle — "
                f"{target.rep_max} tekrara ulaşınca ağırlığı artıracağız "
                f"({remaining} tekrar kaldı)."
            ),
        )

    # 4d. Aralığın ALTINDA: ağırlık fazla gelmiş, aynı ağırlıkta aralığa tırman.
    primary = TargetOption(
        SuggestionKind.hold, weight, target.rep_min, f"{_fmt_weight(weight)}kg x {target.rep_min}"
    )
    lighter = _q(weight - PLATE_INCREMENT.get(target.equipment, Decimal("2.5")))
    alternative = (
        TargetOption(
            SuggestionKind.hold, lighter, target.rep_min, f"{_fmt_weight(lighter)}kg x {target.rep_min}"
        )
        if lighter > 0
        else None
    )
    return ProgressionSuggestion(
        primary=primary,
        alternative=alternative,
        previous_summary=previous_summary,
        message=(
            f"Geçen sefer {_describe_set(top)} yaptın — hedef aralığın "
            f"({target.rep_min}-{target.rep_max}) altında kaldın. Ağırlığı sabit tut ve "
            f"{target.rep_min} tekrara çık; zorlanırsan {alternative.label if alternative else 'biraz daha hafif'} ile başla."
        ),
    )


def _suggest_by_volume(
    target: ExerciseTarget,
    sessions: list[SessionPerformance],
    previous_summary: str,
) -> ProgressionSuggestion:
    """Failure setlerinde ölçüt toplam hacim (karar defteri #2)."""
    last = sessions[-1]
    top = last.top_set
    assert top is not None
    last_volume = last.total_volume

    previous_volume = sessions[-2].total_volume if len(sessions) >= 2 else None
    weight = top.weight_kg

    # Hacim arttıysa aynı ağırlıkta devam; ayrıca tekrar hedefi aralığın üstündeyse ağırlık artır.
    if top.reps >= target.rep_max:
        heavier = next_weight(weight, target.equipment)
        primary = TargetOption(
            SuggestionKind.add_weight,
            heavier,
            target.rep_min,
            f"{_fmt_weight(heavier)}kg x {target.rep_min}+ (failure)",
        )
        message = (
            f"Geçen sefer {_describe_set(top)} ile failure'a gittin ve hedef aralığı aştın. "
            f"Bugün {_fmt_weight(heavier)}kg ile başla, yine failure'a kadar götür."
        )
    else:
        primary = TargetOption(
            SuggestionKind.add_reps,
            weight,
            top.reps + 1,
            f"{_fmt_weight(weight)}kg x {top.reps + 1}+ (failure)",
        )
        message = (
            f"Geçen sefer {_describe_set(top)} ile failure'a gittin "
            f"(toplam hacim {_fmt_weight(last_volume)} kg). "
            f"Bugün aynı ağırlıkta en az bir tekrar fazla çıkarmayı hedefle."
        )

    warnings: list[str] = []
    if previous_volume is not None and last_volume < previous_volume:
        drop_pct = (previous_volume - last_volume) / previous_volume * 100
        warnings.append(
            f"Geçen seansta hacim %{drop_pct.quantize(Decimal('1'))} düştü "
            f"({_fmt_weight(previous_volume)} → {_fmt_weight(last_volume)} kg). "
            f"Uyku/beslenme ya da birikmiş yorgunluk olabilir."
        )

    return ProgressionSuggestion(
        primary=primary,
        previous_summary=previous_summary,
        message=message,
        warnings=tuple(warnings),
    )


# --- Deload haftası otomasyonu (bölüm 4.1) -----------------------------------


def should_suggest_deload_week(
    consecutive_training_weeks: int,
    *,
    cycle_length: int = 5,
) -> bool:
    """4-6 haftalık blok sonunda deload önerir (varsayılan 5).

    Ayrı tutuldu çünkü bu karar tek harekete değil, tüm bloğun birikmiş yorgunluğuna
    bakar; `suggest_next_target` ise hareket bazında çalışır.
    """
    if consecutive_training_weeks < 4:
        return False
    return consecutive_training_weeks % cycle_length == 0
