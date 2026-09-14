"""Haftalık koç raporu endpoint'leri (Bölüm 8, ekran 14).

Rapor **üretimi** burada değil — gece çalışan `scripts/weekly_reports.py` işi
yapıyor. Bir HTTP isteğinden batch gönderip beklemek, isteği saatlerce açık
tutmak demek olurdu.
"""

from __future__ import annotations

import uuid
from datetime import date as date_t
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from overload_api.core.deps import CurrentUser, DbSession
from overload_api.core.time import now_utc, today_in
from overload_api.db.models.ai import CoachReport
from overload_api.features.coach import service

router = APIRouter(prefix="/coach", tags=["coach"])


class CoachReportOut(BaseModel):
    id: uuid.UUID
    week_start: date_t
    content: str
    metrics: dict[str, Any] | None
    generated_at: datetime
    read_at: datetime | None

    model_config = {"from_attributes": True}


class WeeklyMetricsOut(BaseModel):
    """Rapor henüz üretilmemişken bile gösterilebilecek ham sayılar.

    Böylece kullanıcı Pazartesi sabahı rapor gelmeden de haftasını görebiliyor —
    AI metni gecikse bile ekran boş kalmıyor.
    """

    metrics: dict[str, Any]
    has_report: bool


@router.get("/reports", response_model=list[CoachReportOut])
async def list_reports(
    db: DbSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=52)] = 12,
) -> list[CoachReport]:
    rows = await db.execute(
        select(CoachReport)
        .where(CoachReport.user_id == user.id)
        .order_by(CoachReport.week_start.desc())
        .limit(limit)
    )
    return list(rows.scalars().all())


@router.get("/reports/latest", response_model=CoachReportOut)
async def latest_report(db: DbSession, user: CurrentUser) -> CoachReport:
    row = (
        await db.execute(
            select(CoachReport)
            .where(CoachReport.user_id == user.id)
            .order_by(CoachReport.week_start.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Henüz rapor üretilmedi. Raporlar her hafta başı otomatik oluşur.",
        )
    return row


@router.get("/current-week", response_model=WeeklyMetricsOut)
async def current_week(db: DbSession, user: CurrentUser) -> WeeklyMetricsOut:
    """İçinde bulunulan haftanın canlı metrikleri (rapor beklemeden)."""
    week_start = service.week_start_for(today_in(user.timezone))
    metrics = await service.gather_metrics(db, user, week_start)

    has_report = (
        await db.execute(
            select(CoachReport.id).where(
                CoachReport.user_id == user.id, CoachReport.week_start == week_start
            )
        )
    ).scalar_one_or_none() is not None

    return WeeklyMetricsOut(metrics=metrics.to_json(), has_report=has_report)


@router.post("/reports/{report_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(report_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    row = await db.get(CoachReport, report_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rapor bulunamadı.")
    if row.read_at is None:
        row.read_at = now_utc()
        await db.commit()
