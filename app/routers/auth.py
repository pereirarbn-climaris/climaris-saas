import json
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Annotated
from urllib import error as urllib_error
from urllib import request as urllib_request

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import (
    APP_PUBLIC_URL,
    EMAIL_VERIFICATION_TOKEN_TTL_HOURS,
    LOGIN_ADMIN_TRUST_DEVICE_ENABLED,
    LOGIN_ADMIN_TWO_FACTOR_ENABLED,
    PLATFORM_OPERATOR_EMAIL,
    PUBLIC_REGISTER_ENABLED,
    TRUST_COOKIE_DOMAIN,
    TRUST_COOKIE_NAME,
    TRUST_COOKIE_SECURE,
    TRUST_DEVICE_DAYS,
)
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.emailer import send_email, smtp_is_configured
from app.schemas import (
    BootstrapAdminRequest,
    BootstrapTenantAdminRequest,
    ChangeTemporaryPasswordRequest,
    ChangeMyPasswordRequest,
    CompleteTenantFiscalRequest,
    LoginRequest,
    TrustedDeviceOut,
    PublicRegisterRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    TenantAdminUpdateRequest,
    TenantOut,
    TokenResponse,
    UserAdminUpdateRequest,
    UserCreateRequest,
    ResendVerificationEmailRequest,
    UserOut,
    UserProvisionOut,
    UserSelfUpdateRequest,
    VerifyEmailRequest,
)
from app.security import (
    JWT_BOOTSTRAP_TOKEN,
    create_access_token,
    generate_temporary_password,
    hash_password,
    verify_password,
)
from app.tenant_logo import (
    delete_tenant_logo_if_exists,
    generate_tenant_logo_presigned_url,
    process_and_upload_tenant_logo,
)
from app.limiter import limiter
from app.plan_rules import get_plan_definition, normalize_plan_key
from app.saas_plan_effective import effective_plan_label_and_max_users
from models import (
    EmailVerificationToken,
    LoginAttemptAudit,
    LoginCaptchaChallenge,
    LoginClientSecurityState,
    LoginTrustedDevice,
    LoginTwoFactorChallenge,
    MarketplaceEntitlementStatus,
    PasswordResetToken,
    TechnicianWorkWindow,
    Tenant,
    TenantMarketplaceEntitlement,
    TenantHoliday,
    MarketplaceApp,
    TenantStatus,
    User,
    UserRole,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_PENDING_PLACEHOLDER_LEN = 18
_MAX_LOGIN_FAILED_ATTEMPTS = 5
_LOGIN_BLOCK_MINUTES = 15
_CAPTCHA_START_ATTEMPTS = 3
_CAPTCHA_TTL_MINUTES = 10
_TWO_FACTOR_TTL_MINUTES = 15
_TWO_FACTOR_MAX_ATTEMPTS = 5
_CLIENT_BACKOFF_MAX_SECONDS = 300


def _reserved_platform_email(email: str) -> bool:
    return email.strip().lower() == PLATFORM_OPERATOR_EMAIL


def _platform_operator_flag_for_email(email: str) -> bool:
    return _reserved_platform_email(email)


def _tenant_user_limit_guard(db: Session, tenant: Tenant) -> None:
    plan_label, max_users = effective_plan_label_and_max_users(db, tenant)
    if max_users is not None:
        extra_seats = db.execute(
            select(func.coalesce(func.sum(TenantMarketplaceEntitlement.quantity * MarketplaceApp.user_seats_per_unit), 0))
            .select_from(TenantMarketplaceEntitlement)
            .join(MarketplaceApp, MarketplaceApp.id == TenantMarketplaceEntitlement.marketplace_app_id)
            .where(
                TenantMarketplaceEntitlement.tenant_id == tenant.id,
                TenantMarketplaceEntitlement.status == MarketplaceEntitlementStatus.ACTIVE,
                MarketplaceApp.user_seats_per_unit > 0,
            )
        ).scalar_one()
        max_users = int(max_users) + int(extra_seats or 0)
    if max_users is None:
        return
    total_users = db.execute(select(func.count(User.id)).where(User.tenant_id == tenant.id)).scalar_one()
    if int(total_users) >= max_users:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"O plano '{plan_label}' permite até {max_users} acessos considerando extras contratados. "
                "Faça upgrade do plano para liberar novos usuários."
            ),
        )
_NATIONAL_HOLIDAY_MARKER = "[BRASILAPI-NACIONAL]"


def _other_active_admin_count(db: Session, tenant_id: int, exclude_user_id: int) -> int:
    n = db.execute(
        select(func.count())
        .select_from(User)
        .where(
            User.tenant_id == tenant_id,
            User.role == UserRole.ADMIN,
            User.is_active.is_(True),
            User.id != exclude_user_id,
        )
    ).scalar_one()
    return int(n)


def _generate_pending_tax_placeholder() -> str:
    """Identificador único interno (18 caracteres) até o usuário informar CPF/CNPJ."""
    return "P" + secrets.token_hex(9)[: _PENDING_PLACEHOLDER_LEN - 1]


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _safe_verify_password(plain_password: str, hashed_password: str) -> bool:
    """Evita 500 se o hash no banco estiver corrompido ou em formato legado inesperado."""
    try:
        return verify_password(plain_password, hashed_password)
    except Exception:
        return False


def _admin_two_factor_enabled(db: Session) -> bool:
    """2FA por e-mail só para admin, e só quando SMTP estiver disponível (evita 500 no login)."""
    if not LOGIN_ADMIN_TWO_FACTOR_ENABLED:
        return False
    return smtp_is_configured(db)


def _active_login_block_until(users: list[User], now: datetime) -> datetime | None:
    blocks = [u.login_blocked_until for u in users if u.login_blocked_until is not None and u.login_blocked_until > now]
    if not blocks:
        return None
    return max(blocks)


def _register_failed_login_attempt(users: list[User], now: datetime) -> None:
    for user in users:
        # Contador por e-mail para bloquear tentativas de força bruta.
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= _MAX_LOGIN_FAILED_ATTEMPTS:
            user.login_blocked_until = now + timedelta(minutes=_LOGIN_BLOCK_MINUTES)
            user.failed_login_attempts = 0


def _clear_login_security_state(users: list[User]) -> None:
    for user in users:
        if user.failed_login_attempts or user.login_blocked_until is not None:
            user.failed_login_attempts = 0
            user.login_blocked_until = None


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return None


def _device_fingerprint(ip_address: str | None, user_agent: str | None) -> str:
    return _sha256(f"{ip_address or '-'}|{(user_agent or '-').strip().lower()}")


def _user_agent_fingerprint(user_agent: str | None) -> str:
    return _sha256((user_agent or "")[:512])


