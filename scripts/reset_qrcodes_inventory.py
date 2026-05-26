#!/usr/bin/env python3
"""Zera todas as cartelas QR para reiniciar impressão em QR0000001."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal
from app.services.qrcode_labels import format_code_id, reset_qrcode_inventory


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove todas as etiquetas QR do banco")
    parser.add_argument("--tenant-id", type=int, default=None, help="Apenas um tenant (omitir = todos)")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirma exclusão sem prompt interativo",
    )
    args = parser.parse_args()

    if not args.yes:
        scope = f"tenant_id={args.tenant_id}" if args.tenant_id else "TODOS os tenants"
        print(f"Isso apagará todas as cartelas QR ({scope}). Equipamentos ficam sem etiqueta vinculada.")
        print("Use --yes para confirmar.")
        return 1

    db = SessionLocal()
    try:
        deleted = reset_qrcode_inventory(db, tenant_id=args.tenant_id)
        db.commit()
        print(f"Removidas {deleted} cartela(s) QR.")
        print(f"Próximo lote gerado começará em {format_code_id(1)}.")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"Erro: {exc}", file=sys.stderr)
        return 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
