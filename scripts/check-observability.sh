#!/usr/bin/env bash
set -euo pipefail

# Verifica observabilidade mínima da API:
# - propagação de X-Request-ID
# - envelope de erro com request_id
# - endpoint de health disponível
#
# Uso:
#   ./scripts/check-observability.sh
#   BACKEND_URL=http://127.0.0.1:8000 ./scripts/check-observability.sh
#   REQUEST_ID=meu-id ./scripts/check-observability.sh

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
REQUEST_ID="${REQUEST_ID:-obs-smoke-001}"
REQUEST_TIMEOUT_SECS="${REQUEST_TIMEOUT_SECS:-20}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

pass() { printf '\033[32m[OK]\033[0m %s\n' "$1"; }
fail() { printf '\033[31m[ERRO]\033[0m %s\n' "$1"; }
info() { printf '\033[36m[INFO]\033[0m %s\n' "$1"; }

request_json() {
  local method="$1"
  local url="$2"
  local body_file="$3"
  local head_file="$4"
  shift 4
  curl -sS --max-time "$REQUEST_TIMEOUT_SECS" "$@" -X "$method" -D "$head_file" -o "$body_file" -w "%{http_code}" "$url"
}

json_field_equals() {
  local body_file="$1"
  local field="$2"
  local expected="$3"
  python3 - "$body_file" "$field" "$expected" <<'PY'
import json, sys
path, field, expected = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    data = json.load(open(path, "r", encoding="utf-8"))
except Exception:
    raise SystemExit(1)
cur = data
for key in [k for k in field.split(".") if k]:
    if not isinstance(cur, dict) or key not in cur:
        raise SystemExit(1)
    cur = cur[key]
raise SystemExit(0 if str(cur) == expected else 1)
PY
}

header_equals() {
  local head_file="$1"
  local header_name="$2"
  local expected="$3"
  python3 - "$head_file" "$header_name" "$expected" <<'PY'
import sys
path, header_name, expected = sys.argv[1], sys.argv[2].lower(), sys.argv[3]
matched = None
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for raw in f:
        if ":" not in raw:
            continue
        name, value = raw.split(":", 1)
        if name.strip().lower() == header_name:
            matched = value.strip()
            break
if matched is None:
    raise SystemExit(1)
raise SystemExit(0 if matched == expected else 1)
PY
}

main() {
  info "Verificando observabilidade em ${BACKEND_URL%/}"

  local health_body="$TMP_DIR/health.json"
  local health_head="$TMP_DIR/health.head"
  local health_code
  health_code="$(request_json GET "${BACKEND_URL%/}/health" "$health_body" "$health_head" -H "X-Request-ID: ${REQUEST_ID}")"
  if [[ "$health_code" != "200" ]]; then
    fail "/health retornou HTTP $health_code."
    sed -n '1,80p' "$health_body" || true
    exit 1
  fi
  if ! header_equals "$health_head" "X-Request-ID" "$REQUEST_ID"; then
    fail "Resposta de /health não ecoou X-Request-ID esperado."
    sed -n '1,80p' "$health_head" || true
    exit 1
  fi
  pass "Echo de X-Request-ID em /health validado."

  local error_body="$TMP_DIR/error.json"
  local error_head="$TMP_DIR/error.head"
  local error_code
  error_code="$(request_json POST "${BACKEND_URL%/}/api/v1/auth/login" "$error_body" "$error_head" \
    -H "Content-Type: application/json" \
    -H "X-Request-ID: ${REQUEST_ID}" \
    -d "{}")"
  if [[ "$error_code" != "422" ]]; then
    fail "Esperado 422 em login inválido para validar envelope; recebido HTTP $error_code."
    sed -n '1,120p' "$error_body" || true
    exit 1
  fi
  if ! json_field_equals "$error_body" "error.request_id" "$REQUEST_ID"; then
    fail "Envelope de erro não trouxe error.request_id esperado."
    sed -n '1,160p' "$error_body" || true
    exit 1
  fi
  if ! json_field_equals "$error_body" "error.status_code" "422"; then
    fail "Envelope de erro sem status_code esperado."
    sed -n '1,160p' "$error_body" || true
    exit 1
  fi
  pass "Envelope de erro com request_id validado."

  local missing_body="$TMP_DIR/missing.json"
  local missing_head="$TMP_DIR/missing.head"
  local missing_code
  missing_code="$(request_json GET "${BACKEND_URL%/}/api/v1/auth/me" "$missing_body" "$missing_head" \
    -H "Authorization: Bearer invalid-token" \
    -H "X-Request-ID: ${REQUEST_ID}")"
  if [[ "$missing_code" != "401" ]]; then
    fail "Esperado 401 com token inválido ao validar rastreabilidade de falhas; recebido HTTP $missing_code."
    sed -n '1,120p' "$missing_body" || true
    exit 1
  fi
  if ! json_field_equals "$missing_body" "error.request_id" "$REQUEST_ID"; then
    fail "Resposta 401 não preservou request_id no envelope."
    sed -n '1,160p' "$missing_body" || true
    exit 1
  fi
  pass "Rastreabilidade de erro 401 validada."

  echo
  pass "Observabilidade mínima validada com sucesso."
}

main "$@"
