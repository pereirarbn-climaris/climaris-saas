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
EVO_HEALTH_OK=0
for attempt in 1 2 3 4 5 6; do
  if curl -fsS --connect-timeout 3 --max-time 10 http://127.0.0.1:8080/ >/dev/null 2>&1; then
    EVO_HEALTH_OK=1
    echo "==> Evolution API respondeu (tentativa ${attempt})"
    break
  fi
  echo "==> Aguardando Evolution API (tentativa ${attempt}/6)…"
  sleep 2
done
if [[ "${EVO_HEALTH_OK}" != "1" ]]; then
  echo "==> Aviso: Evolution em 127.0.0.1:8080 nao respondeu apos retries (containers podem ainda estar subindo)."
fi

echo "==> Deploy Evolution concluido"
