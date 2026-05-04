#!/usr/bin/env bash
set -euo pipefail

# Publicação completa no servidor (outro host ou o mesmo):
#   1) git pull --ff-only (se existir .git e não desativar)
#   2) API: Docker + migrações (scripts/deploy-api.sh)
#   3) Frontend: build + DEPLOY_ROOT + reload Nginx (scripts/deploy-frontend.sh)
#
# Uso na raiz do clone (onde está docker-compose.yml):
#   ./scripts/publish-all.sh
#
# Variáveis: DEPLOY_ROOT, API_PORT, DEPLOY_API_WAIT_SECS, RELOAD_NGINX (ver scripts individuais)
#   SKIP_GIT_PULL=1  — não roda git pull (ex.: deploy sem repositório git ou pipeline CI)
#   GIT_PULL=0       — mesmo efeito que SKIP_GIT_PULL=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${SKIP_GIT_PULL:-0}" != "1" && "${GIT_PULL:-1}" != "0" ]]; then
  if [[ -d "$ROOT/.git" ]]; then
    echo "######## git pull ########"
    git pull --ff-only
    echo "==> Repositório atualizado"
  else
    echo "==> Aviso: pasta .git não encontrada; pulando git pull (use clone git neste servidor ou SKIP_GIT_PULL=1)."
  fi
else
  echo "==> git pull desativado (SKIP_GIT_PULL=1 ou GIT_PULL=0)"
fi

echo "######## API (Docker) ########"
bash scripts/deploy-api.sh

echo "######## Frontend ########"
bash scripts/deploy-frontend.sh

echo "######## Tudo publicado ########"
