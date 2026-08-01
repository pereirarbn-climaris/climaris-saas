#!/usr/bin/env bash
# Disparado via OnFailure= quando system-backup.service ou
# system-backup-deep-check.service falham. Reúne o log do journal e chama o
# script Python (dentro do container erp_api) que envia o e-mail de alerta
# usando o SMTP já configurado em /operacao/chaves-api.
#
# Instalado em: /usr/local/lib/system-backup/notify-failure.sh
set -uo pipefail

UNIT="${1:-system-backup.service}"
LOG_TAG="system-backup-alert"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_CANDIDATES=("/etc/system-backup/backup.env" "$SCRIPT_DIR/backup.env")
for f in "${ENV_CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
    break
  fi
done
: "${PROJECT_ROOT:=/root/.ssh}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/status-lib.sh" 2>/dev/null || true

log() { logger -t "$LOG_TAG" -- "$@" || true; echo "[$(date -Iseconds)] $*"; }

# Componente do status.json afetado por este unit (ver status-lib.sh)
case "$UNIT" in
  *deep-check*) STATUS_COMPONENT="deep_check" ;;
  *) STATUS_COMPONENT="backup" ;;
esac
if command -v write_status >/dev/null 2>&1 || declare -f write_status >/dev/null 2>&1; then
  write_status "$STATUS_COMPONENT" "false" "Serviço $UNIT falhou; ver e-mail de alerta / journalctl -u $UNIT" || true
fi

LOGFILE="$(mktemp /tmp/system-backup-alert.XXXXXX)"
trap 'rm -f "$LOGFILE"' EXIT

journalctl -u "$UNIT" -n 100 --no-pager >"$LOGFILE" 2>&1 || true

if ! command -v docker >/dev/null 2>&1; then
  log "docker indisponível; não foi possível enviar e-mail de alerta para $UNIT"
  exit 0
fi

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^erp_api$'; then
  log "contentor erp_api inativo; não foi possível enviar e-mail de alerta para $UNIT"
  exit 0
fi

if docker exec -i erp_api python3 /app/scripts/send_backup_alert_email.py "$UNIT" <"$LOGFILE"; then
  log "e-mail de alerta enviado para $UNIT"
else
  log "AVISO: falha ao enviar e-mail de alerta para $UNIT (ver logs do erp_api)"
fi
