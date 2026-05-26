#!/usr/bin/env python3
"""Sanity check administrativo para etiquetas QR e orçamentos (pós-restauração de backup)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal
from app.storage_integrity import run_storage_reindex


def main() -> int:
    parser = argparse.ArgumentParser(description="Sanity check S3: qrcodes e budgets")
    parser.add_argument("--tenant-id", type=int, default=None, help="Limitar a um tenant (omitir = todos)")
    parser.add_argument(
        "--regenerate-invalid",
        action="store_true",
        help="Regerar arquivos de etiquetas QR marcadas como inválidas",
    )
    parser.add_argument(
        "--reupload-budget-pdfs",
        action="store_true",
        help="Gerar e enviar PDFs de orçamentos ausentes no S3",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        report = run_storage_reindex(
            db,
            tenant_id=args.tenant_id,
            regenerate_invalid_qr=args.regenerate_invalid,
            reupload_missing_budget_pdfs=args.reupload_budget_pdfs,
        )
        print(json.dumps(report.to_dict(), indent=2, ensure_ascii=False))
        if report.errors:
            return 2
        if report.qrcodes_invalid or report.budgets_pdf_missing:
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
