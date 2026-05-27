#!/usr/bin/env bash
# Cria PR minha-branch -> main no GitHub (requer GH_TOKEN ou gh auth login).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null 2>&1; then
  echo "Instale gh: apt install gh" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
    echo "Autentique: export GH_TOKEN=ghp_... && gh auth login --with-token <<< \"\$GH_TOKEN\"" >&2
    exit 1
  fi
  echo "${GH_TOKEN:-$GITHUB_TOKEN}" | gh auth login --with-token
fi

gh pr create \
  --base main \
  --head minha-branch \
  --title "feat: backup minha-branch — etiquetas QR, PMOC, OS e dashboard" \
  --body-file - <<'EOF'
## Resumo

Consolidação da branch `minha-branch` para backup/revisão em relação à `main` (produção continua no VPS).

### Destaques
- **Etiquetas QR**: geração em lotes de 28, modelos de layout, PDF A4 (4×7), preview, vinculação a equipamentos, formato `QR0000001`…
- **Catálogo de equipamentos** e ficha com código QR
- **Módulo OS** integrado à UI v0
- **Clientes** (visual v0, CNPJ em duas camadas)
- **Dashboard** com KPIs e ordens reais
- **WhatsApp/Evolution**: correções de API e plano interno (`beta_internal`)
- Migrações Alembic 0076–0099 (ambiente VPS já aplicado)

### Commits (10)
- c5d9712 feat: etiquetas QR, catálogo de equipamentos e evoluções de PMOC/OS
- 3904185 feat: integracao completa do modulo de OS com UI v0
- f2985bd feat: modulo de clientes completo com visual v0
- 21c37f6 feat: integração completa do dashboard
- e2c33b7 Organizando estrutura v0-ui
- 524e0c4 chore: sync Evolution API key
- c37146f docs: Evolution EVOLUTION_API_KEY
- 93bd2d8 fix(plan): alias beta_internal55
- 5b74728 fix(plan): beta_internalss
- ace3711 fix(whatsapp): Evolution fetchInstances

## Test plan
- [ ] Etiquetas QR: gerar lote 28, preview modelos, PDF
- [ ] Vincular etiqueta a equipamento / scan
- [ ] Ficha equipamento exibe `qrcode_code_id`
- [ ] Dashboard e OS carregam dados reais
- [ ] WhatsApp conexão (tenant plano interno)

> **Nota:** GitHub é backup; deploy de produção segue no servidor (`app.climaris.com.br`).
EOF

gh pr view --web 2>/dev/null || gh pr view --json url -q .url
