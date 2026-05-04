#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8000}"
REQUEST_TIMEOUT_SECS="${REQUEST_TIMEOUT_SECS:-20}"
SMOKE_WAIT_SECS="${SMOKE_WAIT_SECS:-180}"
WEBHOOK_SECRET_KEY="${WEBHOOK_SECRET_KEY:-smoke-webhook-secret-key-32}"

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

upsert_webhook_fixture() {
  local fixture_path="$1"
  if command -v docker >/dev/null 2>&1; then
    docker compose exec -T api env WEBHOOK_SECRET_KEY="$WEBHOOK_SECRET_KEY" python - "$fixture_path" <<'PY'
from __future__ import annotations

from datetime import date, datetime, timezone
import json
import os
import random
import time

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.security import encrypt_platform_secret
from models import (
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
    FinanceGatewayProvider,
    Tenant,
    TenantFinanceGateway,
)


def cnpj_digit(numbers: list[int], weights: list[int]) -> int:
    total = sum(a * b for a, b in zip(numbers, weights))
    mod = total % 11
    return 0 if mod < 2 else 11 - mod


output_path = os.sys.argv[1]
db_url = os.getenv("DATABASE_URL", "").strip()
if not db_url:
    raise SystemExit("DATABASE_URL não definido no container da API.")
secret_key = os.environ["WEBHOOK_SECRET_KEY"]

engine = create_engine(db_url, pool_pre_ping=True)
seed = int(time.time() * 1000)
rng = random.Random(seed)
base = [rng.randint(0, 9) for _ in range(12)]
d1 = cnpj_digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
d2 = cnpj_digit(base + [d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
cnpj = "".join(str(x) for x in (base + [d1, d2]))

suffix = str(seed)[-8:]
path_token = f"smoke-asaas-{suffix}"
payment_id = f"pay-smoke-{suffix}"

with Session(engine) as db:
    tenant = Tenant(
        name=f"Tenant Webhook Smoke {suffix}",
        cnpj=cnpj,
        tax_id_kind="cnpj",
        active_plan="professional",
        finance_enabled=True,
        finance_mode="management",
        timezone="UTC",
        business_days="0,1,2,3,4",
        workday_start="08:00",
        workday_end="18:00",
    )
    db.add(tenant)
    db.flush()
    tenant_id = int(tenant.id)

    gateway = TenantFinanceGateway(
        tenant_id=tenant_id,
        provider=FinanceGatewayProvider.ASAAS,
        asaas_api_key_encrypted=encrypt_platform_secret(f"api-smoke-{suffix}"),
        asaas_sandbox=True,
        asaas_webhook_path_token=path_token,
        asaas_webhook_auth_encrypted=encrypt_platform_secret(secret_key),
        asaas_webhook_remote_id=None,
        asaas_webhook_last_error=None,
        last_validated_at=datetime.now(timezone.utc),
        account_label="Smoke account",
    )
    db.add(gateway)
    db.flush()

    entry_gateway = FinanceEntry(
        tenant_id=tenant_id,
        category_id=None,
        description="Receita smoke por gateway_payment_id",
        entry_type=FinanceEntryType.INCOME,
        status=FinanceEntryStatus.PENDING,
        amount=100.00,
        payment_method="pix",
        payment_provider="asaas",
        gateway_payment_id=payment_id,
        installment_group_id=None,
        installment_number=1,
        installment_total=1,
        due_date=date.today(),
        competence_date=date.today(),
        expected_settlement_date=date.today(),
        settlement_plan="same_as_due",
        paid_at=None,
        notes="Fixture webhook smoke",
    )
    db.add(entry_gateway)
    db.flush()
    entry_gateway_id = int(entry_gateway.id)

    entry_external = FinanceEntry(
        tenant_id=tenant_id,
        category_id=None,
        description="Receita smoke por externalReference",
        entry_type=FinanceEntryType.INCOME,
        status=FinanceEntryStatus.PENDING,
        amount=200.00,
        payment_method="boleto",
        payment_provider="asaas",
        gateway_payment_id=None,
        installment_group_id=None,
        installment_number=1,
        installment_total=1,
        due_date=date.today(),
        competence_date=date.today(),
        expected_settlement_date=date.today(),
        settlement_plan="same_as_due",
        paid_at=None,
        notes="Fixture webhook smoke",
    )
    db.add(entry_external)
    db.flush()
    entry_external_id = int(entry_external.id)
    entry_external_ref = f"climaris-fin-{entry_external_id}"
    invalid_external_reference = f"climaris-fin-{entry_external_id + 1000000}"

    db.commit()

payload = {
    "tenant_id": tenant_id,
    "path_token": path_token,
    "auth_token": secret_key,
    "payment_id": payment_id,
    "entry_gateway_id": entry_gateway_id,
    "entry_external_id": entry_external_id,
    "entry_external_reference": entry_external_ref,
    "invalid_external_reference": invalid_external_reference,
}

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(payload, f)
PY
    return 0
  fi

  python3 - "$fixture_path" <<'PY'
from __future__ import annotations

from datetime import date, datetime, timezone
import json
import os
import random
import time

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.security import encrypt_platform_secret
from models import (
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
    FinanceGatewayProvider,
    Tenant,
    TenantFinanceGateway,
)


def cnpj_digit(numbers: list[int], weights: list[int]) -> int:
    total = sum(a * b for a, b in zip(numbers, weights))
    mod = total % 11
    return 0 if mod < 2 else 11 - mod


output_path = os.sys.argv[1]
db_url = os.getenv("DATABASE_URL", "").strip()
if not db_url:
    raise SystemExit("DATABASE_URL não definido para execução local.")
secret_key = os.environ["WEBHOOK_SECRET_KEY"]

engine = create_engine(db_url, pool_pre_ping=True)
seed = int(time.time() * 1000)
rng = random.Random(seed)
base = [rng.randint(0, 9) for _ in range(12)]
d1 = cnpj_digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
d2 = cnpj_digit(base + [d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
cnpj = "".join(str(x) for x in (base + [d1, d2]))

suffix = str(seed)[-8:]
path_token = f"smoke-asaas-{suffix}"
payment_id = f"pay-smoke-{suffix}"

with Session(engine) as db:
    tenant = Tenant(
        name=f"Tenant Webhook Smoke {suffix}",
        cnpj=cnpj,
        tax_id_kind="cnpj",
        active_plan="professional",
        finance_enabled=True,
        finance_mode="management",
        timezone="UTC",
        business_days="0,1,2,3,4",
        workday_start="08:00",
        workday_end="18:00",
    )
    db.add(tenant)
    db.flush()
    tenant_id = int(tenant.id)

    gateway = TenantFinanceGateway(
        tenant_id=tenant_id,
        provider=FinanceGatewayProvider.ASAAS,
        asaas_api_key_encrypted=encrypt_platform_secret(f"api-smoke-{suffix}"),
        asaas_sandbox=True,
        asaas_webhook_path_token=path_token,
        asaas_webhook_auth_encrypted=encrypt_platform_secret(secret_key),
        asaas_webhook_remote_id=None,
        asaas_webhook_last_error=None,
        last_validated_at=datetime.now(timezone.utc),
        account_label="Smoke account",
    )
    db.add(gateway)
    db.flush()

    entry_gateway = FinanceEntry(
        tenant_id=tenant_id,
        category_id=None,
        description="Receita smoke por gateway_payment_id",
        entry_type=FinanceEntryType.INCOME,
        status=FinanceEntryStatus.PENDING,
        amount=100.00,
        payment_method="pix",
        payment_provider="asaas",
        gateway_payment_id=payment_id,
        installment_group_id=None,
        installment_number=1,
        installment_total=1,
        due_date=date.today(),
        competence_date=date.today(),
        expected_settlement_date=date.today(),
        settlement_plan="same_as_due",
        paid_at=None,
        notes="Fixture webhook smoke",
    )
    db.add(entry_gateway)
    db.flush()
    entry_gateway_id = int(entry_gateway.id)

    entry_external = FinanceEntry(
        tenant_id=tenant_id,
        category_id=None,
        description="Receita smoke por externalReference",
        entry_type=FinanceEntryType.INCOME,
        status=FinanceEntryStatus.PENDING,
        amount=200.00,
        payment_method="boleto",
        payment_provider="asaas",
        gateway_payment_id=None,
        installment_group_id=None,
        installment_number=1,
        installment_total=1,
        due_date=date.today(),
        competence_date=date.today(),
        expected_settlement_date=date.today(),
        settlement_plan="same_as_due",
        paid_at=None,
        notes="Fixture webhook smoke",
    )
    db.add(entry_external)
    db.flush()
    entry_external_id = int(entry_external.id)
    entry_external_ref = f"climaris-fin-{entry_external_id}"
    invalid_external_reference = f"climaris-fin-{entry_external_id + 1000000}"

    db.commit()

payload = {
    "tenant_id": tenant_id,
    "path_token": path_token,
    "auth_token": secret_key,
    "payment_id": payment_id,
    "entry_gateway_id": entry_gateway_id,
    "entry_external_id": entry_external_id,
    "entry_external_reference": entry_external_ref,
    "invalid_external_reference": invalid_external_reference,
}

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(payload, f)
PY
}

query_entry_status() {
  local entry_id="$1"
  local status_out
  if command -v docker >/dev/null 2>&1; then
    status_out="$(docker compose exec -T api env TARGET_ENTRY_ID="$entry_id" python - <<'PY'
from __future__ import annotations

import os
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from models import FinanceEntry

entry_id = int(os.environ["TARGET_ENTRY_ID"])
db_url = os.getenv("DATABASE_URL", "").strip()
if not db_url:
    raise SystemExit("DATABASE_URL não definido no container da API.")
engine = create_engine(db_url, pool_pre_ping=True)
with Session(engine) as db:
    row = db.execute(select(FinanceEntry).where(FinanceEntry.id == entry_id)).scalar_one_or_none()
    if row is None:
        raise SystemExit(2)
    print(row.status.value if hasattr(row.status, "value") else str(row.status))
PY
)"
    printf "%s" "$status_out"
    return 0
  fi

  status_out="$(python3 - "$entry_id" <<'PY'
from __future__ import annotations

import os
import sys
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from models import FinanceEntry

entry_id = int(sys.argv[1])
db_url = os.getenv("DATABASE_URL", "").strip()
if not db_url:
    raise SystemExit("DATABASE_URL não definido para execução local.")
engine = create_engine(db_url, pool_pre_ping=True)
with Session(engine) as db:
    row = db.execute(select(FinanceEntry).where(FinanceEntry.id == entry_id)).scalar_one_or_none()
    if row is None:
        raise SystemExit(2)
    print(row.status.value if hasattr(row.status, "value") else str(row.status))
PY
)"
  printf "%s" "$status_out"
}

main() {
  info "Executando smoke de webhook Asaas em ${API_BASE_URL%/}"
  wait_for_health

  local fixture_file="$TMP_DIR/fixture.json"
  upsert_webhook_fixture "$fixture_file"
  local path_token
  path_token="$(json_get "$fixture_file" "path_token")"
  local auth_token
  auth_token="$(json_get "$fixture_file" "auth_token")"
  local payment_id
  payment_id="$(json_get "$fixture_file" "payment_id")"
  local entry_gateway_id
  entry_gateway_id="$(json_get "$fixture_file" "entry_gateway_id")"
  local entry_external_id
  entry_external_id="$(json_get "$fixture_file" "entry_external_id")"
  local entry_external_reference
  entry_external_reference="$(json_get "$fixture_file" "entry_external_reference")"
  local invalid_external_reference
  invalid_external_reference="$(json_get "$fixture_file" "invalid_external_reference")"

  local webhook_url="${API_BASE_URL%/}/api/v1/webhooks/asaas/${path_token}"
  pass "Fixtures de webhook criadas (tenant e lançamentos)."

  local unauthorized_body="$TMP_DIR/unauthorized.json"
  local unauthorized_status
  unauthorized_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$unauthorized_body" \
    -w "%{http_code}" \
    -X POST "$webhook_url" \
    -H "Content-Type: application/json" \
    -d "{\"event\":\"PAYMENT_OVERDUE\",\"payment\":{\"id\":\"${payment_id}\"}}")"
  assert_status "$unauthorized_status" "401" "Webhook sem header de auth" "$unauthorized_body"
  pass "Segurança de header validada (401 sem token)."

  local invalid_status_body="$TMP_DIR/invalid-status.json"
  local invalid_status_code
  invalid_status_code="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$invalid_status_body" \
    -w "%{http_code}" \
    -X POST "$webhook_url" \
    -H "Content-Type: application/json" \
    -H "Asaas-Access-Token: ${auth_token}" \
    -d "{\"event\":\"PAYMENT_OVERDUE\",\"payment\":{\"externalReference\":\"${invalid_external_reference}\"}}")"
  assert_status "$invalid_status_code" "200" "Webhook sem correspondencia (externalReference inválido)" "$invalid_status_body"
  local entry_gateway_status
  entry_gateway_status="$(query_entry_status "$entry_gateway_id")"
  if [[ "$entry_gateway_status" != "pending" ]]; then
    fail "Lançamento por gateway deveria permanecer pending após evento sem match (status atual: ${entry_gateway_status})."
    exit 1
  fi
  pass "Evento sem match não alterou lançamentos."

  local overdue_body="$TMP_DIR/overdue.json"
  local overdue_status
  overdue_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$overdue_body" \
    -w "%{http_code}" \
    -X POST "$webhook_url" \
    -H "Content-Type: application/json" \
    -H "Asaas-Access-Token: ${auth_token}" \
    -d "{\"event\":\"PAYMENT_OVERDUE\",\"payment\":{\"id\":\"${payment_id}\"}}")"
  assert_status "$overdue_status" "200" "Webhook PAYMENT_OVERDUE por payment id" "$overdue_body"
  entry_gateway_status="$(query_entry_status "$entry_gateway_id")"
  if [[ "$entry_gateway_status" != "overdue" ]]; then
    fail "Esperado status overdue após PAYMENT_OVERDUE (atual: ${entry_gateway_status})."
    exit 1
  fi
  pass "Transição pending -> overdue validada."

  local paid_body="$TMP_DIR/paid.json"
  local paid_status
  paid_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$paid_body" \
    -w "%{http_code}" \
    -X POST "$webhook_url" \
    -H "Content-Type: application/json" \
    -H "Asaas-Access-Token: ${auth_token}" \
    -d "{\"event\":\"PAYMENT_CONFIRMED\",\"payment\":{\"id\":\"${payment_id}\"}}")"
  assert_status "$paid_status" "200" "Webhook PAYMENT_CONFIRMED por payment id" "$paid_body"
  entry_gateway_status="$(query_entry_status "$entry_gateway_id")"
  if [[ "$entry_gateway_status" != "paid" ]]; then
    fail "Esperado status paid após PAYMENT_CONFIRMED (atual: ${entry_gateway_status})."
    exit 1
  fi
  pass "Transição overdue -> paid validada."

  local external_paid_body="$TMP_DIR/external-paid.json"
  local external_paid_status
  external_paid_status="$(curl -sS --max-time "$REQUEST_TIMEOUT_SECS" \
    -o "$external_paid_body" \
    -w "%{http_code}" \
    -X POST "$webhook_url" \
    -H "Content-Type: application/json" \
    -H "Asaas-Access-Token: ${auth_token}" \
    -d "{\"event\":\"PAYMENT_RECEIVED\",\"payment\":{\"externalReference\":\"${entry_external_reference}\"}}")"
  assert_status "$external_paid_status" "200" "Webhook PAYMENT_RECEIVED por externalReference" "$external_paid_body"
  local entry_external_status
  entry_external_status="$(query_entry_status "$entry_external_id")"
  if [[ "$entry_external_status" != "paid" ]]; then
    fail "Esperado status paid no lançamento por externalReference (atual: ${entry_external_status})."
    exit 1
  fi
  pass "Match por externalReference validado."

  echo
  pass "Smoke de webhook Asaas finalizado com sucesso."
}

main "$@"
