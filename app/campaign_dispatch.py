from __future__ import annotations

import logging
import threading
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from models import Campaign, CampaignLog

logger = logging.getLogger("erp.campaign_dispatch")


def get_campaign_dispatch_status(
    db: Session,
    *,
    tenant_id: int,
    campaign_id: int,
) -> dict[str, Any] | None:
    campaign = db.execute(
        select(Campaign).where(Campaign.tenant_id == tenant_id, Campaign.id == campaign_id)
    ).scalar_one_or_none()
    if campaign is None:
        return None
    failed = int(
        db.execute(
            select(func.count())
            .select_from(CampaignLog)
            .where(CampaignLog.campaign_id == campaign_id, CampaignLog.status == "failed")
        ).scalar_one()
        or 0
    )
    total = max(campaign.total_contacts, 0)
    processed = campaign.sent_count + failed
    progress_pct = round((processed / total) * 100, 1) if total > 0 else 0.0
    return {
        "campaign_id": campaign.id,
        "status": campaign.status,
        "sent": campaign.sent_count,
        "failed": failed,
        "total": total,
        "processed": processed,
        "progress_pct": min(100.0, progress_pct),
        "is_running": campaign.status == "running",
    }


def schedule_campaign_dispatch(*, campaign_id: int, tenant_id: int, user_id: int) -> None:
    """Executa o disparo em thread separada (progresso via polling no campaign.sent_count)."""

    def _worker() -> None:
        db = SessionLocal()
        try:
            from app.campaign_processor import execute_campaign_dispatch

            execute_campaign_dispatch(db, campaign_id=campaign_id, tenant_id=tenant_id, user_id=user_id)
        except Exception:
            logger.exception("Falha no disparo em background da campanha %s", campaign_id)
            try:
                row = db.get(Campaign, campaign_id)
                if row is not None and row.status == "running":
                    row.status = "failed"
                    db.add(row)
                    db.commit()
            except Exception:
                logger.exception("Não foi possível marcar campanha %s como failed", campaign_id)
        finally:
            db.close()

    threading.Thread(target=_worker, name=f"campaign-dispatch-{campaign_id}", daemon=True).start()
