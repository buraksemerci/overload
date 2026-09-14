"""Seed verisi: kas grupları, hareket kütüphanesi, programlar.

Veri burada, yükleme mantığı `loader.py`'de. Ayrı tutuldu çünkü bu dosya zamanla
büyüyecek ve çoğu değişiklik saf veri ekleme olacak.

`svg_id` değerleri frontend'deki kas haritası SVG'sinde `<path id="...">` ile
eşleşir; birini değiştirirken diğerini de değiştirmek gerekir.
"""

from __future__ import annotations

from typing import NamedTuple

# =============================================================================
# Kas grupları
# =============================================================================


class MuscleSeed(NamedTuple):
    slug: str
    name_tr: str
    name_en: str
    region: str  # "front" | "back"
    svg_id: str
    weekly_set_target: int


MUSCLE_GROUPS: tuple[MuscleSeed, ...] = (
    MuscleSeed("chest", "Göğüs", "Chest", "front", "m-chest", 12),
    MuscleSeed("front_delts", "Ön Omuz", "Front Delts", "front", "m-front-delts", 8),
    MuscleSeed("side_delts", "Yan Omuz", "Side Delts", "front", "m-side-delts", 12),
    MuscleSeed("rear_delts", "Arka Omuz", "Rear Delts", "back", "m-rear-delts", 10),
    MuscleSeed("lats", "Kanat (Lat)", "Lats", "back", "m-lats", 12),
    MuscleSeed("mid_back", "Orta Sırt", "Mid Back", "back", "m-mid-back", 10),
    MuscleSeed("traps", "Trapez", "Traps", "back", "m-traps", 6),
    MuscleSeed("lower_back", "Bel", "Lower Back", "back", "m-lower-back", 6),
    MuscleSeed("biceps", "Biceps", "Biceps", "front", "m-biceps", 12),
    MuscleSeed("triceps", "Triceps", "Triceps", "back", "m-triceps", 12),
    MuscleSeed("forearms", "Ön Kol", "Forearms", "front", "m-forearms", 6),
    MuscleSeed("abs", "Karın", "Abs", "front", "m-abs", 8),
    MuscleSeed("obliques", "Yan Karın", "Obliques", "front", "m-obliques", 6),
    MuscleSeed("quads", "Quadriceps", "Quadriceps", "front", "m-quads", 12),
    MuscleSeed("hamstrings", "Arka Bacak", "Hamstrings", "back", "m-hamstrings", 10),
    MuscleSeed("glutes", "Kalça", "Glutes", "back", "m-glutes", 10),
    MuscleSeed("calves", "Baldır", "Calves", "back", "m-calves", 8),
    MuscleSeed("adductors", "İç Bacak", "Adductors", "front", "m-adductors", 4),
)


# =============================================================================
# Hareket kütüphanesi
#
# Biçim: (ad, ekipman, birincil kaslar, ikincil kaslar, tek_taraflı)
# Bölüm 6.2'deki örnek desen tüm hareketlere uygulandı.
# =============================================================================


class ExerciseSeed(NamedTuple):
    name: str
    equipment: str
    primary: tuple[str, ...]
    secondary: tuple[str, ...] = ()
    unilateral: bool = False


