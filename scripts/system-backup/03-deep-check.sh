#!/usr/bin/env bash
set -euo pipefail
# Verificação profunda: lê amostra de blocos (mais custo de S3, maior confiança)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_CANDIDATES=("/etc/system-backup/backup.env" "$SCRIPT_DIR/backup.env")
ENV_FILE=""
for f in "${ENV_CANDIDATES[@]}"; do
  [[ -f "$f" ]] && ENV_FILE="$f" && break
done
[[ -n "$ENV_FILE" ]] || { echo "Falta backup.env"; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export AWS_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"

: "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD:?}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}" "${AWS_DEFAULT_REGION:?}"
export RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR:-/var/cache/restic}"

# Percentagem: ex. 3% = amostra de 3% dos ficheiros de payload
PCT="${DEEP_CHECK_READ_DATA_PERCENT:-3}"
exec restic check --read-data-subset="${PCT}%" --verbose
