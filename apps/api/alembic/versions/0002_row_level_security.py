"""row-level security politikalari ve uygulama rolu

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-13

--------------------------------------------------------------------------------
NEDEN AYRI BIR UYGULAMA ROLU VAR
--------------------------------------------------------------------------------
Postgres'te bir tablonun SAHIBI, RLS politikalarini varsayilan olarak BAYPAS EDER.
Neon'da (ve cogu yonetilen Postgres'te) uygulama, tablolari yaratan rolle baglanir.
Yani politikalari yazip hicbir sey korumamis olma tuzagi gercek ve sessizdir:
politikalar `pg_policies` icinde durur, sorgular hepsini gormeye devam eder.

Iki cozum var:
  (a) ALTER TABLE ... FORCE ROW LEVEL SECURITY  -> sahip de politikalara tabi olur,
      ama o zaman seed betigi de paylasilan referans veriyi (kas gruplari, hareket
      kutuphanesi, sablon programlar) yazamaz hale gelir.
  (b) Uygulama icin ayri, sahip OLMAYAN bir rol; her transaction basinda SET LOCAL ROLE.
      Migration ve seed sahip rolle kosar (politikalari baypas eder), uygulama
      istekleri kisitli rolle kosar (politikalara tabidir).

(b) secildi. `SET LOCAL` kritik: transaction bitince hem rol hem app.user_id duser,
boylece havuzdan ayni baglantiyi alan sonraki istek onceki kullanicinin kimligini
devralamaz.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "overload_app"

# Kullaniciya ait satir tutan tablolar: politika dogrudan user_id uzerinden.
USER_OWNED_TABLES = (
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
)

# owner_id NULL olabilen tablolar: NULL sahipli satirlar paylasilan kutuphane
# (sablon programlar, hazir hareketler) ve herkese okunur; yazma sadece sahibe.
OWNER_NULLABLE_TABLES = ("program", "exercise")

# Paylasilan referans/onbellek: RLS yok, ama yazma yetkisi de verilmiyor
# (uygulama rolu bunlari sadece OKUYABILIR; yeni besin onbellegi haric).
READ_ONLY_REFERENCE = ("muscle_group",)


def upgrade() -> None:
    # --- Yardimci fonksiyon ---------------------------------------------------
    # current_setting(..., true) deger yoksa NULL yerine BOS STRING dondurebilir;
    # ''::uuid ise hata firlatir. NULLIF bunu kapatiyor.
    # Sonuc NULL oldugunda "user_id = NULL" -> NULL -> satir gelmez: fail-closed.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
        LANGUAGE sql STABLE
        AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
        """
    )

    # --- Uygulama rolu --------------------------------------------------------
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} NOLOGIN;
            END IF;
        END $$;
        """
    )
    # Migration'i koşan rol, uygulama rolune SET ROLE yapabilmek icin uye olmali.
    op.execute(f"GRANT {APP_ROLE} TO CURRENT_USER;")
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE};")
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP_ROLE};"
    )
    op.execute(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE};")
    # Sonradan eklenen tablolar da otomatik yetkilensin, yoksa her yeni tabloda
    # "permission denied" ile karsilasilir ve sebebi gec anlasilir.
    op.execute(
        f"""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP_ROLE};
        """
    )

    # Referans tablolari: sadece okuma.
    for table in READ_ONLY_REFERENCE:
        op.execute(f"REVOKE INSERT, UPDATE, DELETE ON {table} FROM {APP_ROLE};")

    # --- Kullaniciya ait tablolar --------------------------------------------
    for table in USER_OWNED_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        # USING  -> hangi satirlar GORULUR (SELECT/UPDATE/DELETE)
        # WITH CHECK -> hangi satirlar YAZILABILIR (INSERT/UPDATE)
        # Ikisi de gerekli: sadece USING yazarsak kullanici baskasinin user_id'siyle
        # satir EKLEYEBILIR (goremese bile).
        op.execute(
            f"""
            CREATE POLICY {table}_isolation ON {table}
            FOR ALL
            USING (user_id = app_current_user_id())
            WITH CHECK (user_id = app_current_user_id());
            """
        )

    # --- owner_id NULL olabilen tablolar -------------------------------------
    for table in OWNER_NULLABLE_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        # Okuma: kendi satirlarim + paylasilan kutuphane (owner_id IS NULL).
        op.execute(
            f"""
            CREATE POLICY {table}_read ON {table}
            FOR SELECT
            USING (owner_id IS NULL OR owner_id = app_current_user_id());
            """
        )
        # Yazma: sadece kendi adima. owner_id NULL satir olusturamam —
        # yoksa kullanici kendi programini herkese acik sablona donusturebilirdi.
        op.execute(
            f"""
            CREATE POLICY {table}_write ON {table}
            FOR INSERT
            WITH CHECK (owner_id = app_current_user_id());
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_modify ON {table}
            FOR UPDATE
            USING (owner_id = app_current_user_id())
            WITH CHECK (owner_id = app_current_user_id());
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_delete ON {table}
            FOR DELETE
            USING (owner_id = app_current_user_id());
            """
        )

    # --- Alt tablolar: ust kaydin sahipligi uzerinden -------------------------
    # program_day / program_exercise'te user_id yok; sahiplik program uzerinden gelir.
    op.execute("ALTER TABLE program_day ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY program_day_isolation ON program_day
        FOR ALL
        USING (EXISTS (
            SELECT 1 FROM program p WHERE p.id = program_day.program_id
            AND (p.owner_id IS NULL OR p.owner_id = app_current_user_id())
        ))
        WITH CHECK (EXISTS (
            SELECT 1 FROM program p WHERE p.id = program_day.program_id
            AND p.owner_id = app_current_user_id()
        ));
        """
    )
    op.execute("ALTER TABLE program_exercise ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY program_exercise_isolation ON program_exercise
        FOR ALL
        USING (EXISTS (
            SELECT 1 FROM program_day d
            JOIN program p ON p.id = d.program_id
            WHERE d.id = program_exercise.program_day_id
            AND (p.owner_id IS NULL OR p.owner_id = app_current_user_id())
        ))
        WITH CHECK (EXISTS (
            SELECT 1 FROM program_day d
            JOIN program p ON p.id = d.program_id
            WHERE d.id = program_exercise.program_day_id
            AND p.owner_id = app_current_user_id()
        ));
        """
    )
    op.execute("ALTER TABLE exercise_muscle_map ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY exercise_muscle_map_isolation ON exercise_muscle_map
        FOR ALL
        USING (EXISTS (
            SELECT 1 FROM exercise e WHERE e.id = exercise_muscle_map.exercise_id
            AND (e.owner_id IS NULL OR e.owner_id = app_current_user_id())
        ))
        WITH CHECK (EXISTS (
            SELECT 1 FROM exercise e WHERE e.id = exercise_muscle_map.exercise_id
            AND e.owner_id = app_current_user_id()
        ));
        """
    )


def downgrade() -> None:
    for table in (
        "exercise_muscle_map",
        "program_exercise",
        "program_day",
        *OWNER_NULLABLE_TABLES,
        *USER_OWNED_TABLES,
    ):
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
        op.execute(f"DROP POLICY IF EXISTS {table}_isolation ON {table};")
        for suffix in ("read", "write", "modify", "delete"):
            op.execute(f"DROP POLICY IF EXISTS {table}_{suffix} ON {table};")

    op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {APP_ROLE};")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {APP_ROLE};")
    op.execute("DROP FUNCTION IF EXISTS app_current_user_id();")
    # Rol bilerek DUSURULMUYOR: baska veritabani nesneleri ona bagli olabilir ve
    # DROP ROLE bu durumda hata verir. Elle kaldirmak isteyen: DROP ROLE overload_app;
