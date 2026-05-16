# Runbook de incidentes (API SaaS)

Guia rápido para diagnóstico e contenção de incidentes em produção.

## 1) Primeiros 5 minutos

1. Confirme sintoma e impacto:
   - API fora do ar?
   - erro concentrado em rota específica?
   - cobrança/webhook parou?
2. Colete um `request_id` de uma resposta de erro (header `X-Request-ID` ou `error.request_id` no JSON).
3. Valide saúde básica:
   - `curl https://SEU_HOST/health`
4. Verifique logs recentes:
   - `docker compose logs --tail 200 api`

## 2) Checklist técnico de triagem

### 2.1 Disponibilidade da API

- `curl /health` retorna `200` e `{"status":"ok", ...}`.
- Se falhar:
  - `docker compose ps`
  - `docker compose logs --tail 200 api`
  - `docker compose logs --tail 200 db`

### 2.2 Banco e migrações

Sinais comuns:
- erros 500 com menção a coluna/tabela ausente;
- `ProgrammingError` nos logs.

Ações:
1. `docker compose exec -T api python -m alembic upgrade heads`
2. repetir requisição com mesmo `X-Request-ID` para confirmar recuperação.

### 2.3 Rastreabilidade (request_id)

Para qualquer falha, a API deve:
- ecoar `X-Request-ID` no response header;
- incluir `error.request_id` no corpo JSON.

Valide com:

```bash
bash scripts/check-observability.sh
```

### 2.4 Webhook Asaas (receita)

Sinais comuns:
- cobranças não conciliam;
- lançamentos não mudam para `paid/overdue`.

Ações:
1. Verifique endpoint de webhook e auth token configurados.
2. Valide fluxo com:

```bash
bash scripts/smoke-asaas-webhook.sh
```

## 3) Procedimentos de contenção

- Erro em feature específica:
  - bloquear temporariamente a ação no frontend (flag/UI) se necessário.
- Falha de gateway externo:
  - manter criação de lançamentos internos e enfileirar reconciliação manual.
- Pico de erros 5xx:
  - reduzir mudanças em produção, estabilizar deploy atual e priorizar rota crítica.

## 4) Verificações pós-incidente

1. Rodar suíte mínima operacional:

```bash
bash scripts/check-observability.sh
bash scripts/smoke-critical-flow.sh
bash scripts/smoke-asaas-webhook.sh
bash scripts/smoke-plan-guards.sh
```

2. Confirmar CI verde no PR de correção.
3. Registrar causa raiz e ação preventiva no changelog interno.

## 5) Comandos úteis

```bash
# Saúde
curl http://127.0.0.1:8000/health

# Logs API
docker compose logs --tail 200 api

# Migração
docker compose exec -T api python -m alembic upgrade heads

# Deploy API
bash scripts/deploy-api.sh
```
