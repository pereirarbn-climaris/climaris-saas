#!/usr/bin/env python3
"""Vincula etiquetas QR disponíveis aos equipamentos sem cartela."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal
from app.services.qrcode_labels import link_available_qrcodes_to_equipments


def main() -> int:
    parser = argparse.ArgumentParser(description="Vincula cartelas QR a equipamentos existentes")
    parser.add_argument("--tenant-id", type=int, required=True, help="ID do tenant")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = link_available_qrcodes_to_equipments(db, tenant_id=args.tenant_id)
        db.commit()
        print(f"Vinculadas: {result.linked}")
        print(f"Equipamentos sem etiqueta (antes): {result.equipment_without_qr}")
        print(f"Ainda sem etiqueta: {result.equipment_still_without_qr}")
        print(f"Etiquetas ainda disponíveis: {result.qrcodes_still_available}")
        if result.qrcodes_used:
            print(f"Primeira: {result.qrcodes_used[0]} · Última: {result.qrcodes_used[-1]}")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"Erro: {exc}", file=sys.stderr)
        return 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
