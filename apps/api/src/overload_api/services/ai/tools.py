"""AI asistanının tool tanımları ve risk katmanlaması (bölüm 4.3).

--------------------------------------------------------------------------------
GÜVENLİK MODELİ
--------------------------------------------------------------------------------
Tool'lar iki kümeye ayrılır:

* **AUTO_EXECUTE** — yalnızca *yeni kayıt ekler* ya da salt-okunur. En kötü ihtimalle
  fazladan bir satır oluşur; kullanıcı silebilir. Onay istemez, akış kesilmez.

* **APPROVAL_REQUIRED** — var olan veriyi değiştirir/siler ya da program kurar.
  Bu tool'lar çağrıldığında **hiçbir veritabanı değişikliği olmaz**; sadece bir
  `PendingAction` satırı doğar. Değişikliği `POST /pending-actions/{id}/approve`
  endpoint'i uygular — modelin erişemediği, deterministik Python kodu.

**Hesap ayarları için tool YOKTUR ve olmayacaktır.** E-posta, şifre ve güvenlik
ayarları yalnızca ayrı bir ekrandan elle değişir. Bu, prompt talimatıyla değil
*tool yüzeyinin yokluğuyla* garanti altına alınır: model olmayan bir tool'u
çağıramaz. `tests/test_ai_tools.py` bu sınırı test eder.

--------------------------------------------------------------------------------
PROMPT CACHING
--------------------------------------------------------------------------------
Anthropic önbelleği bir **önek eşleşmesidir** ve render sırası `tools -> system ->
messages`. Buradaki tanımlar bu yüzden modül seviyesinde sabit ve **sırası
deterministik**: tek bir byte değişse (ör. sözlük sırası değişse) o istekten sonraki
tüm önbellek düşer. Tanımlara asla dinamik veri (tarih, kullanıcı adı, sayaç)
girmemeli.
"""

from __future__ import annotations

from typing import Any, Final

from overload_api.db.models.ai import ActionType

# --- Ortak şema parçaları ----------------------------------------------------

_DATE_FIELD: Final[dict[str, Any]] = {
    "type": "string",
    "format": "date",
    "description": "ISO tarih (YYYY-AA-GG). Belirtilmezse bugün kabul edilir.",
}

_MEAL_TYPES: Final[list[str]] = ["breakfast", "lunch", "dinner", "snack"]
_ACTIVITY_TYPES: Final[list[str]] = [
    "walking",
    "running",
    "cycling",
    "swimming",
    "sports",
    "other",
]
_EQUIPMENT: Final[list[str]] = [
    "barbell",
    "dumbbell",
    "machine",
    "plate_loaded",
    "smith_machine",
    "cable",
    "bodyweight",
    "other",
]
_TECHNIQUES: Final[list[str]] = [
    "straight",
    "rir1",
    "failure",
    "rir1_to_failure",
    "superset_failure",
    "drop_set",
    "myo_reps",
]


def _tool(
    name: ActionType, description: str, properties: dict[str, Any], required: list[str]
) -> dict[str, Any]:
    """Tool tanımı üretir.

    `strict: True` şemaya birebir uyan argüman garantisi verir; bunun için
    `additionalProperties: False` ve eksiksiz `required` zorunlu. Bu, modelin
    uydurduğu fazladan alanların sessizce veritabanına sızmasını engeller.
    """
    return {
        "name": name.value,
        "description": description,
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        },
    }


# --- Salt-okunur -------------------------------------------------------------

