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
    sed -n '1,160p' "$body_file" || true
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

cur = data
for key in keys:
    if not isinstance(cur, dict) or key not in cur:
        raise SystemExit(1)
    cur = cur[key]

if isinstance(cur, (dict, list)):
    print(json.dumps(cur))
else:
    print(cur)
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
email = f"smoke-plan-{suffix}@example.com"

print(cnpj)
print(email)
print(f"Tenant Plan Guard {suffix[-6:]}")
PY
}

activate_marketplace_addon() {
  local tenant_id="$1"
  local addon_slug="$2"
  if command -v docker >/dev/null 2>&1; then
    docker compose exec -T api env TARGET_TENANT_ID="$tenant_id" TARGET_ADDON_SLUG="$addon_slug" python - <<'PY'
from __future__ import annotations

from datetime import datetime, timezone
import os

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from models import MarketplaceApp, MarketplaceEntitlementStatus, TenantMarketplaceEntitlement

tenant_id = int(os.environ["TARGET_TENANT_ID"])
slug = os.environ["TARGET_ADDON_SLUG"].strip()
db_url = os.getenv("DATABASE_URL", "").strip()
if not db_url:
    raise SystemExit("DATABASE_URL não definido no container da API.")

engine = create_engine(db_url, pool_pre_ping=True)
with Session(engine) as db:
    app = db.execute(select(MarketplaceApp).where(MarketplaceApp.slug == slug)).scalar_one_or_none()
    if app is None:
        app = MarketplaceApp(
            slug=slug,
            display_name=f"Addon {slug}",
            short_description=f"Addon de teste {slug}",
            long_description="Criado automaticamente pelo smoke de guardas de plano.",
            monthly_price_brl=0,
            setup_fee_brl=0,
            feature_flag_key=slug,
            allow_quantity=False,
            unit_label=None,
            user_seats_per_unit=0,
            sort_order=999,
            is_active=True,
        )
        db.add(app)
        db.flush()

    entitlement = db.execute(
        select(TenantMarketplaceEntitlement).where(
            TenantMarketplaceEntitlement.tenant_id == tenant_id,
            TenantMarketplaceEntitlement.marketplace_app_id == app.id,
        )
    ).scalar_one_or_none()
    if entitlement is None:
        entitlement = TenantMarketplaceEntitlement(
            tenant_id=tenant_id,
            marketplace_app_id=app.id,
            quantity=1,
            status=MarketplaceEntitlementStatus.ACTIVE,
            activated_at=datetime.now(timezone.utc),
            tenant_notes="Ativado por smoke-plan-guards.",
        )
        db.add(entitlement)
    else:
        entitlement.status = MarketplaceEntitlementStatus.ACTIVE
        entitlement.activated_at = datetime.now(timezone.utc)
        db.add(entitlement)
    db.commit()
PY
    return 0
  fi

  python3 - "$tenant_id" "$addon_slug" <<'PY'
from __future__ import annotations

from datetime import datetime, timezone
import os
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from models import MarketplaceApp, MarketplaceEntitlementStatus, TenantMarketplaceEntitlement

tenant_id = int(sys.argv[1])
slug = sys.argv[2].strip()
db_url = os.getenv("DATABASE_URL", "").strip()
if not db_url:
    raise SystemExit("DATABASE_URL não definido para execução local.")

engine = create_engine(db_url, pool_pre_ping=True)
with Session(engine) as db:
    app = db.execute(select(MarketplaceApp).where(MarketplaceApp.slug == slug)).scalar_one_or_none()
    if app is None:
        app = MarketplaceApp(
            slug=slug,
            display_name=f"Addon {slug}",
            short_description=f"Addon de teste {slug}",
            long_description="Criado automaticamente pelo smoke de guardas de plano.",
            monthly_price_brl=0,
            setup_fee_brl=0,
            feature_flag_key=slug,
            allow_quantity=False,
            unit_label=None,
            user_seats_per_unit=0,
            sort_order=999,
            is_active=True,
        )
        db.add(app)
        db.flush()

    entitlement = db.execute(
        select(TenantMarketplaceEntitlement).where(
            TenantMarketplaceEntitlement.tenant_id == tenant_id,
            TenantMarketplaceEntitlement.marketplace_app_id == app.id,
        )
    ).scalar_one_or_none()
    if entitlement is None:
        entitlement = TenantMarketplaceEntitlement(
            tenant_id=tenant_id,
            marketplace_app_id=app.id,
            quantity=1,
            status=MarketplaceEntitlementStatus.ACTIVE,
            activated_at=datetime.now(timezone.utc),
            tenant_notes="Ativado por smoke-plan-guards.",
        )
        db.add(entitlement)
    else:
        entitlement.status = MarketplaceEntitlementStatus.ACTIVE
        entitlement.activated_at = datetime.now(timezone.utc)
        db.add(entitlement)
    db.commit()
PY
}

