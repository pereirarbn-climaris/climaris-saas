#!/usr/bin/env bash
set -euo pipefail

# Publica o build do React em DEPLOY_ROOT (padrão: /var/www/climaris-web).
# Uso: ./scripts/deploy-frontend.sh
#      DEPLOY_ROOT=/srv/climaris-web sudo -E ./scripts/deploy-frontend.sh
#
# Após copiar os arquivos, tenta recarregar o Nginx (desative com RELOAD_NGINX=0).

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/climaris-web}"
RELOAD_NGINX="${RELOAD_NGINX:-1}"

cd "$REPO_ROOT/frontend"
if [[ ! -f package.json ]]; then
  echo "frontend/package.json não encontrado." >&2
  exit 1
fi

echo "==> Instalando dependências e gerando build (Vite)"
npm install
# Mesmo host que a API: não defina VITE_API_URL (fetch usa /api/v1/... relativo)
npm run build

if [[ ! -d dist ]] || [[ ! -f dist/index.html ]]; then
  echo "Build falhou: dist/index.html ausente." >&2
  exit 1
fi

echo "==> Publicando em $DEPLOY_ROOT"
sudo mkdir -p "$DEPLOY_ROOT"
sudo rm -rf "${DEPLOY_ROOT:?}/"*
sudo cp -a dist/. "$DEPLOY_ROOT/"

echo "==> Frontend publicado em $DEPLOY_ROOT"

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

echo "==> Concluído. No navegador use atualização forçada (Ctrl+F5) ou aba anônima para evitar cache."
