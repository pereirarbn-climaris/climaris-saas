#!/usr/bin/env bash
set -euo pipefail

# Backup completo do anfitrião (/) para repositório restic no S3, com dump PostgreSQL
# (via docker) para consistência. Executar como root (systemd).
#
# Ficheiro de configuração: /etc/system-backup/backup.env
#   (cópia a partir de backup.env.example; chmod 600)

LOG_TAG="system-backup"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXCLUDES_FILE="${EXCLUDES_FILE:-$SCRIPT_DIR/restic-excludes.txt}"
ENV_CANDIDATES=("/etc/system-backup/backup.env" "$SCRIPT_DIR/backup.env")
ENV_FILE=""

for f in "${ENV_CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then
    ENV_FILE="$f"
    break
  fi
done
if [[ -z "$ENV_FILE" ]]; then
  echo "Defina a config: copie backup.env.example para /etc/system-backup/backup.env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${RESTIC_REPOSITORY:?Defina RESTIC_REPOSITORY}"
if [[ "$RESTIC_REPOSITORY" == *SEU-BUCKET* ]] || [[ "$RESTIC_REPOSITORY" == *YOUR_BUCKET* ]] || [[ "$RESTIC_REPOSITORY" == *example.com* ]]; then
  die "RESTIC_REPOSITORY ainda é placeholder. No AWS S3 crie um bucket (nome em minúsculas, único) e use: s3:nome-do-bucket/caminho-resto"
fi
: "${RESTIC_PASSWORD:?Defina RESTIC_PASSWORD}"
: "${AWS_ACCESS_KEY_ID:?Defina AWS_ACCESS_KEY_ID}"
: "${AWS_SECRET_ACCESS_KEY:?Defina AWS_SECRET_ACCESS_KEY}"
: "${AWS_DEFAULT_REGION:?Defina AWS_DEFAULT_REGION}"
: "${PROJECT_ROOT:=/root/.ssh}"

STAGING_DIR="${BACKUP_STAGING_DIR:-/var/lib/system-backup/staging}"
CACHE_DIR="${RESTIC_CACHE_DIR:-/var/cache/restic}"
TAG_PREFIX="${BACKUP_TAG_PREFIX:-host}"

export RESTIC_REPOSITORY
export RESTIC_PASSWORD
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION
export AWS_REGION="${AWS_DEFAULT_REGION}"
export RESTIC_CACHE_DIR="${CACHE_DIR}"

log() { logger -t "$LOG_TAG" -- "$@" || true; echo "[$(date -Iseconds)] $*"; }
die() { log "ERRO: $*"; exit 1; }

if [[ "$(id -u)" -ne 0 ]]; then
  die "Execute como root (o backup de / requer privilégios elevados)"
fi
[[ -f "$EXCLUDES_FILE" ]] || die "Ficheiro de exclusões inexistente: $EXCLUDES_FILE"
[[ -d "$PROJECT_ROOT" ]] || die "PROJECT_ROOT não existe: $PROJECT_ROOT"
command -v restic >/dev/null 2>&1 || die "Instale restic: apt install -y restic"

mkdir -p "$STAGING_DIR" "$CACHE_DIR" || die "Falha ao criar $STAGING_DIR / $CACHE_DIR"
chmod 700 "$STAGING_DIR" 2>/dev/null || true

# Dump PostgreSQL (dados reais em volume Docker) — ficheiro fica no staging e entra no snapshot
DUMP_NAME="pgdump_$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
DUMP_PATH="$STAGING_DIR/$DUMP_NAME"
# Remove dumps antigos no staging (ficam na história restic)
find "$STAGING_DIR" -maxdepth 1 -name 'pgdump_*.sql.gz' -type f -mtime +2 -delete 2>/dev/null || true

if command -v docker >/dev/null 2>&1 && [[ -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^erp_db$'; then
    log "A gerar pg_dump (erp_db) -> $DUMP_PATH"
    if ! docker exec erp_db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' 2>&1 | gzip -1 > "$DUMP_PATH"; then
      log "AVISO: pg_dump falhou; continua backup de ficheiros (verifique o container erp_db)"
      rm -f "$DUMP_PATH"
    else
      log "pg_dump concluído ($(du -h "$DUMP_PATH" 2>/dev/null | cut -f1 || echo ?))"
    fi
  else
    log "AVISO: contentor erp_db inativo; sem dump SQL nesta passagem"
  fi
else
  log "docker/docker-compose indisponível; segue sem dump SQL"
fi

log "A inicializar/verificar repositório"
if ! restic snapshots &>/dev/null; then
  log "A criar repositório novo (primeira execução)"
  restic init
fi

DAY_TAG="$(date -u +%Y-%m-%d)"
HOST_TAG="$(hostname -s 2>/dev/null || echo host)"
SNAPSHOT_TAGS=("--tag" "${TAG_PREFIX}" "--tag" "daily-${DAY_TAG}" "--tag" "host-${HOST_TAG}")

log "A executar restic backup /"
restic backup \
  / \
  --exclude-file="$EXCLUDES_FILE" \
  "${SNAPSHOT_TAGS[@]}" \
  || die "restic backup falhou"

log "A aplicar retenção (prune) — ajuste em 01-backup.sh se quiser outra política"
# Mantém: 7 diários, 4 semanais, 6 mensais, 2 anuais; altere conforme espaço/auditoria
restic forget \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --keep-yearly 2 \
  --prune \
  --compact \
  || log "AVISO: restic forget/prune avisou; ver logs"

if [[ -f "$DUMP_PATH" ]]; then
  log "Dump neste snapshot: $DUMP_PATH (restaure a BD com gunzip|psql após restore de ficheiros)"
fi
if OUT="$(restic snapshots -c 3 2>/dev/null)"; then
  log "Últimos snapshots: $(echo "$OUT" | tail -n 3 | tr '\n' ' ')"
else
  log "Backup concluído (listagem de snapshots indisponível)"
fi
exit 0