def _trusted_device_cookie_accepts(
    *,
    db: Session,
    request: Request,
    user_id: int,
    device_fingerprint: str,
    user_agent: str | None,
    now: datetime,
) -> bool:
    if not LOGIN_ADMIN_TRUST_DEVICE_ENABLED:
        return False
    raw = request.cookies.get(TRUST_COOKIE_NAME)
    if not raw or len(raw.strip()) < 16:
        return False
    th = _sha256(raw.strip())
    row = db.execute(
        select(LoginTrustedDevice).where(
            LoginTrustedDevice.user_id == user_id,
            LoginTrustedDevice.token_hash == th,
            LoginTrustedDevice.device_fingerprint == device_fingerprint,
            LoginTrustedDevice.expires_at > now,
        )
    ).scalar_one_or_none()
    if row is None:
        return False
    ua_hash = _user_agent_fingerprint(user_agent)
    if row.user_agent_hash and row.user_agent_hash != ua_hash:
        return False
    row.last_used_at = now
    db.add(row)
    return True


def _issue_trusted_device_cookie(
    *,
    db: Session,
    response: Response,
    user: User,
    device_fingerprint: str,
    user_agent: str | None,
    now: datetime,
) -> None:
    if not LOGIN_ADMIN_TRUST_DEVICE_ENABLED:
        return
    db.execute(
        delete(LoginTrustedDevice).where(
            LoginTrustedDevice.user_id == user.id,
            LoginTrustedDevice.device_fingerprint == device_fingerprint,
        )
    )
    raw = secrets.token_urlsafe(32)
    th = _sha256(raw)
    ua_h = _user_agent_fingerprint(user_agent)
    exp = now + timedelta(days=TRUST_DEVICE_DAYS)
    db.add(
        LoginTrustedDevice(
            user_id=user.id,
            device_fingerprint=device_fingerprint,
            token_hash=th,
            user_agent_hash=ua_h,
            expires_at=exp,
            last_used_at=now,
        )
    )
    _ck: dict[str, str | int | bool] = {
        "key": TRUST_COOKIE_NAME,
        "value": raw,
        "max_age": TRUST_DEVICE_DAYS * 86400,
        "httponly": True,
        "secure": TRUST_COOKIE_SECURE,
        "samesite": "lax",
        "path": "/",
    }
    if TRUST_COOKIE_DOMAIN:
        _ck["domain"] = TRUST_COOKIE_DOMAIN
    response.set_cookie(**_ck)


def _record_login_attempt(
    *,
    db: Session,
    email: str,
    tenant_id: int | None,
    user_id: int | None,
    ip_address: str | None,
    user_agent: str | None,
    device_fingerprint: str | None,
    outcome: str,
    reason: str,
) -> None:
    db.add(
        LoginAttemptAudit(
            email=email,
            tenant_id=tenant_id,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            device_fingerprint=device_fingerprint,
            outcome=outcome,
            reason=reason,
        )
    )


def _upsert_client_state(
    *,
    db: Session,
    email: str,
    ip_address: str | None,
    user_agent: str | None,
    device_fingerprint: str,
) -> LoginClientSecurityState:
    state = db.execute(
        select(LoginClientSecurityState).where(
            LoginClientSecurityState.email == email,
            LoginClientSecurityState.device_fingerprint == device_fingerprint,
        )
    ).scalar_one_or_none()
    if state is None:
        state = LoginClientSecurityState(
            email=email,
            ip_address=ip_address,
            user_agent=user_agent,
            device_fingerprint=device_fingerprint,
            failed_attempts=0,
        )
        db.add(state)
        db.flush()
    return state


def _send_login_lock_email(*, db: Session, user: User, ip_address: str | None, user_agent: str | None) -> None:
    if not user.email:
        return
    subject = "Bloqueio temporário de login - Climaris"
    text_body = (
        f"Olá, {user.full_name}.\n\n"
        "Detectamos múltiplas tentativas inválidas de login e bloqueamos temporariamente o acesso da sua conta por 15 minutos.\n\n"
        f"IP: {ip_address or 'não identificado'}\n"
        f"Dispositivo: {(user_agent or 'não identificado')[:280]}\n\n"
        "Se não foi você, recomendamos alterar sua senha após o desbloqueio.\n\n"
        "Equipe Climaris"
    )
    html_body = (
        "<!doctype html><html lang='pt-BR'><body style='font-family:Arial,Helvetica,sans-serif;color:#0f172a;'>"
        f"<p>Olá, {user.full_name}.</p>"
        "<p>Detectamos múltiplas tentativas inválidas de login e bloqueamos temporariamente o acesso da sua conta por <strong>15 minutos</strong>.</p>"
        f"<p><strong>IP:</strong> {ip_address or 'não identificado'}<br/><strong>Dispositivo:</strong> {(user_agent or 'não identificado')[:280]}</p>"
        "<p>Se não foi você, recomendamos alterar sua senha após o desbloqueio.</p>"
        "<p>Equipe Climaris</p></body></html>"
    )
    send_email(to_email=user.email, subject=subject, text_body=text_body, html_body=html_body, db=db)


def _new_captcha_challenge(
    *,
    db: Session,
    email: str,
    device_fingerprint: str,
    now: datetime,
) -> tuple[str, str]:
    a = secrets.randbelow(8) + 2
    b = secrets.randbelow(8) + 2
    answer = str(a + b)
    raw_token = secrets.token_urlsafe(32)
    db.add(
        LoginCaptchaChallenge(
            token_hash=_sha256(raw_token),
            email=email,
            device_fingerprint=device_fingerprint,
            answer_hash=_sha256(answer),
            expires_at=now + timedelta(minutes=_CAPTCHA_TTL_MINUTES),
            attempts=0,
        )
    )
    question = f"Verificação de segurança: quanto é {a} + {b}?"
    return raw_token, question


def _validate_captcha(
    *,
    db: Session,
    email: str,
    device_fingerprint: str,
    token: str | None,
    answer: str | None,
    now: datetime,
) -> bool:
    if not token or not answer:
        return False
    row = db.execute(
        select(LoginCaptchaChallenge).where(
            LoginCaptchaChallenge.token_hash == _sha256(token),
            LoginCaptchaChallenge.email == email,
            LoginCaptchaChallenge.device_fingerprint == device_fingerprint,
            LoginCaptchaChallenge.expires_at > now,
        )
    ).scalar_one_or_none()
    if row is None:
        return False
    row.attempts = int(row.attempts or 0) + 1
    valid = _sha256(answer.strip()) == row.answer_hash
    db.add(row)
    if valid:
        db.delete(row)
    return valid


def _create_two_factor_challenge(db: Session, user: User, now: datetime) -> str:
    db.execute(delete(LoginTwoFactorChallenge).where(LoginTwoFactorChallenge.user_id == user.id))
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    raw_token = secrets.token_urlsafe(36)
    db.add(
        LoginTwoFactorChallenge(
            user_id=user.id,
            token_hash=_sha256(raw_token),
            code_hash=_sha256(code),
            expires_at=now + timedelta(minutes=_TWO_FACTOR_TTL_MINUTES),
            attempts=0,
        )
    )
    subject = "Seu código de acesso (2 fatores) - Climaris"
    text_body = (
        f"Olá, {user.full_name}.\n\n"
        f"Seu código de verificação é: {code}\n\n"
        f"Ele expira em {_TWO_FACTOR_TTL_MINUTES} minutos."
    )
    html_body = (
        "<!doctype html><html lang='pt-BR'><body style='font-family:Arial,Helvetica,sans-serif;color:#0f172a;'>"
        f"<p>Olá, {user.full_name}.</p><p>Seu código de verificação é:</p>"
        f"<p style='font-size:24px;font-weight:700;letter-spacing:2px'>{code}</p>"
        f"<p>Ele expira em {_TWO_FACTOR_TTL_MINUTES} minutos.</p></body></html>"
    )
    try:
        send_email(to_email=user.email, subject=subject, text_body=text_body, html_body=html_body, db=db)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Não foi possível enviar o código de verificação por e-mail. "
                "Verifique SMTP no .env ou a credencial `smtp` em /operacao/chaves-api (com SMTP_ALLOW_DB_OVERRIDE=true)."
            ),
        ) from exc
    return raw_token