SEARCH_EXERCISE_LIBRARY = _tool(
    ActionType.search_exercise_library,
    (
        "Hareket kütüphanesinde arama yapar. Bir programa hareket eklemeden ya da "
        "bir hareketten bahsetmeden ÖNCE mutlaka bunu çağır. Kütüphanede olmayan bir "
        "hareketi asla uydurma — her hareketin kas grubu eşlemesi vardır ve uydurulan "
        "bir isim kas haritasını sessizce yanlışlar. Aradığın hareket çıkmazsa "
        "add_exercise_to_library ile eklemeyi öner."
    ),
    {
        "query": {
            "type": "string",
            "description": "Hareket adı ya da parçası (ör. 'lat pulldown', 'chest press').",
        },
        "equipment": {
            "type": ["string", "null"],
            "enum": [*_EQUIPMENT, None],
            "description": "Ekipmana göre daralt. Fark etmiyorsa null.",
        },
        "muscle_group_slug": {
            "type": ["string", "null"],
            "description": "Kas grubu slug'ı (ör. 'lats', 'chest'). Fark etmiyorsa null.",
        },
    },
    ["query", "equipment", "muscle_group_slug"],
)

GET_PROGRESSION_SUGGESTION = _tool(
    ActionType.get_progression_suggestion,
    (
        "Bir hareket için progresif overload motorunun hesapladığı bir sonraki hedefi "
        "döndürür (geçmiş setler, plato durumu, önerilen ağırlık/tekrar). "
        "Kullanıcı 'bugün ne kadar kaldırayım' türü bir şey sorduğunda sayı UYDURMA, "
        "bunu çağır — hesap deterministik kodda yapılır."
    ),
    {
        "exercise_id": {
            "type": "string",
            "description": "search_exercise_library'den dönen hareket id'si (UUID).",
        }
    },
    ["exercise_id"],
)

# --- Otomatik: yeni kayıt ekler ----------------------------------------------

LOG_FOOD_ITEM = _tool(
    ActionType.log_food_item,
    (
        "Yenen bir besini günlüğe ekler. Besin adı gerçek besin veritabanlarında "
        "(USDA / Open Food Facts) aranır ve eşleşen kayıt kullanılır — kalori/makro "
        "değerlerini SEN hesaplama, sadece besini ve gramajı bildir. "
        "Miktar belirsizse (ör. 'bir tabak pilav') makul bir tahmin yap ve "
        "cevabında tahmin ettiğini açıkça söyle."
    ),
    {
        "food_name": {
            "type": "string",
            "description": "Besinin adı, tercihen İngilizce ('chicken breast', 'white rice').",
        },
        "quantity_g": {
            "type": "number",
            "minimum": 1,
            "maximum": 10000,
            "description": "Gram cinsinden miktar.",
        },
        "meal_type": {"type": "string", "enum": _MEAL_TYPES},
        "date": _DATE_FIELD,
    },
    ["food_name", "quantity_g", "meal_type", "date"],
)

LOG_ACTIVITY = _tool(
    ActionType.log_activity,
    "Antrenman dışı bir aktiviteyi (yürüyüş, koşu, bisiklet...) günlüğe ekler.",
    {
        "activity_type": {"type": "string", "enum": _ACTIVITY_TYPES},
        "duration_min": {"type": "integer", "minimum": 1, "maximum": 1440},
        "date": _DATE_FIELD,
        "notes": {"type": ["string", "null"], "maxLength": 500},
    },
    ["activity_type", "duration_min", "date", "notes"],
)

LOG_BODYWEIGHT = _tool(
    ActionType.log_bodyweight,
    (
        "Günlük kilo kaydı ekler. Aynı güne ikinci kayıt gelirse üzerine yazılır "
        "(gün içi dalgalanma trendi bozar)."
    ),
    {
        "weight_kg": {"type": "number", "minimum": 20, "maximum": 400},
        "date": _DATE_FIELD,
    },
    ["weight_kg", "date"],
)

LOG_SORENESS = _tool(
    ActionType.log_soreness,
    "Bir kas grubu için günlük ağrı seviyesi kaydeder (0 = yok, 4 = hareket kısıtlayıcı).",
    {
        "muscle_group_slug": {
            "type": "string",
            "description": "Kas grubu slug'ı (ör. 'quads', 'lats', 'chest').",
        },
        "level": {"type": "integer", "minimum": 0, "maximum": 4},
        "date": _DATE_FIELD,
    },
    ["muscle_group_slug", "level", "date"],
)

