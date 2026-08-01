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
die() { log "ERRO: $*"; write_status "backup" "false" "$*"; exit 1; }

# shellcheck disable=SC1091
source "$SCRIPT_DIR/status-lib.sh"

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
# Remove locks órfãos (processo morto) antes de qualquer operação — evita falso
# "repo inexistente" e o restic init destrutivo que falhou em 2026-07-22.
restic unlock 2>/dev/null || true

# NÃO use `restic snapshots` como teste de existência: falha por lock/Glacier
# fazia o script chamar `restic init` e abortar com "already initialized".
REPO_PROBE_ERR="$(restic cat config 2>&1)" && REPO_PROBE_RC=0 || REPO_PROBE_RC=$?
if [[ "$REPO_PROBE_RC" -ne 0 ]]; then
  if echo "$REPO_PROBE_ERR" | grep -qiE 'does not exist|Is there a repository at the following location'; then
    log "A criar repositório novo (primeira execução)"
    restic init || die "restic init falhou"
  else
    die "Não foi possível aceder ao repositório restic (lock/Glacier/credenciais?): ${REPO_PROBE_ERR}"
  fi
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

# Detecta Glacier cedo: prune (repack) precisa ler packs aleatórios e falha
# com "operation is not valid for the object's storage class". Nesse caso
# só faz forget (remove metadados de snapshot) sem --prune/--compact.
STORAGE_CLASS_WARNING_EARLY=false
PYBIN="$PROJECT_ROOT/.venv/bin/python3"
STORAGE_CLASS_INFO_EARLY="{}"
if [[ -x "$PYBIN" ]]; then
  STORAGE_CLASS_INFO_EARLY="$(timeout 25 "$PYBIN" - <<'PYEOF' 2>/dev/null
import json
import os
import re

import boto3

repo = os.environ.get("RESTIC_REPOSITORY", "")
m = re.match(r"^s3:[^/]+/([^/]+)(/.*)?$", repo)
if not m:
    print("{}")
else:
    bucket = m.group(1)
    prefix = (m.group(2) or "/").lstrip("/")
    s3 = boto3.client("s3", region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    total = 0
    non_standard = 0
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            total += 1
            if obj.get("StorageClass", "STANDARD") != "STANDARD":
                non_standard += 1
    pct = round(100.0 * non_standard / total, 1) if total else 0.0
    print(json.dumps({"total_objects": total, "non_standard_objects": non_standard, "non_standard_pct": pct}))
PYEOF
  )"
  echo "$STORAGE_CLASS_INFO_EARLY" | jq -e . >/dev/null 2>&1 || STORAGE_CLASS_INFO_EARLY="{}"
  if echo "$STORAGE_CLASS_INFO_EARLY" | jq -e '(.non_standard_objects // 0) > 0' >/dev/null 2>&1; then
    STORAGE_CLASS_WARNING_EARLY=true
  fi
fi

log "A aplicar retenção — ajuste em 01-backup.sh se quiser outra política"
# Mantém: 7 diários, 4 semanais, 6 mensais, 2 anuais; altere conforme espaço/auditoria
PRUNE_WARNING=false
FORGET_ARGS=(--keep-daily 7 --keep-weekly 4 --keep-monthly 6 --keep-yearly 2)
if [[ "$STORAGE_CLASS_WARNING_EARLY" == "true" ]]; then
  log "AVISO: objetos fora de STANDARD no bucket — a saltar prune/compact (só forget)"
  PRUNE_WARNING=true
  restic forget "${FORGET_ARGS[@]}" \
    || { PRUNE_WARNING=true; log "AVISO: restic forget avisou; ver logs"; }
else
  restic forget "${FORGET_ARGS[@]}" --prune --compact \
    || { PRUNE_WARNING=true; log "AVISO: restic forget/prune avisou; ver logs"; }
fi

DUMP_INCLUDED=false
if [[ -f "$DUMP_PATH" ]]; then
  DUMP_INCLUDED=true
  log "Dump neste snapshot: $DUMP_PATH (restaure a BD com gunzip|psql após restore de ficheiros)"
fi

SNAP_JSON="$(restic snapshots --latest 1 --json 2>/dev/null || echo '[]')"
SNAP_ID="$(echo "$SNAP_JSON" | jq -r '.[0].short_id // ""' 2>/dev/null || echo "")"
SNAP_TIME="$(echo "$SNAP_JSON" | jq -r '.[0].time // ""' 2>/dev/null || echo "")"
SNAP_COUNT="$(restic snapshots --json 2>/dev/null | jq 'length' 2>/dev/null || echo null)"
if OUT="$(restic snapshots -c 3 2>/dev/null)"; then
  log "Últimos snapshots: $(echo "$OUT" | tail -n 3 | tr '\n' ' ')"
else
  log "Backup concluído (listagem de snapshots indisponível)"
fi

STORAGE_CLASS_INFO="${STORAGE_CLASS_INFO_EARLY:-{}}"
STORAGE_CLASS_WARNING="$STORAGE_CLASS_WARNING_EARLY"
if [[ "$STORAGE_CLASS_WARNING" == "true" ]]; then
  log "AVISO: $(echo "$STORAGE_CLASS_INFO" | jq -r '.non_standard_objects')/$(echo "$STORAGE_CLASS_INFO" | jq -r '.total_objects') objetos do repositório fora de STANDARD (ex.: Glacier) — prune/restore podem falhar"
fi

STATUS_MESSAGE="Backup concluído com sucesso"
if [[ "$PRUNE_WARNING" == "true" ]]; then
  STATUS_MESSAGE="Backup concluído; retenção sem prune (Glacier/aviso) — ver journalctl -u system-backup"
fi
if [[ "$STORAGE_CLASS_WARNING" == "true" ]]; then
  STATUS_MESSAGE="$STATUS_MESSAGE — ATENÇÃO: parte do repositório está fora de STANDARD (Glacier?), risco para restauro"
fi
EXTRA_JSON="$(jq -n \
  --arg id "$SNAP_ID" \
  --arg time "$SNAP_TIME" \
  --argjson count "${SNAP_COUNT:-null}" \
  --argjson prune_warning "$PRUNE_WARNING" \
  --argjson dump_included "$DUMP_INCLUDED" \
  --argjson storage_class_warning "$STORAGE_CLASS_WARNING" \
  --argjson storage_class_info "$STORAGE_CLASS_INFO" \
  '{
    last_snapshot_id: (if $id == "" then null else $id end),
    last_snapshot_time: (if $time == "" then null else $time end),
    snapshot_count: $count,
    prune_warning: $prune_warning,
    dump_included: $dump_included,
    storage_class_warning: $storage_class_warning,
    storage_class_info: $storage_class_info
  }' 2>/dev/null || echo '{}')"
write_status "backup" "true" "$STATUS_MESSAGE" "$EXTRA_JSON"
exit 0
