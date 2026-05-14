#!/usr/bin/env bash
# Copia AUTHENTICATION_API_KEY de deploy/evolution/.env para EVOLUTION_API_KEY no .env da raiz.
# Necessário para o contentor `api` autenticar na Evolution (header apikey).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT
python3 <<'PY'
import re
from pathlib import Path
import os
root = Path(os.environ["ROOT"]) / ".env"
evo = Path(os.environ["ROOT"]) / "deploy" / "evolution" / ".env"
if not evo.is_file():
    raise SystemExit(f"Falta {evo}")
key = None
for line in evo.read_text().splitlines():
    m = re.match(r"^AUTHENTICATION_API_KEY=(.+)$", line.strip())
    if m:
        key = m.group(1).strip().strip('"').strip("'")
        break
if not key:
    raise SystemExit("AUTHENTICATION_API_KEY não encontrado em deploy/evolution/.env")
text = root.read_text() if root.is_file() else ""
if re.search(r"^EVOLUTION_API_KEY=", text, re.M):
    lines = []
    for line in text.splitlines():
        if line.startswith("EVOLUTION_API_KEY="):
            lines.append(f"EVOLUTION_API_KEY={key}")
        else:
            lines.append(line)
    root.write_text("\n".join(lines).rstrip() + "\n")
    print("Atualizado EVOLUTION_API_KEY no .env da raiz.")
else:
    extra = (
        f"\n# Evolution (mesmo valor que AUTHENTICATION_API_KEY em deploy/evolution/.env)\n"
        f"EVOLUTION_API_KEY={key}\n"
    )
    root.write_text(text.rstrip() + extra)
    print("Adicionado EVOLUTION_API_KEY ao .env da raiz.")
PY
