"""ai_usage tablosu: kullanici basina gunluk AI kullanimi

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-16

Anthropic faturasi kullanima gore cikiyor ve uygulamayi birkac kisiye acmak o
faturayi baskalarinin eline vermek demek. Kotu niyet de gerekmiyor: donguye
giren bir istemci ya da meraktan yuz kere denenen bir foto ayristirma yeter.

Sayac GUN BASINA: aylik bir sinir ayin ucuncu gunu tukenebiliyor ve geri kalan
yirmi yedi gun uygulama olu kaliyor.

RLS acik. Kullanici kendi sayacini gorebilmeli (hesap ekraninda gosteriliyor)
ama baskasininkini goremez ve kendi satirini da elle degistiremez -- politika
yazmaya izin veriyor ama yazan tek yer uygulama kodu; asil koruma, sinirin
istemcide degil sunucuda uygulanmasi.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_usage",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        # Kullanicinin KENDI saat dilimindeki gun: UTC'ye sabitlemek gun
        # donumunu kullanicinin gecesinin ortasina dusururdu.
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        # Onbellekten okunan token onda bir fiyatina geliyor; normal girdiyle
        # ayni kefeye koymak siniri gereksiz yere sikistirir.
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("requests >= 0", name="ck_ai_usage_requests_positive"),
    )

    op.execute("ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY ai_usage_isolation ON ai_usage
        FOR ALL
        USING (user_id = app_current_user_id())
        WITH CHECK (user_id = app_current_user_id());
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS ai_usage_isolation ON ai_usage;")
    op.drop_table("ai_usage")
