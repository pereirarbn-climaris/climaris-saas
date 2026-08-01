"""Gestão de cartelas QR pré-geradas (code_id sequencial)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import public_app_base_url
from models import Client, Equipment, QrCode, QrCodeStatus

# Numérico: QR0000001 … QR9999999 (7 dígitos)
NUMERIC_MAX = 9_999_999
# Com letra: QRA0000001 … QRZ9999999 (26 blocos × 9.999.999)
LETTER_BLOCK_SIZE = 9_999_999
LETTER_START_SEQ = 10_000_000
MAX_SEQUENCE = LETTER_START_SEQ + 26 * LETTER_BLOCK_SIZE - 1

_CODE_NUMERIC_RE = re.compile(r"^QR(\d{7})$", re.IGNORECASE)
_CODE_LETTER_RE = re.compile(r"^QR([A-Z])(\d{7})$", re.IGNORECASE)
_CODE_LEGACY_8_RE = re.compile(r"^QR(\d{8})$", re.IGNORECASE)


@dataclass
class QrCodeGenerateResult:
    created: int
    code_ids: list[str]
    first_code_id: str | None
    last_code_id: str | None


@dataclass
class QrLinkEquipmentsResult:
    linked: int
    equipment_without_qr: int
    qrcodes_used: list[str]
    equipment_still_without_qr: int
    qrcodes_still_available: int


def normalize_code_id(raw: str) -> str:
    text = (raw or "").strip().upper()
    if not text:
        return ""
    url_match = re.search(r"/equipment/([^/?#]+)", text, re.IGNORECASE)
    if url_match:
        text = url_match.group(1).strip().upper()
    legacy = re.search(r"/p/e/([^/?#]+)", text, re.IGNORECASE)
    if legacy:
        return legacy.group(1).strip()
    return text


def build_qrcode_public_url(code_id: str) -> str:
    return f"{public_app_base_url()}/equipment/{normalize_code_id(code_id)}"


def parse_sequence_from_code_id(code_id: str) -> int | None:
    """Converte code_id (novo ou legado 8 dígitos) em número de sequência interno."""
    normalized = normalize_code_id(code_id)
    if not normalized:
        return None

    m = _CODE_NUMERIC_RE.match(normalized)
    if m:
        seq = int(m.group(1))
        return seq if 1 <= seq <= NUMERIC_MAX else None

    m = _CODE_LEGACY_8_RE.match(normalized)
    if m:
        seq = int(m.group(1))
        return seq if 1 <= seq <= NUMERIC_MAX else None

    m = _CODE_LETTER_RE.match(normalized)
    if m:
        letter_idx = ord(m.group(1).upper()) - ord("A")
        if letter_idx < 0 or letter_idx > 25:
            return None
        num = int(m.group(2))
        if num < 1 or num > LETTER_BLOCK_SIZE:
            return None
        return LETTER_START_SEQ + letter_idx * LETTER_BLOCK_SIZE + (num - 1)

    return None


def format_code_id(sequence: int) -> str:
    """QR0000001 … QR9999999; depois QRA0000001 … QRZ9999999."""
    seq = int(sequence)
    if seq < 1:
        raise ValueError("Sequência de etiqueta inválida.")
    if seq <= NUMERIC_MAX:
        return f"QR{seq:07d}"
    if seq > MAX_SEQUENCE:
        raise ValueError("Limite de etiquetas QR atingido.")
    index = seq - LETTER_START_SEQ
    letter_idx = index // LETTER_BLOCK_SIZE
    num = index % LETTER_BLOCK_SIZE + 1
    letter = chr(ord("A") + letter_idx)
    return f"QR{letter}{num:07d}"


def _max_sequence(db: Session, tenant_id: int) -> int:
    rows = db.execute(select(QrCode.code_id).where(QrCode.tenant_id == tenant_id)).scalars().all()
    max_n = 0
    for code in rows:
        seq = parse_sequence_from_code_id(code or "")
        if seq is not None:
            max_n = max(max_n, seq)
    return max_n


def generate_qrcode_batch(db: Session, *, tenant_id: int, quantity: int) -> QrCodeGenerateResult:
    qty = max(1, min(int(quantity), 500))
    start = _max_sequence(db, tenant_id) + 1
    if start + qty - 1 > MAX_SEQUENCE:
        raise ValueError("Limite de etiquetas QR atingido para este tenant.")
    created_ids: list[str] = []
    for offset in range(qty):
        seq = start + offset
        code_id = format_code_id(seq)
        row = QrCode(
            tenant_id=tenant_id,
            code_id=code_id,
            status=QrCodeStatus.AVAILABLE,
            tracking_url=build_qrcode_public_url(code_id),
        )
        db.add(row)
        created_ids.append(code_id)
    db.flush()
    return QrCodeGenerateResult(
        created=len(created_ids),
        code_ids=created_ids,
        first_code_id=created_ids[0] if created_ids else None,
        last_code_id=created_ids[-1] if created_ids else None,
    )


def link_available_qrcodes_to_equipments(db: Session, *, tenant_id: int) -> QrLinkEquipmentsResult:
    """Vincula cartelas QR disponíveis (ordem crescente) a equipamentos ainda sem etiqueta."""
    eq_ids = list(
        db.execute(
            select(Equipment.id)
            .join(Client, Client.id == Equipment.client_id)
            .outerjoin(QrCode, QrCode.linked_to_equipment_id == Equipment.id)
            .where(Client.tenant_id == tenant_id, QrCode.id.is_(None))
            .order_by(Equipment.id.asc())
        ).scalars().all()
    )
    available = list(
        db.execute(
            select(QrCode)
            .where(
                QrCode.tenant_id == tenant_id,
                QrCode.status == QrCodeStatus.AVAILABLE,
                QrCode.linked_to_equipment_id.is_(None),
            )
            .order_by(QrCode.code_id.asc())
        ).scalars().all()
    )

    linked = 0
    used_codes: list[str] = []
    for equipment_id, qr_row in zip(eq_ids, available, strict=False):
        equipment = db.get(Equipment, equipment_id)
        if equipment is None:
            continue
        link_qrcode_to_equipment(
            db,
            code_id=qr_row.code_id,
            tenant_id=tenant_id,
            equipment_id=equipment_id,
            public_token=equipment.public_token,
        )
        linked += 1
        used_codes.append(qr_row.code_id)

    still_without = len(eq_ids) - linked
    still_available = len(available) - linked
    return QrLinkEquipmentsResult(
        linked=linked,
        equipment_without_qr=len(eq_ids),
        qrcodes_used=used_codes,
        equipment_still_without_qr=still_without,
        qrcodes_still_available=still_available,
    )


def reset_qrcode_inventory(db: Session, *, tenant_id: int | None = None) -> int:
    """Remove todas as cartelas QR (desvincula equipamentos). Próximo lote começa em QR0000001."""
    stmt = delete(QrCode)
    if tenant_id is not None:
        stmt = stmt.where(QrCode.tenant_id == tenant_id)
    result = db.execute(stmt)
    db.flush()
    return int(result.rowcount or 0)


def get_qrcode_by_code_id(db: Session, code_id: str, *, tenant_id: int | None = None) -> QrCode | None:
    normalized = normalize_code_id(code_id)
    if not normalized:
        return None
    query = select(QrCode).where(QrCode.code_id == normalized)
    if tenant_id is not None:
        query = query.where(QrCode.tenant_id == tenant_id)
    return db.execute(query).scalar_one_or_none()


def validate_available_qrcode(db: Session, code_id: str, *, tenant_id: int) -> QrCode:
    row = get_qrcode_by_code_id(db, code_id, tenant_id=tenant_id)
    if row is None:
        raise ValueError("Código QR não encontrado.")
    if row.status != QrCodeStatus.AVAILABLE:
        raise ValueError("Este código QR já está vinculado a um equipamento.")
    if row.linked_to_equipment_id is not None:
        raise ValueError("Este código QR já está vinculado a um equipamento.")
    return row


def link_qrcode_to_equipment(
    db: Session,
    *,
    code_id: str,
    tenant_id: int,
    equipment_id: int,
    public_token: str | None = None,
    allow_replace: bool = False,
) -> QrCode:
    row = get_qrcode_by_code_id(db, code_id, tenant_id=tenant_id)
    if row is None:
        raise ValueError("Código QR não encontrado.")

    # Já vinculado a este mesmo equipamento — idempotente.
    if row.linked_to_equipment_id == equipment_id and row.status == QrCodeStatus.LINKED:
        if public_token and row.public_token != public_token:
            row.public_token = public_token
        return row

    if row.status != QrCodeStatus.AVAILABLE or row.linked_to_equipment_id is not None:
        raise ValueError("Este código QR já está vinculado a um equipamento.")

    equipment = db.get(Equipment, equipment_id)
    if equipment is None:
        raise ValueError("Equipamento não encontrado.")

    existing = db.execute(
        select(QrCode).where(
            QrCode.tenant_id == tenant_id,
            QrCode.linked_to_equipment_id == equipment_id,
            QrCode.id != row.id,
        )
    ).scalar_one_or_none()
    if existing is not None:
        if not allow_replace:
            raise ValueError(f"Equipamento já possui etiqueta {existing.code_id}.")
        existing.status = QrCodeStatus.AVAILABLE
        existing.linked_to_equipment_id = None
        existing.public_token = None
        existing.tracking_url = None

    row.status = QrCodeStatus.LINKED
    row.linked_to_equipment_id = equipment_id
    row.public_token = public_token
    row.tracking_url = build_qrcode_public_url(row.code_id)
    return row


def resolve_equipment_id_from_public_key(db: Session, key: str) -> int | None:
    """Resolve equipamento por code_id (cartela) ou public_token (legado)."""
    normalized = normalize_code_id(key)
    if not normalized:
        return None

    qr = db.execute(select(QrCode).where(QrCode.code_id == normalized)).scalar_one_or_none()
    if qr is not None and qr.linked_to_equipment_id is not None:
        return int(qr.linked_to_equipment_id)

    equipment = db.execute(select(Equipment.id).where(Equipment.public_token == normalized)).scalar_one_or_none()
    if equipment is not None:
        return int(equipment)
    return None


def count_qrcodes_by_status(db: Session, tenant_id: int) -> dict[str, int]:
    rows = db.execute(
        select(QrCode.status, func.count(QrCode.id))
        .where(QrCode.tenant_id == tenant_id)
        .group_by(QrCode.status)
    ).all()
    out = {"available": 0, "linked": 0}
    for status, count in rows:
        key = status.value if hasattr(status, "value") else str(status)
        if key in out:
            out[key] = int(count)
    return out
