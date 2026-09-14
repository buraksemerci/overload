"""İlk Alembic migration'ını canlı veritabanı olmadan üretir.

`alembic revision --autogenerate` çalışan bir Postgres bağlantısı ister
(`compare/schema.py` içinde `assert connection is not None`). Ama ilk migration
için karşılaştırılacak bir şey yok — hedef zaten boş şema. Bu yüzden ops ağacını
doğrudan metadata'dan kurup Alembic'in kendi render motoruyla basıyoruz.

Sonraki migration'lar normal akışla üretilir:
    alembic revision --autogenerate -m "aciklama"

Kullanım:
    python scripts/build_initial_migration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent / "apps" / "api"
sys.path.insert(0, str(API_ROOT / "src"))

from alembic.autogenerate import render_python_code  # noqa: E402
from alembic.migration import MigrationContext  # noqa: E402
from alembic.operations import ops  # noqa: E402

from overload_api.db.models import Base  # noqa: E402

HEADER = '''"""ilk sema - tum tablolar, kisitlar ve indeksler

Revision ID: 0001
Revises:
Create Date: 2026-09-13

Bu dosya `scripts/build_initial_migration.py` ile uretildi (bkz. betigin docstringi).
Elle duzenlenebilir; sonraki migration'lar alembic autogenerate ile uretilir.
"""

from __future__ import annotations

from collections.abc import Sequence

import fastapi_users_db_sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# fastapi_users_db_sqlalchemy import'u ZORUNLU ve gorunuste kullanilmiyor:
# `user.id` ve ona referans veren tum FK sutunlari
# `fastapi_users_db_sqlalchemy.generics.GUID()` tipiyle render ediliyor.
# Alembic render motoru tipi tam nitelikli adiyla yaziyor ama import'u
# eklemiyor; import olmadan migration NameError ile patlar.
_ = fastapi_users_db_sqlalchemy

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
'''

FOOTER = """

def downgrade() -> None:
"""


def main() -> None:
    ctx = MigrationContext.configure(dialect_name="postgresql")

    create_ops: list[object] = []
    index_ops: list[object] = []
    for table in Base.metadata.sorted_tables:
        create_ops.append(ops.CreateTableOp.from_table(table))
        for index in sorted(table.indexes, key=lambda i: i.name or ""):
            index_ops.append(ops.CreateIndexOp.from_index(index))

    upgrade_body = render_python_code(
        ops.UpgradeOps(ops=[*create_ops, *index_ops]), migration_context=ctx
    )

    drop_ops: list[object] = [
        ops.DropIndexOp.from_index(index)
        for table in Base.metadata.sorted_tables
        for index in sorted(table.indexes, key=lambda i: i.name or "")
    ]
    drop_ops += [
        ops.DropTableOp.from_table(table) for table in reversed(Base.metadata.sorted_tables)
    ]
    downgrade_body = render_python_code(ops.UpgradeOps(ops=drop_ops), migration_context=ctx)

    target = API_ROOT / "alembic" / "versions" / "0001_initial_schema.py"

    # TEK SEFERLIK BETIK. Sonraki migration'lar `alembic revision --autogenerate`
    # ile uretiliyor; bu betigi tekrar calistirmak 0001'i GUNCEL metadata'dan
    # yeniden yazar ve sonraki migration'lari (0002 RLS, 0003 yuzde alani)
    # gecersiz kilar: 0001 zaten o sutunu olusturdugu icin 0003 "column already
    # exists" ile patlar.
    if target.exists() and "--force" not in sys.argv:
        print(
            f"HATA: {target.name} zaten var.\n"
            "Bu betik TEK SEFERLIKTIR — tekrar calistirmak sonraki migration'lari "
            "gecersiz kilar.\n"
            "Yeni bir sema degisikligi icin:  alembic revision --autogenerate -m 'aciklama'\n"
            "Gercekten yeniden uretmek istiyorsan (bos veritabani + tum migration'lari "
            "silerek):  python scripts/build_initial_migration.py --force"
        )
        raise SystemExit(1)

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(HEADER + upgrade_body + FOOTER + downgrade_body + "\n", encoding="utf-8")

    print(f"Yazildi: {target}")
    print(f"  tablo: {len(create_ops)}  indeks: {len(index_ops)}")


if __name__ == "__main__":
    main()
