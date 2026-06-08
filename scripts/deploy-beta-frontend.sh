#!/usr/bin/env bash
set -euo pipefail

# Publica o build React do ambiente Beta em /var/www/climaris-beta-web.
# Uso: bash scripts/deploy-beta-frontend.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/climaris-beta-web}"
RELOAD_NGINX="${RELOAD_NGINX:-1}"
PUBLIC_APP_URL="${VITE_PUBLIC_APP_URL:-https://beta.climaris.com.br}"

cd "$REPO_ROOT/frontend"
if [[ ! -f package.json ]]; then
  echo "frontend/package.json não encontrado." >&2
  exit 1
fi

echo "==> Build Beta (VITE_PUBLIC_APP_URL=${PUBLIC_APP_URL})"
npm install
VITE_PUBLIC_APP_URL="$PUBLIC_APP_URL" npm run build

if [[ ! -d dist ]] || [[ ! -f dist/index.html ]]; then
  echo "Build falhou: dist/index.html ausente." >&2
  exit 1
fi

echo "==> Publicando em $DEPLOY_ROOT"
sudo mkdir -p "$DEPLOY_ROOT"
sudo rm -rf "${DEPLOY_ROOT:?}/"*
sudo cp -a dist/. "$DEPLOY_ROOT/"

echo "==> Frontend Beta publicado em $DEPLOY_ROOT"

if [[ "$RELOAD_NGINX" == "1" ]] && command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx 2>/dev/null; then
    echo "==> Testando configuração e recarregando Nginx"
    sudo nginx -t
    sudo systemctl reload nginx
    echo "==> Nginx recarregado"
  else
    echo "==> Nginx não está ativo; configure deploy/nginx/beta.climaris.com.br.conf.example"
  fi
fi

echo "==> Concluído. Acesse https://beta.climaris.com.br (Ctrl+F5 para evitar cache)."