EXERCISES: tuple[ExerciseSeed, ...] = (
    # --- Kullanıcının mevcut programındaki hareketler ---
    ExerciseSeed(
        "Plate Loaded Chest Press", "plate_loaded", ("chest",), ("front_delts", "triceps")
    ),
    ExerciseSeed(
        "Smith Machine Low Incline Row",
        "smith_machine",
        ("lats", "mid_back"),
        ("biceps", "rear_delts"),
    ),
    ExerciseSeed("Chest Fly Machine", "machine", ("chest",), ("front_delts",)),
    ExerciseSeed("Shoulder Press Machine", "machine", ("front_delts",), ("side_delts", "triceps")),
    ExerciseSeed("Lateral Raise", "dumbbell", ("side_delts",), ("front_delts",)),
    ExerciseSeed("Triceps Pushdown", "cable", ("triceps",)),
    ExerciseSeed("Lat Pulldown", "machine", ("lats",), ("biceps", "rear_delts")),
    ExerciseSeed(
        "Plate Loaded Wide Grip Row", "plate_loaded", ("lats", "mid_back"), ("biceps", "rear_delts")
    ),
    ExerciseSeed("Cable Row", "cable", ("mid_back", "lats"), ("biceps",)),
    ExerciseSeed("Dumbbell Curl", "dumbbell", ("biceps",), ("forearms",)),
    ExerciseSeed("Cable Curl", "cable", ("biceps",)),
    ExerciseSeed("Hammer Curl", "dumbbell", ("biceps", "forearms")),
    ExerciseSeed("Reverse Barbell Curl", "barbell", ("forearms",), ("biceps",)),
    ExerciseSeed("Leg Press", "machine", ("quads",), ("glutes", "hamstrings")),
    ExerciseSeed("Smith Machine Squat", "smith_machine", ("quads",), ("glutes", "hamstrings")),
    ExerciseSeed("Leg Extension", "machine", ("quads",)),
    ExerciseSeed("Seated Leg Curl", "machine", ("hamstrings",), ("calves",)),
    ExerciseSeed(
        "Smith Machine Low Incline Press", "smith_machine", ("chest",), ("front_delts", "triceps")
    ),
    ExerciseSeed("Cable Rear Delt Fly", "cable", ("rear_delts",), ("mid_back",)),
    ExerciseSeed("Overhead Rope Extension", "cable", ("triceps",)),
    ExerciseSeed("Close Grip Lat Pulldown", "machine", ("lats",), ("biceps", "rear_delts")),
    # --- Şablon programların ihtiyaç duyduğu temel hareketler ---
    ExerciseSeed(
        "Barbell Back Squat", "barbell", ("quads",), ("glutes", "hamstrings", "lower_back")
    ),
    ExerciseSeed("Barbell Bench Press", "barbell", ("chest",), ("front_delts", "triceps")),
    ExerciseSeed(
        "Barbell Deadlift", "barbell", ("lower_back", "glutes"), ("hamstrings", "traps", "lats")
    ),
    ExerciseSeed("Barbell Overhead Press", "barbell", ("front_delts",), ("side_delts", "triceps")),
    ExerciseSeed("Barbell Row", "barbell", ("mid_back", "lats"), ("biceps", "rear_delts")),
    ExerciseSeed("Pull-Up", "bodyweight", ("lats",), ("biceps", "mid_back")),
    ExerciseSeed("Dip", "bodyweight", ("chest", "triceps"), ("front_delts",)),
    ExerciseSeed("Romanian Deadlift", "barbell", ("hamstrings",), ("glutes", "lower_back")),
    ExerciseSeed("Incline Dumbbell Press", "dumbbell", ("chest",), ("front_delts", "triceps")),
    ExerciseSeed("Face Pull", "cable", ("rear_delts",), ("traps", "mid_back")),
    ExerciseSeed("Standing Calf Raise", "machine", ("calves",)),
    ExerciseSeed("Hip Thrust", "barbell", ("glutes",), ("hamstrings",)),
    ExerciseSeed("Lying Leg Curl", "machine", ("hamstrings",), ("calves",)),
    ExerciseSeed("Hanging Leg Raise", "bodyweight", ("abs",), ("obliques",)),
    ExerciseSeed("Plank", "bodyweight", ("abs",), ("obliques",)),
    ExerciseSeed("Bulgarian Split Squat", "dumbbell", ("quads",), ("glutes",), unilateral=True),
    ExerciseSeed("Skullcrusher", "barbell", ("triceps",)),
    ExerciseSeed("Preacher Curl", "machine", ("biceps",), ("forearms",)),
    # --- İleri/orta seviye şablonların (5/3/1, GZCLP, PHAT, nSuns) ihtiyaç duyduğu
    #     barbell varyasyonları ---
    ExerciseSeed("Front Squat", "barbell", ("quads",), ("glutes", "abs")),
    ExerciseSeed("Close Grip Bench Press", "barbell", ("triceps",), ("chest", "front_delts")),
    ExerciseSeed("Incline Barbell Press", "barbell", ("chest",), ("front_delts", "triceps")),
    ExerciseSeed("Sumo Deadlift", "barbell", ("glutes", "hamstrings"), ("lower_back", "quads")),
    ExerciseSeed("Pendlay Row", "barbell", ("mid_back", "lats"), ("biceps", "rear_delts")),
    ExerciseSeed("Good Morning", "barbell", ("hamstrings",), ("lower_back", "glutes")),
    ExerciseSeed("Barbell Shrug", "barbell", ("traps",), ("forearms",)),
    # Chin-up ve pull-up ayrı: ters (supine) tutuş biceps'i belirgin biçimde
    # daha fazla çalıştırıyor, kas haritasında ikisini birleştirmek yanıltıcı olur.
    ExerciseSeed("Chin-Up", "bodyweight", ("lats", "biceps"), ("mid_back",)),
    ExerciseSeed(
        "Seated Dumbbell Shoulder Press", "dumbbell", ("front_delts",), ("side_delts", "triceps")
    ),
    ExerciseSeed("Dumbbell Row", "dumbbell", ("lats", "mid_back"), ("biceps",), unilateral=True),
    ExerciseSeed("Cable Crunch", "cable", ("abs",), ("obliques",)),
    ExerciseSeed("Hack Squat", "machine", ("quads",), ("glutes",)),
)


# =============================================================================
# Programlar
#
# Biçim: (hareket_adı, set, tekrar_min, tekrar_max, teknik, superset_grubu)
# =============================================================================


class PxSeed(NamedTuple):
    exercise: str
    sets: int
    rep_min: int
    rep_max: int
    technique: str = "straight"
    superset_group: int | None = None
    #: Antrenman maksimumunun yüzdesi (5/3/1, nSuns, Candito gibi programlarda).
    #: String olarak tutuluyor ki Decimal'e kayıpsız çevrilsin.
    percent: str | None = None


class DaySeed(NamedTuple):
    label: str
    exercises: tuple[PxSeed, ...]


class ProgramSeed(NamedTuple):
    name: str
    goal: str
    level: str
    days: tuple[DaySeed, ...]
    description: str | None = None
    source_name: str | None = None
    source_url: str | None = None
    is_template: bool = True


# --- Kullanıcının mevcut programı (bölüm 2'deki JSON) ------------------------
#
# NOT: "Hammer curl + Reverse barbell curl" kaynak veride tek satır, ama iki ayrı
# hareket. Burada iki satıra ayrılıp aynı `superset_group` verildi — tek satıra
# sıkıştırmak kas eşlemesini, dolayısıyla ısı haritasını bozardı.