set_finance_mode() {
  local access_token="$1"
  local mode="$2"
  local out_file="$3"
  local status
  status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$out_file" \
    -w "%{http_code}" \
    -X PATCH "${API_BASE_URL%/}/api/v1/finance/settings" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${access_token}" \
    -d "{\"finance_enabled\":true,\"finance_mode\":\"${mode}\"}")"
  assert_status "$status" "200" "Patch finance mode=${mode}" "$out_file"
}

main() {
  info "Executando smoke de guardas de plano em ${API_BASE_URL%/}"
  wait_for_health

  mapfile -t smoke_data < <(generate_smoke_data)
  local tenant_tax_document="${smoke_data[0]}"
  local admin_email="${smoke_data[1]}"
  local tenant_name="${smoke_data[2]}"
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
      \"tenant_name\":\"${tenant_name}\",
      \"tax_id_kind\":\"cnpj\",
      \"tax_document\":\"${tenant_tax_document}\",
      \"active_plan\":\"basic\",
      \"full_name\":\"Admin Plano\",
      \"email\":\"${admin_email}\",
      \"password\":\"${admin_password}\",
      \"timezone\":\"UTC\",
      \"business_days\":[0,1,2,3,4]
    }")"
  assert_status "$bootstrap_status" "201" "Bootstrap tenant basic" "$bootstrap_body"
  local tenant_id
  tenant_id="$(json_get "$bootstrap_body" "id")"
  pass "Tenant basic criado (tenant_id=${tenant_id})."

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
    fail "Login não retornou access_token."
    sed -n '1,120p' "$login_body"
    exit 1
  fi

  local today
  today="$(date -u +%F)"

  local settings_intermediate_body="$TMP_DIR/settings-intermediate.json"
  set_finance_mode "$access_token" "intermediate" "$settings_intermediate_body"
  pass "Modo financeiro solicitado para intermediate (plano basic)."

  local advanced_blocked_body="$TMP_DIR/advanced-blocked.json"
  local advanced_blocked_status
  advanced_blocked_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$advanced_blocked_body" \
    -w "%{http_code}" \
    -X GET "${API_BASE_URL%/}/api/v1/finance/advanced-summary?start_date=${today}&end_date=${today}" \
    -H "Authorization: Bearer ${access_token}")"
  assert_status "$advanced_blocked_status" "403" "Advanced summary bloqueado sem addon" "$advanced_blocked_body"
  pass "Bloqueio intermediate sem addon validado."

  activate_marketplace_addon "$tenant_id" "finance-intermediate"
  local advanced_ok_body="$TMP_DIR/advanced-ok.json"
  local advanced_ok_status
  advanced_ok_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$advanced_ok_body" \
    -w "%{http_code}" \
    -X GET "${API_BASE_URL%/}/api/v1/finance/advanced-summary?start_date=${today}&end_date=${today}" \
    -H "Authorization: Bearer ${access_token}")"
  assert_status "$advanced_ok_status" "200" "Advanced summary liberado com addon intermediate" "$advanced_ok_body"
  pass "Liberação intermediate com addon validada."

  local settings_management_body="$TMP_DIR/settings-management.json"
  set_finance_mode "$access_token" "management" "$settings_management_body"
  pass "Modo financeiro solicitado para management."

  local cashflow_blocked_body="$TMP_DIR/cashflow-blocked.json"
  local cashflow_blocked_status
  cashflow_blocked_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$cashflow_blocked_body" \
    -w "%{http_code}" \
    -X GET "${API_BASE_URL%/}/api/v1/finance/cashflow?start_date=${today}&end_date=${today}" \
    -H "Authorization: Bearer ${access_token}")"
  assert_status "$cashflow_blocked_status" "403" "Cashflow bloqueado sem addon management" "$cashflow_blocked_body"
  pass "Bloqueio management sem addon validado."

  activate_marketplace_addon "$tenant_id" "finance-management"
  local cashflow_ok_body="$TMP_DIR/cashflow-ok.json"
  local cashflow_ok_status
  cashflow_ok_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$cashflow_ok_body" \
    -w "%{http_code}" \
    -X GET "${API_BASE_URL%/}/api/v1/finance/cashflow?start_date=${today}&end_date=${today}" \
    -H "Authorization: Bearer ${access_token}")"
  assert_status "$cashflow_ok_status" "200" "Cashflow liberado com addon management" "$cashflow_ok_body"
  pass "Liberação management com addon validada."

  echo
  pass "Smoke de guardas de plano finalizado com sucesso."
}

main "$@"
