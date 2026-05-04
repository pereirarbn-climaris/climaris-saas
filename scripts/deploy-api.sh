#!/usr/bin/env bash
set -euo pipefail

# Deploy padrão da API:
# 1) recria o serviço com dependências atualizadas
# 2) espera o pip + uvicorn do container (evita "alembic not in PATH" e deps faltando)
# 3) aplica migrações do banco

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-8000}"
WAIT_SECS="${DEPLOY_API_WAIT_SECS:-120}"

echo "==> Recriando serviço da API"
docker compose up -d --force-recreate api

echo "==> Aguardando API (pip + uvicorn) em http://127.0.0.1:${API_PORT}/health …"
deadline=$((SECONDS + WAIT_SECS))
until curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "==> Timeout após ${WAIT_SECS}s. Últimas linhas do log da API:" >&2
    docker compose logs --tail 40 api >&2 || true
    exit 1
  fi
  sleep 2
done
echo "==> API respondeu em /health"

run_migrations() {
  docker compose exec -T api alembic upgrade heads
}

echo "==> Aplicando migrações"
if run_migrations; then
  echo "==> Migrações aplicadas com sucesso"
else
  echo "==> Falha no 'alembic upgrade heads'."
  echo "==> Instalando driver Postgres + alembic no container e tentando de novo…"
  docker compose exec -T api pip install --no-cache-dir "psycopg[binary]" alembic sqlalchemy
  run_migrations
  echo "==> Migrações aplicadas após instalar dependências"
fi

echo "==> Deploy da API concluído"
