#!/usr/bin/env python3
"""Valida pacotes Python necessários para assinatura NFS-e nacional (lxml + signxml).

Execute na raiz do repositório:

  PYTHONPATH=. python3 scripts/check_deps.py

Saída: código 0 se tudo OK; 1 se faltar dependência ou se app.nfse_dps_sign não importar.
"""

from __future__ import annotations

import importlib
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Pacotes usados diretamente na cadeia NFS-e nacional (certificado + XML-DSig).
REQUIRED_IMPORTS: tuple[tuple[str, str], ...] = (
    ("lxml", "lxml"),
    ("signxml", "signxml"),
    ("cryptography", "cryptography"),
)


def _check_import(dist_label: str, module_name: str) -> bool:
    try:
        mod = importlib.import_module(module_name)
    except ImportError as exc:
        print(f"[FALHA] {dist_label}: {exc}")
        return False
    ver = getattr(mod, "__version__", "?")
    print(f"[OK]    {dist_label} (import {module_name}, versão {ver})")
    return True


def main() -> int:
    print("Verificação de dependências NFS-e (assinatura digital / certificado A1)\n")
    ok = True
    for label, mod in REQUIRED_IMPORTS:
        if not _check_import(label, mod):
            ok = False

    print()
    try:
        from app.nfse_dps_sign import sign_dps_xml  # noqa: F401

        print("[OK]    app.nfse_dps_sign (assinatura DPS)")
    except ImportError as exc:
        print(f"[FALHA] app.nfse_dps_sign: {exc}")
        ok = False

    if not ok:
        print(
            "\nInstale no ambiente do serviço: pip install -r requirements.txt\n"
            "Em Debian/Ubuntu, se o lxml não tiver wheel: "
            "sudo apt-get install -y libxml2-dev libxslt1-dev python3-dev"
        )
        return 1
    print("\nTodas as verificações passaram.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
