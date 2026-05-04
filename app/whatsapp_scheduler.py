from __future__ import annotations

import logging
import threading
import time

from app.config import WHATSAPP_REMINDER_WORKER_ENABLED, WHATSAPP_REMINDER_WORKER_INTERVAL_SECONDS
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
