#!/usr/bin/env python3
"""Diagnóstico manual: GET /dps/{id} no ADN (mesma URL e headers que o ERP).

Uso (na raiz do repositório):

  PYTHONPATH=. python3 scripts/adn_probe_get_dps.py \\
    --pfx /caminho/cert.pfx \\
    --pfx-password '***' \\
    --mei-environment homolog \\
    --dps-id 'DPS35032082373335118000180NF1778092992'

Senha também pode vir de ADN_PROBE_PFX_PASSWORD.

Imprime: URL final (após quote), tpAmb, HTTP status e corpo (JSON ou texto).
Não logue isso em canais públicos (certificado + resposta podem ser sensíveis).
"""

from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe GET /dps/{id} no Ambiente Nacional (ADN).")
    parser.add_argument("--pfx", required=True, help="Arquivo .pfx / .p12 (certificado A1)")
    parser.add_argument(
        "--pfx-password",
        default=os.getenv("ADN_PROBE_PFX_PASSWORD", ""),
        help="Senha do PFX (ou env ADN_PROBE_PFX_PASSWORD)",
    )
    parser.add_argument("--dps-id", required=True, help="Valor do atributo Id do infDPS")
    parser.add_argument(
        "--mei-environment",
        choices=("homolog", "producao"),
        default="homolog",
        help="homolog → ADN produção restrita; producao → ADN produção",
    )
    parser.add_argument(
        "--base-url",
        default="",
        help="Opcional: sobrescreve a URL base (senão usa NFSE_SEFIN_BASE_URL_* ou padrão oficial)",
    )
    parser.add_argument("--timeout", type=float, default=90.0)
    args = parser.parse_args()

    if not args.pfx_password:
        print("Erro: informe --pfx-password ou ADN_PROBE_PFX_PASSWORD.", file=sys.stderr)
        return 2

    from app.nfse_pfx_ssl import ssl_context_from_pfx_bytes
    from app.nfse_sefin_client import adn_base_url, dps_resource_url, get_dps_resource

    pfx_path = os.path.abspath(args.pfx)
    with open(pfx_path, "rb") as f:
        pfx_bytes = f.read()

    ssl_ctx = ssl_context_from_pfx_bytes(pfx_bytes, args.pfx_password)

    if args.base_url.strip():
        base_url = args.base_url.strip().rstrip("/")
    else:
        base_url = adn_base_url(args.mei_environment)

    full_url = dps_resource_url(base_url, args.dps_id)
    tp_amb = "1" if args.mei_environment == "producao" else "2"

    print("--- ADN GET /dps probe ---")
    print(f"mei_environment: {args.mei_environment}")
    print(f"base_url:      {base_url}")
    print(f"tpAmb header:  {tp_amb}")
    print(f"full URL:      {full_url}")
    print("--- response ---")

    http_code, body = get_dps_resource(
        ssl_ctx,
        base_url,
        args.dps_id.strip(),
        mei_environment=args.mei_environment,
        timeout=args.timeout,
    )

    print(f"HTTP status: {http_code}")
    if isinstance(body, dict):
        print(json.dumps(body, ensure_ascii=False, indent=2)[:12000])
    else:
        print(str(body)[:12000])

    return 0 if http_code in (200, 201) else 1


if __name__ == "__main__":
    raise SystemExit(main())
