#!/usr/bin/env bash
set -euo pipefail

# Deploy da API Beta (porta 8001, banco climaris_beta, container erp_api_beta).
# Uso: bash scripts/deploy-beta-api.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.beta ]]; then
  echo "Arquivo .env.beta ausente. Copie env.docker.beta.example → .env.beta e ajuste." >&2
  exit 1
fi

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml:docker-compose.evolution.yml:docker-compose.beta.yml}"
API_PORT="${API_PORT:-8001}"
WAIT_SECS="${DEPLOY_API_WAIT_SECS:-120}"
SERVICE="${BETA_API_SERVICE:-api-beta}"

echo "==> Sincronizando segredos de plataforma (CNPJA, Claude, AWS S3) da produção → .env.beta"
bash scripts/sync-beta-platform-secrets.sh || echo "==> Aviso: sync-beta-platform-secrets falhou; CNPJA pode não estar disponível no Beta."

echo "==> Sincronizando credenciais do painel (/operacao/chaves-api) → banco Beta"
bash scripts/sync-beta-platform-credentials-db.sh || echo "==> Aviso: sync-beta-platform-credentials-db falhou; uploads podem depender só do .env.beta."

echo "==> Garantindo banco climaris_beta"
bash scripts/init-beta-db.sh

echo "==> Recriando serviço ${SERVICE}"
docker compose up -d --force-recreate "$SERVICE"

echo "==> Aguardando API Beta em http://127.0.0.1:${API_PORT}/health …"
deadline=$((SECONDS + WAIT_SECS))
until curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "==> Timeout após ${WAIT_SECS}s. Últimas linhas do log:" >&2
    docker compose logs --tail 40 "$SERVICE" >&2 || true
    exit 1
  fi
  sleep 2
done
echo "==> API Beta respondeu em /health"

BETA_DB="${BETA_DB:-climaris_beta}"
PG_USER="${POSTGRES_USER:-erp_user}"

run_migrations() {
  docker compose exec -T "$SERVICE" alembic upgrade heads
}

db_revision() {
  docker compose exec -T db psql -U "$PG_USER" -d "$BETA_DB" -tAc \
    "SELECT version_num FROM alembic_version LIMIT 1;" 2>/dev/null | tr -d '[:space:]'
}

echo "==> Aplicando migrações no ${BETA_DB}"
if run_migrations; then
  echo "==> Migrações aplicadas"
else
  current_rev="$(db_revision)"
  if [[ -n "$current_rev" ]]; then
    echo "==> Aviso: alembic upgrade falhou; banco em ${current_rev}."
  else
    docker compose exec -T "$SERVICE" pip install --no-cache-dir "psycopg[binary]" alembic sqlalchemy
    run_migrations || {
      current_rev="$(db_revision)"
      [[ -n "$current_rev" ]] || exit 1
    }
  fi
fi

echo "==> Deploy da API Beta concluído (porta ${API_PORT})"
