"""Persistência e renovação de tokens Mercado Livre por tenant."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.mercado_livre_api import refresh_access_token
from app.security import decrypt_platform_secret, encrypt_platform_secret
from models import TenantMercadoLivreAccount


REFRESH_SKEW = timedelta(minutes=7)


def get_ml_account(db: Session, tenant_id: int) -> TenantMercadoLivreAccount | None:
    return db.execute(select(TenantMercadoLivreAccount).where(TenantMercadoLivreAccount.tenant_id == tenant_id)).scalar_one_or_none()


def save_token_payload(db: Session, account: TenantMercadoLivreAccount, payload: dict) -> None:
    access = payload["access_token"]
    expires_in = int(payload.get("expires_in", 21_600))
    refresh_new = payload.get("refresh_token")
    old_refresh = decrypt_platform_secret(account.refresh_token_encrypted)
    refresh = refresh_new if refresh_new else old_refresh
    if not refresh:
        raise RuntimeError("Refresh token ausente.")

    account.access_token_encrypted = encrypt_platform_secret(access)
    account.refresh_token_encrypted = encrypt_platform_secret(refresh)
    account.access_expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(120, expires_in))

    db.add(account)
    db.commit()
    db.refresh(account)


def ensure_valid_access_token(db: Session, tenant_id: int) -> tuple[str, TenantMercadoLivreAccount]:
    acc = get_ml_account(db, tenant_id)
    if acc is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conecte sua conta Mercado Livre antes (autorização OAuth).",
        )
    now = datetime.now(timezone.utc)
    if acc.access_expires_at <= now + REFRESH_SKEW:
        refresh = decrypt_platform_secret(acc.refresh_token_encrypted)
        try:
            tok = refresh_access_token(refresh)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sessão Mercado Livre expirou. Desconecte e autorize novamente.",
            ) from exc
        save_token_payload(db, acc, tok)
        acc = get_ml_account(db, tenant_id)
        if acc is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Erro ao renovar sessão Mercado Livre.",
            )
    access = decrypt_platform_secret(acc.access_token_encrypted)
    return access, acc


def upsert_account_from_token_response(db: Session, tenant_id: int, token_payload: dict) -> TenantMercadoLivreAccount:
    from app.mercado_livre_api import api_get_my_user

    access = token_payload["access_token"]
    me = api_get_my_user(access)
    uid = str(me.get("id", "") or "").strip()
    if not uid:
        raise RuntimeError("Resposta inválida do Mercado Livre (usuário sem id).")

    acc = get_ml_account(db, tenant_id)
    if acc is None:
        acc = TenantMercadoLivreAccount(tenant_id=tenant_id, ml_user_id=uid)
        db.add(acc)
        db.flush()
    acc.ml_user_id = uid
    nick = me.get("nickname")
    acc.nickname = str(nick)[:120] if nick else None
    email = me.get("email")
    acc.email = str(email)[:255] if email else None
    sid = me.get("site_id")
    acc.site_id = str(sid)[:8] if sid else "MLB"
    save_token_payload(db, acc, token_payload)
    return acc
