#!/usr/bin/env bash
set -euo pipefail

# Roda Alembic dentro do container `api`, onde o host `db` do Postgres resolve.
# Uso (na raiz do repositório, ex.: /root/.ssh):
#   ./scripts/db-migrate.sh
#   ./scripts/db-migrate.sh upgrade head
#   ./scripts/db-migrate.sh current
#
# Não use `.venv/bin/alembic` no host com DATABASE_URL=@db — o nome `db` só existe na rede Docker.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if (($# == 0)); then
  set -- upgrade head
fi

exec docker compose exec api bash -lc "cd /app && python -m alembic $*"