def _normalize_public_base_from_request(request: Request) -> str:
    forwarded_proto = request.headers.get("x-forwarded-proto", "").strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").strip()
    if forwarded_host:
        proto = forwarded_proto or request.url.scheme or "https"
        return f"{proto}://{forwarded_host}".rstrip("/")

    origin = request.headers.get("origin", "").strip()
    if origin.startswith("http://") or origin.startswith("https://"):
        return origin.rstrip("/")

    base = str(request.base_url).rstrip("/")
    return base


def _build_verify_email_url(raw_token: str, request: Request) -> str:
    configured = APP_PUBLIC_URL.strip().rstrip("/")
    if configured and "127.0.0.1" not in configured and "localhost" not in configured:
        base = configured
    else:
        base = _normalize_public_base_from_request(request)
    return f"{base}/verify-email?token={raw_token}"


def _build_reset_password_url(raw_token: str, request: Request) -> str:
    configured = APP_PUBLIC_URL.strip().rstrip("/")
    if configured and "127.0.0.1" not in configured and "localhost" not in configured:
        base = configured
    else:
        base = _normalize_public_base_from_request(request)
    return f"{base}/reset-password?token={raw_token}"


def _send_verification_email(*, to_email: str, full_name: str, verify_url: str, db: Session) -> None:
    subject = "Confirme seu e-mail - Climaris"
    text_body = (
        f"Olá, {full_name}!\n\n"
        "Recebemos seu cadastro na Climaris.\n"
        "Para ativar sua conta, confirme seu e-mail no link abaixo:\n\n"
        f"{verify_url}\n\n"
        "Este link expira em 24 horas.\n\n"
        "Se você não solicitou esse cadastro, pode ignorar esta mensagem.\n\n"
        "Equipe Climaris"
    )
    html_body = (
        "<!doctype html>"
        '<html lang="pt-BR">'
        "<body style=\"margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;\">"
        "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f3f6fb;padding:24px 12px;\">"
        "<tr><td align=\"center\">"
        "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" "
        "style=\"max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;\">"
        "<tr>"
        "<td style=\"padding:18px 24px;background:linear-gradient(135deg,#0284c7,#0ea5e9);color:#ffffff;\">"
        "<div style=\"font-size:20px;font-weight:700;letter-spacing:.2px;\">Climaris</div>"
        "<div style=\"font-size:13px;opacity:.95;margin-top:2px;\">Confirmação de e-mail</div>"
        "</td>"
        "</tr>"
        "<tr>"
        "<td style=\"padding:24px;\">"
        f"<p style=\"margin:0 0 14px;font-size:16px;line-height:1.5;\">Olá, {full_name}!</p>"
        "<p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;\">"
        "Recebemos seu cadastro na Climaris. Para ativar sua conta, confirme seu e-mail clicando no botão abaixo."
        "</p>"
        "<p style=\"margin:22px 0;\">"
        f"<a href=\"{verify_url}\" "
        "style=\"display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:700;"
        "font-size:14px;padding:12px 20px;border-radius:10px;\">Confirmar e-mail</a>"
        "</p>"
        "<p style=\"margin:0 0 6px;font-size:13px;color:#64748b;line-height:1.6;\">"
        "Se o botão não funcionar, copie e cole este link no navegador:"
        "</p>"
        f"<p style=\"margin:0 0 14px;font-size:13px;line-height:1.6;word-break:break-all;\"><a href=\"{verify_url}\" style=\"color:#0284c7;\">{verify_url}</a></p>"
        "<p style=\"margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.6;\">Este link expira em 24 horas.</p>"
        "<p style=\"margin:0;font-size:13px;color:#64748b;line-height:1.6;\">"
        "Se você não solicitou esse cadastro, pode ignorar esta mensagem."
        "</p>"
        "</td>"
        "</tr>"
        "<tr>"
        "<td style=\"padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;\">"
        "Equipe Climaris"
        "</td>"
        "</tr>"
        "</table>"
        "</td></tr></table>"
        "</body></html>"
    )
    send_email(to_email=to_email, subject=subject, text_body=text_body, html_body=html_body, db=db)


def _create_email_verification_token(db: Session, user: User) -> str:
    db.execute(delete(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id))
    raw_token = secrets.token_urlsafe(48)
    token = EmailVerificationToken(
        user_id=user.id,
        token_hash=_sha256(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFICATION_TOKEN_TTL_HOURS),
    )
    db.add(token)
    db.flush()
    return raw_token


def _create_password_reset_token(db: Session, user: User) -> str:
    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    raw_token = secrets.token_urlsafe(48)
    token = PasswordResetToken(
        user_id=user.id,
        token_hash=_sha256(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFICATION_TOKEN_TTL_HOURS),
    )
    db.add(token)
    db.flush()
    return raw_token


def _send_password_reset_email(*, to_email: str, full_name: str, reset_url: str, db: Session) -> None:
    subject = "Recuperação de senha - Climaris"
    text_body = (
        f"Olá, {full_name}!\n\n"
        "Recebemos um pedido para redefinir sua senha.\n"
        "Use o link abaixo para criar uma nova senha:\n\n"
        f"{reset_url}\n\n"
        "Este link expira em 24 horas.\n\n"
        "Se você não fez esse pedido, ignore este e-mail."
    )
    html_body = (
        "<!doctype html>"
        '<html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:24px 12px;">'
        '<tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        'style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">'
        '<tr><td style="padding:18px 24px;background:linear-gradient(135deg,#0284c7,#0ea5e9);color:#ffffff;">'
        '<div style="font-size:20px;font-weight:700;">Climaris</div>'
        '<div style="font-size:13px;opacity:.95;margin-top:2px;">Recuperação de senha</div></td></tr>'
        '<tr><td style="padding:24px;">'
        f'<p style="margin:0 0 14px;font-size:16px;line-height:1.5;">Olá, {full_name}!</p>'
        '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">Recebemos um pedido para redefinir sua senha. Clique no botão abaixo para continuar.</p>'
        f'<p style="margin:22px 0;"><a href="{reset_url}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;">Criar nova senha</a></p>'
        '<p style="margin:0 0 6px;font-size:13px;color:#64748b;line-height:1.6;">Se o botão não funcionar, copie e cole este link:</p>'
        f'<p style="margin:0 0 14px;font-size:13px;line-height:1.6;word-break:break-all;"><a href="{reset_url}" style="color:#0284c7;">{reset_url}</a></p>'
        '<p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">Este link expira em 24 horas. Se você não solicitou a alteração, ignore esta mensagem.</p>'
        "</td></tr></table></td></tr></table></body></html>"
    )
    send_email(to_email=to_email, subject=subject, text_body=text_body, html_body=html_body, db=db)


