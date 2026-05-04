#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVOLUTION_DIR="$ROOT_DIR/deploy/evolution"

if [[ ! -f "$EVOLUTION_DIR/.env" ]]; then
  echo "Arquivo $EVOLUTION_DIR/.env nao encontrado."
  echo "Copie .env.example para .env e preencha as variaveis."
  exit 1
fi

echo "==> Subindo stack Evolution"
docker compose -f "$EVOLUTION_DIR/docker-compose.yml" --env-file "$EVOLUTION_DIR/.env" up -d

echo "==> Status dos containers"
docker compose -f "$EVOLUTION_DIR/docker-compose.yml" --env-file "$EVOLUTION_DIR/.env" ps

echo "==> Healthcheck local da API"
curl -fsS http://127.0.0.1:8080/ || true

echo "==> Deploy Evolution concluido"
