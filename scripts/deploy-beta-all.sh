#!/usr/bin/env bash
set -euo pipefail

# Deploy completo do ambiente Beta (API 8001 + frontend + banco isolado).
# Não altera produção (app.climaris.com.br / porta 8000 / erp_db).
#
# Uso:
#   bash scripts/deploy-beta-all.sh
#   SKIP_FRONTEND=1 bash scripts/deploy-beta-all.sh
#   DB_CLONE=1 bash scripts/deploy-beta-all.sh          # recria estrutura antes do deploy
#   DB_CLONE='--with-data --sanitize' bash scripts/deploy-beta-all.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=========================================="
echo "  Deploy ambiente Beta (beta.climaris.com.br)"
echo "=========================================="

if [[ -n "${DB_CLONE:-}" ]]; then
  echo ""
  echo "==> [0] Clone do banco (produção → climaris_beta)"
  bash scripts/init-beta-db.sh
  # shellcheck disable=SC2086
  bash scripts/db_clone.sh $DB_CLONE
fi

echo ""
echo "==> [1/2] API Beta"
bash scripts/deploy-beta-api.sh

echo ""
if [[ "${SKIP_FRONTEND:-0}" == "1" ]]; then
  echo "==> [2/2] Frontend Beta — SKIP_FRONTEND=1, pulando."
else
  echo "==> [2/2] Frontend Beta"
  bash scripts/deploy-beta-frontend.sh
fi

echo ""
echo "=========================================="
echo "  Beta pronto."
echo "  Health: curl -sS https://beta.climaris.com.br/health"
echo "=========================================="