def _fetch_national_holidays(year: int) -> list[tuple[str, str]]:
    url = f"https://brasilapi.com.br/api/feriados/v1/{year}"
    req = urllib_request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib_request.urlopen(req, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib_error.URLError, TimeoutError, json.JSONDecodeError):
        return []
    if not isinstance(payload, list):
        return []
    rows: list[tuple[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        day_text = item.get("date")
        holiday_name = item.get("name")
        if isinstance(day_text, str) and len(day_text) == 10 and isinstance(holiday_name, str) and holiday_name.strip():
            rows.append((day_text, holiday_name.strip()))
    return rows


def _sync_tenant_national_holidays(db: Session, tenant_id: int) -> None:
    _sync_tenant_national_holidays_count(db, tenant_id)


def _remove_auto_national_holidays(db: Session, tenant_id: int) -> None:
    db.execute(
        delete(TenantHoliday).where(
            TenantHoliday.tenant_id == tenant_id,
            TenantHoliday.description.is_not(None),
            TenantHoliday.description.like(f"{_NATIONAL_HOLIDAY_MARKER}%"),
        )
    )


def _tenant_weekday_schedule_for_technician(tenant: Tenant) -> list[tuple[int, str, str]]:
    if tenant.weekday_work_hours:
        try:
            mapping = json.loads(tenant.weekday_work_hours)
        except json.JSONDecodeError:
            mapping = None
        if isinstance(mapping, dict):
            rows: list[tuple[int, str, str]] = []
            for k, v in mapping.items():
                try:
                    weekday = int(str(k))
                except ValueError:
                    continue
                if weekday < 0 or weekday > 6 or not isinstance(v, dict):
                    continue
                start = v.get("start")
                end = v.get("end")
                if isinstance(start, str) and isinstance(end, str) and len(start) == 5 and len(end) == 5 and end > start:
                    rows.append((weekday, start, end))
            if rows:
                rows.sort(key=lambda item: item[0])
                return rows

    business_days: list[int] = []
    for p in (tenant.business_days or "0,1,2,3,4").split(","):
        p = p.strip()
        if not p:
            continue
        try:
            d = int(p)
        except ValueError:
            continue
        if 0 <= d <= 6:
            business_days.append(d)
    business_days = sorted(set(business_days)) or [0, 1, 2, 3, 4]
    start = tenant.workday_start or "08:00"
    end = tenant.workday_end or "18:00"
    if end <= start:
        start, end = "08:00", "18:00"
    return [(d, start, end) for d in business_days]


def _sync_tenant_national_holidays_count(db: Session, tenant_id: int) -> int:
    created = 0
    current_year = datetime.utcnow().year
    for year in (current_year, current_year + 1):
        holidays = _fetch_national_holidays(year)
        for day_text, holiday_name in holidays:
            try:
                holiday_date = datetime.strptime(day_text, "%Y-%m-%d").date()
            except ValueError:
                continue
            exists = db.execute(
                select(TenantHoliday).where(TenantHoliday.tenant_id == tenant_id, TenantHoliday.holiday_date == holiday_date)
            ).scalar_one_or_none()
            if exists is not None:
                continue
            db.add(
                TenantHoliday(
                    tenant_id=tenant_id,
                    holiday_date=holiday_date,
                    description=f"{_NATIONAL_HOLIDAY_MARKER} {holiday_name}",
                )
            )
            created += 1
    return created


@router.post("/bootstrap-admin", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
def bootstrap_admin(
    request: Request,
    payload: BootstrapAdminRequest,
    db: Annotated[Session, Depends(get_db)],
    x_bootstrap_token: Annotated[str, Header(alias="X-Bootstrap-Token")],
) -> User:
    if x_bootstrap_token != JWT_BOOTSTRAP_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bootstrap token.")

    existing = db.execute(
        select(User).where(User.tenant_id == payload.tenant_id, User.email == payload.email.lower())
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists for tenant.")

    user = User(
        tenant_id=payload.tenant_id,
        full_name=payload.full_name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=UserRole.ADMIN,
        is_active=True,
        is_platform_operator=_platform_operator_flag_for_email(payload.email),
    )
    db.add(user)
    _sync_tenant_national_holidays(db, payload.tenant_id)
    db.commit()
    db.refresh(user)
    return user


@router.post("/bootstrap-tenant-admin", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
def bootstrap_tenant_admin(
    request: Request,
    payload: BootstrapTenantAdminRequest,
    db: Annotated[Session, Depends(get_db)],
    x_bootstrap_token: Annotated[str, Header(alias="X-Bootstrap-Token")],
) -> Tenant:
    if x_bootstrap_token != JWT_BOOTSTRAP_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bootstrap token.")

    existing_tenant = db.execute(select(Tenant).where(Tenant.cnpj == payload.tax_document)).scalar_one_or_none()
    if existing_tenant:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este CPF/CNPJ já está cadastrado.")

    tenant = Tenant(
        name=payload.tenant_name,
        cnpj=payload.tax_document,
        tax_id_kind=payload.tax_id_kind,
        active_plan=normalize_plan_key(payload.active_plan),
        timezone=payload.timezone,
        business_days=",".join(str(d) for d in payload.business_days),
        workday_start="08:00",
        workday_end="18:00",
        block_national_holidays=True,
        status=TenantStatus.ACTIVE,
    )
    db.add(tenant)
    db.flush()

    user = User(
        tenant_id=tenant.id,
        full_name=payload.full_name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=UserRole.ADMIN,
        is_active=True,
        is_platform_operator=_platform_operator_flag_for_email(payload.email),
    )
    db.add(user)
    if payload.tax_id_kind == "cnpj":
        from app.nfse_auto_provider import sync_nfse_auto_from_cnpj_digits

        sync_nfse_auto_from_cnpj_digits(db, tenant.id, payload.tax_document, commit=False)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.post("/register", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
def register(request: Request, payload: PublicRegisterRequest, db: Annotated[Session, Depends(get_db)]) -> Tenant:
    """Cadastro público: sem CPF/CNPJ (pendente) ou completo; PF/PJ depois em `/auth/me/tenant/fiscal` se pendente."""
    if not PUBLIC_REGISTER_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cadastro público está desabilitado neste ambiente. Use o fluxo de bootstrap autorizado.",
        )
    if _reserved_platform_email(payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este e-mail é reservado à operação Climaris. Use outro endereço para cadastrar uma empresa.",
        )
    email_norm = payload.email.strip().lower()
    try:
        # Verifica se o domínio do e-mail aceita recebimento para evitar cadastros sem confirmação possível.
        validate_email(email_norm, check_deliverability=True)
    except EmailNotValidError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"E-mail inválido ou sem recebimento: {str(exc)}",
        ) from exc
    existing_email = db.execute(select(User).where(User.email == email_norm)).scalar_one_or_none()
    if existing_email is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este e-mail já possui cadastro. Use outro e-mail ou confirme a conta existente.",
        )
    if payload.tax_document is not None:
        existing_tenant = db.execute(select(Tenant).where(Tenant.cnpj == payload.tax_document)).scalar_one_or_none()
        if existing_tenant:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este CPF/CNPJ já está cadastrado.")

        tenant = Tenant(
            name=payload.tenant_name.strip(),
            cnpj=payload.tax_document,
            tax_id_kind=payload.tax_id_kind,
            active_plan=normalize_plan_key(payload.active_plan),
            timezone=payload.timezone,
            business_days=",".join(str(d) for d in payload.business_days),
            workday_start="08:00",
            workday_end="18:00",
            block_national_holidays=True,
            status=TenantStatus.ACTIVE,
        )
        db.add(tenant)
        db.flush()

        user = User(
            tenant_id=tenant.id,
            full_name=payload.full_name.strip(),
            email=payload.email.lower(),
            password_hash=hash_password(payload.password),
            role=UserRole.ADMIN,
            is_active=False,
            must_change_password=False,
            phone=payload.phone,
            whatsapp=payload.whatsapp,
            is_platform_operator=_platform_operator_flag_for_email(payload.email),
        )
        db.add(user)
        db.flush()
        raw_token = _create_email_verification_token(db, user)
        try:
            _send_verification_email(
                to_email=user.email,
                full_name=user.full_name,
                verify_url=_build_verify_email_url(raw_token, request),
                db=db,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Não foi possível enviar e-mail de confirmação agora: {str(exc)}",
            ) from exc
        _sync_tenant_national_holidays(db, tenant.id)
        if payload.tax_id_kind == "cnpj":
            from app.nfse_auto_provider import sync_nfse_auto_from_cnpj_digits

            sync_nfse_auto_from_cnpj_digits(db, tenant.id, payload.tax_document, commit=False)
        db.commit()
        db.refresh(tenant)
        return tenant

    pending_cnpj: str | None = None
    for _ in range(12):
        candidate = _generate_pending_tax_placeholder()
        taken = db.execute(select(Tenant).where(Tenant.cnpj == candidate)).scalar_one_or_none()
        if taken is None:
            pending_cnpj = candidate
            break
    if pending_cnpj is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível reservar identificador da conta. Tente novamente.",
        )

    tenant = Tenant(
        name=payload.tenant_name.strip(),
        cnpj=pending_cnpj,
        tax_id_kind="pending",
        active_plan=normalize_plan_key(payload.active_plan),
        timezone=payload.timezone,
        business_days=",".join(str(d) for d in payload.business_days),
        workday_start="08:00",
        workday_end="18:00",
        block_national_holidays=True,
        status=TenantStatus.ACTIVE,
    )
    db.add(tenant)
    db.flush()

    user = User(
        tenant_id=tenant.id,
        full_name=payload.full_name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=UserRole.ADMIN,
        is_active=False,
        must_change_password=False,
        phone=payload.phone,
        whatsapp=payload.whatsapp,
        is_platform_operator=_platform_operator_flag_for_email(payload.email),
    )
    db.add(user)
    db.flush()
    raw_token = _create_email_verification_token(db, user)
    try:
        _send_verification_email(
            to_email=user.email,
            full_name=user.full_name,
            verify_url=_build_verify_email_url(raw_token, request),
            db=db,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Não foi possível enviar e-mail de confirmação agora: {str(exc)}",
        ) from exc
    _sync_tenant_national_holidays(db, tenant.id)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.get("/me/tenant", response_model=TenantOut)
def get_my_tenant(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Tenant:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    return tenant


@router.patch("/me/tenant/fiscal", response_model=TenantOut)
@limiter.limit("30/minute")
def complete_my_tenant_fiscal(
    request: Request,
    payload: CompleteTenantFiscalRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> Tenant:
    """Define PF/PJ e CPF/CNPJ quando o cadastro ainda está pendente."""
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    if tenant.tax_id_kind != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O cadastro fiscal desta conta já foi concluído.",
        )

    other = db.execute(select(Tenant).where(Tenant.cnpj == payload.tax_document)).scalar_one_or_none()
    if other is not None and other.id != tenant.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este CPF/CNPJ já está cadastrado.")

    tenant.cnpj = payload.tax_document
    tenant.tax_id_kind = payload.tax_id_kind
    db.add(tenant)
    if payload.tax_id_kind == "cnpj":
        from app.nfse_auto_provider import sync_nfse_auto_from_cnpj_digits

        sync_nfse_auto_from_cnpj_digits(db, tenant.id, payload.tax_document, commit=False)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.patch("/me/tenant", response_model=TenantOut)
@limiter.limit("30/minute")
def admin_patch_my_tenant(
    request: Request,
    payload: TenantAdminUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> Tenant:
    from app.tax_id import normalize_and_validate_tax_document

    raw = payload.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")

    tax_kind_in = raw.pop("tax_id_kind", None)
    tax_doc_in = raw.pop("tax_document", None)
    if "active_plan" in raw and raw["active_plan"] is not None:
        raw["active_plan"] = normalize_plan_key(str(raw["active_plan"]))

    for field, value in raw.items():
        if field == "weekday_work_hours" and value is not None:
            value = json.dumps(value, ensure_ascii=False)
        setattr(tenant, field, value)
    if tenant.workday_end <= tenant.workday_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Horário final deve ser maior que o horário inicial.",
        )

    if tax_kind_in is not None or tax_doc_in is not None:
        if tax_doc_in is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Informe o CPF/CNPJ ao atualizar dados fiscais.",
            )
        kind = tax_kind_in if tax_kind_in is not None else tenant.tax_id_kind
        if kind not in ("cpf", "cnpj"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selecione CPF ou CNPJ para concluir ou alterar o cadastro fiscal.",
            )
        try:
            normalized = normalize_and_validate_tax_document(tax_doc_in, kind)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        other = db.execute(select(Tenant).where(Tenant.cnpj == normalized)).scalar_one_or_none()
        if other is not None and other.id != tenant.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este CPF/CNPJ já está cadastrado.")

        tenant.cnpj = normalized
        tenant.tax_id_kind = kind
        if kind == "cnpj":
            from app.nfse_auto_provider import sync_nfse_auto_from_cnpj_digits

            sync_nfse_auto_from_cnpj_digits(db, tenant.id, normalized, commit=False)

    if tenant.block_national_holidays:
        _sync_tenant_national_holidays(db, tenant.id)
    else:
        _remove_auto_national_holidays(db, tenant.id)

    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.post("/me/tenant/logo", response_model=TenantOut)
@limiter.limit("20/minute")
async def admin_upload_tenant_logo(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    file: UploadFile = File(...),
) -> Tenant:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    raw = await file.read()
    try:
        uploaded = process_and_upload_tenant_logo(
            tenant_id=tenant.id,
            file_bytes=raw,
            source_filename=file.filename,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao processar ou enviar logo para armazenamento: {str(exc)}",
        ) from exc

    previous_key = tenant.logo_s3_key
    tenant.logo_s3_key = uploaded.s3_key
    tenant.logo_url = uploaded.public_url
    tenant.logo_content_type = uploaded.content_type
    tenant.logo_updated_at = datetime.now(timezone.utc)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    if previous_key and previous_key != uploaded.s3_key:
        delete_tenant_logo_if_exists(previous_key, db=db)
    return tenant


@router.get("/me/tenant/logo-url")
@limiter.limit("60/minute")
def admin_get_tenant_logo_url(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> dict[str, str]:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    if not tenant.logo_s3_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo não cadastrada para este tenant.")
    try:
        signed = generate_tenant_logo_presigned_url(tenant.logo_s3_key, db=db)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Falha ao gerar URL temporária do logo: {str(exc)}") from exc
    return {"url": signed}


@router.delete("/me/tenant/logo", response_model=TenantOut)
@limiter.limit("30/minute")
def admin_delete_tenant_logo(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> Tenant:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    old_key = tenant.logo_s3_key
    tenant.logo_s3_key = None
    tenant.logo_url = None
    tenant.logo_content_type = None
    tenant.logo_updated_at = None
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    if old_key:
        delete_tenant_logo_if_exists(old_key, db=db)
    return tenant


@router.post("/me/tenant/sync-national-holidays")
@limiter.limit("30/minute")
def admin_sync_national_holidays(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> dict[str, int | bool]:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    if not tenant.block_national_holidays:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ative o bloqueio de feriados nacionais antes de sincronizar.",
        )
    inserted = _sync_tenant_national_holidays_count(db, tenant.id)
    db.commit()
    return {"inserted": inserted, "block_national_holidays": tenant.block_national_holidays}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("8/minute")
def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    email_norm = payload.email.strip().lower()
    now = datetime.now(timezone.utc)
    user_agent = request.headers.get("user-agent", "").strip()[:512] or None
    ip_address = _client_ip(request)
    device_fingerprint = _device_fingerprint(ip_address, user_agent)
    users_by_email = db.execute(select(User).where(User.email == email_norm)).scalars().all()
    client_state = _upsert_client_state(
        db=db,
        email=email_norm,
        ip_address=ip_address,
        user_agent=user_agent,
        device_fingerprint=device_fingerprint,
    )
    if client_state.blocked_until is not None and client_state.blocked_until > now:
        _record_login_attempt(
            db=db,
            email=email_norm,
            tenant_id=payload.tenant_id,
            user_id=None,
            ip_address=ip_address,
            user_agent=user_agent,
            device_fingerprint=device_fingerprint,
            outcome="blocked",
            reason="client_backoff",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas neste dispositivo. Aguarde alguns segundos e tente novamente.",
        )
    blocked_until = _active_login_block_until(users_by_email, now)
    if blocked_until is not None:
        _record_login_attempt(
            db=db,
            email=email_norm,
            tenant_id=payload.tenant_id,
            user_id=None,
            ip_address=ip_address,
            user_agent=user_agent,
            device_fingerprint=device_fingerprint,
            outcome="blocked",
            reason="email_lock",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso temporariamente bloqueado por segurança. Tente novamente em 15 minutos.",
        )
    if client_state.failed_attempts >= _CAPTCHA_START_ATTEMPTS:
        captcha_valid = _validate_captcha(
            db=db,
            email=email_norm,
            device_fingerprint=device_fingerprint,
            token=payload.captcha_token,
            answer=payload.captcha_answer,
            now=now,
        )
        if not captcha_valid:
            captcha_token, captcha_question = _new_captcha_challenge(
                db=db, email=email_norm, device_fingerprint=device_fingerprint, now=now
            )
            _record_login_attempt(
                db=db,
                email=email_norm,
                tenant_id=payload.tenant_id,
                user_id=None,
                ip_address=ip_address,
                user_agent=user_agent,
                device_fingerprint=device_fingerprint,
                outcome="blocked",
                reason="captcha_required",
            )
            db.commit()
            return TokenResponse(
                access_token="",
                must_change_password=False,
                tenant_id=payload.tenant_id or 0,
                is_platform_operator=False,
                two_factor_required=False,
                captcha_required=True,
                captcha_token=captcha_token,
                captcha_question=captcha_question,
            )

    if payload.tenant_id is not None:
        user = next((u for u in users_by_email if u.tenant_id == payload.tenant_id), None)
        if user is None or not _safe_verify_password(payload.password, user.password_hash):
            if users_by_email:
                _register_failed_login_attempt(users_by_email, now)
                if any((u.login_blocked_until is not None and u.login_blocked_until > now) for u in users_by_email):
                    for candidate in users_by_email:
                        if candidate.login_blocked_until is not None and candidate.login_blocked_until > now:
                            try:
                                _send_login_lock_email(
                                    db=db, user=candidate, ip_address=ip_address, user_agent=user_agent
                                )
                            except Exception:
                                pass
            client_state.failed_attempts = int(client_state.failed_attempts or 0) + 1
            backoff_seconds = min(2 ** max(0, client_state.failed_attempts - 1), _CLIENT_BACKOFF_MAX_SECONDS)
            client_state.blocked_until = now + timedelta(seconds=backoff_seconds)
            client_state.last_failed_at = now
            db.add(client_state)
            _record_login_attempt(
                db=db,
                email=email_norm,
                tenant_id=payload.tenant_id,
                user_id=user.id if user else None,
                ip_address=ip_address,
                user_agent=user_agent,
                device_fingerprint=device_fingerprint,
                outcome="failure",
                reason="invalid_credentials",
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    else:
        matches = [u for u in users_by_email if _safe_verify_password(payload.password, u.password_hash)]
        if len(matches) == 0:
            if users_by_email:
                _register_failed_login_attempt(users_by_email, now)
                if any((u.login_blocked_until is not None and u.login_blocked_until > now) for u in users_by_email):
                    for candidate in users_by_email:
                        if candidate.login_blocked_until is not None and candidate.login_blocked_until > now:
                            try:
                                _send_login_lock_email(
                                    db=db, user=candidate, ip_address=ip_address, user_agent=user_agent
                                )
                            except Exception:
                                pass
            client_state.failed_attempts = int(client_state.failed_attempts or 0) + 1
            backoff_seconds = min(2 ** max(0, client_state.failed_attempts - 1), _CLIENT_BACKOFF_MAX_SECONDS)
            client_state.blocked_until = now + timedelta(seconds=backoff_seconds)
            client_state.last_failed_at = now
            db.add(client_state)
            _record_login_attempt(
                db=db,
                email=email_norm,
                tenant_id=payload.tenant_id,
                user_id=None,
                ip_address=ip_address,
                user_agent=user_agent,
                device_fingerprint=device_fingerprint,
                outcome="failure",
                reason="invalid_credentials",
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
        if len(matches) > 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Este e-mail está em mais de uma empresa. Inclua tenant_id no JSON do login "
                    "ou unifique o acesso com o suporte."
                ),
            )
        user = matches[0]

    _clear_login_security_state(users_by_email)
    client_state.failed_attempts = 0
    client_state.blocked_until = None
    client_state.last_failed_at = None
    db.add(client_state)
    db.commit()

    if not user.is_active:
        pending_verification = db.execute(
            select(EmailVerificationToken).where(
                EmailVerificationToken.user_id == user.id,
                EmailVerificationToken.expires_at > datetime.now(timezone.utc),
            )
        ).scalar_one_or_none()
        if pending_verification is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="E-mail ainda não confirmado. Confira sua caixa de entrada e confirme o cadastro.",
            )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive.")

    if user.role == UserRole.ADMIN and _admin_two_factor_enabled(db):
        valid_2fa = False
        code_provided = bool((payload.two_factor_token or "").strip() and (payload.two_factor_code or "").strip())

        if code_provided:
            token_plain = (payload.two_factor_token or "").strip()
            token_hash = _sha256(token_plain)
            challenge = db.execute(
                select(LoginTwoFactorChallenge).where(
                    LoginTwoFactorChallenge.user_id == user.id,
                    LoginTwoFactorChallenge.token_hash == token_hash,
                )
            ).scalar_one_or_none()
            if challenge is None:
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=(
                        "Sessão de verificação inválida. Entre de novo com e-mail e senha. "
                        "Se você pediu um novo código, abriu outra aba ou enviou o formulário duas vezes, "
                        "use só o último e-mail recebido."
                    ),
                )
            if challenge.expires_at <= now:
                db.delete(challenge)
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=(
                        f"Código expirado (até {_TWO_FACTOR_TTL_MINUTES} min). "
                        "Faça login novamente para receber outro código."
                    ),
                )
            challenge.attempts = int(challenge.attempts or 0) + 1
            db.add(challenge)
            if _sha256((payload.two_factor_code or "").strip()) == challenge.code_hash:
                valid_2fa = True
                db.delete(challenge)
            elif challenge.attempts >= _TWO_FACTOR_MAX_ATTEMPTS:
                db.delete(challenge)
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Muitas tentativas incorretas. Faça login novamente para receber um novo código.",
                )
            else:
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Código de verificação incorreto.",
                )
            db.commit()
            if payload.trust_this_device and LOGIN_ADMIN_TRUST_DEVICE_ENABLED:
                _issue_trusted_device_cookie(
                    db=db,
                    response=response,
                    user=user,
                    device_fingerprint=device_fingerprint,
                    user_agent=user_agent,
                    now=now,
                )
                db.commit()
        elif _trusted_device_cookie_accepts(
            db=db,
            request=request,
            user_id=user.id,
            device_fingerprint=device_fingerprint,
            user_agent=user_agent,
            now=now,
        ):
            valid_2fa = True
            db.commit()

        if not valid_2fa:
            two_factor_token = _create_two_factor_challenge(db, user, now)
            _record_login_attempt(
                db=db,
                email=email_norm,
                tenant_id=user.tenant_id,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                device_fingerprint=device_fingerprint,
                outcome="challenge",
                reason="two_factor_required",
            )
            db.commit()
            return TokenResponse(
                access_token="",
                must_change_password=user.must_change_password,
                tenant_id=user.tenant_id,
                is_platform_operator=user.is_platform_operator,
                two_factor_required=True,
                two_factor_token=two_factor_token,
            )

    token = create_access_token(
        {
            "sub": str(user.id),
            "tenant_id": user.tenant_id,
            "role": user.role.value,
            "po": user.is_platform_operator,
        }
    )
    _record_login_attempt(
        db=db,
        email=email_norm,
        tenant_id=user.tenant_id,
        user_id=user.id,
        ip_address=ip_address,
        user_agent=user_agent,
        device_fingerprint=device_fingerprint,
        outcome="success",
        reason="ok",
    )
    db.commit()
    return TokenResponse(
        access_token=token,
        must_change_password=user.must_change_password,
        tenant_id=user.tenant_id,
        is_platform_operator=user.is_platform_operator,
    )


