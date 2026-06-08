#!/usr/bin/env bash
set -euo pipefail

# Cria o banco PostgreSQL climaris_beta no container erp_db (compartilhado com produção).
# Uso: bash scripts/init-beta-db.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

PG_USER="${POSTGRES_USER:-erp_user}"
PG_CONTAINER="${PG_CONTAINER:-erp_db}"
BETA_DB="${BETA_DB:-climaris_beta}"

echo "==> Garantindo que o Postgres de produção está no ar"
docker compose up -d db

echo "==> Aguardando Postgres ficar saudável"
deadline=$((SECONDS + 60))
until docker compose exec -T db pg_isready -U "$PG_USER" >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Timeout aguardando Postgres." >&2
    exit 1
  fi
  sleep 2
done

exists="$(docker compose exec -T db psql -U "$PG_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${BETA_DB}'" | tr -d '[:space:]')"

if [[ "$exists" == "1" ]]; then
  echo "==> Banco '${BETA_DB}' já existe — nada a fazer."
else
  echo "==> Criando banco '${BETA_DB}' (owner: ${PG_USER})"
  docker compose exec -T db psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 -c \
    "CREATE DATABASE ${BETA_DB} OWNER ${PG_USER};"
  echo "==> Banco '${BETA_DB}' criado."
fi

echo "==> Próximo passo: bash scripts/db_clone.sh  (estrutura a partir de produção)"
