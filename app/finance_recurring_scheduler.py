from __future__ import annotations

import logging
import threading
import time

from app.database import SessionLocal
from app.finance_recurring_service import process_due_recurring_transactions

logger = logging.getLogger("erp.finance_recurring_scheduler")

_worker_thread: threading.Thread | None = None
_worker_stop = threading.Event()
_INTERVAL_SECONDS = 3600


def _worker_loop() -> None:
    while not _worker_stop.is_set():
        try:
            db = SessionLocal()
            try:
                result = process_due_recurring_transactions(db)
                if result.get("created") or result.get("ended"):
                    logger.info("finance recurring scheduler: %s", result)
            finally:
                db.close()
        except Exception:
            logger.exception("finance recurring scheduler cycle failed")
        _worker_stop.wait(_INTERVAL_SECONDS)


def start_finance_recurring_scheduler_worker() -> None:
    global _worker_thread
    if _worker_thread is not None and _worker_thread.is_alive():
        return
    _worker_stop.clear()
    _worker_thread = threading.Thread(
        target=_worker_loop,
        name="finance-recurring-scheduler",
        daemon=True,
    )
    _worker_thread.start()


def stop_finance_recurring_scheduler_worker() -> None:
    _worker_stop.set()
    time.sleep(0.05)
