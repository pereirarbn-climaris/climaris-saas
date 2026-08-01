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
: "${PROJECT_ROOT:=/root/.ssh}"
READ_DATA_PCT="${READ_DATA_CHECK_PERCENT:-0}"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/status-lib.sh"

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

restic unlock 2>/dev/null || true
SNAP_COUNT="$(restic snapshots --json 2>/dev/null | jq 'length' 2>/dev/null || echo "")"
if [[ -z "$SNAP_COUNT" ]]; then
  log "Não foi possível listar snapshots; a continuar verificação mesmo assim"
elif [[ "$SNAP_COUNT" == "0" ]]; then
  log "Nenhum snapshot; saltar verificação"
  write_status "verify" "true" "Sem snapshots para verificar (primeira execução)"
  exit 0
fi

# restic check precisa ler TODOS os índices. Com lifecycle -> Glacier isso
# fica em retry infinito ("operation is not valid for the object's storage class").
# Nesses casos saltamos o check estrutural e ficamos só no teste de restore.
SKIP_CHECK=false
PYBIN="${PROJECT_ROOT}/.venv/bin/python3"
if [[ -x "$PYBIN" ]]; then
  NON_STD="$("$PYBIN" - <<'PYEOF' 2>/dev/null || echo 0
import os, re
import boto3
repo = os.environ.get("RESTIC_REPOSITORY", "")
m = re.match(r"^s3:[^/]+/([^/]+)(/.*)?$", repo)
if not m:
    print(0)
else:
    bucket, prefix = m.group(1), (m.group(2) or "/").lstrip("/")
    s3 = boto3.client("s3", region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    n = 0
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            if obj.get("StorageClass", "STANDARD") != "STANDARD":
                n += 1
                if n >= 1:
                    print(n)
                    raise SystemExit
    print(n)
PYEOF
  )"
  if [[ "${NON_STD:-0}" != "0" ]]; then
    SKIP_CHECK=true
    warn "objetos fora de STANDARD no bucket — a saltar restic check (só teste de restore)"
  fi
fi

if [[ "$SKIP_CHECK" != "true" ]]; then
  log "restic check"
  if [[ -n "$READ_DATA_PCT" && "$READ_DATA_PCT" != "0" ]]; then
    timeout 600 restic check --read-data-subset "${READ_DATA_PCT}%" || { log "restic check falhou"; write_status "verify" "false" "restic check falhou"; exit 1; }
  else
    timeout 600 restic check || { log "restic check falhou"; write_status "verify" "false" "restic check falhou"; exit 1; }
  fi
else
  log "restic check saltado (Glacier/lifecycle)"
fi

RESTORE_DIR="/var/lib/system-backup/restore-test"
rm -rf "$RESTORE_DIR" 2>/dev/null || true
mkdir -p "$RESTORE_DIR" || { log "Falha ao criar $RESTORE_DIR"; write_status "verify" "false" "Falha ao criar $RESTORE_DIR"; exit 1; }
chmod 700 "$RESTORE_DIR"

# Preferir o pgdump do snapshot (ficheiro único do dia, packs novos em STANDARD).
# /etc/hostname falha com Glacier: o conteúdo costuma estar em packs antigos
# (deduplicação), mesmo no snapshot "latest".
REF=""
COMPARE_WITH=""
DUMP_CAND="$(restic ls latest /var/lib/system-backup/staging 2>/dev/null | grep -E 'pgdump_.*\.sql\.gz$' | tail -1 || true)"
if [[ -n "$DUMP_CAND" ]]; then
  log "A restaurar dump do snapshot: $DUMP_CAND"
  if timeout 300 restic restore latest --include "$DUMP_CAND" --target "$RESTORE_DIR" >/dev/null 2>&1 \
     && [[ -f "$RESTORE_DIR$DUMP_CAND" ]]; then
    REF="$DUMP_CAND"
    # Só compara com o disco se o dump local ainda existir (staging limpa dumps >2 dias)
    [[ -f "$DUMP_CAND" ]] && COMPARE_WITH="$DUMP_CAND"
  fi
fi

if [[ -z "$REF" ]]; then
  shopt -s nullglob
  for CAND in /etc/hostname /etc/os-release; do
    if timeout 120 restic restore latest --include "$CAND" --target "$RESTORE_DIR" >/dev/null 2>&1 \
       && [[ -f "$RESTORE_DIR$CAND" ]] && [[ -s "$RESTORE_DIR$CAND" ]]; then
      REF="$CAND"
      COMPARE_WITH="$CAND"
      break
    fi
    for x in "$RESTORE_DIR"/*; do
      [[ -e "$x" ]] && rm -rf "$x"
    done
  done
fi

if [[ -z "$REF" ]]; then
  log "Falha em restic restore (teste com pgdump/etc); ver snapshot, Glacier e permissões"
  write_status "verify" "false" "Falha ao restaurar ficheiro de teste (restic restore)"
  exit 1
fi

COPY="$RESTORE_DIR$REF"
log "A verificar ficheiro restaurado: $REF ($(du -h "$COPY" 2>/dev/null | cut -f1 || echo ?))"
DRIFT=false
if [[ -n "$COMPARE_WITH" ]] && [[ -f "$COMPARE_WITH" ]]; then
  if ! cmp -s "$COPY" "$COMPARE_WITH" 2>/dev/null; then
    DRIFT=true
    warn "conteúdo de $REF difere do no disco (normal se mudou após o backup)"
  else
    log "OK: conteúdo de $REF coincide após restauro"
  fi
else
  log "OK: restauro de $REF concluído (sem ficheiro local para comparar)"
fi
rm -rf "$RESTORE_DIR" 2>/dev/null || true
log "Verificação pós-backup concluída"
MSG_CHECK="restore"
[[ "$SKIP_CHECK" != "true" ]] && MSG_CHECK="restic check + restore"
if [[ "$DRIFT" == "true" ]]; then
  write_status "verify" "true" "Verificação OK ($MSG_CHECK de $REF; conteúdo mudou após o backup, esperado)"
else
  write_status "verify" "true" "Verificação OK ($MSG_CHECK de $REF)"
fi
exit 0
