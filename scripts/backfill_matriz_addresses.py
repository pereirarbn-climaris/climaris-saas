#!/usr/bin/env python3
"""Backfill: cria o endereço "Principal" (e, para Pessoa Jurídica, também a
unidade "Matriz") para clientes já existentes que possuem endereço
cadastrado no cliente mas ainda não têm nenhum registro em Endereços
(principal) — e, no caso de PJ, também sem Unidades/Filiais (matriz).

Reaproveita a mesma lógica usada em app/routers/clients.py ao salvar um
cliente (create_client / update_client), então o resultado é idêntico ao que
passa a ocorrer automaticamente daqui para frente.

Uso (na raiz do repositório):

  PYTHONPATH=. python3 scripts/backfill_matriz_addresses.py           # aplica
  PYTHONPATH=. python3 scripts/backfill_matriz_addresses.py --dry-run # só lista
"""

from __future__ import annotations

import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.routers.clients import _ensure_matriz_and_principal_address  # noqa: E402
from models import Client, ClientAddress, ClientSite  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Apenas lista o que seria criado, sem gravar.")
    args = parser.parse_args()

    db = SessionLocal()
    created_matriz = 0
    created_address = 0
    try:
        clients = db.execute(select(Client)).scalars().all()
        print(f"Total de clientes: {len(clients)}")

        for client in clients:
            is_pj = client.tax_id_kind == "cnpj" and bool((client.document or "").strip())
            has_address_data = bool(
                (client.address_street or "").strip()
                or (client.address_city or "").strip()
                or (client.address_postal_code or "").strip()
            )

            has_matriz = (
                is_pj
                and db.execute(
                    select(ClientSite.id).where(ClientSite.client_id == client.id, ClientSite.site_type == "matriz")
                )
                .scalars()
                .first()
                is not None
            )
            has_principal = (
                db.execute(
                    select(ClientAddress.id).where(
                        ClientAddress.client_id == client.id, ClientAddress.address_type == "principal"
                    )
                )
                .scalars()
                .first()
                is not None
            )

            needs_matriz = is_pj and not has_matriz
            needs_principal = has_address_data and not has_principal
            if not needs_matriz and not needs_principal:
                continue

            kind = "PJ" if is_pj else "PF"
            print(
                f"  - cliente #{client.id} ({client.name!r}, {kind}): "
                f"matriz={'ok' if not is_pj else ('ok' if has_matriz else 'CRIAR')}, "
                f"endereço principal={'ok' if has_principal else ('CRIAR' if has_address_data else 'sem dados de endereço')}"
            )
            if args.dry_run:
                continue

            _ensure_matriz_and_principal_address(db, client)
            db.flush()
            if needs_matriz:
                created_matriz += 1
            if needs_principal:
                created_address += 1

        if args.dry_run:
            print("Dry-run: nada foi gravado.")
        else:
            db.commit()
            print(f"OK — matriz criada para {created_matriz} cliente(s); endereço principal para {created_address}.")
    finally:
        db.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
