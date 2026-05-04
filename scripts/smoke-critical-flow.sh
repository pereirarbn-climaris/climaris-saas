#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8000}"
BOOTSTRAP_TOKEN="${BOOTSTRAP_TOKEN:-bootstrap-change-me}"
REQUEST_TIMEOUT_SECS="${REQUEST_TIMEOUT_SECS:-20}"
SMOKE_WAIT_SECS="${SMOKE_WAIT_SECS:-180}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

info() {
  printf '\033[36m[INFO]\033[0m %s\n' "$1"
}

pass() {
  printf '\033[32m[OK]\033[0m %s\n' "$1"
}

fail() {
  printf '\033[31m[ERRO]\033[0m %s\n' "$1"
}

assert_status() {
  local got="$1"
  local expected="$2"
  local label="$3"
  local body_file="$4"
  if [[ "$got" != "$expected" ]]; then
    fail "$label retornou HTTP $got (esperado $expected)."
    echo "Resposta:"
    sed -n '1,120p' "$body_file" || true
    exit 1
  fi
}

json_get() {
  local body_file="$1"
  local field_path="$2"
  python3 - "$body_file" "$field_path" <<'PY'
import json
import sys

path = sys.argv[1]
field_path = sys.argv[2].strip()
keys = [k for k in field_path.split(".") if k]

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

current = data
for key in keys:
    if not isinstance(current, dict) or key not in current:
        raise SystemExit(1)
    current = current[key]

if isinstance(current, (dict, list)):
    print(json.dumps(current))
else:
    print(current)
PY
}

wait_for_health() {
  local deadline=$((SECONDS + SMOKE_WAIT_SECS))
  while true; do
    if curl -fsS --max-time "$REQUEST_TIMEOUT_SECS" "${API_BASE_URL%/}/health" >/dev/null 2>&1; then
      pass "API respondeu em /health."
      return 0
    fi
    if [[ "$SECONDS" -ge "$deadline" ]]; then
      fail "Timeout aguardando ${API_BASE_URL%/}/health (${SMOKE_WAIT_SECS}s)."
      exit 1
    fi
    sleep 2
  done
}

