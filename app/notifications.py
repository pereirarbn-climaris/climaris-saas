"""Serviço de notificações in-app por usuário."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import (
    Budget,
    Client,
    FinanceEntry,
    FinanceEntryType,
    NotificationKind,
    OrderStatus,
    PlatformNotificationBroadcast,
    ServiceOrder,
    Tenant,
    TenantStatus,
    User,
    UserNotification,
    UserRole,
    WhatsappMessageJob,
)


def create_user_notification(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    kind: str,
    title: str,
    body: str,
    link_path: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actor_user_id: int | None = None,
) -> UserNotification:
    notification = UserNotification(
        tenant_id=tenant_id,
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        link_path=link_path,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
    )
    db.add(notification)
    return notification


def notify_user_ids(
    db: Session,
    *,
    tenant_id: int,
    user_ids: Iterable[int],
    exclude_user_id: int | None,
    kind: str,
    title: str,
    body: str,
    link_path: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actor_user_id: int | None = None,
) -> int:
    created = 0
    for user_id in user_ids:
        if exclude_user_id is not None and user_id == exclude_user_id:
            continue
        create_user_notification(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            kind=kind,
            title=title,
            body=body,
            link_path=link_path,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_user_id=actor_user_id,
        )
        created += 1
    return created


def notify_tenant_staff(
    db: Session,
    *,
    tenant_id: int,
    roles: tuple[UserRole, ...],
    exclude_user_id: int | None,
    kind: str,
    title: str,
    body: str,
    link_path: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actor_user_id: int | None = None,
) -> int:
    """Cria a mesma notificação para usuários ativos do tenant nos papéis indicados."""
    user_ids = db.execute(
        select(User.id).where(
            User.tenant_id == tenant_id,
            User.is_active.is_(True),
            User.role.in_(roles),
        )
    ).scalars().all()
    return notify_user_ids(
        db,
        tenant_id=tenant_id,
        user_ids=user_ids,
        exclude_user_id=exclude_user_id,
        kind=kind,
        title=title,
        body=body,
        link_path=link_path,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
    )


def safe_commit_notification_dispatch(db: Session, dispatch_fn, *args, **kwargs) -> None:
    """Executa um dispatch de notificação sem interromper o fluxo principal."""
    try:
        dispatch_fn(db, *args, **kwargs)
        db.commit()
    except Exception:
        db.rollback()


def _actor_label(actor: User | None, fallback: str = "Equipe") -> str:
    if actor is None:
        return fallback
    return actor.full_name.strip() or fallback


def _client_label(db: Session, order: ServiceOrder) -> str:
    if order.client is not None:
        return order.client.name
    client = db.get(Client, order.client_id)
    return client.name if client is not None else "Cliente"


def _budget_client_label(db: Session, budget: Budget) -> str:
    if budget.client is not None:
        return budget.client.name
    client = db.get(Client, budget.client_id)
    return client.name if client is not None else "Cliente"


def _format_brl(amount: float) -> str:
    value = f"{float(amount):,.2f}"
    return "R$ " + value.replace(",", "X").replace(".", ",").replace("X", ".")


def _format_schedule_local(db: Session, tenant_id: int, starts_at: datetime) -> str:
    tenant = db.get(Tenant, tenant_id)
    tz_name = (tenant.timezone if tenant is not None else None) or "America/Sao_Paulo"
    try:
        local = starts_at.astimezone(ZoneInfo(tz_name))
    except Exception:
        local = starts_at
    return local.strftime("%d/%m/%Y às %H:%M")


def build_service_order_notification(
    db: Session,
    *,
    order: ServiceOrder,
    actor: User,
    status: OrderStatus,
) -> tuple[str, str, str] | None:
    """Retorna (kind, title, body) para mudança de status da OS, ou None se não notificar."""
    client_name = _client_label(db, order)
    order_ref = f"OS #{order.id}"
    actor_name = _actor_label(actor, "Técnico")

    if status == OrderStatus.IN_PROGRESS:
        return (
            NotificationKind.SERVICE_ORDER_STARTED.value,
            "OS em andamento",
            f"{actor_name} iniciou a {order_ref} — {client_name}.",
        )
    if status == OrderStatus.DONE:
        return (
            NotificationKind.SERVICE_ORDER_DONE.value,
            "OS concluída",
            f"{actor_name} concluiu a {order_ref} — {client_name}.",
        )
    if status == OrderStatus.CANCELLED:
        return (
            NotificationKind.SERVICE_ORDER_CANCELLED.value,
            "OS cancelada",
            f"{actor_name} cancelou a {order_ref} — {client_name}.",
        )
    return None


def dispatch_service_order_status_notification(
    db: Session,
    *,
    order: ServiceOrder,
    actor: User,
    status: OrderStatus,
) -> int:
    """Notifica admin e recepção sobre eventos relevantes da OS (exceto o próprio ator)."""
    payload = build_service_order_notification(db, order=order, actor=actor, status=status)
    if payload is None:
        return 0
    kind, title, body = payload
    link_path = f"/app/service-orders/{order.id}"
    return notify_tenant_staff(
        db,
        tenant_id=order.tenant_id,
        roles=(UserRole.ADMIN, UserRole.RECEPTIONIST),
        exclude_user_id=actor.id,
        kind=kind,
        title=title,
        body=body,
        link_path=link_path,
        entity_type="service_order",
        entity_id=order.id,
        actor_user_id=actor.id,
    )


def dispatch_service_order_created_notification(
    db: Session,
    *,
    order: ServiceOrder,
    actor: User,
) -> int:
    client_name = _client_label(db, order)
    return notify_tenant_staff(
        db,
        tenant_id=order.tenant_id,
        roles=(UserRole.ADMIN, UserRole.RECEPTIONIST),
        exclude_user_id=actor.id,
        kind=NotificationKind.SERVICE_ORDER_CREATED.value,
        title="Nova ordem de serviço",
        body=f"{_actor_label(actor)} criou a OS #{order.id} — {client_name}.",
        link_path=f"/app/service-orders/{order.id}",
        entity_type="service_order",
        entity_id=order.id,
        actor_user_id=actor.id,
    )


def dispatch_service_order_scheduled_notification(
    db: Session,
    *,
    order: ServiceOrder,
    actor: User,
    starts_at: datetime,
    technician_ids: Iterable[int] | None = None,
) -> int:
    client_name = _client_label(db, order)
    when = _format_schedule_local(db, order.tenant_id, starts_at)
    body = f"{_actor_label(actor)} agendou a OS #{order.id} — {client_name} para {when}."
    link_path = f"/app/service-orders/{order.id}"
    kind = NotificationKind.SERVICE_ORDER_SCHEDULED.value
    title = "OS agendada"

    staff_count = notify_tenant_staff(
        db,
        tenant_id=order.tenant_id,
        roles=(UserRole.ADMIN, UserRole.RECEPTIONIST),
        exclude_user_id=actor.id,
        kind=kind,
        title=title,
        body=body,
        link_path=link_path,
        entity_type="service_order",
        entity_id=order.id,
        actor_user_id=actor.id,
    )
    tech_ids = [int(tid) for tid in (technician_ids or []) if tid]
    tech_count = notify_user_ids(
        db,
        tenant_id=order.tenant_id,
        user_ids=tech_ids,
        exclude_user_id=actor.id,
        kind=kind,
        title=title,
        body=body,
        link_path=link_path,
        entity_type="service_order",
        entity_id=order.id,
        actor_user_id=actor.id,
    )
    return staff_count + tech_count


def dispatch_budget_approved_notification(
    db: Session,
    *,
    budget: Budget,
    service_order_id: int,
    actor: User,
) -> int:
    client_name = _budget_client_label(db, budget)
    return notify_tenant_staff(
        db,
        tenant_id=budget.tenant_id,
        roles=(UserRole.ADMIN, UserRole.RECEPTIONIST),
        exclude_user_id=actor.id,
        kind=NotificationKind.BUDGET_APPROVED.value,
        title="Orçamento aprovado",
        body=(
            f"{_actor_label(actor)} aprovou o orçamento #{budget.id} de {client_name}. "
            f"OS #{service_order_id} foi gerada."
        ),
        link_path=f"/app/service-orders/{service_order_id}",
        entity_type="budget",
        entity_id=budget.id,
        actor_user_id=actor.id,
    )


def dispatch_finance_payment_received_notification(
    db: Session,
    *,
    entry: FinanceEntry,
    actor_user_id: int | None = None,
    source_label: str = "pagamento",
) -> int:
    if entry.entry_type != FinanceEntryType.INCOME:
        return 0
    amount = _format_brl(float(entry.amount or 0))
    description = (entry.description or "Recebimento").strip()
    body = f"{source_label.capitalize()} confirmado: {amount} — {description}."
    return notify_tenant_staff(
        db,
        tenant_id=entry.tenant_id,
        roles=(UserRole.ADMIN, UserRole.RECEPTIONIST),
        exclude_user_id=actor_user_id,
        kind=NotificationKind.FINANCE_PAYMENT_RECEIVED.value,
        title="Pagamento recebido",
        body=body,
        link_path="/app/finance/dashboard",
        entity_type="finance_entry",
        entity_id=entry.id,
        actor_user_id=actor_user_id,
    )


def dispatch_whatsapp_send_failed_notification(
    db: Session,
    *,
    job: WhatsappMessageJob,
) -> int:
    from app.whatsapp_error_messages import humanize_whatsapp_send_error, whatsapp_template_label

    template = whatsapp_template_label(job.template_key)
    recipient = job.recipient_whatsapp or "destinatário"
    reason = humanize_whatsapp_send_error(job.error_message)
    body = f"Não foi possível enviar o {template} para {recipient}.\n\n{reason}"
    return notify_tenant_staff(
        db,
        tenant_id=job.tenant_id,
        roles=(UserRole.ADMIN, UserRole.RECEPTIONIST),
        exclude_user_id=None,
        kind=NotificationKind.WHATSAPP_SEND_FAILED.value,
        title="Falha no WhatsApp",
        body=body,
        link_path="/app/integrations/whatsapp",
        entity_type="whatsapp_job",
        entity_id=job.id,
        actor_user_id=job.created_by_user_id,
    )


def notify_finance_entry_paid_if_needed(
    db: Session,
    *,
    entry: FinanceEntry,
    was_paid: bool,
    actor_user_id: int | None = None,
    source_label: str = "pagamento",
) -> None:
    from models import FinanceEntryStatus

    if was_paid or entry.status != FinanceEntryStatus.PAID:
        return
    safe_commit_notification_dispatch(
        db,
        dispatch_finance_payment_received_notification,
        entry=entry,
        actor_user_id=actor_user_id,
        source_label=source_label,
    )


def on_whatsapp_job_failed(db: Session, job: WhatsappMessageJob) -> None:
    safe_commit_notification_dispatch(db, dispatch_whatsapp_send_failed_notification, job=job)


def broadcast_platform_announcement(
    db: Session,
    *,
    title: str,
    body: str,
    link_path: str | None,
    actor_user_id: int,
    audience: str = "all",
) -> PlatformNotificationBroadcast:
    """Envia notificação in-app para o público segmentado da plataforma."""
    from app.platform_broadcast_audiences import resolve_broadcast_recipients, validate_audience

    title_clean = title.strip()
    body_clean = body.strip()
    if not title_clean:
        raise ValueError("Título obrigatório.")
    if not body_clean:
        raise ValueError("Mensagem obrigatória.")
    audience_key = validate_audience(audience)

    broadcast = PlatformNotificationBroadcast(
        title=title_clean[:160],
        body=body_clean,
        link_path=(link_path or "").strip()[:255] or None,
        audience=audience_key,
        created_by_user_id=actor_user_id,
    )
    db.add(broadcast)
    db.flush()

    recipients, tenant_count = resolve_broadcast_recipients(db, audience_key)
    if not recipients:
        raise ValueError("Nenhum destinatário encontrado para o público selecionado.")

    batch: list[UserNotification] = []
    batch_size = 500
    for user_id, tenant_id in recipients:
        batch.append(
            UserNotification(
                tenant_id=tenant_id,
                user_id=user_id,
                kind=NotificationKind.PLATFORM_ANNOUNCEMENT.value,
                title=title_clean[:160],
                body=body_clean,
                link_path=broadcast.link_path,
                entity_type="platform_broadcast",
                entity_id=broadcast.id,
                actor_user_id=actor_user_id,
            )
        )
        if len(batch) >= batch_size:
            db.add_all(batch)
            db.flush()
            batch.clear()

    if batch:
        db.add_all(batch)
        db.flush()

    broadcast.recipients_count = len(recipients)
    broadcast.tenant_count = tenant_count
    db.add(broadcast)
    return broadcast


def mark_notification_read(
    db: Session,
    *,
    notification: UserNotification,
) -> UserNotification:
    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
    return notification


def mark_notification_unread(
    db: Session,
    *,
    notification: UserNotification,
) -> UserNotification:
    notification.read_at = None
    return notification
