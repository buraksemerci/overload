"""food_database_entry.source_dataset alani

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-15

Besin adaylarinin siralanmasi icin kaynak veri kumesi ("Foundation" /
"SR Legacy") saklaniyor.

Gerekcesi: USDA'nin Foundation kumesi temel gidalari (cig tavuk gogsu, pirinc,
yumurta) tutuyor, SR Legacy ise islenmis ve markali urunlerle dolu. "chicken
breast" arayan biri neredeyse her zaman Foundation kaydini kastediyor.

Bu alan olmadan TAZE sonuclar dogru siralaniyor ama ONBELLEKTEN gelenler
siralanamiyordu; yani arama kalitesi ilk aramadan sonra dusuyordu.

NULL = bu alan eklenmeden once onbellege girmis kayit. Siralamada Foundation
olmayanlarla ayni kefeye giriyor; veri kaybi yok, sadece o satirlar bir tik
geride kaliyor.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "food_database_entry",
        sa.Column("source_dataset", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("food_database_entry", "source_dataset")
