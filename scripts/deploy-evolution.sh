#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVOLUTION_DIR="$ROOT_DIR/deploy/evolution"

if [[ ! -f "$EVOLUTION_DIR/.env" ]]; then
  echo "Arquivo $EVOLUTION_DIR/.env nao encontrado."
  echo "Copie .env.example para .env e preencha as variaveis."
  exit 1
fi

echo "==> Rede externa evolution_evolution_net (API Climaris ↔ Evolution)"
docker network create evolution_evolution_net 2>/dev/null || true

echo "==> Subindo stack Evolution"
UP_ARGS=(up -d)
if [[ "${EVOLUTION_FORCE_RECREATE:-0}" == "1" ]]; then
  UP_ARGS+=(--force-recreate)
fi
docker compose -f "$EVOLUTION_DIR/docker-compose.yml" --env-file "$EVOLUTION_DIR/.env" "${UP_ARGS[@]}"

echo "==> Status dos containers"
docker compose -f "$EVOLUTION_DIR/docker-compose.yml" --env-file "$EVOLUTION_DIR/.env" ps

echo "==> Healthcheck local da API"
curl -fsS http://127.0.0.1:8080/ || true

echo "==> Deploy Evolution concluido"
