"""Kullanici basina en fazla bir acik antrenman seansi

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-15

`start_session` ikinci bir acik seansi zaten 409 ile reddediyor, ama bu kural
YALNIZCA uygulama katmanindaydi. Iki POST yarisirsa (cift dokunus, yeniden
deneyen istemci, PWA'nin cevrimdisi kuyrugu) iki acik seans olusabiliyordu.

Sonucu agir: hem `/workouts/today` hem `start_session` acik seansi
`scalar_one_or_none()` ile okuyor, yani ikinci satir olustugu anda o kullanici
icin uygulamanin ANA endpoint'i kalici olarak 500 donmeye basliyor — her ekran
birden coker ve kullanicinin kendi basina duzeltme yolu yok.

`program.is_active` icin ayni desen (kismi tekil indeks) 0001'de zaten var;
burada da o gecerli. Veritabani seviyesinde tekillik, yaristaki ikinci POST'u
IntegrityError'a cevirir ve 409'a duser.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Indeks kurulamadan once mevcut cakismalar temizlenmeli; aksi halde
    # migration var olan bir veritabaninda basarisiz olur. En SON baslayan
    # acik seans korunur (kullanicinin uzerinde calistigi o), eskiler kapatilir.
    # Silmiyoruz: icindeki setler gercekten yapilmis antrenmanlardir ve
    # ilerleme gecmisinden dusurulmemeli.
    op.execute(
        sa.text("""
        UPDATE workout_session AS w
        SET completed_at = COALESCE(
            (SELECT max(s.completed_at) FROM set_log s WHERE s.workout_session_id = w.id),
            w.started_at
        )
        WHERE w.completed_at IS NULL
          AND w.id <> (
              SELECT w2.id
              FROM workout_session w2
              WHERE w2.user_id = w.user_id AND w2.completed_at IS NULL
              ORDER BY w2.started_at DESC, w2.id DESC
              LIMIT 1
          )
        """)
    )

    op.create_index(
        "uq_workout_session_one_open_per_user",
        "workout_session",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("completed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_workout_session_one_open_per_user",
        table_name="workout_session",
        postgresql_where=sa.text("completed_at IS NULL"),
    )
