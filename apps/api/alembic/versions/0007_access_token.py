"""accesstoken tablosu: acik oturumlar

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-16

Oturumlar JWT'den veritabanina tasindi. JWT GERI ALINAMIYOR: imzasi gecerli
bir jeton suresi dolana kadar (yedi gun) kabul edilir. Sonuclari somut:

* "Cikis yap" yalnizca tarayicidaki kopyayi siliyordu. Jeton baskasinin eline
  gectiyse cikmak hicbir ise yaramiyordu.
* Hesabi silinen kullanicinin jetonu calismaya devam ediyordu.
* Ortak bir bilgisayarda oturum kapatmak, kapatmis olmuyordu.

Satir silinince jeton o anda gecersiz.

MEVCUT OTURUMLAR DUSUYOR. Bu migration'dan sonra herkesin yeniden giris
yapmasi gerekiyor: eski jetonlar JWT ve yeni strateji onlari tanimiyor.
On kisilik bir kurulumda kabul edilebilir; alternatifi iki stratejiyi bir
sure yan yana kosturmak ve gecis bitince temizlemeyi unutmak.

RLS YOK -- `user` tablosuyla ayni sebeple: kimlik dogrulama sirasinda henuz
bir `app.user_id` yok. Jetonun kendisi rastgele 43 karakter ve tahmin
edilemez; erisim kontrolu onun bilinmesine dayaniyor.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "accesstoken",
        sa.Column("token", sa.String(length=43), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="cascade"),
            nullable=False,
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    )
    # Suresi dolmus jetonlar yasa gore taranarak eleniyor: `created_at`
    # indekssiz kalirsa her istek tablo taramasi yapar.
    op.create_index("ix_accesstoken_created_at", "accesstoken", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_accesstoken_created_at", table_name="accesstoken")
    op.drop_table("accesstoken")