USER_PROGRAM = ProgramSeed(
    name="5 Günlük Split (Başlangıç Programım)",
    description="Prompt'ta verilen mevcut program. Başlangıç noktası — düzenlenebilir.",
    goal="hypertrophy",
    level="intermediate",
    is_template=False,
    source_name=None,
    days=(
        DaySeed(
            "Pazartesi — Göğüs / Omuz / Triceps",
            (
                PxSeed("Plate Loaded Chest Press", 2, 5, 6, "rir1"),
                # Kaynak JSON'da "Smith machine low incline ROW" yazıyordu. Günün
                # geri kalanı tamamen it (göğüs/omuz/triceps) ve Cuma gününde aynı
                # hareket "PRESS" olarak geçiyor; kullanıcı yazım hatası olduğunu
                # doğruladı. "Row" kütüphanede duruyor, sadece bu satır düzeltildi.
                PxSeed("Smith Machine Low Incline Press", 1, 6, 8, "failure"),
                PxSeed("Chest Fly Machine", 2, 6, 8, "rir1"),
                PxSeed("Shoulder Press Machine", 3, 8, 10, "failure"),
                PxSeed("Lateral Raise", 2, 6, 8, "rir1"),
                PxSeed("Triceps Pushdown", 2, 8, 10, "failure"),
            ),
        ),
        DaySeed(
            "Salı — Sırt / Biceps",
            (
                PxSeed("Lat Pulldown", 2, 8, 8, "rir1_to_failure"),
                PxSeed("Plate Loaded Wide Grip Row", 2, 8, 8, "rir1_to_failure"),
                PxSeed("Cable Row", 1, 8, 10, "failure"),
                PxSeed("Dumbbell Curl", 2, 6, 8, "rir1"),
                PxSeed("Cable Curl", 2, 8, 8, "rir1"),
                PxSeed("Hammer Curl", 2, 8, 10, "superset_failure", 1),
                PxSeed("Reverse Barbell Curl", 2, 8, 10, "superset_failure", 1),
            ),
        ),
        DaySeed(
            "Çarşamba — Bacak",
            (
                PxSeed("Leg Press", 2, 6, 8, "rir1"),
                PxSeed("Smith Machine Squat", 2, 6, 8, "rir1"),
                PxSeed("Leg Extension", 1, 8, 10, "failure"),
                PxSeed("Seated Leg Curl", 2, 8, 10, "rir1"),
            ),
        ),
        DaySeed(
            "Cuma — Omuz / Göğüs / Triceps",
            (
                PxSeed("Shoulder Press Machine", 2, 5, 6, "rir1"),
                PxSeed("Lateral Raise", 1, 8, 10, "failure"),
                PxSeed("Smith Machine Low Incline Press", 2, 5, 6, "rir1"),
                PxSeed("Chest Fly Machine", 2, 6, 8, "rir1"),
                PxSeed("Cable Rear Delt Fly", 2, 8, 10, "failure"),
                PxSeed("Triceps Pushdown", 2, 6, 8, "rir1"),
                PxSeed("Overhead Rope Extension", 2, 8, 10, "failure"),
            ),
        ),
        DaySeed(
            "Cumartesi — Sırt / Biceps / Bacak",
            (
                PxSeed("Plate Loaded Wide Grip Row", 3, 6, 8, "rir1_to_failure"),
                PxSeed("Close Grip Lat Pulldown", 3, 6, 8, "rir1_to_failure"),
                PxSeed("Cable Curl", 2, 6, 8, "failure"),
                PxSeed("Hammer Curl", 2, 8, 10, "superset_failure", 1),
                PxSeed("Reverse Barbell Curl", 2, 8, 10, "superset_failure", 1),
                PxSeed("Leg Press", 2, 6, 8, "failure"),
                PxSeed("Leg Extension", 2, 6, 8, "failure"),
                PxSeed("Seated Leg Curl", 1, 8, 10, "failure"),
            ),
        ),
    ),
)


# --- Hazır şablonlar (bölüm 9) — atıf zorunlu -------------------------------

