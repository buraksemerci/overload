"""onboarding alanlari: antrenman deneyimi, hedefler, tamamlanma zamani

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-16

Her alanin BIR tuketicisi var; tuketicisi olmayan hicbir sey sorulmuyor.

  training_experience     baslangic agirligi -- gecmis yokken seviye
  training_goal           program onerisi, asistan baglami
  training_days_per_week  program onerisi, program yokken haftalik hedef
  nutrition_goal          kalori hedefinin varsayilani, asistan baglami
  onboarding_completed_at tanisma akisi bitti mi

Hepsi bos olabilir: kullanici bir adimi gecebilir ve o durumda ilgili ozellik
bugunku (muhafazakar) davranisinda kaliyor.

MEVCUT KULLANICILAR tanisma akisini bir kez goruyor (`onboarding_completed_at`
bos). Bu kasitli: onlarin da deneyim ve hedef bilgisi yok ve baslangic
agirliklari su an en dusuk seviyeden hesaplaniyor.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "training_experience",
            sa.Enum(
                "new",
                "under_1y",
                "one_to_three",
                "over_three",
                name="trainingexperience",
                native_enum=False,
                length=32,
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "user",
        sa.Column(
            "training_goal",
            sa.Enum(
                "strength",
                "hypertrophy",
                "powerbuilding",
                "general_fitness",
                name="programgoal",
                native_enum=False,
                length=32,
            ),
            nullable=True,
        ),
    )
    op.add_column("user", sa.Column("training_days_per_week", sa.SmallInteger(), nullable=True))
    op.add_column(
        "user",
        sa.Column(
            "nutrition_goal",
            sa.Enum("cut", "maintain", "bulk", name="nutritiongoal", native_enum=False, length=32),
            nullable=True,
        ),
    )
    op.add_column(
        "user",
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "training_days_sane",
        "user",
        "training_days_per_week IS NULL OR training_days_per_week BETWEEN 1 AND 7",
    )


def downgrade() -> None:
    # Adlandırma kuralı oluştururken `ck_user_` önekini ekledi; silerken tam ad.
    op.drop_constraint(op.f("ck_user_training_days_sane"), "user", type_="check")
    op.drop_column("user", "onboarding_completed_at")
    op.drop_column("user", "nutrition_goal")
    op.drop_column("user", "training_days_per_week")
    op.drop_column("user", "training_goal")
    op.drop_column("user", "training_experience")