generate_smoke_data() {
  python3 <<'PY'
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import random
import time


def cnpj_digit(numbers: list[int], weights: list[int]) -> int:
    total = sum(a * b for a, b in zip(numbers, weights))
    mod = total % 11
    return 0 if mod < 2 else 11 - mod


seed = int(time.time() * 1000)
rng = random.Random(seed)
base = [rng.randint(0, 9) for _ in range(12)]
d1 = cnpj_digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
d2 = cnpj_digit(base + [d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
cnpj = "".join(str(x) for x in (base + [d1, d2]))
suffix = str(seed)
email = f"smoke-{suffix}@example.com"
client_name = f"Cliente Smoke {suffix[-6:]}"
service_name = f"Servico Smoke {suffix[-6:]}"
order_title = f"OS Smoke {suffix[-6:]}"

fixed_holidays = {
    "01-01",
    "04-21",
    "05-01",
    "09-07",
    "10-12",
    "11-02",
    "11-15",
    "11-20",
    "12-25",
}
base_day = datetime.now(timezone.utc).replace(hour=10, minute=0, second=0, microsecond=0)
if base_day <= datetime.now(timezone.utc) + timedelta(hours=2):
    base_day = base_day + timedelta(days=1)
for _ in range(20):
    mm_dd = base_day.strftime("%m-%d")
    if mm_dd not in fixed_holidays:
        break
    base_day = base_day + timedelta(days=1)
starts_at = base_day.isoformat().replace("+00:00", "Z")

print(cnpj)
print(email)
print(client_name)
print(service_name)
print(order_title)
print(starts_at)
PY
}

main() {
  info "Executando smoke de fluxo critico em ${API_BASE_URL%/}"
  wait_for_health

  mapfile -t smoke_data < <(generate_smoke_data)
  local tenant_tax_document="${smoke_data[0]}"
  local admin_email="${smoke_data[1]}"
  local client_name="${smoke_data[2]}"
  local service_name="${smoke_data[3]}"
  local order_title="${smoke_data[4]}"
  local starts_at="${smoke_data[5]}"
  local admin_password="Admin@123"

  local bootstrap_body="$TMP_DIR/bootstrap.json"
  local bootstrap_status
  bootstrap_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$bootstrap_body" \
    -w "%{http_code}" \
    -X POST "${API_BASE_URL%/}/api/v1/auth/bootstrap-tenant-admin" \
    -H "Content-Type: application/json" \
    -H "X-Bootstrap-Token: ${BOOTSTRAP_TOKEN}" \
    -d "{
      \"tenant_name\":\"Tenant Smoke\",
      \"tax_id_kind\":\"cnpj\",
      \"tax_document\":\"${tenant_tax_document}\",
      \"active_plan\":\"free_30d\",
      \"full_name\":\"Admin Smoke\",
      \"email\":\"${admin_email}\",
      \"password\":\"${admin_password}\",
      \"timezone\":\"UTC\",
      \"business_days\":[0,1,2,3,4,5,6]
    }")"
  assert_status "$bootstrap_status" "201" "Bootstrap tenant+admin" "$bootstrap_body"
  local tenant_id
  tenant_id="$(json_get "$bootstrap_body" "id")"
  pass "Bootstrap concluido (tenant_id=${tenant_id})."

  local login_body="$TMP_DIR/login.json"
  local login_status
  login_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$login_body" \
    -w "%{http_code}" \
    -X POST "${API_BASE_URL%/}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\":\"${admin_email}\",
      \"password\":\"${admin_password}\",
      \"tenant_id\":${tenant_id}
    }")"
  assert_status "$login_status" "200" "Login admin" "$login_body"
  local access_token
  access_token="$(json_get "$login_body" "access_token")"
  if [[ -z "$access_token" || "$access_token" == "null" ]]; then
    local two_factor_required="false"
    two_factor_required="$(json_get "$login_body" "two_factor_required" 2>/dev/null || echo "false")"
    if [[ "$two_factor_required" == "True" || "$two_factor_required" == "true" ]]; then
      fail "Login exigiu 2FA. Para este smoke, rode com LOGIN_ADMIN_TWO_FACTOR_ENABLED=false."
    else
      fail "Login nao retornou access_token."
    fi
    sed -n '1,120p' "$login_body"
    exit 1
  fi
  pass "Login concluido."

  local client_body="$TMP_DIR/client.json"
  local client_status
  client_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$client_body" \
    -w "%{http_code}" \
    -X POST "${API_BASE_URL%/}/api/v1/clients" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${access_token}" \
    -d "{
      \"name\":\"${client_name}\"
    }")"
  assert_status "$client_status" "201" "Criacao de cliente" "$client_body"
  local client_id
  client_id="$(json_get "$client_body" "id")"
  pass "Cliente criado (client_id=${client_id})."

  local service_body="$TMP_DIR/service.json"
  local service_status
  service_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$service_body" \
    -w "%{http_code}" \
    -X POST "${API_BASE_URL%/}/api/v1/services" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${access_token}" \
    -d "{
      \"name\":\"${service_name}\",
      \"description\":\"Servico criado pelo smoke test\",
      \"price\":120.0,
      \"duration_minutes\":60,
      \"is_active\":true,
      \"product_inputs\":[]
    }")"
  assert_status "$service_status" "201" "Criacao de servico" "$service_body"
  local service_id
  service_id="$(json_get "$service_body" "id")"
  pass "Servico criado (service_id=${service_id})."

  local order_body="$TMP_DIR/order.json"
  local order_status
  order_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$order_body" \
    -w "%{http_code}" \
    -X POST "${API_BASE_URL%/}/api/v1/service-orders" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${access_token}" \
    -d "{
      \"client_id\":${client_id},
      \"title\":\"${order_title}\",
      \"description\":\"OS criada pelo smoke test\",
      \"services\":[{\"service_id\":${service_id},\"quantity\":1}],
      \"products\":[]
    }")"
  assert_status "$order_status" "201" "Criacao de OS" "$order_body"
  local order_id
  order_id="$(json_get "$order_body" "id")"
  pass "Ordem de servico criada (order_id=${order_id})."

  local approve_body="$TMP_DIR/approve.json"
  local approve_status
  approve_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$approve_body" \
    -w "%{http_code}" \
    -X POST "${API_BASE_URL%/}/api/v1/service-orders/${order_id}/approve" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${access_token}" \
    -d "{
      \"starts_at\":\"${starts_at}\",
      \"allow_overtime\":true
    }")"
  assert_status "$approve_status" "200" "Aprovacao de OS" "$approve_body"
  local schedule_id
  schedule_id="$(json_get "$approve_body" "schedule_id")"
  pass "OS aprovada (schedule_id=${schedule_id})."

  local detail_body="$TMP_DIR/detail.json"
  local detail_status
  detail_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$detail_body" \
    -w "%{http_code}" \
    -X GET "${API_BASE_URL%/}/api/v1/service-orders/${order_id}" \
    -H "Authorization: Bearer ${access_token}")"
  assert_status "$detail_status" "200" "Consulta de OS" "$detail_body"
  local order_status_value
  order_status_value="$(json_get "$detail_body" "status")"
  local schedule_from_detail
  schedule_from_detail="$(json_get "$detail_body" "schedule.id")"
  if [[ -z "$schedule_from_detail" ]]; then
    fail "Consulta da OS nao retornou schedule."
    sed -n '1,120p' "$detail_body"
    exit 1
  fi
  pass "Consulta final valida (status=${order_status_value}, schedule_id=${schedule_from_detail})."

  echo
  pass "Smoke do fluxo critico finalizado com sucesso."
}

main "$@"
