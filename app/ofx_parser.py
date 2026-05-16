"""Parser mínimo de extrato OFX 1.x (BANKTRANLIST / STMTTRN) para importação genérica."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation


@dataclass(frozen=True)
class OfxStatementTransaction:
    fit_id: str
    amount: Decimal
    posted_at: date
    trn_type: str | None
    payee: str | None
    memo: str | None


_TAG_RE = re.compile(r"<([A-Za-z0-9_.]+)>\s*([^<\r\n]*?)\s*(?=<)", re.MULTILINE)


def _decode_ofx_text(raw: bytes) -> str:
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _parse_ofx_date(raw: str) -> date | None:
    s = (raw or "").strip()
    if len(s) < 8 or not s[:8].isdigit():
        return None
    y, m, d = int(s[0:4]), int(s[4:6]), int(s[6:8])
    if m < 1 or m > 12 or d < 1 or d > 31:
        return None
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _tags_in_segment(segment: str) -> dict[str, str]:
    d: dict[str, str] = {}
    for line in segment.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        s = line.strip()
        if not s.startswith("<") or s.startswith("</"):
            continue
        try:
            gt = s.index(">")
        except ValueError:
            continue
        tag = s[1:gt].strip().upper()
        val = s[gt + 1 :].strip()
        if tag and val:
            d[tag] = val
    if len(d) < 3:
        for m in _TAG_RE.finditer(segment):
            key, val = m.group(1).upper(), m.group(2).strip()
            if key and val:
                d.setdefault(key, val)
    return d


def parse_ofx_statement_transactions(raw: bytes) -> tuple[list[OfxStatementTransaction], str | None]:
    """
    Extrai transações de extratos OFX comuns (ex.: exportação de banco digital).
    Retorna (lista, mensagem_erro) — erro só para falha total de leitura; linhas inválidas são ignoradas.
    """
    if not raw or len(raw) > 6 * 1024 * 1024:
        return [], "Arquivo vazio ou muito grande (máx. 6 MB)."

    text = _decode_ofx_text(raw)
    if "<OFX" not in text.upper() and "OFXHEADER" not in text.upper():
        return [], "O arquivo não parece ser OFX (cabeçalho OFX ausente)."

    parts = re.split(r"<\s*STMTTRN\s*>", text, flags=re.IGNORECASE)
    if len(parts) < 2:
        return [], "Nenhuma transação <STMTTRN> encontrada no OFX."

    out: list[OfxStatementTransaction] = []
    seen_fit: set[str] = set()

    for chunk in parts[1:]:
        seg = re.split(r"<\s*/\s*STMTTRN\s*>", chunk, maxsplit=1, flags=re.IGNORECASE)[0]
        tags = _tags_in_segment(seg)
        fit = (tags.get("FITID") or "").strip()
        if not fit:
            continue
        if fit in seen_fit:
            continue
        seen_fit.add(fit)

        amt_raw = tags.get("TRNAMT") or ""
        try:
            amount = Decimal(str(amt_raw).replace(",", "."))
        except (InvalidOperation, ValueError):
            continue

        dt_raw = tags.get("DTPOSTED") or tags.get("DTUSER") or tags.get("DTAVAIL") or ""
        posted = _parse_ofx_date(dt_raw)
        if posted is None:
            continue

        trn_type = (tags.get("TRNTYPE") or "").strip() or None
        payee = (tags.get("NAME") or "").strip() or None
        memo = (tags.get("MEMO") or "").strip() or None

        out.append(
            OfxStatementTransaction(
                fit_id=fit[:128],
                amount=amount.quantize(Decimal("0.01")),
                posted_at=posted,
                trn_type=trn_type,
                payee=payee[:500] if payee else None,
                memo=memo[:1000] if memo else None,
            )
        )

    if not out:
        return [], "Nenhuma transação válida (FITID, TRNAMT, DTPOSTED) foi encontrada."
    return out, None
