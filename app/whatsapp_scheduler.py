from __future__ import annotations

import logging
import threading
import time

from app.config import (
    WHATSAPP_PREVENTIVE_WORKER_ENABLED,
    WHATSAPP_REMINDER_WORKER_ENABLED,
    WHATSAPP_REMINDER_WORKER_INTERVAL_SECONDS,
)
from app.preventive_maintenance import dispatch_preventive_due_today, flush_scheduled_preventive_whatsapp_jobs
from app.whatsapp import dispatch_due_appointment_reminders

_worker_thread: threading.Thread | None = None
_worker_stop = threading.Event()


def _worker_loop() -> None:
    logger = logging.getLogger("erp.whatsapp_scheduler")
    interval = max(15, WHATSAPP_REMINDER_WORKER_INTERVAL_SECONDS)
    while not _worker_stop.is_set():
        try:
            result = dispatch_due_appointment_reminders()
            logger.info("whatsapp reminder cycle: checked=%s sent=%s", result.get("checked"), result.get("sent"))
        except Exception:
            logger.exception("whatsapp reminder worker failed")
        try:
            flush_prev = flush_scheduled_preventive_whatsapp_jobs()
            logger.info(
                "preventive scheduled whatsapp flush: processed=%s failed=%s",
                flush_prev.get("processed"),
                flush_prev.get("failed"),
            )
        except Exception:
            logger.exception("preventive scheduled whatsapp flush failed")
        if WHATSAPP_PREVENTIVE_WORKER_ENABLED:
            try:
                prev = dispatch_preventive_due_today()
                logger.info(
                    "preventive maintenance cycle: checked=%s sent=%s (due=%s advance=%s)",
                    prev.get("checked"),
                    prev.get("sent"),
                    prev.get("sent_due"),
                    prev.get("sent_advance"),
                )
            except Exception:
                logger.exception("preventive maintenance worker failed")
        _worker_stop.wait(interval)


def start_whatsapp_reminder_worker() -> None:
    global _worker_thread
    if not WHATSAPP_REMINDER_WORKER_ENABLED:
        return
    if _worker_thread is not None and _worker_thread.is_alive():
        return
    _worker_stop.clear()
    _worker_thread = threading.Thread(target=_worker_loop, name="whatsapp-reminder-worker", daemon=True)
    _worker_thread.start()


def stop_whatsapp_reminder_worker() -> None:
    _worker_stop.set()
    # keep shutdown fast; thread is daemon
    time.sleep(0.05)
