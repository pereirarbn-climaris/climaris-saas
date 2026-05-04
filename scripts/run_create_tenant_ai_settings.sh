#!/usr/bin/env bash
# Aplica scripts/create_tenant_ai_settings.sql no Postgres do docker-compose (serviço db).
# Uso: a partir da raiz do projeto: bash scripts/run_create_tenant_ai_settings.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

USER="${POSTGRES_USER:-erp_user}"
DB="${POSTGRES_DB:-erp_db}"

export MSYS_NO_PATHCONV=1 2>/dev/null || true

docker compose exec -T db psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 < "$ROOT/scripts/create_tenant_ai_settings.sql"

echo "OK: tabela tenant_ai_settings criada ou já existia; linhas inseridas onde faltavam."
