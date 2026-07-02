from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timezone

from app.config import (
    S3_DAILY_BACKUP_ENABLED,
    S3_DAILY_BACKUP_HOUR_UTC,
    S3_DAILY_BACKUP_MINUTE_UTC,
    S3_DAILY_BACKUP_WORKER_INTERVAL_SECONDS,
)
from app.s3_daily_backup import create_and_upload_daily_backup

logger = logging.getLogger("erp.s3_backup_scheduler")

_worker_thread: threading.Thread | None = None
_worker_stop = threading.Event()


def _due_now(now_utc: datetime, *, last_success_date: date | None) -> bool:
    if last_success_date == now_utc.date():
        return False
    scheduled = now_utc.replace(
        hour=S3_DAILY_BACKUP_HOUR_UTC,
        minute=S3_DAILY_BACKUP_MINUTE_UTC,
        second=0,
        microsecond=0,
    )
    return now_utc >= scheduled


def _worker_loop() -> None:
    interval = max(30, S3_DAILY_BACKUP_WORKER_INTERVAL_SECONDS)
    last_success_date: date | None = None
    last_attempt_at: datetime | None = None
    while not _worker_stop.is_set():
        now_utc = datetime.now(timezone.utc)
        can_retry = last_attempt_at is None or (now_utc - last_attempt_at).total_seconds() >= 1800
        if _due_now(now_utc, last_success_date=last_success_date) and can_retry:
            last_attempt_at = now_utc
            try:
                result = create_and_upload_daily_backup(target_date=now_utc.date())
                last_success_date = now_utc.date()
                logger.info("s3 daily backup finished: %s", result)
            except Exception:
                logger.exception("s3 daily backup cycle failed")
        _worker_stop.wait(interval)


def start_s3_backup_scheduler_worker() -> None:
    global _worker_thread
    if not S3_DAILY_BACKUP_ENABLED:
        return
    if _worker_thread is not None and _worker_thread.is_alive():
        return
    _worker_stop.clear()
    _worker_thread = threading.Thread(
        target=_worker_loop,
        name="s3-daily-backup-worker",
        daemon=True,
    )
    _worker_thread.start()


def stop_s3_backup_scheduler_worker() -> None:
    _worker_stop.set()
    time.sleep(0.05)
