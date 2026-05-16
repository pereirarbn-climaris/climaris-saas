# Checklist de finalização (pronto para vender)

Use esta lista para fechar o SaaS por impacto e risco, não por volume de funcionalidades.

## 1) Fluxo crítico de valor (obrigatório)

- [ ] Cadastro/bootstrapping de empresa funcionando (`/api/v1/auth/bootstrap-tenant-admin` ou `/api/v1/auth/register`).
- [ ] Login com retorno de token válido (`/api/v1/auth/login`).
- [ ] Criação de cliente (`/api/v1/clients`).
- [ ] Criação de serviço (`/api/v1/services`).
- [ ] Criação de ordem de serviço (`/api/v1/service-orders`).
- [ ] Aprovação/agendamento da OS (`/api/v1/service-orders/{id}/approve`).

### Validação automática

- [ ] Rodar `bash scripts/smoke-critical-flow.sh` localmente.
- [ ] Garantir que o workflow `.github/workflows/ci.yml` passa no PR.

## 2) Cobrança e plano (proteção de receita)

- [ ] Configurar gateway (Asaas) por tenant.
- [ ] Confirmar webhook com autenticação ativa (`/api/v1/webhooks/asaas/{token}`).
- [ ] Validar cenários: pagamento aprovado, vencimento, não correspondência (evento sem match), falha.
- [ ] Conferir bloqueios/liberações por status de plano.

### Validação automática (cobrança)

- [ ] Rodar `bash scripts/smoke-asaas-webhook.sh`.
- [ ] Garantir transições no banco:
  - `pending -> overdue` em `PAYMENT_OVERDUE`
  - `overdue -> paid` em `PAYMENT_CONFIRMED`
  - match por `payment.id` e por `payment.externalReference`
- [ ] Garantir `401` ao enviar webhook sem `Asaas-Access-Token`.

## 2.1) Guardas de plano (não vender recurso que não pode entregar)

- [ ] Plano **basic/free_30d** não acessa recursos financeiros de nível superior sem addon.
- [ ] Addon `finance-intermediate` libera endpoints de nível **intermediate** (ex.: `/finance/advanced-summary`).
- [ ] Addon `finance-management` libera endpoints de nível **management** (ex.: `/finance/cashflow`).
- [ ] Mensagens de bloqueio retornam `403` com detalhe claro para upgrade/addon.

### Validação automática (guardas de plano)

- [ ] Rodar `bash scripts/smoke-plan-guards.sh`.
- [ ] Garantir sequência:
  - basic + `finance_mode=intermediate` => `403` em `/finance/advanced-summary`
  - basic + addon `finance-intermediate` => `200` em `/finance/advanced-summary`
  - basic + `finance_mode=management` => `403` em `/finance/cashflow`
  - basic + addon `finance-management` => `200` em `/finance/cashflow`

## 3) Operação segura

- [ ] Migrações versionadas e aplicadas (`python -m alembic upgrade heads`).
- [ ] Healthcheck estável (`/health`) no ambiente alvo.
- [ ] Logs de erro e request id habilitados e revisáveis.
- [ ] Verificação de observabilidade mínima passando (`bash scripts/check-observability.sh`).
- [ ] Runbook de incidentes atualizado e acessível para operação (`docs/incident-response-runbook.md`).
- [ ] Backups e restauração testados (`scripts/system-backup`).

## 4) Frontend pronto para release

- [ ] Build limpo (`cd frontend && npm ci && npm run build`).
- [ ] Rotas públicas essenciais revisadas: `/login`, `/register`, `/verify-email`.
- [ ] Fluxos principais sem bloqueios visuais ou erros de API.

## 5) Critério de Go/No-Go

Pode publicar quando:

1. Smoke crítico passa.
2. Cobrança/webhook está validada.
3. Build frontend passa.
4. Deploy + migração + healthcheck funcionam sem intervenção manual extra.
