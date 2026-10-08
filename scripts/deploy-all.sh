#!/usr/bin/env bash
set -euo pipefail

# Deploy completo: Evolution → API Climaris (com rede compartilhada) → frontend estático + reload Nginx.
# Uso:
#   ./scripts/deploy-all.sh
#   SKIP_FRONTEND=1 ./scripts/deploy-all.sh    # só backend + Evolution
#   EVOLUTION_FORCE_RECREATE=1 já é aplicado por este script na Evolution.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export EVOLUTION_FORCE_RECREATE="${EVOLUTION_FORCE_RECREATE:-1}"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml:docker-compose.evolution.yml}"

echo "=========================================="
echo "  Deploy completo Climaris + Evolution"
echo "=========================================="

echo ""
echo "==> [1/3] Evolution (API + Manager + Postgres + Redis)"
bash scripts/deploy-evolution.sh

echo ""
echo "==> [2/3] API Climaris (erp_api + migrações Alembic)"
bash scripts/deploy-api.sh

echo ""
if [[ "${SKIP_FRONTEND:-0}" == "1" ]]; then
  echo "==> [3/3] Frontend — SKIP_FRONTEND=1, pulando."
else
  echo "==> [3/3] Frontend (npm build + cópia em DEPLOY_ROOT)"
  bash scripts/deploy-frontend.sh
fi

echo ""
echo "=========================================="
echo "  Deploy completo finalizado."
echo "=========================================="
