"""Tüm ORM modelleri.

Alembic'in autogenerate'i `Base.metadata`'yı okur; bir model burada import
edilmezse metadata'ya kaydolmaz ve migration'da **sessizce** eksik kalır.
Yeni model eklerken bu dosyaya da eklemek zorunlu.
"""

from overload_api.db.base import Base
from overload_api.db.models.ai import (
    ActionLog,
    ActionResult,
    ActionType,
    AiUsage,
    ChatMessage,
    ChatRole,
    CoachReport,
    PendingAction,
    PendingActionStatus,
)
from overload_api.db.models.body import (
    BodyWeightLog,
    InjuryNote,
    SorenessCheckin,
    Supplement,
    SupplementIntake,
    SupplementSchedule,
)
from overload_api.db.models.exercise import (
    BodyRegion,
    Equipment,
    Exercise,
    ExerciseMuscleMap,
    MuscleGroup,
    MuscleRole,
)
from overload_api.db.models.nutrition import (
    ActivityLog,
    ActivitySource,
    ActivityType,
    FoodDatabaseEntry,
    FoodSource,
    MealType,
    NutritionLog,
)
from overload_api.db.models.program import (
    IntensityTechnique,
    Program,
    ProgramDay,
    ProgramExercise,
    ProgramGoal,
    ProgramLevel,
)
from overload_api.db.models.user import (
    AccessToken,
    ActivityLevel,
    Goal,
    GoalType,
    Sex,
    User,
)
from overload_api.db.models.workout import PersonalRecord, PRType, SetLog, WorkoutSession

# RLS uygulanacak tablolar: kullanıcıya ait satır tutan her tablo.
# `user` ve `accesstoken` hariç — fastapi-users, kimlik doğrulanmadan ÖNCE
# e-postayla kullanıcı ve jetonla oturum aramak zorunda; o anda henüz bir
# app.user_id yok.
# `muscle_group`, `exercise`, `food_database_entry` de hariç: paylaşılan referans/önbellek.
RLS_TABLES: tuple[str, ...] = (
    "goal",
    "workout_session",
    "set_log",
    "personal_record",
    "body_weight_log",
    "soreness_checkin",
    "injury_note",
    "supplement",
    "supplement_intake",
    "nutrition_log",
    "activity_log",
    "chat_message",
    "pending_action",
    "action_log",
    "coach_report",
    "ai_usage",
)

# `program` ve `exercise` özel: şablon/kütüphane satırları (owner NULL) herkese açık
# okunur, kullanıcı satırları sadece sahibine.
RLS_OWNER_NULLABLE_TABLES: tuple[str, ...] = ("program", "exercise")

__all__ = [
    "RLS_OWNER_NULLABLE_TABLES",
    "RLS_TABLES",
    "AccessToken",
    "ActionLog",
    "ActionResult",
    "ActionType",
    "ActivityLevel",
    "ActivityLog",
    "ActivitySource",
    "ActivityType",
    "AiUsage",
    "Base",
    "BodyRegion",
    "BodyWeightLog",
    "ChatMessage",
    "ChatRole",
    "CoachReport",
    "Equipment",
    "Exercise",
    "ExerciseMuscleMap",
    "FoodDatabaseEntry",
    "FoodSource",
    "Goal",
    "GoalType",
    "InjuryNote",
    "IntensityTechnique",
    "MealType",
    "MuscleGroup",
    "MuscleRole",
    "NutritionLog",
    "PRType",
    "PendingAction",
    "PendingActionStatus",
    "PersonalRecord",
    "Program",
    "ProgramDay",
    "ProgramExercise",
    "ProgramGoal",
    "ProgramLevel",
    "SetLog",
    "Sex",
    "SorenessCheckin",
    "Supplement",
    "SupplementIntake",
    "SupplementSchedule",
    "User",
    "WorkoutSession",
]
