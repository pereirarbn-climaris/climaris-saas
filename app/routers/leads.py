"""Leads do site institucional — endpoint público de contato."""

from datetime import datetime, timezone
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_platform_operator
from app.limiter import limiter
from app.schemas_leads import WebsiteLeadCreateIn, WebsiteLeadCreateOut, WebsiteLeadOut
from models import User, WebsiteLead

router = APIRouter(prefix="/leads", tags=["leads"])


def _normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    return digits or None


@router.post("", response_model=WebsiteLeadCreateOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("15/hour")
def create_website_lead(
    request: Request,
    payload: WebsiteLeadCreateIn,
    db: Annotated[Session, Depends(get_db)],
) -> WebsiteLeadCreateOut:
    """Recebe formulário de contato do site climaris.com.br (sem autenticação)."""
    if payload.website_url:
        # Bot preencheu honeypot — resposta neutra sem persistir.
        return WebsiteLeadCreateOut(id=0, message="Recebemos seu contato. Em breve retornaremos.")

    email_norm = payload.email.strip().lower()
    try:
        validate_email(email_norm, check_deliverability=False)
    except EmailNotValidError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"E-mail inválido: {exc}",
        ) from exc

    message = (payload.message or "").strip()
    if len(message) < 10:
        parts = ["Solicitação de demonstração via site institucional."]
        if payload.company:
            parts.append(f"Empresa: {payload.company.strip()}.")
        if payload.job_title:
            parts.append(f"Cargo: {payload.job_title.strip()}.")
        if payload.technicians_count:
            parts.append(f"Técnicos na equipe: {payload.technicians_count.strip()}.")
        if payload.selected_plan:
            parts.append(f"Plano de interesse: {payload.selected_plan.strip()}.")
        message = " ".join(parts)

    lead = WebsiteLead(
        name=payload.name.strip(),
        email=email_norm,
        phone=_normalize_phone(payload.phone),
        company=payload.company.strip() if payload.company else None,
        job_title=payload.job_title.strip() if payload.job_title else None,
        technicians_count=payload.technicians_count.strip() if payload.technicians_count else None,
        selected_plan=payload.selected_plan.strip() if payload.selected_plan else None,
        message=message,
        source="website",
        status="new",
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
        lgpd_consent_at=datetime.now(timezone.utc),
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return WebsiteLeadCreateOut(id=lead.id)


@router.get("", response_model=list[WebsiteLeadOut])
def list_website_leads(
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> list[WebsiteLead]:
    """Lista leads do site — somente operação Climaris."""
    stmt = select(WebsiteLead).order_by(WebsiteLead.created_at.desc()).limit(limit)
    if status_filter:
        stmt = stmt.where(WebsiteLead.status == status_filter.strip().lower())
    return list(db.scalars(stmt).all())
