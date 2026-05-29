from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import SessionLocal
from models import Campaign

logger = logging.getLogger("erp.campaign_scheduler")

_worker_thread: threading.Thread | None = None
_worker_stop = threading.Event()
_INTERVAL_SECONDS = 30


def process_due_scheduled_campaigns() -> dict[str, int]:
    """Dispara campanhas com status=scheduled cuja scheduled_at já passou."""
    from app.campaign_dispatch import schedule_campaign_dispatch

    now = datetime.now(timezone.utc)
    db = SessionLocal()
    triggered = 0
    try:
        rows = db.execute(
            select(Campaign).where(
                Campaign.status == "scheduled",
                Campaign.scheduled_at.is_not(None),
                Campaign.scheduled_at <= now,
            )
        ).scalars().all()
        for campaign in rows:
            user_id = campaign.created_by_user_id
            if user_id is None:
                logger.warning("Campanha agendada %s sem created_by_user_id", campaign.id)
                continue
            campaign.status = "running"
            db.add(campaign)
            db.commit()
            schedule_campaign_dispatch(
                campaign_id=campaign.id,
                tenant_id=campaign.tenant_id,
                user_id=user_id,
            )
            triggered += 1
            logger.info("Campanha agendada %s iniciada pelo scheduler", campaign.id)
    finally:
        db.close()
    return {"triggered": triggered}


def _worker_loop() -> None:
    while not _worker_stop.is_set():
        try:
            result = process_due_scheduled_campaigns()
            if result.get("triggered"):
                logger.info("campaign scheduler: triggered=%s", result["triggered"])
        except Exception:
            logger.exception("campaign scheduler cycle failed")
        _worker_stop.wait(_INTERVAL_SECONDS)


def start_campaign_scheduler_worker() -> None:
    global _worker_thread
    if _worker_thread is not None and _worker_thread.is_alive():
        return
    _worker_stop.clear()
    _worker_thread = threading.Thread(target=_worker_loop, name="campaign-scheduler", daemon=True)
    _worker_thread.start()


def stop_campaign_scheduler_worker() -> None:
    _worker_stop.set()
    time.sleep(0.05)