@router.post("/verify-email")
@limiter.limit("20/minute")
def verify_email(request: Request, payload: VerifyEmailRequest, db: Annotated[Session, Depends(get_db)]) -> dict[str, str]:
    token_hash = _sha256(payload.token.strip())
    row = db.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_hash,
            EmailVerificationToken.expires_at > datetime.now(timezone.utc),
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de confirmação inválido ou expirado.",
        )

    user = db.get(User, row.user_id)
    if user is None:
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token de confirmação inválido.")

    user.is_active = True
    db.add(user)
    db.delete(row)
    db.commit()
    return {"message": "E-mail confirmado com sucesso. Você já pode entrar."}


@router.post("/resend-verification-email")
@limiter.limit("10/minute")
def resend_verification_email(
    request: Request,
    payload: ResendVerificationEmailRequest,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    email_norm = payload.email.strip().lower()
    user = db.execute(select(User).where(User.email == email_norm)).scalar_one_or_none()
    if user is None:
        return {"message": "Se este e-mail estiver cadastrado, enviaremos um novo link de confirmação."}
    if user.is_active:
        return {"message": "Este e-mail já está confirmado. Você já pode entrar."}

    raw_token = _create_email_verification_token(db, user)
    try:
        _send_verification_email(
            to_email=user.email,
            full_name=user.full_name,
            verify_url=_build_verify_email_url(raw_token, request),
            db=db,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Não foi possível reenviar o e-mail de confirmação agora: {str(exc)}",
        ) from exc
    db.commit()
    return {"message": "Enviamos um novo link de confirmação para seu e-mail."}


@router.post("/forgot-password")
@limiter.limit("10/minute")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    email_norm = payload.email.strip().lower()
    user = db.execute(select(User).where(User.email == email_norm)).scalar_one_or_none()
    if user is None:
        return {"message": "Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha."}
    if not user.is_active:
        return {"message": "Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha."}
    raw_token = _create_password_reset_token(db, user)
    try:
        _send_password_reset_email(
            to_email=user.email,
            full_name=user.full_name,
            reset_url=_build_reset_password_url(raw_token, request),
            db=db,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Não foi possível enviar o e-mail de recuperação agora: {str(exc)}",
        ) from exc
    db.commit()
    return {"message": "Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha."}


@router.post("/reset-password")
@limiter.limit("20/minute")
def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    token_hash = _sha256(payload.token.strip())
    row = db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.expires_at > datetime.now(timezone.utc),
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Link de recuperação inválido ou expirado.")

    user = db.get(User, row.user_id)
    if user is None:
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Link de recuperação inválido.")
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conta inativa. Confirme seu e-mail antes de redefinir a senha.",
        )

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.add(user)
    db.delete(row)
    db.commit()
    return {"message": "Senha redefinida com sucesso. Faça login com a nova senha."}


