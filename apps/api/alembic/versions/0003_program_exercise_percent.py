"""program_exercise.target_percent_1rm alani

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-14

Yuzde tabanli programlar (5/3/1, nSuns, Candito) icin antrenman maksimumunun
yuzdesi. Bu alan olmadan o programlari kaydetmek YANLIS VERI uretiyordu:
program "%85 x 5+" diyor, biz sadece "5 tekrar" yazsak kullanici agirligi
kendi uydurur ve programin butun mantigi (yuzde dongusu) kaybolurdu.

NULL = agirlik progresif overload motoruna birakilir (mevcut davranis).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "program_exercise",
        sa.Column("target_percent_1rm", sa.Numeric(precision=5, scale=2), nullable=True),
    )
    op.create_check_constraint(
        "ck_program_exercise_percent_range",
        "program_exercise",
        "target_percent_1rm IS NULL OR target_percent_1rm BETWEEN 30 AND 120",
    )


def downgrade() -> None:
    op.drop_constraint("ck_program_exercise_percent_range", "program_exercise", type_="check")
    op.drop_column("program_exercise", "target_percent_1rm")
