#!/usr/bin/env bash
set -euo pipefail

# Publica o site institucional Next.js em DEPLOY_ROOT (padrão: /var/www/climaris-website).
# Uso: ./scripts/deploy-website.sh
#      DEPLOY_ROOT=/srv/climaris-website sudo -E ./scripts/deploy-website.sh
#
# Build estático (next export → website/out). Formulário usa /api/v1/leads no mesmo host.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/climaris-website}"
RELOAD_NGINX="${RELOAD_NGINX:-1}"

cd "$REPO_ROOT/website"
if [[ ! -f package.json ]]; then
  echo "website/package.json não encontrado." >&2
  exit 1
fi

echo "==> Instalando dependências e gerando build (Next.js)"
export WEBSITE_BUILD_API_URL="${WEBSITE_BUILD_API_URL:-http://127.0.0.1:8000}"
curl -sf "${WEBSITE_BUILD_API_URL}/api/v1/platform/branding" \
  -o lib/platform-branding.build.json \
  || echo '{"platform_name":"Climaris","has_logo":false,"has_favicon":false,"logo_url":null,"favicon_url":null,"logo_updated_at":null,"favicon_updated_at":null}' \
  > lib/platform-branding.build.json
npm install
npm run build

if [[ ! -d out ]] || [[ ! -f out/index.html ]]; then
  echo "Build falhou: out/index.html ausente." >&2
  exit 1
fi

echo "==> Publicando em $DEPLOY_ROOT"
sudo mkdir -p "$DEPLOY_ROOT"
sudo rm -rf "${DEPLOY_ROOT:?}/"*
sudo cp -a out/. "$DEPLOY_ROOT/"

echo "==> Site institucional publicado em $DEPLOY_ROOT"

if [[ "$RELOAD_NGINX" == "1" ]] && command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx 2>/dev/null; then
    echo "==> Testando configuração e recarregando Nginx"
    sudo nginx -t
    sudo systemctl reload nginx
    echo "==> Nginx recarregado"
  else
    echo "==> Nginx não está ativo; pule o reload ou inicie o serviço."
  fi
fi

echo "==> Concluído."
