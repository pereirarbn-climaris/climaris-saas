#!/usr/bin/env bash
set -euo pipefail

# Copia platform_api_credentials da API de produção para o banco Beta,
# recifrando segredos com o JWT_SECRET_KEY do Beta (painel /operacao/chaves-api).
#
# Uso: bash scripts/sync-beta-platform-credentials-db.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml:docker-compose.evolution.yml:docker-compose.beta.yml}"
PROD_SERVICE="${PROD_API_SERVICE:-api}"
BETA_SERVICE="${BETA_API_SERVICE:-api-beta}"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

echo "==> Exportando credenciais de plataforma da produção (${PROD_SERVICE})"

docker compose exec -T "$PROD_SERVICE" python3 - <<'PY' >"$TMP_FILE"
import json
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
import os
from models import PlatformApiCredential
from app.security import decrypt_platform_secret

engine = create_engine(os.environ["DATABASE_URL"])
with Session(engine) as db:
    rows = list(db.execute(select(PlatformApiCredential)).scalars().all())
    out = []
    for row in rows:
        item = {
            "provider_slug": row.provider_slug,
            "display_name": row.display_name,
            "api_base_url": row.api_base_url,
            "extra_config_json": row.extra_config_json,
            "api_key_preview": row.api_key_preview,
            "aws_access_key_id_preview": row.aws_access_key_id_preview,
            "aws_secret_access_key_preview": row.aws_secret_access_key_preview,
            "api_key_plain": None,
            "aws_access_key_id_plain": None,
            "aws_secret_access_key_plain": None,
        }
        if row.api_key_secret:
            item["api_key_plain"] = decrypt_platform_secret(row.api_key_secret)
        if row.aws_access_key_id:
            item["aws_access_key_id_plain"] = decrypt_platform_secret(row.aws_access_key_id)
        if row.aws_secret_access_key:
            item["aws_secret_access_key_plain"] = decrypt_platform_secret(row.aws_secret_access_key)
        out.append(item)
    print(json.dumps(out, ensure_ascii=False), end="")
PY

if [[ ! -s "$TMP_FILE" || "$(cat "$TMP_FILE")" == "[]" ]]; then
  echo "Nenhuma credencial de plataforma na produção — nada a sincronizar."
  exit 0
fi

echo "==> Importando credenciais no banco Beta (${BETA_SERVICE})"

docker compose cp "$TMP_FILE" "${BETA_SERVICE}:/tmp/platform-credentials-sync.json"
docker compose exec -T "$BETA_SERVICE" python3 - <<'PY'
import json
import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from models import PlatformApiCredential
from app.security import encrypt_platform_secret

with open("/tmp/platform-credentials-sync.json", encoding="utf-8") as fh:
    items = json.load(fh)

engine = create_engine(os.environ["DATABASE_URL"])
now = datetime.now(timezone.utc)
with Session(engine) as db:
    for item in items:
        slug = item["provider_slug"]
        row = db.execute(
            select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == slug)
        ).scalar_one_or_none()
        if row is None:
            row = PlatformApiCredential(provider_slug=slug, display_name=item["display_name"])
            db.add(row)
        row.display_name = item["display_name"]
        row.api_base_url = item.get("api_base_url")
        row.extra_config_json = item.get("extra_config_json")
        row.api_key_preview = item.get("api_key_preview")
        row.aws_access_key_id_preview = item.get("aws_access_key_id_preview")
        row.aws_secret_access_key_preview = item.get("aws_secret_access_key_preview")
        if item.get("api_key_plain"):
            row.api_key_secret = encrypt_platform_secret(item["api_key_plain"])
            row.key_updated_at = now
        if item.get("aws_access_key_id_plain"):
            row.aws_access_key_id = encrypt_platform_secret(item["aws_access_key_id_plain"])
            row.aws_keys_updated_at = now
        if item.get("aws_secret_access_key_plain"):
            row.aws_secret_access_key = encrypt_platform_secret(item["aws_secret_access_key_plain"])
            row.aws_keys_updated_at = now
        row.updated_at = now
    db.commit()
print(f"synced={len(items)}", end="")
PY

echo ""
echo "==> Credenciais de plataforma sincronizadas no banco Beta."
