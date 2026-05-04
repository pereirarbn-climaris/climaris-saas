#!/usr/bin/env bash
set -euo pipefail

# Verifica saúde do backend e proxy Nginx para o app.
# Uso:
#   ./scripts/check-api.sh
#   APP_HOST=app.climaris.com.br ./scripts/check-api.sh
#   APP_HOST=app.climaris.com.br RESOLVE_IP=127.0.0.1 ./scripts/check-api.sh

APP_HOST="${APP_HOST:-app.climaris.com.br}"
RESOLVE_IP="${RESOLVE_IP:-127.0.0.1}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"

pass() { printf '\033[32m[OK]\033[0m %s\n' "$1"; }
fail() { printf '\033[31m[ERRO]\033[0m %s\n' "$1"; }
info() { printf '\033[36m[INFO]\033[0m %s\n' "$1"; }

HTTP_CODE=""
BODY_FILE=""
HEAD_FILE=""
TMP_FILES=()

cleanup() {
  if ((${#TMP_FILES[@]} > 0)); then
    rm -f "${TMP_FILES[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

request() {
  local url="$1"
  shift || true
  BODY_FILE="$(mktemp)"
  HEAD_FILE="$(mktemp)"
  TMP_FILES+=("$BODY_FILE" "$HEAD_FILE")
  HTTP_CODE="$(curl -sS "$@" -D "$HEAD_FILE" -o "$BODY_FILE" -w "%{http_code}" "$url")"
}

contains_body_text() {
  local pattern="$1"
  rg -n "$pattern" "$BODY_FILE" >/dev/null 2>&1
}

json_field_equals() {
  local field="$1"
  local expected="$2"
  python3 - "$BODY_FILE" "$field" "$expected" <<'PY'
import json, sys
path, field, expected = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    data = json.load(open(path, "r", encoding="utf-8"))
except Exception:
    raise SystemExit(1)
value = data.get(field)
raise SystemExit(0 if str(value) == expected else 1)
PY
}

main() {
  info "Host: $APP_HOST | Resolve: $RESOLVE_IP | Backend: $BACKEND_URL"

  # 1) Backend direto (uvicorn)
  request "$BACKEND_URL/health"
  if [[ "$HTTP_CODE" == "200" ]] && json_field_equals "status" "ok"; then
    pass "Backend direto em $BACKEND_URL/health respondeu 200 JSON."
  else
    fail "Backend direto falhou (HTTP $HTTP_CODE)."
    echo "Resposta:"
    sed -n '1,40p' "$BODY_FILE"
    exit 1
  fi

  # 2) Nginx /health (com Host correto)
  request "http://127.0.0.1/health" -H "Host: $APP_HOST"
  if [[ "$HTTP_CODE" == "301" ]]; then
    pass "Nginx HTTP redireciona para HTTPS (esperado)."
  elif [[ "$HTTP_CODE" == "200" ]]; then
    pass "Nginx HTTP respondeu /health sem redirecionar (aceitável)."
  else
    fail "Nginx HTTP /health retornou HTTP $HTTP_CODE."
    exit 1
  fi

  # 3) Nginx HTTPS /health (forçando resolução local)
  request "https://$APP_HOST/health" -k --resolve "$APP_HOST:443:$RESOLVE_IP"
  if [[ "$HTTP_CODE" == "200" ]] && json_field_equals "status" "ok"; then
    pass "Nginx HTTPS /health respondeu 200 JSON."
  else
    fail "Nginx HTTPS /health falhou (HTTP $HTTP_CODE)."
    echo "Resposta:"
    sed -n '1,40p' "$BODY_FILE"
    exit 1
  fi

  # 4) API login via Nginx (GET deve ser 405 JSON)
  request "https://$APP_HOST/api/v1/auth/login" -k --resolve "$APP_HOST:443:$RESOLVE_IP"
  if [[ "$HTTP_CODE" == "405" ]] && json_field_equals "detail" "Method Not Allowed"; then
    pass "Proxy /api/v1 está ok (GET /auth/login -> 405 JSON, esperado)."
  else
    fail "Proxy /api/v1 suspeito (HTTP $HTTP_CODE)."
    echo "Headers:"
    sed -n '1,30p' "$HEAD_FILE"
    echo
    echo "Body:"
    sed -n '1,40p' "$BODY_FILE"
    exit 1
  fi

  echo
  pass "Tudo certo: backend + Nginx + proxy /api/v1."
}

main "$@"