TEMPLATES: tuple[ProgramSeed, ...] = (
    ProgramSeed(
        name="StrongLifts 5x5",
        description=(
            "İki antrenmanın (A/B) dönüşümlü tekrarı. Her seans 5 set 5 tekrar, "
            "her seferinde 2.5 kg ekle. Yeni başlayanlar için en yalın doğrusal ilerleme."
        ),
        goal="strength",
        level="beginner",
        source_name="Mehdi Hadim (StrongLifts)",
        source_url="https://stronglifts.com/5x5/",
        days=(
            DaySeed(
                "Antrenman A",
                (
                    PxSeed("Barbell Back Squat", 5, 5, 5),
                    PxSeed("Barbell Bench Press", 5, 5, 5),
                    PxSeed("Barbell Row", 5, 5, 5),
                ),
            ),
            DaySeed(
                "Antrenman B",
                (
                    PxSeed("Barbell Back Squat", 5, 5, 5),
                    PxSeed("Barbell Overhead Press", 5, 5, 5),
                    PxSeed("Barbell Deadlift", 1, 5, 5),
                ),
            ),
        ),
    ),
    ProgramSeed(
        name="Starting Strength",
        description=(
            "Temel bileşik hareketlerde 3x5 doğrusal ilerleme. Teknik öğrenmeye ve "
            "hızlı güç kazanımına odaklı."
        ),
        goal="strength",
        level="beginner",
        source_name="Mark Rippetoe",
        source_url="https://startingstrength.com/",
        days=(
            DaySeed(
                "Antrenman A",
                (
                    PxSeed("Barbell Back Squat", 3, 5, 5),
                    PxSeed("Barbell Bench Press", 3, 5, 5),
                    PxSeed("Barbell Deadlift", 1, 5, 5),
                ),
            ),
            DaySeed(
                "Antrenman B",
                (
                    PxSeed("Barbell Back Squat", 3, 5, 5),
                    PxSeed("Barbell Overhead Press", 3, 5, 5),
                    PxSeed("Barbell Row", 3, 5, 5),
                ),
            ),
        ),
    ),
    ProgramSeed(
        name="PHUL — Power Hypertrophy Upper Lower",
        description=(
            "Haftada 4 gün: iki güç günü (düşük tekrar, ağır) + iki hipertrofi günü "
            "(yüksek tekrar, hacim). Güç ve kas kütlesini birlikte hedefler."
        ),
        goal="powerbuilding",
        level="intermediate",
        source_name="Brandon Campbell (PHUL)",
        source_url="https://www.muscleandstrength.com/workouts/phul-workout",
        days=(
            DaySeed(
                "Üst Vücut — Güç",
                (
                    PxSeed("Barbell Bench Press", 4, 3, 5, "rir1"),
                    PxSeed("Barbell Row", 4, 3, 5, "rir1"),
                    PxSeed("Barbell Overhead Press", 3, 5, 8, "rir1"),
                    PxSeed("Lat Pulldown", 3, 6, 10, "rir1"),
                    PxSeed("Skullcrusher", 3, 6, 10, "rir1"),
                    PxSeed("Dumbbell Curl", 3, 6, 10, "rir1"),
                ),
            ),
            DaySeed(
                "Alt Vücut — Güç",
                (
                    PxSeed("Barbell Back Squat", 4, 3, 5, "rir1"),
                    PxSeed("Barbell Deadlift", 3, 3, 5, "rir1"),
                    PxSeed("Leg Press", 3, 8, 12, "rir1"),
                    PxSeed("Lying Leg Curl", 3, 8, 12, "rir1"),
                    PxSeed("Standing Calf Raise", 4, 8, 12, "failure"),
                ),
            ),
            DaySeed(
                "Üst Vücut — Hipertrofi",
                (
                    PxSeed("Incline Dumbbell Press", 3, 8, 12, "rir1"),
                    PxSeed("Cable Row", 3, 8, 12, "rir1"),
                    PxSeed("Chest Fly Machine", 3, 10, 15, "failure"),
                    PxSeed("Lateral Raise", 4, 10, 15, "failure"),
                    PxSeed("Triceps Pushdown", 3, 10, 15, "failure"),
                    PxSeed("Cable Curl", 3, 10, 15, "failure"),
                ),
            ),
            DaySeed(
                "Alt Vücut — Hipertrofi",
                (
                    PxSeed("Barbell Back Squat", 3, 8, 12, "rir1"),
                    PxSeed("Romanian Deadlift", 3, 8, 12, "rir1"),
                    PxSeed("Leg Extension", 3, 10, 15, "failure"),
                    PxSeed("Seated Leg Curl", 3, 10, 15, "failure"),
                    PxSeed("Standing Calf Raise", 4, 12, 20, "failure"),
                ),
            ),
        ),
    ),
    ProgramSeed(
        name="Reddit PPL (Push / Pull / Legs)",
        description=(
            "Haftada 6 gün itme/çekme/bacak döngüsü. Yüksek sıklık ve hacim; "
            "toparlanması iyi olan orta seviye için."
        ),
        goal="hypertrophy",
        level="intermediate",
        source_name="Metallicadpa (r/Fitness topluluğu)",
        source_url="https://www.reddit.com/r/Fitness/comments/37ylk5/",
        days=(
            DaySeed(
                "İtme (Push)",
                (
                    PxSeed("Barbell Bench Press", 4, 5, 8, "rir1"),
                    PxSeed("Barbell Overhead Press", 3, 8, 12, "rir1"),
                    PxSeed("Incline Dumbbell Press", 3, 8, 12, "rir1"),
                    PxSeed("Lateral Raise", 3, 12, 20, "failure"),
                    PxSeed("Triceps Pushdown", 3, 10, 15, "failure"),
                    PxSeed("Overhead Rope Extension", 3, 10, 15, "failure"),
                ),
            ),
            DaySeed(
                "Çekme (Pull)",
                (
                    PxSeed("Barbell Deadlift", 3, 5, 5, "rir1"),
                    PxSeed("Pull-Up", 3, 6, 12, "failure"),
                    PxSeed("Cable Row", 3, 8, 12, "rir1"),
                    PxSeed("Face Pull", 3, 15, 20, "failure"),
                    PxSeed("Dumbbell Curl", 3, 8, 12, "rir1"),
                    PxSeed("Hammer Curl", 3, 10, 15, "failure"),
                ),
            ),
            DaySeed(
                "Bacak (Legs)",
                (
                    PxSeed("Barbell Back Squat", 4, 5, 8, "rir1"),
                    PxSeed("Romanian Deadlift", 3, 8, 12, "rir1"),
                    PxSeed("Leg Press", 3, 10, 15, "rir1"),
                    PxSeed("Lying Leg Curl", 3, 10, 15, "failure"),
                    PxSeed("Standing Calf Raise", 5, 10, 15, "failure"),
                ),
            ),
        ),
    ),
    # ------------------------------------------------------------------------
    # NOT — yüzde tabanlı ve dalgalı (wave) programlar hakkında
    #
    # 5/3/1, nSuns ve Candito 4 haftalık dalgalar hâlinde çalışır: her hafta
    # yüzdeler değişir. Veri modelinde "hafta" kavramı YOK — bir program tek bir
    # gün kümesinden ibaret. Bu yüzden şablonlar **1. haftanın** yüzdelerini
    # içeriyor ve açıklamada sonraki haftalarda ne yapılacağı yazıyor.
    #
    # Tam periyodizasyon desteği (mezosiklus modeli) ayrı bir özellik; bunu
    # sessizce yanlış modellemek yerine sınırı açıkça belirtmek tercih edildi.
    # ------------------------------------------------------------------------
    ProgramSeed(
        name="Greg Nuckols 3x Haftada Başlangıç",
        description=(
            "Haftada 3 gün, her gün squat + bench + deadlift/OHP. Yüzdeler antrenman "
            "maksimumuna göre; her hafta ağırlığı küçük adımlarla artır."
        ),
        goal="strength",
        level="beginner",
        source_name="Greg Nuckols (Stronger by Science)",
        source_url="https://www.strongerbyscience.com/programs/",
        days=(
            DaySeed(
                "Gün A",
                (
                    PxSeed("Barbell Back Squat", 3, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Bench Press", 3, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Row", 3, 8, 10, "rir1"),
                    # Plank süre bazlı: "tekrar" alanı burada SANİYE demek.
                    # Modelde ayrı bir süre alanı yok; bu bilinen bir sınır
                    # (bkz. docs/mimari.md, bilinen sınırlar).
                    PxSeed("Plank", 3, 30, 60),
                ),
            ),
            DaySeed(
                "Gün B",
                (
                    PxSeed("Barbell Back Squat", 3, 5, 5, "straight", None, "70"),
                    PxSeed("Barbell Overhead Press", 3, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Deadlift", 2, 5, 5, "straight", None, "80"),
                    PxSeed("Chin-Up", 3, 5, 10, "rir1"),
                ),
            ),
            DaySeed(
                "Gün C",
                (
                    PxSeed("Front Squat", 3, 5, 5, "straight", None, "70"),
                    PxSeed("Barbell Bench Press", 3, 8, 10, "rir1", None, "65"),
                    PxSeed("Romanian Deadlift", 3, 8, 10, "rir1"),
                    PxSeed("Cable Crunch", 3, 12, 15, "rir1"),
                ),
            ),
        ),
    ),
    ProgramSeed(
        name="5/3/1 Boring But Big",
        description=(
            "Ana hareket 5/3/1 yüzdeleriyle (son set AMRAP), ardından aynı hareketin "
            "5x10 hacim çalışması. ŞABLON 1. HAFTA yüzdelerini içerir "
            "(%65/%75/%85). 2. hafta %70/%80/%90 x3, 3. hafta %75/%85/%95 x5-3-1, "
            "4. hafta deload %40/%50/%60. Yüzdeler gerçek 1RM'in değil, "
            "**antrenman maksimumunun** (1RM x 0.90) yüzdesidir."
        ),
        goal="strength",
        level="intermediate",
        source_name="Jim Wendler",
        source_url="https://www.jimwendler.com/blogs/jimwendler-com/101065094-boring-but-big",
        days=(
            DaySeed(
                "Overhead Press günü",
                (
                    PxSeed("Barbell Overhead Press", 1, 5, 5, "straight", None, "65"),
                    PxSeed("Barbell Overhead Press", 1, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Overhead Press", 1, 5, 10, "failure", None, "85"),
                    PxSeed("Barbell Overhead Press", 5, 10, 10, "straight", None, "50"),
                    PxSeed("Chin-Up", 5, 8, 12, "rir1"),
                ),
            ),
            DaySeed(
                "Deadlift günü",
                (
                    PxSeed("Barbell Deadlift", 1, 5, 5, "straight", None, "65"),
                    PxSeed("Barbell Deadlift", 1, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Deadlift", 1, 5, 10, "failure", None, "85"),
                    PxSeed("Barbell Deadlift", 5, 10, 10, "straight", None, "50"),
                    PxSeed("Hanging Leg Raise", 5, 10, 15, "rir1"),
                ),
            ),
            DaySeed(
                "Bench Press günü",
                (
                    PxSeed("Barbell Bench Press", 1, 5, 5, "straight", None, "65"),
                    PxSeed("Barbell Bench Press", 1, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Bench Press", 1, 5, 10, "failure", None, "85"),
                    PxSeed("Barbell Bench Press", 5, 10, 10, "straight", None, "50"),
                    PxSeed("Dumbbell Row", 5, 10, 12, "rir1"),
                ),
            ),
            DaySeed(
                "Squat günü",
                (
                    PxSeed("Barbell Back Squat", 1, 5, 5, "straight", None, "65"),
                    PxSeed("Barbell Back Squat", 1, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Back Squat", 1, 5, 10, "failure", None, "85"),
                    PxSeed("Barbell Back Squat", 5, 10, 10, "straight", None, "50"),
                    PxSeed("Lying Leg Curl", 5, 10, 15, "rir1"),
                ),
            ),
        ),
    ),
    ProgramSeed(
        name="GZCLP",
        description=(
            "Üç kademeli yapı: T1 ağır ana hareket (5x3, son set AMRAP), T2 orta "
            "hacim (3x10), T3 yüksek tekrar yardımcı (3x15+). T1'de son set "
            "tamamlanamayınca 6x2'ye, sonra 10x1'e geçilir, ardından yeni maksimum test edilir."
        ),
        goal="strength",
        level="intermediate",
        source_name="Cody Lefever (GZCL)",
        source_url="https://www.gainzfever.com/",
        days=(
            DaySeed(
                "Gün 1 — Squat / Bench",
                (
                    PxSeed("Barbell Back Squat", 5, 3, 3, "straight", None, "85"),
                    PxSeed("Barbell Bench Press", 3, 10, 10, "rir1", None, "65"),
                    PxSeed("Lat Pulldown", 3, 15, 20, "failure"),
                ),
            ),
            DaySeed(
                "Gün 2 — OHP / Deadlift",
                (
                    PxSeed("Barbell Overhead Press", 5, 3, 3, "straight", None, "85"),
                    PxSeed("Barbell Deadlift", 3, 10, 10, "rir1", None, "65"),
                    PxSeed("Dumbbell Row", 3, 15, 20, "failure"),
                ),
            ),
            DaySeed(
                "Gün 3 — Bench / Squat",
                (
                    PxSeed("Barbell Bench Press", 5, 3, 3, "straight", None, "85"),
                    PxSeed("Barbell Back Squat", 3, 10, 10, "rir1", None, "65"),
                    PxSeed("Cable Row", 3, 15, 20, "failure"),
                ),
            ),
            DaySeed(
                "Gün 4 — Deadlift / OHP",
                (
                    PxSeed("Barbell Deadlift", 5, 3, 3, "straight", None, "85"),
                    PxSeed("Barbell Overhead Press", 3, 10, 10, "rir1", None, "65"),
                    PxSeed("Chin-Up", 3, 15, 20, "failure"),
                ),
            ),
        ),
    ),
    ProgramSeed(
        name="Candito 6 Haftalık Güç Programı",
        description=(
            "Altı haftalık blok periyodizasyon: hipertrofi → güç → tepe (peaking). "
            "ŞABLON 1-2. HAFTA (hipertrofi bloğu) yüzdelerini içerir; 3-4. haftada "
            "yüzdeler %80-87'ye, 5-6. haftada %90+ tekil çalışmaya çıkar."
        ),
        goal="strength",
        level="intermediate",
        source_name="Jonnie Candito",
        source_url="https://www.canditotraininghq.com/",
        days=(
            DaySeed(
                "Üst Vücut — Hacim",
                (
                    PxSeed("Barbell Bench Press", 4, 6, 8, "rir1", None, "70"),
                    PxSeed("Barbell Row", 4, 6, 8, "rir1"),
                    PxSeed("Seated Dumbbell Shoulder Press", 3, 8, 12, "rir1"),
                    PxSeed("Lat Pulldown", 3, 10, 12, "rir1"),
                    PxSeed("Skullcrusher", 3, 10, 12, "failure"),
                ),
            ),
            DaySeed(
                "Alt Vücut — Hacim",
                (
                    PxSeed("Barbell Back Squat", 4, 6, 8, "rir1", None, "70"),
                    PxSeed("Romanian Deadlift", 3, 8, 10, "rir1"),
                    PxSeed("Leg Press", 3, 10, 12, "rir1"),
                    PxSeed("Lying Leg Curl", 3, 10, 12, "failure"),
                ),
            ),
            DaySeed(
                "Üst Vücut — Yoğunluk",
                (
                    PxSeed("Barbell Bench Press", 5, 4, 5, "rir1", None, "80"),
                    PxSeed("Pendlay Row", 4, 5, 6, "rir1"),
                    PxSeed("Close Grip Bench Press", 3, 6, 8, "rir1"),
                    PxSeed("Face Pull", 3, 15, 20, "failure"),
                ),
            ),
            DaySeed(
                "Alt Vücut — Yoğunluk",
                (
                    PxSeed("Barbell Deadlift", 5, 4, 5, "rir1", None, "80"),
                    PxSeed("Front Squat", 3, 5, 6, "rir1"),
                    PxSeed("Good Morning", 3, 8, 10, "rir1"),
                    PxSeed("Standing Calf Raise", 4, 10, 15, "failure"),
                ),
            ),
        ),
    ),
    ProgramSeed(
        name="PHAT — Power Hypertrophy Adaptive Training",
        description=(
            "Haftada 5 gün: iki güç günü (üst/alt, düşük tekrar) + üç hipertrofi günü "
            "(sırt/omuz, alt vücut, göğüs/kol). Yüksek hacim; toparlanması iyi olan "
            "ileri seviye için."
        ),
        goal="powerbuilding",
        level="advanced",
        source_name="Layne Norton",
        source_url="https://www.simplyshredded.com/dr-layne-norton-training-series-full-routine.html",
        days=(
            DaySeed(
                "Gün 1 — Üst Vücut Güç",
                (
                    PxSeed("Pendlay Row", 3, 3, 5, "rir1"),
                    PxSeed("Pull-Up", 2, 6, 10, "rir1"),
                    PxSeed("Barbell Bench Press", 3, 3, 5, "rir1"),
                    PxSeed("Seated Dumbbell Shoulder Press", 2, 6, 10, "rir1"),
                    PxSeed("Dumbbell Curl", 3, 6, 10, "rir1"),
                    PxSeed("Skullcrusher", 3, 6, 10, "rir1"),
                ),
            ),
            DaySeed(
                "Gün 2 — Alt Vücut Güç",
                (
                    PxSeed("Barbell Back Squat", 3, 3, 5, "rir1"),
                    PxSeed("Hack Squat", 2, 6, 10, "rir1"),
                    PxSeed("Leg Extension", 2, 6, 10, "rir1"),
                    PxSeed("Romanian Deadlift", 3, 5, 8, "rir1"),
                    PxSeed("Lying Leg Curl", 2, 6, 10, "rir1"),
                    PxSeed("Standing Calf Raise", 4, 6, 10, "failure"),
                ),
            ),
            DaySeed(
                "Gün 3 — Sırt / Omuz Hipertrofi",
                (
                    PxSeed("Pendlay Row", 3, 8, 12, "rir1"),
                    PxSeed("Close Grip Lat Pulldown", 3, 10, 15, "rir1"),
                    PxSeed("Cable Row", 3, 12, 15, "failure"),
                    PxSeed("Seated Dumbbell Shoulder Press", 3, 8, 12, "rir1"),
                    PxSeed("Lateral Raise", 4, 12, 20, "failure"),
                    PxSeed("Cable Rear Delt Fly", 3, 12, 20, "failure"),
                ),
            ),
            DaySeed(
                "Gün 4 — Alt Vücut Hipertrofi",
                (
                    PxSeed("Barbell Back Squat", 3, 8, 12, "rir1"),
                    PxSeed("Leg Press", 3, 10, 15, "rir1"),
                    PxSeed("Leg Extension", 3, 15, 20, "failure"),
                    PxSeed("Romanian Deadlift", 3, 8, 12, "rir1"),
                    PxSeed("Seated Leg Curl", 3, 15, 20, "failure"),
                    PxSeed("Standing Calf Raise", 4, 15, 20, "failure"),
                ),
            ),
            DaySeed(
                "Gün 5 — Göğüs / Kol Hipertrofi",
                (
                    PxSeed("Incline Barbell Press", 3, 8, 12, "rir1"),
                    PxSeed("Chest Fly Machine", 3, 12, 15, "failure"),
                    PxSeed("Incline Dumbbell Press", 3, 12, 15, "rir1"),
                    PxSeed("Triceps Pushdown", 3, 12, 15, "failure"),
                    PxSeed("Overhead Rope Extension", 3, 12, 15, "failure"),
                    PxSeed("Cable Curl", 3, 12, 15, "failure"),
                    PxSeed("Hammer Curl", 3, 12, 15, "failure"),
                ),
            ),
        ),
    ),
    ProgramSeed(
        name="Alberto Nuñez Üst/Alt Split",
        description=(
            "Haftada 4 gün üst/alt bölünmesi. Doğal vücut geliştirmede uzun vadeli, "
            "sürdürülebilir hacim yaklaşımı: orta tekrar aralığı, RIR ile yönetilen "
            "yoğunluk, bileşik hareket önceliği."
        ),
        goal="hypertrophy",
        level="intermediate",
        source_name="Alberto Nuñez (3DMJ)",
        source_url="https://3dmusclejourney.com/",
        days=(
            DaySeed(
                "Üst Vücut A",
                (
                    PxSeed("Barbell Bench Press", 4, 6, 8, "rir1"),
                    PxSeed("Pendlay Row", 4, 6, 8, "rir1"),
                    PxSeed("Seated Dumbbell Shoulder Press", 3, 8, 12, "rir1"),
                    PxSeed("Close Grip Lat Pulldown", 3, 8, 12, "rir1"),
                    PxSeed("Lateral Raise", 3, 12, 15, "failure"),
                    PxSeed("Dumbbell Curl", 3, 8, 12, "rir1"),
                    PxSeed("Triceps Pushdown", 3, 10, 15, "failure"),
                ),
            ),
            DaySeed(
                "Alt Vücut A",
                (
                    PxSeed("Barbell Back Squat", 4, 6, 8, "rir1"),
                    PxSeed("Romanian Deadlift", 3, 8, 10, "rir1"),
                    PxSeed("Leg Press", 3, 10, 15, "rir1"),
                    PxSeed("Seated Leg Curl", 3, 10, 15, "failure"),
                    PxSeed("Standing Calf Raise", 4, 10, 15, "failure"),
                    PxSeed("Cable Crunch", 3, 12, 15, "rir1"),
                ),
            ),
            DaySeed(
                "Üst Vücut B",
                (
                    PxSeed("Incline Dumbbell Press", 4, 8, 12, "rir1"),
                    PxSeed("Chin-Up", 4, 6, 10, "rir1"),
                    PxSeed("Chest Fly Machine", 3, 12, 15, "failure"),
                    PxSeed("Cable Row", 3, 10, 12, "rir1"),
                    PxSeed("Cable Rear Delt Fly", 3, 15, 20, "failure"),
                    PxSeed("Preacher Curl", 3, 10, 12, "rir1"),
                    PxSeed("Overhead Rope Extension", 3, 10, 15, "failure"),
                ),
            ),
            DaySeed(
                "Alt Vücut B",
                (
                    PxSeed("Front Squat", 4, 6, 8, "rir1"),
                    PxSeed("Hip Thrust", 3, 8, 12, "rir1"),
                    PxSeed("Bulgarian Split Squat", 3, 10, 12, "rir1"),
                    PxSeed("Lying Leg Curl", 3, 10, 15, "failure"),
                    PxSeed("Standing Calf Raise", 4, 15, 20, "failure"),
                    PxSeed("Hanging Leg Raise", 3, 10, 15, "failure"),
                ),
            ),
        ),
    ),
    ProgramSeed(
        name="nSuns 5/3/1 LP",
        description=(
            "5/3/1'in yüksek hacimli doğrusal ilerleme türevi: her ana harekette "
            "9 set, artan-azalan yüzde piramidi ve bir AMRAP seti. ŞABLON 1. HAFTA "
            "yüzdelerini içerir. Haftalık artış AMRAP setindeki tekrar sayısına göre "
            "belirlenir. Yüksek hacim — toparlanma ve beslenme yerinde değilse önerilmez."
        ),
        goal="powerbuilding",
        level="advanced",
        source_name="nSuns (r/Fitness topluluğu)",
        source_url="https://www.reddit.com/r/nSuns/",
        days=(
            DaySeed(
                "Gün 1 — Bench / OHP",
                (
                    PxSeed("Barbell Bench Press", 1, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Bench Press", 1, 3, 3, "straight", None, "85"),
                    PxSeed("Barbell Bench Press", 1, 1, 8, "failure", None, "95"),
                    PxSeed("Barbell Bench Press", 1, 3, 3, "straight", None, "90"),
                    PxSeed("Barbell Bench Press", 1, 5, 5, "straight", None, "85"),
                    PxSeed("Barbell Bench Press", 1, 3, 3, "straight", None, "80"),
                    PxSeed("Barbell Overhead Press", 1, 6, 6, "straight", None, "50"),
                    PxSeed("Barbell Overhead Press", 1, 5, 5, "straight", None, "60"),
                    PxSeed("Barbell Overhead Press", 1, 3, 8, "failure", None, "70"),
                ),
            ),
            DaySeed(
                "Gün 2 — Squat / Sumo Deadlift",
                (
                    PxSeed("Barbell Back Squat", 1, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Back Squat", 1, 3, 3, "straight", None, "85"),
                    PxSeed("Barbell Back Squat", 1, 1, 8, "failure", None, "95"),
                    PxSeed("Barbell Back Squat", 1, 3, 3, "straight", None, "90"),
                    PxSeed("Barbell Back Squat", 1, 5, 5, "straight", None, "85"),
                    PxSeed("Sumo Deadlift", 1, 5, 5, "straight", None, "50"),
                    PxSeed("Sumo Deadlift", 1, 5, 5, "straight", None, "60"),
                    PxSeed("Sumo Deadlift", 1, 3, 8, "failure", None, "70"),
                ),
            ),
            DaySeed(
                "Gün 3 — OHP / Incline",
                (
                    PxSeed("Barbell Overhead Press", 1, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Overhead Press", 1, 3, 3, "straight", None, "85"),
                    PxSeed("Barbell Overhead Press", 1, 1, 8, "failure", None, "95"),
                    PxSeed("Incline Barbell Press", 3, 6, 8, "rir1", None, "60"),
                    PxSeed("Lateral Raise", 4, 12, 20, "failure"),
                    PxSeed("Face Pull", 4, 15, 20, "failure"),
                ),
            ),
            DaySeed(
                "Gün 4 — Deadlift / Front Squat",
                (
                    PxSeed("Barbell Deadlift", 1, 5, 5, "straight", None, "75"),
                    PxSeed("Barbell Deadlift", 1, 3, 3, "straight", None, "85"),
                    PxSeed("Barbell Deadlift", 1, 1, 8, "failure", None, "95"),
                    PxSeed("Front Squat", 3, 5, 5, "rir1", None, "60"),
                    PxSeed("Lying Leg Curl", 4, 10, 15, "failure"),
                    PxSeed("Cable Crunch", 4, 12, 15, "failure"),
                ),
            ),
            DaySeed(
                "Gün 5 — Close Grip / Sırt",
                (
                    PxSeed("Close Grip Bench Press", 1, 5, 5, "straight", None, "70"),
                    PxSeed("Close Grip Bench Press", 1, 5, 5, "straight", None, "80"),
                    PxSeed("Close Grip Bench Press", 1, 3, 8, "failure", None, "90"),
                    PxSeed("Pendlay Row", 4, 8, 10, "rir1"),
                    PxSeed("Chin-Up", 4, 8, 12, "failure"),
                    PxSeed("Barbell Shrug", 4, 10, 15, "failure"),
                ),
            ),
        ),
    ),
)
