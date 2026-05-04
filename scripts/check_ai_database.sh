#!/usr/bin/env bash
# Verifica tabelas da IA no Postgres do docker-compose local (erp_db / erp_user).
# Uso: bash scripts/check_ai_database.sh
set -euo pipefail
USER="${POSTGRES_USER:-erp_user}"
DB="${POSTGRES_DB:-erp_db}"
CONTAINER="${PG_CONTAINER:-erp_db}"

echo "Container: $CONTAINER | User: $USER | Database: $DB"
docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" <<'SQL'
\dt tenant_ai_settings
\dt ai_chat_history
\dt ai_pending_tool_confirmations
\d tenant_ai_settings
SQL
