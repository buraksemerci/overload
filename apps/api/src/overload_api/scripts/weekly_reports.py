"""Haftalık koç raporu işi — cron/zamanlanmış görev giriş noktası.

Kullanım:

    # 1. Geçen haftanın raporlarını kuyruğa al (Pazartesi 03:00 gibi)
    python -m overload_api.scripts.weekly_reports submit

    # 2. Hazır sonuçları veritabanına yaz (Pazartesi 06:00 gibi)
    python -m overload_api.scripts.weekly_reports collect --batch-id msgbatch_xxx

    # Tek komutta gönder + bekle + topla (küçük kullanıcı sayısı için)
    python -m overload_api.scripts.weekly_reports run

    # Ne gönderileceğini gör, hiçbir şey gönderme
    python -m overload_api.scripts.weekly_reports submit --dry-run

**Neden iki aşama:** Batch API sonuçları dakikalar ile 24 saat arasında hazır
oluyor. `run` komutu beklemeyi kendisi yapıyor ama uzun sürebileceği için
üretimde iki ayrı cron girdisi daha sağlıklı — ilk iş kısa sürer ve biter,
ikinci iş hazır sonuçları toplar.

**Nerede çalıştırılır:** Railway/Render'da "Cron Job" olarak, ya da GitHub
Actions `schedule` ile. Batch id'sini iki iş arasında taşımak gerektiği için
`run` komutu tek cron girdisiyle çalışan basit kurulum için tercih edilebilir.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import timedelta

from overload_api.core.time import now_utc
from overload_api.db.session import session_scope
from overload_api.features.coach import service
from overload_api.services.ai.client import batch_status

logger = logging.getLogger("weekly-reports")

#: `run` komutunda batch için beklenen azami süre.
MAX_WAIT_SECONDS = 30 * 60
POLL_INTERVAL_SECONDS = 30


def _last_week_start() -> object:
    """Geçen haftanın Pazartesi'si. Rapor tamamlanmış bir hafta için üretilir;
    içinde bulunulan hafta için üretmek yarım veriyle yorum yapmak olurdu."""
    today = now_utc().date()
    return service.week_start_for(today - timedelta(days=7))


async def _submit(dry_run: bool) -> str | None:
    week_start = _last_week_start()
    # Seed ve rapor işleri sahip rolüyle koşar: tüm kullanıcıların verisine
    # erişmeleri gerekiyor, RLS kapsamı tek kullanıcıya bağlı.
    async with session_scope(assume_app_role=False) as session:
        batch_id, count = await service.submit_weekly_batch(
            session,
            week_start,
            dry_run=dry_run,  # type: ignore[arg-type]
        )
    if count == 0:
        logger.info("Gonderilecek rapor yok (%s haftasi).", week_start)
        return None
    if dry_run:
        logger.info("dry-run: %d istek hazirlandi.", count)
        return None
    logger.info("Batch gonderildi: %s (%d istek)", batch_id, count)
    return batch_id


async def _collect(batch_id: str) -> int:
    async with session_scope(assume_app_role=False) as session:
        return await service.collect_weekly_batch(session, batch_id)


async def _wait_for(batch_id: str) -> bool:
    """Batch bitene kadar bekler. Zaman aşımında False döner."""
    waited = 0
    while waited < MAX_WAIT_SECONDS:
        status = await batch_status(batch_id)
        logger.info("batch %s durumu: %s", batch_id, status)
        if status == "ended":
            return True
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        waited += POLL_INTERVAL_SECONDS
    logger.warning(
        "Batch %s %d dakikada bitmedi. Daha sonra `collect --batch-id %s` ile topla.",
        batch_id,
        MAX_WAIT_SECONDS // 60,
        batch_id,
    )
    return False


async def _run() -> int:
    batch_id = await _submit(dry_run=False)
    if batch_id is None:
        return 0
    if not await _wait_for(batch_id):
        return 0
    return await _collect(batch_id)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Haftalık koç raporu işi")
    sub = parser.add_subparsers(dest="command", required=True)

    p_submit = sub.add_parser("submit", help="Geçen haftanın raporlarını kuyruğa al")
    p_submit.add_argument("--dry-run", action="store_true", help="Gönderme, sadece say")

    p_collect = sub.add_parser("collect", help="Hazır batch sonuçlarını yaz")
    p_collect.add_argument("--batch-id", required=True)

    sub.add_parser("run", help="Gönder, bekle ve topla (tek komut)")

    args = parser.parse_args()

    match args.command:
        case "submit":
            batch_id = asyncio.run(_submit(args.dry_run))
            if batch_id:
                # Cron zincirinde bir sonraki işe taşınabilsin diye stdout'a da yaz.
                print(batch_id)
        case "collect":
            written = asyncio.run(_collect(args.batch_id))
            print(f"{written} rapor yazildi")
        case "run":
            written = asyncio.run(_run())
            print(f"{written} rapor yazildi")
        case _:  # pragma: no cover - argparse zaten engelliyor
            parser.print_help()
            sys.exit(1)


if __name__ == "__main__":
    main()
