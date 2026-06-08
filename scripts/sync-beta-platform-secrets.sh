#!/usr/bin/env bash
set -euo pipefail

# Copia segredos de integração da API de produção para `.env.beta`.
# O banco Beta (climaris_beta) é isolado e o sanitize apaga platform_api_credentials;
# além disso, JWT_SECRET_KEY do Beta difere do de produção, então chaves cifradas no
# painel (/operacao/chaves-api) não decifram no container api-beta.
#
# Uso: bash scripts/sync-beta-platform-secrets.sh
# Depois: bash scripts/deploy-beta-api.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.beta ]]; then
  echo "Arquivo .env.beta ausente." >&2
  exit 1
fi

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml:docker-compose.evolution.yml:docker-compose.beta.yml}"
PROD_SERVICE="${PROD_API_SERVICE:-api}"

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$value" 'BEGIN{done=0} $0 ~ "^" k "=" {print k "=" v; done=1; next} {print} END{if(!done) print k "=" v}' "$file" >"$tmp"
  else
    cat "$file" >"$tmp"
    printf '\n%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  mv "$tmp" "$file"
}

read_prod_secret() {
  local resolver="$1"
  docker compose exec -T "$PROD_SERVICE" python3 -c "
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
engine = create_engine(os.environ['DATABASE_URL'])
with Session(engine) as db:
    ${resolver}
" 2>/dev/null | tr -d '\r'
}

echo "==> Lendo credenciais da API de produção (${PROD_SERVICE})"

cnpja_key="$(read_prod_secret "
    from app.platform_credentials import resolve_cnpja_api_key
    k = resolve_cnpja_api_key(db)
    if not k:
        raise SystemExit(2)
    print(k, end='')
")" || {
  echo "CNPJA não encontrada em produção (painel ou CNPJA_API_KEY)." >&2
  exit 1
}

upsert_env_var ".env.beta" "CNPJA_API_KEY" "$cnpja_key"
echo "==> CNPJA_API_KEY gravada em .env.beta"

claude_key="$(read_prod_secret "
    from app.platform_credentials import resolve_claude_api_key
    k = resolve_claude_api_key(db)
    if not k:
        raise SystemExit(2)
    print(k, end='')
")" || true
if [[ -n "${claude_key:-}" ]]; then
  upsert_env_var ".env.beta" "CLAUDE_API_KEY" "$claude_key"
  echo "==> CLAUDE_API_KEY gravada em .env.beta"
fi

aws_json="$(read_prod_secret "
    import json
    from app.tenant_logo import _resolve_s3_runtime_config
    cfg = _resolve_s3_runtime_config(db)
    bucket_imagens = (cfg.bucket_imagens or cfg.bucket or '').strip()
    if not cfg.access_key or not cfg.secret_key or not bucket_imagens:
        raise SystemExit(2)
    print(json.dumps({
        'access_key': cfg.access_key,
        'secret_key': cfg.secret_key,
        'bucket_imagens': bucket_imagens,
        'bucket_manuais': (cfg.bucket_manuais or cfg.bucket or '').strip(),
        'bucket_backups': (cfg.bucket_backups or cfg.bucket or '').strip(),
        'bucket': (cfg.bucket or '').strip(),
        'region': (cfg.region or 'us-east-1').strip(),
        'endpoint_url': (cfg.endpoint_url or '').strip(),
        'public_base_url': (cfg.public_base_url or '').strip(),
    }), end='')
")" || true

if [[ -n "${aws_json:-}" ]]; then
  AWS_ACCESS_KEY_ID="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["access_key"])' "$aws_json")"
  AWS_SECRET_ACCESS_KEY="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["secret_key"])' "$aws_json")"
  AWS_S3_BUCKET_IMAGENS="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["bucket_imagens"])' "$aws_json")"
  AWS_S3_BUCKET_MANUAIS="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["bucket_manuais"])' "$aws_json")"
  AWS_S3_BUCKET_BACKUPS="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["bucket_backups"])' "$aws_json")"
  AWS_STORAGE_BUCKET_NAME="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["bucket"])' "$aws_json")"
  AWS_S3_REGION="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["region"])' "$aws_json")"
  AWS_S3_ENDPOINT_URL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["endpoint_url"])' "$aws_json")"
  AWS_S3_PUBLIC_BASE_URL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["public_base_url"])' "$aws_json")"

  upsert_env_var ".env.beta" "AWS_ACCESS_KEY_ID" "$AWS_ACCESS_KEY_ID"
  upsert_env_var ".env.beta" "AWS_SECRET_ACCESS_KEY" "$AWS_SECRET_ACCESS_KEY"
  upsert_env_var ".env.beta" "AWS_S3_BUCKET_IMAGENS" "$AWS_S3_BUCKET_IMAGENS"
  upsert_env_var ".env.beta" "AWS_S3_BUCKET_MANUAIS" "$AWS_S3_BUCKET_MANUAIS"
  upsert_env_var ".env.beta" "AWS_S3_BUCKET_BACKUPS" "$AWS_S3_BUCKET_BACKUPS"
  upsert_env_var ".env.beta" "AWS_STORAGE_BUCKET_NAME" "$AWS_STORAGE_BUCKET_NAME"
  upsert_env_var ".env.beta" "AWS_S3_REGION" "$AWS_S3_REGION"
  upsert_env_var ".env.beta" "AWS_S3_ENDPOINT_URL" "$AWS_S3_ENDPOINT_URL"
  upsert_env_var ".env.beta" "AWS_S3_PUBLIC_BASE_URL" "$AWS_S3_PUBLIC_BASE_URL"
  echo "==> Credenciais AWS S3 gravadas em .env.beta (bucket imagens: ${AWS_S3_BUCKET_IMAGENS})"
else
  echo "==> Aviso: AWS S3 não encontrada em produção; uploads de imagem no Beta podem falhar."
fi

echo "==> Concluído. Recrie a API Beta: bash scripts/deploy-beta-api.sh"
