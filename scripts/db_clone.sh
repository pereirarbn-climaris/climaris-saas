#!/usr/bin/env bash
set -euo pipefail

# Sincroniza o banco Beta (climaris_beta) a partir do banco de produção (erp_db).
#
# Modos:
#   bash scripts/db_clone.sh                    # só estrutura (padrão)
#   bash scripts/db_clone.sh --with-data        # estrutura + dados completos (CUIDADO)
#   bash scripts/db_clone.sh --with-data --sanitize   # dados + anonimização (scripts/sanitize-beta-data.sql)
#
# Requer: erp_db no ar, climaris_beta criado (scripts/init-beta-db.sh).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

PG_USER="${POSTGRES_USER:-erp_user}"
PG_CONTAINER="${PG_CONTAINER:-erp_db}"
PROD_DB="${PROD_DB:-erp_db}"
BETA_DB="${BETA_DB:-climaris_beta}"

WITH_DATA=0
SANITIZE=0

for arg in "$@"; do
  case "$arg" in
    --with-data) WITH_DATA=1 ;;
    --sanitize) SANITIZE=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $arg (use --help)" >&2
      exit 1
      ;;
  esac
done

if [[ "$SANITIZE" == "1" && "$WITH_DATA" != "1" ]]; then
  echo "--sanitize exige --with-data." >&2
  exit 1
fi

echo "==> Verificando Postgres"
docker compose up -d db
deadline=$((SECONDS + 60))
until docker compose exec -T db pg_isready -U "$PG_USER" >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Timeout aguardando Postgres." >&2
    exit 1
  fi
  sleep 2
done

beta_exists="$(docker compose exec -T db psql -U "$PG_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${BETA_DB}'" | tr -d '[:space:]')"
if [[ "$beta_exists" != "1" ]]; then
  echo "Banco '${BETA_DB}' não existe. Rode: bash scripts/init-beta-db.sh" >&2
  exit 1
fi

echo "==> Encerrando conexões ativas em '${BETA_DB}'"
docker compose exec -T db psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${BETA_DB}' AND pid <> pg_backend_pid();" \
  >/dev/null 2>&1 || true

echo "==> Recriando banco '${BETA_DB}'"
docker compose exec -T db psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${BETA_DB};"
docker compose exec -T db psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 -c \
  "CREATE DATABASE ${BETA_DB} OWNER ${PG_USER};"

DUMP_OPTS=(--no-owner --no-acl)
if [[ "$WITH_DATA" == "1" ]]; then
  echo "==> Clonando estrutura + dados de '${PROD_DB}' → '${BETA_DB}'"
  DUMP_OPTS+=(--clean --if-exists)
else
  echo "==> Clonando apenas estrutura de '${PROD_DB}' → '${BETA_DB}'"
  DUMP_OPTS+=(--schema-only)
fi

docker compose exec -T db pg_dump -U "$PG_USER" "${DUMP_OPTS[@]}" "$PROD_DB" \
  | docker compose exec -T db psql -U "$PG_USER" -d "$BETA_DB" -v ON_ERROR_STOP=1 -q

if [[ "$WITH_DATA" == "1" && "$SANITIZE" == "1" ]]; then
  echo "==> Aplicando sanitização (dados sensíveis)"
  docker compose exec -T db psql -U "$PG_USER" -d "$BETA_DB" -v ON_ERROR_STOP=1 \
    < "$ROOT_DIR/scripts/sanitize-beta-data.sql"
fi

if [[ "$WITH_DATA" != "1" ]]; then
  echo "==> Copiando revisão Alembic de produção (se existir)"
  rev="$(docker compose exec -T db psql -U "$PG_USER" -d "$PROD_DB" -tAc \
    "SELECT version_num FROM alembic_version LIMIT 1;" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ -n "$rev" ]]; then
    docker compose exec -T db psql -U "$PG_USER" -d "$BETA_DB" -v ON_ERROR_STOP=1 -c \
      "INSERT INTO alembic_version (version_num) VALUES ('${rev}') ON CONFLICT DO NOTHING;" \
      2>/dev/null || \
    docker compose exec -T db psql -U "$PG_USER" -d "$BETA_DB" -v ON_ERROR_STOP=1 -c \
      "TRUNCATE alembic_version; INSERT INTO alembic_version (version_num) VALUES ('${rev}');" \
      2>/dev/null || true
  fi
fi

echo "==> Clone concluído: ${PROD_DB} → ${BETA_DB}"
if [[ "$WITH_DATA" != "1" ]]; then
  echo "    Dica: use --with-data --sanitize para dados de teste sem PII real."
fi
