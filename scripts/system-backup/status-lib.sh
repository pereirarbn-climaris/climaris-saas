#!/usr/bin/env bash
# Biblioteca compartilhada (sourced, não executável sozinha): grava o status do
# backup do sistema em JSON para o painel de operação (/operacao) ler via API
# (GET /api/v1/platform/backup-status). Todas as escritas são best-effort —
# nunca devem interromper o script chamador.
#
# Instalado em: /usr/local/lib/system-backup/status-lib.sh
# Lido por: 01-backup.sh, 02-verify-restore.sh, 03-deep-check.sh, notify-failure.sh
#
# Formato do ficheiro (chaves por componente: "backup", "verify", "deep_check"):
#   {
#     "backup": {"ok": true, "last_run_at": "...", "last_success_at": "...",
#                "last_failure_at": null, "message": "...", ...extras},
#     "verify": {...}, "deep_check": {...},
#     "updated_at": "..."
#   }

: "${PROJECT_ROOT:=/root/.ssh}"
STATUS_FILE="${SYSTEM_BACKUP_STATUS_FILE:-${PROJECT_ROOT}/var/system-backup/status.json}"

# write_status <component> <ok:true|false> <message> [extra_json]
#   extra_json: objeto JSON (string) opcional, mesclado dentro do componente
#   (ex.: '{"last_snapshot_id":"abc123"}'). Campos não incluídos no update são
#   preservados (merge profundo via jq `*`), exceto ok/last_run_at/message que
#   são sempre substituídos, e last_success_at/last_failure_at que dependem de $ok.
write_status() {
  local component="$1" ok="$2" message="$3" extra_json="${4:-}"
  [[ -n "$extra_json" ]] || extra_json='{}'
  command -v jq >/dev/null 2>&1 || return 0

  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local status_dir
  status_dir="$(dirname "$STATUS_FILE")"
  mkdir -p "$status_dir" 2>/dev/null || return 0

  local base_update
  if [[ "$ok" == "true" ]]; then
    base_update="$(jq -n --arg now "$now" --arg msg "$message" \
      '{ok:true, last_run_at:$now, last_success_at:$now, last_failure_at:null, message:$msg}' 2>/dev/null)"
  else
    base_update="$(jq -n --arg now "$now" --arg msg "$message" \
      '{ok:false, last_run_at:$now, last_failure_at:$now, message:$msg}' 2>/dev/null)"
  fi
  [[ -n "$base_update" ]] || return 0

  local merged
  merged="$(jq -n --argjson base "$base_update" --argjson extra "$extra_json" '$base * $extra' 2>/dev/null)" || return 0
  [[ -n "$merged" ]] || return 0

  local existing="{}"
  if [[ -f "$STATUS_FILE" ]]; then
    existing="$(cat "$STATUS_FILE" 2>/dev/null || echo '{}')"
    echo "$existing" | jq -e . >/dev/null 2>&1 || existing="{}"
  fi

  local tmp
  tmp="$(mktemp "${STATUS_FILE}.XXXXXX" 2>/dev/null)" || return 0
  if echo "$existing" | jq --arg comp "$component" --argjson upd "$merged" --arg now "$now" \
      '(.[$comp] // {}) as $cur | .[$comp] = ($cur * $upd) | .updated_at = $now' \
      >"$tmp" 2>/dev/null; then
    mv "$tmp" "$STATUS_FILE"
    chmod 644 "$STATUS_FILE" 2>/dev/null || true
  else
    rm -f "$tmp" 2>/dev/null || true
  fi
}