@router.get("/me", response_model=UserOut)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


@router.patch("/me", response_model=UserOut)
@limiter.limit("60/minute")
def patch_me(
    request: Request,
    payload: UserSelfUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    target = db.get(User, current_user.id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    if "email" in data:
        data["email"] = data["email"].strip().lower()
        existing = db.execute(
            select(User).where(
                User.tenant_id == target.tenant_id,
                User.email == data["email"],
                User.id != target.id,
            )
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists for tenant.")
        if _reserved_platform_email(data["email"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este e-mail é reservado à operação da plataforma.",
            )

    for key, value in data.items():
        setattr(target, key, value)

    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.post(
    "/users",
    response_model=UserProvisionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("60/minute")
def create_user(
    request: Request,
    payload: UserCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserProvisionOut:
    if current_user.tenant_id != payload.tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot create user for another tenant.")

    existing = db.execute(
        select(User).where(User.tenant_id == payload.tenant_id, User.email == payload.email.lower())
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists for tenant.")
    if _reserved_platform_email(payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este e-mail é reservado à operação da plataforma e não pode ser usado em usuários de empresa.",
        )
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    _tenant_user_limit_guard(db, tenant)

    temporary_password = generate_temporary_password(6)
    user = User(
        tenant_id=payload.tenant_id,
        full_name=payload.full_name,
        email=payload.email.lower(),
        password_hash=hash_password(temporary_password),
        role=payload.role,
        is_active=True,
        must_change_password=True,
        is_platform_operator=False,
    )
    db.add(user)
    db.flush()

    if payload.role == UserRole.TECHNICIAN:
        for weekday, start_time, end_time in _tenant_weekday_schedule_for_technician(tenant):
            db.add(
                TechnicianWorkWindow(
                    tenant_id=current_user.tenant_id,
                    technician_id=user.id,
                    weekday=weekday,
                    start_time=start_time,
                    end_time=end_time,
                )
            )

    db.commit()
    db.refresh(user)
    return UserProvisionOut.model_validate(
        {
            "id": user.id,
            "tenant_id": user.tenant_id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
            "must_change_password": user.must_change_password,
            "is_platform_operator": user.is_platform_operator,
            "phone": user.phone,
            "whatsapp": user.whatsapp,
            "temporary_password": temporary_password,
        }
    )


@router.get("/users", response_model=list[UserOut])
@limiter.limit("120/minute")
def list_tenant_users(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[User]:
    rows = db.execute(
        select(User)
        .where(User.tenant_id == current_user.tenant_id)
        .order_by(User.id.asc())
        .offset(skip)
        .limit(limit)
    ).scalars().all()
    return list(rows)


@router.patch("/users/{user_id}", response_model=UserOut)
@limiter.limit("60/minute")
def admin_update_user(
    request: Request,
    user_id: int,
    payload: UserAdminUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> User:
    target = db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")

    if target.is_platform_operator and not current_user.is_platform_operator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este usuário pertence à operação da plataforma e não pode ser alterado pelo administrador do workspace.",
        )

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    if "email" in data:
        data["email"] = data["email"].strip().lower()
        existing = db.execute(
            select(User).where(
                User.tenant_id == current_user.tenant_id,
                User.email == data["email"],
                User.id != user_id,
            )
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists for tenant.")
        if _reserved_platform_email(data["email"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este e-mail é reservado à operação da plataforma.",
            )

    new_role = data.get("role", target.role)
    new_active = data.get("is_active", target.is_active)

    if target.id == current_user.id:
        if "is_active" in data and data["is_active"] is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Você não pode desativar sua própria conta.",
            )
        if "role" in data and data["role"] != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Você não pode remover seu próprio perfil de administrador.",
            )

    if target.role == UserRole.ADMIN and target.is_active:
        will_remain_admin = new_role == UserRole.ADMIN and new_active
        if not will_remain_admin:
            if _other_active_admin_count(db, current_user.tenant_id, target.id) < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Deve existir ao menos outro administrador ativo na empresa.",
                )

    for key, value in data.items():
        setattr(target, key, value)

    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.post("/users/{user_id}/reset-password", response_model=UserProvisionOut)
@limiter.limit("30/minute")
def admin_reset_user_password(
    request: Request,
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> UserProvisionOut:
    """Gera nova senha temporária; o usuário deve alterá-la no próximo login."""
    target = db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    if target.is_platform_operator and not current_user.is_platform_operator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não é possível redefinir a senha deste usuário pelo painel da empresa.",
        )
    if target.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use outro fluxo para alterar a própria senha (não é possível redefinir aqui).",
        )

    temporary_password = generate_temporary_password(6)
    target.password_hash = hash_password(temporary_password)
    target.must_change_password = True
    db.add(target)
    db.commit()
    db.refresh(target)
    return UserProvisionOut.model_validate(
        {
            "id": target.id,
            "tenant_id": target.tenant_id,
            "full_name": target.full_name,
            "email": target.email,
            "role": target.role,
            "is_active": target.is_active,
            "must_change_password": target.must_change_password,
            "is_platform_operator": target.is_platform_operator,
            "phone": target.phone,
            "whatsapp": target.whatsapp,
            "temporary_password": temporary_password,
        }
    )


@router.post("/change-temporary-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def change_temporary_password(
    request: Request, payload: ChangeTemporaryPasswordRequest, db: Annotated[Session, Depends(get_db)]
) -> None:
    user = db.execute(
        select(User).where(User.tenant_id == payload.tenant_id, User.email == payload.email.lower())
    ).scalar_one_or_none()
    if user is None or not verify_password(payload.temporary_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")
    if not user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="User password does not require temporary change."
        )
    if payload.temporary_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different from temporary password."
        )

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.add(user)
    db.commit()


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def change_my_password(
    request: Request,
    payload: ChangeMyPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha atual inválida.")
    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    db.add(current_user)
    db.commit()


@router.get("/me/trusted-devices", response_model=list[TrustedDeviceOut])
@limiter.limit("60/minute")
def list_my_trusted_devices(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> list[TrustedDeviceOut]:
    """Lista dispositivos confiáveis (2FA lembrar dispositivo) — só administradores do workspace."""
    ip_address = _client_ip(request)
    user_agent = request.headers.get("user-agent", "").strip()[:512] or None
    fp = _device_fingerprint(ip_address, user_agent)
    rows = (
        db.execute(
            select(LoginTrustedDevice)
            .where(LoginTrustedDevice.user_id == current_user.id)
            .order_by(LoginTrustedDevice.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [
        TrustedDeviceOut(
            id=row.id,
            expires_at=row.expires_at,
            created_at=row.created_at,
            last_used_at=row.last_used_at,
            is_current_browser=row.device_fingerprint == fp,
        )
        for row in rows
    ]


@router.delete("/me/trusted-devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_my_trusted_device(
    request: Request,
    device_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> None:
    row = db.execute(
        select(LoginTrustedDevice).where(
            LoginTrustedDevice.id == device_id,
            LoginTrustedDevice.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispositivo não encontrado.")
    db.delete(row)
    db.commit()


@router.delete("/me/trusted-devices", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def delete_all_my_trusted_devices(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> None:
    """Revoga todos os dispositivos confiáveis (o cookie deixa de validar na próxima checagem)."""
    db.execute(delete(LoginTrustedDevice).where(LoginTrustedDevice.user_id == current_user.id))
    db.commit()