LOG_SUPPLEMENT = _tool(
    ActionType.log_supplement,
    "Bir supplementin o gün alınıp alınmadığını işaretler.",
    {
        "supplement_name": {"type": "string", "maxLength": 80},
        "taken": {"type": "boolean"},
        "date": _DATE_FIELD,
    },
    ["supplement_name", "taken", "date"],
)

# --- Onay gerektirenler ------------------------------------------------------

_PROGRAM_EXERCISE_SCHEMA: Final[dict[str, Any]] = {
    "type": "object",
    "properties": {
        "exercise_id": {
            "type": "string",
            "description": (
                "search_exercise_library'den dönen id. ZORUNLU — serbest metin hareket "
                "adı kabul edilmez."
            ),
        },
        "target_sets": {"type": "integer", "minimum": 1, "maximum": 20},
        "target_rep_min": {"type": "integer", "minimum": 1, "maximum": 100},
        "target_rep_max": {"type": "integer", "minimum": 1, "maximum": 100},
        "technique": {"type": "string", "enum": _TECHNIQUES},
        "superset_group": {
            "type": ["integer", "null"],
            "description": (
                "Aynı değeri paylaşan hareketler superset olarak arka arkaya yapılır. "
                "Bağımsız hareketlerde null."
            ),
        },
        "rest_seconds": {"type": ["integer", "null"], "minimum": 0, "maximum": 900},
        "notes": {"type": ["string", "null"], "maxLength": 500},
    },
    "required": [
        "exercise_id",
        "target_sets",
        "target_rep_min",
        "target_rep_max",
        "technique",
        "superset_group",
        "rest_seconds",
        "notes",
    ],
    "additionalProperties": False,
}

PROPOSE_PROGRAM = _tool(
    ActionType.propose_program,
    (
        "Tam yapılandırılmış bir antrenman programı ÖNERİR. Bu tool programı KAYDETMEZ — "
        "kullanıcıya bir onay kartı gösterir; kullanıcı gözden geçirip düzenledikten sonra "
        "onaylarsa kaydedilir. Her hareket için önce search_exercise_library ile gerçek bir "
        "exercise_id bulmuş olman gerekir. Programı önermeden önce kullanıcının hedefini, "
        "haftada kaç gün ayırabildiğini, ekipman erişimini ve deneyim seviyesini öğren; "
        "eksik bilgi varsa tahmin etmek yerine sor."
    ),
    {
        "name": {"type": "string", "maxLength": 120},
        "description": {"type": ["string", "null"], "maxLength": 2000},
        "goal": {
            "type": "string",
            "enum": ["strength", "hypertrophy", "powerbuilding", "general_fitness"],
        },
        "level": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
        "days": {
            "type": "array",
            "minItems": 1,
            "maxItems": 7,
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "maxLength": 80},
                    "exercises": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 20,
                        "items": _PROGRAM_EXERCISE_SCHEMA,
                    },
                },
                "required": ["label", "exercises"],
                "additionalProperties": False,
            },
        },
        "rationale": {
            "type": "string",
            "maxLength": 2000,
            "description": "Bu programı neden böyle kurduğunun kısa gerekçesi; onay kartında gösterilir.",
        },
    },
    ["name", "description", "goal", "level", "days", "rationale"],
)

