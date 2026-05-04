"""Integração OAuth e anúncios Mercado Livre (requer add-on na loja)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_mercado_livre_marketplace, require_roles
from app.mercado_livre_api import (
    api_create_item,
    api_domain_discovery,
    api_get_item,
    api_put_item,
    build_authorization_url,
    exchange_authorization_code,
    mercado_livre_redirect_uri,
    oauth_app_configured,
)
from app.mercado_livre_service import ensure_valid_access_token, get_ml_account, upsert_account_from_token_response
from app.marketplace_util import tenant_has_marketplace_app
from app.schemas import (
    MercadoLivreLinkUpsert,
    MercadoLivreOAuthCompleteRequest,
    MercadoLivreProductLinkOut,
    MercadoLivrePublishRequest,
    MercadoLivreStatusOut,
)
from models import MercadoLivreProductLink, MercadoLivreSyncStatus, Product, User, UserRole

router = APIRouter(prefix="/integrations/mercado-livre", tags=["integrations-mercado-livre"])


def _money_float(v: Decimal | float) -> float:
    return float(v) if isinstance(v, Decimal) else float(v)


def _qty_int(q: Decimal | float) -> int:
    x = float(q) if isinstance(q, Decimal) else float(q)
    if x < 0:
        return 0
    return int(min(round(x), 999_999))


@router.get("/status", response_model=MercadoLivreStatusOut)
def mercado_livre_status(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MercadoLivreStatusOut:
    entitlement = tenant_has_marketplace_app(db, current_user.tenant_id, "mercado_livre")
    acc = get_ml_account(db, current_user.tenant_id)
    return MercadoLivreStatusOut(
        oauth_app_configured=oauth_app_configured(),
        entitlement_active=entitlement,
        connected=acc is not None,
        nickname=acc.nickname if acc else None,
        ml_user_id=acc.ml_user_id if acc else None,
        site_id=acc.site_id if acc else None,
        access_expires_at=acc.access_expires_at if acc else None,
    )


@router.get("/oauth-url")
def mercado_livre_oauth_url(
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> dict[str, str]:
    if not oauth_app_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Credenciais Mercado Livre não configuradas no servidor (MERCADO_LIVRE_CLIENT_ID / SECRET).",
        )
    try:
        url = build_authorization_url()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return {"authorization_url": url, "redirect_uri": mercado_livre_redirect_uri()}


@router.post("/oauth-complete")
def mercado_livre_oauth_complete(
    payload: MercadoLivreOAuthCompleteRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> dict[str, str]:
    if not oauth_app_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OAuth não configurado no servidor.")
    try:
        tokens = exchange_authorization_code(payload.code.strip())
        upsert_account_from_token_response(db, current_user.tenant_id, tokens)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"status": "connected"}


@router.delete("/disconnect", status_code=status.HTTP_204_NO_CONTENT)
def mercado_livre_disconnect(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> None:
    acc = get_ml_account(db, current_user.tenant_id)
    if acc is None:
        return None
    db.delete(acc)
    db.commit()
    return None


@router.get("/domain-discovery")
def mercado_livre_domain_discovery(
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
    q: Annotated[str, Query(min_length=2)],
    site_id: Annotated[str, Query()] = "MLB",
    limit: Annotated[int, Query(ge=1, le=40)] = 16,
) -> list[dict]:
    try:
        rows = api_domain_discovery(site_id.strip() or "MLB", q, limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    clean: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        cats = row.get("categories")
        first_cat = cats[0] if isinstance(cats, list) and cats and isinstance(cats[0], dict) else {}
        clean.append(
            {
                "domain_id": row.get("domain_id"),
                "domain_name": row.get("domain_name"),
                "category_id": first_cat.get("id") if first_cat else row.get("category_id"),
                "category_name": first_cat.get("name") if first_cat else row.get("category_name"),
            }
        )
    return clean


@router.get("/products/{product_id}/link", response_model=MercadoLivreProductLinkOut)
def get_ml_product_link(
    product_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
) -> MercadoLivreProductLinkOut:
    product = db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")
    link = db.execute(
        select(MercadoLivreProductLink).where(
            MercadoLivreProductLink.product_id == product_id,
            MercadoLivreProductLink.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo ML ainda não criado.")
    return MercadoLivreProductLinkOut(
        id=link.id,
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku,
        ml_item_id=link.ml_item_id,
        permalink=link.permalink,
        ml_category_id=link.ml_category_id,
        listing_type_id=link.listing_type_id,
        sync_status=link.sync_status.value,
        last_sync_at=link.last_sync_at,
        last_error=link.last_error,
        ml_item_status=link.ml_item_status,
    )


def _get_product(db: Session, tenant_id: int, product_id: int) -> Product:
    p = db.execute(
        select(Product)
        .options(joinedload(Product.images), joinedload(Product.mercado_livre_link))
        .where(Product.id == product_id, Product.tenant_id == tenant_id)
    ).unique().scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")
    return p


@router.put("/products/{product_id}/link", response_model=MercadoLivreProductLinkOut)
def upsert_ml_link(
    product_id: int,
    payload: MercadoLivreLinkUpsert,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
) -> MercadoLivreProductLinkOut:
    product = _get_product(db, current_user.tenant_id, product_id)
    link = product.mercado_livre_link
    if link is None:
        link = MercadoLivreProductLink(tenant_id=current_user.tenant_id, product_id=product_id)
        db.add(link)
        db.flush()
    if payload.ml_category_id is not None:
        link.ml_category_id = payload.ml_category_id.strip() or None
    if payload.listing_type_id is not None:
        link.listing_type_id = payload.listing_type_id.strip() or None
    elif link.listing_type_id is None:
        link.listing_type_id = "gold_special"
    db.commit()
    db.refresh(link)
    db.refresh(product)
    return MercadoLivreProductLinkOut(
        id=link.id,
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku,
        ml_item_id=link.ml_item_id,
        permalink=link.permalink,
        ml_category_id=link.ml_category_id,
        listing_type_id=link.listing_type_id,
        sync_status=link.sync_status.value,
        last_sync_at=link.last_sync_at,
        last_error=link.last_error,
        ml_item_status=link.ml_item_status,
    )


@router.post("/products/{product_id}/publish", response_model=MercadoLivreProductLinkOut)
def publish_product_to_ml(
    product_id: int,
    payload: MercadoLivrePublishRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
) -> MercadoLivreProductLinkOut:
    token, _acc = ensure_valid_access_token(db, current_user.tenant_id)
    product = _get_product(db, current_user.tenant_id, product_id)
    imgs = sorted(product.images, key=lambda x: (x.sort_order, x.id))
    if not imgs:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Adicione pelo menos uma imagem ao produto.")

    link = product.mercado_livre_link
    if link is None:
        link = MercadoLivreProductLink(tenant_id=current_user.tenant_id, product_id=product_id, listing_type_id="gold_special")
        db.add(link)
        db.flush()

    cat = (payload.ml_category_id or "").strip() or link.ml_category_id
    if not cat:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe ml_category_id (busca em domain-discovery) ou salve na vinculação antes.")

    listing_type = (payload.listing_type_id or "").strip() or link.listing_type_id or "gold_special"
    link.ml_category_id = cat
    link.listing_type_id = listing_type
    link.sync_status = MercadoLivreSyncStatus.PUBLISHING
    link.last_error = None
    db.commit()
    db.refresh(link)

    title = product.name.strip()[:120]
    price = round(_money_float(product.sale_price), 2)
    qty = _qty_int(product.stock_quantity)
    pics = [{"source": im.public_url} for im in imgs[:12]]

    body: dict = {
        "title": title,
        "category_id": cat,
        "price": price,
        "currency_id": "BRL",
        "available_quantity": qty,
        "buying_mode": "buy_it_now",
        "listing_type_id": listing_type,
        "condition": "new",
        "pictures": pics,
    }

    try:
        if link.ml_item_id:
            out = api_put_item(token, link.ml_item_id, body)
        else:
            out = api_create_item(token, body)
        link.ml_item_id = str(out.get("id", link.ml_item_id or ""))
        link.permalink = out.get("permalink") or link.permalink
        link.ml_item_status = out.get("status") or link.ml_item_status
        link.sync_status = MercadoLivreSyncStatus.ACTIVE
        link.last_sync_at = datetime.now(timezone.utc)
        link.last_error = None
    except Exception as exc:
        link.sync_status = MercadoLivreSyncStatus.ERROR
        link.last_error = str(exc)[:2000]
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    db.commit()
    db.refresh(link)
    db.refresh(product)
    return MercadoLivreProductLinkOut(
        id=link.id,
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku,
        ml_item_id=link.ml_item_id,
        permalink=link.permalink,
        ml_category_id=link.ml_category_id,
        listing_type_id=link.listing_type_id,
        sync_status=link.sync_status.value,
        last_sync_at=link.last_sync_at,
        last_error=link.last_error,
        ml_item_status=link.ml_item_status,
    )


@router.post("/products/{product_id}/sync-stock", response_model=MercadoLivreProductLinkOut)
def sync_stock_to_ml(
    product_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
) -> MercadoLivreProductLinkOut:
    token, _acc = ensure_valid_access_token(db, current_user.tenant_id)
    product = _get_product(db, current_user.tenant_id, product_id)
    link = product.mercado_livre_link
    if link is None or not link.ml_item_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Produto ainda não publicado no Mercado Livre.")

    qty = _qty_int(product.stock_quantity)
    price = round(_money_float(product.sale_price), 2)
    try:
        out = api_put_item(
            token,
            link.ml_item_id,
            {"available_quantity": qty, "price": price},
        )
        link.ml_item_status = out.get("status") or link.ml_item_status
        link.last_sync_at = datetime.now(timezone.utc)
        link.sync_status = MercadoLivreSyncStatus.ACTIVE
        link.last_error = None
        db.commit()
        db.refresh(link)
    except Exception as exc:
        link.last_error = str(exc)[:2000]
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    db.refresh(product)
    return MercadoLivreProductLinkOut(
        id=link.id,
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku,
        ml_item_id=link.ml_item_id,
        permalink=link.permalink,
        ml_category_id=link.ml_category_id,
        listing_type_id=link.listing_type_id,
        sync_status=link.sync_status.value,
        last_sync_at=link.last_sync_at,
        last_error=link.last_error,
        ml_item_status=link.ml_item_status,
    )


@router.get("/listings", response_model=list[MercadoLivreProductLinkOut])
def list_ml_listings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[MercadoLivreProductLinkOut]:
    rows = db.execute(
        select(MercadoLivreProductLink, Product)
        .join(Product, MercadoLivreProductLink.product_id == Product.id)
        .where(MercadoLivreProductLink.tenant_id == current_user.tenant_id)
        .order_by(MercadoLivreProductLink.updated_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()
    out: list[MercadoLivreProductLinkOut] = []
    for link, product in rows:
        out.append(
            MercadoLivreProductLinkOut(
                id=link.id,
                product_id=product.id,
                product_name=product.name,
                product_sku=product.sku,
                ml_item_id=link.ml_item_id,
                permalink=link.permalink,
                ml_category_id=link.ml_category_id,
                listing_type_id=link.listing_type_id,
                sync_status=link.sync_status.value,
                last_sync_at=link.last_sync_at,
                last_error=link.last_error,
                ml_item_status=link.ml_item_status,
            )
        )
    return out


@router.post("/pull-item/{product_id}")
def pull_ml_item_metadata(
    product_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_mercado_livre_marketplace)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
) -> dict:
    token, _acc = ensure_valid_access_token(db, current_user.tenant_id)
    product = _get_product(db, current_user.tenant_id, product_id)
    link = product.mercado_livre_link
    if link is None or not link.ml_item_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sem anúncio vinculado.")
    try:
        remote = api_get_item(token, link.ml_item_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    link.ml_item_status = remote.get("status") or link.ml_item_status
    link.permalink = remote.get("permalink") or link.permalink
    link.last_sync_at = datetime.now(timezone.utc)
    db.commit()
    return {"permalink": remote.get("permalink"), "status": remote.get("status"), "health": remote.get("health")}
