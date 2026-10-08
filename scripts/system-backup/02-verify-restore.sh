#!/usr/bin/env bash
set -euo pipefail

# 1) restic check (integridade)
# 2) Teste: restaurar /etc/hostname do snapshot latest e comparar com o disco

LOG_TAG="system-backup-verify"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_CANDIDATES=("/etc/system-backup/backup.env" "$SCRIPT_DIR/backup.env")
ENV_FILE=""

for f in "${ENV_CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then
    ENV_FILE="$f"
    break
  fi
done
if [[ -z "$ENV_FILE" ]]; then
  echo "Falta /etc/system-backup/backup.env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${RESTIC_REPOSITORY:?}"
: "${RESTIC_PASSWORD:?}"
: "${AWS_ACCESS_KEY_ID:?}"
: "${AWS_SECRET_ACCESS_KEY:?}"
: "${AWS_DEFAULT_REGION:?}"
READ_DATA_PCT="${READ_DATA_CHECK_PERCENT:-0}"

export RESTIC_REPOSITORY
export RESTIC_PASSWORD
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION
export AWS_REGION="${AWS_DEFAULT_REGION}"
export RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR:-/var/cache/restic}"

log() { logger -t "$LOG_TAG" -- "$@" || true; echo "[$(date -Iseconds)] $*"; }
warn() { log "AVISO: $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root" >&2
  exit 1
fi
command -v restic >/dev/null 2>&1 || { echo "restic em falta"; exit 1; }

if ! restic snapshots 2>/dev/null | head -1 | grep -q .; then
  log "Nenhum snapshot; saltar verificação"
  exit 0
fi

log "restic check"
if [[ -n "$READ_DATA_PCT" && "$READ_DATA_PCT" != "0" ]]; then
  restic check --read-data-subset "${READ_DATA_PCT}%" || { log "restic check falhou"; exit 1; }
else
  restic check || { log "restic check falhou"; exit 1; }
fi

RESTORE_DIR="/var/lib/system-backup/restore-test"
rm -rf "$RESTORE_DIR" 2>/dev/null || true
mkdir -p "$RESTORE_DIR" || { log "Falha ao criar $RESTORE_DIR"; exit 1; }
chmod 700 "$RESTORE_DIR"

# restic restore: ficheiro fica em $RESTORE_DIR + caminho (ex. .../etc/hostname)
shopt -s nullglob
REF=""
for CAND in /etc/hostname /etc/os-release; do
  if restic restore latest --include "$CAND" --target "$RESTORE_DIR" 2>/dev/null; then
    if [[ -f "$RESTORE_DIR$CAND" ]]; then
      REF="$CAND"
      break
    fi
  fi
  for x in "$RESTORE_DIR"/*; do
    [[ -e "$x" ]] && rm -rf "$x"
  done
done
if [[ -z "$REF" ]]; then
  log "Falha em restic restore (teste com ficheiros /etc/…); ver snapshot e permissões"
  exit 1
fi
log "A verificar ficheiro restaurado: $REF (em $RESTORE_DIR$REF)"
COPY="$RESTORE_DIR$REF"
if [[ ! -f "$COPY" ]]; then
  log "Caminho esperado em falta: $COPY; verifique o layout de restic restore com esta versão"
  exit 1
fi
if ! diff -q "$COPY" "$REF" >/dev/null 2>&1; then
  warn "diff: conteúdo de $REF difere do no disco (normal se o ficheiro mudou após o backup)"
  # Cenário de "drift" ainda indica que o mecanismo de restauro funciona; não sair 1
else
  log "OK: conteúdo de $REF coincide após restauro"
fi
rm -rf "$RESTORE_DIR" 2>/dev/null || true
log "Verificação pós-backup concluída"
exit 0