PROPOSE_UPDATE = _tool(
    ActionType.propose_update,
    (
        "Var olan bir kaydı DEĞİŞTİRMEYİ ya da SİLMEYİ önerir (antrenman kaydı, beslenme "
        "kalemi, kilo girişi, program satırı...). Bu tool değişikliği UYGULAMAZ — onay "
        "kartı üretir. Yeni kayıt eklemek için bunu kullanma, ilgili log_* tool'unu kullan. "
        "Hesap ayarları (e-posta, şifre, güvenlik) bu tool'un kapsamı DIŞINDADIR ve "
        "hiçbir koşulda değiştirilemez."
    ),
    {
        "entity": {
            "type": "string",
            "enum": [
                "workout_session",
                "set_log",
                "nutrition_log",
                "activity_log",
                "body_weight_log",
                "soreness_checkin",
                "supplement",
                "program",
                "program_exercise",
                "goal",
            ],
            "description": "Hangi tablodaki kayıt. Bu liste kapalıdır; başka değer kabul edilmez.",
        },
        "operation": {"type": "string", "enum": ["update", "delete"]},
        "entity_id": {"type": "string", "description": "Değiştirilecek kaydın UUID'si."},
        "changes": {
            "type": ["object", "null"],
            "description": (
                "operation='update' için alan->yeni değer eşlemesi. operation='delete' için null."
            ),
        },
        "reason": {
            "type": "string",
            "maxLength": 500,
            "description": "Kullanıcıya gösterilecek gerekçe.",
        },
    },
    ["entity", "operation", "entity_id", "changes", "reason"],
)

ADD_EXERCISE_TO_LIBRARY = _tool(
    ActionType.add_exercise_to_library,
    (
        "Kütüphanede olmayan bir hareketin EKLENMESİNİ önerir. Kas grubu eşlemesi "
        "zorunludur — eşlemesiz hareket kas haritasını bozar. Önce mutlaka "
        "search_exercise_library ile gerçekten var olmadığını doğrula."
    ),
    {
        "name": {"type": "string", "maxLength": 120},
        "equipment": {"type": "string", "enum": _EQUIPMENT},
        "primary_muscle_slugs": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {"type": "string"},
            "description": "Birincil çalışan kas gruplarının slug'ları.",
        },
        "secondary_muscle_slugs": {
            "type": "array",
            "maxItems": 6,
            "items": {"type": "string"},
        },
        "is_unilateral": {"type": "boolean"},
        "notes": {"type": ["string", "null"], "maxLength": 1000},
    },
    [
        "name",
        "equipment",
        "primary_muscle_slugs",
        "secondary_muscle_slugs",
        "is_unilateral",
        "notes",
    ],
)


# --- Kayıt (registry) --------------------------------------------------------
#
# SIRA ÖNEMLİ: prompt caching önek eşleşmesi yapar, bu listenin sırası değişirse
# tüm önbellek düşer. Yeni tool SONA eklenmeli.

ALL_TOOLS: Final[tuple[dict[str, Any], ...]] = (
    SEARCH_EXERCISE_LIBRARY,
    GET_PROGRESSION_SUGGESTION,
    LOG_FOOD_ITEM,
    LOG_ACTIVITY,
    LOG_BODYWEIGHT,
    LOG_SORENESS,
    LOG_SUPPLEMENT,
    PROPOSE_PROGRAM,
    PROPOSE_UPDATE,
    ADD_EXERCISE_TO_LIBRARY,
)

#: Onay akışına giren tool'lar. Tek doğruluk kaynağı burasıdır.
APPROVAL_REQUIRED: Final[frozenset[ActionType]] = frozenset(
    {
        ActionType.propose_program,
        ActionType.propose_update,
        ActionType.add_exercise_to_library,
    }
)

#: Onaysız çalışabilenler.
AUTO_EXECUTE: Final[frozenset[ActionType]] = frozenset(
    {
        ActionType.search_exercise_library,
        ActionType.get_progression_suggestion,
        ActionType.log_food_item,
        ActionType.log_activity,
        ActionType.log_bodyweight,
        ActionType.log_soreness,
        ActionType.log_supplement,
    }
)

#: AI'nın ASLA dokunamayacağı tablolar. `propose_update` şemasındaki `entity` enum'ı
#: zaten kapalı bir liste, ama bu küme ikinci bir savunma katmanı olarak
#: onay endpoint'inde de kontrol edilir.
FORBIDDEN_ENTITIES: Final[frozenset[str]] = frozenset(
    {"user", "chat_message", "pending_action", "action_log"}
)


def requires_approval(action: ActionType) -> bool:
    return action in APPROVAL_REQUIRED


def tool_names() -> frozenset[str]:
    return frozenset(t["name"] for t in ALL_TOOLS)
