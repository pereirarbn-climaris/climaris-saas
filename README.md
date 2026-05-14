# ERP SaaS API (FastAPI + PostgreSQL)

REST resources are under **`/api/v1`** (for example `POST /api/v1/auth/login`). Em produção, o **Nginx** encaminha `/api/v1`, `/health`, `/docs`, etc. para a API; a **raiz `/`** é o **React** (build em `frontend/dist`). Assets legados opcionais continuam em `/web/` na API.

Base multi-tenant ERP backend with:
- auth (JWT + RBAC)
- clients/products/services
- service orders with service/product items
- automatic scheduling on service order approval
- tenant calendar (timezone, business days, holidays)
- technician calendar (work windows, breaks, unavailability)

### WhatsApp / Evolution webhook

`POST /api/v1/whatsapp/webhook/evolution` aceita **token estático** (`EVOLUTION_WEBHOOK_TOKEN`, igual ao valor na URL) **ou** **JWT HS256** enviado em `?token=`, `Authorization: Bearer`, header `apikey` ou `X-Webhook-Token`. Para JWT, configure `EVOLUTION_WEBHOOK_JWT_SECRET` com o mesmo segredo usado na Evolution (ex.: `jwt_key` do webhook), ou `EVOLUTION_WEBHOOK_JWT_USE_APIKEY=true` se a Evolution assinar com a mesma chave que `EVOLUTION_API_KEY`. Se só chegar JWT da Evolution, não compare com um segredo curto fixo no `.env`: ou esvazie `EVOLUTION_WEBHOOK_TOKEN` e use só validação JWT, ou mantenha ambos coerentes.

**Painel Evolution (Manager) e URL correta da API:** o hostname `evolution_api` só existe **entre containers Docker** — não use no navegador. Guia passo a passo: **`deploy/evolution/README.md`** (127.0.0.1:3001 / :8080 ou túnel SSH).

## WhatsApp bot V1

O plano técnico do bot WhatsApp sem IA (menus, fluxos determinísticos e configuração por tenant) está em
[`docs/whatsapp-bot-v1.md`](docs/whatsapp-bot-v1.md). A camada de IA fica reservada para V2 e permanece desativada por padrão.

## Run

```bash
docker compose up -d
docker compose exec api alembic upgrade heads
```

Ou em um único comando (recria API, espera `/health` no host — porta **8000** por padrão — e aplica migrações):

```bash
bash scripts/deploy-api.sh
```

Variáveis opcionais: `API_PORT` (se a API não estiver em 8000), `DEPLOY_API_WAIT_SECS` (tempo máximo de espera, padrão 120).

**Evolution (WhatsApp no Docker):** no `.env` na raiz do repositório, defina `EVOLUTION_API_KEY` com o **mesmo** valor de `AUTHENTICATION_API_KEY` em `deploy/evolution/.env`. O `docker-compose.yml` já define `EVOLUTION_API_BASE_URL=http://evolution_api:8080` para tráfego entre contentores. Em produção, defina também `APP_PUBLIC_URL` (e, se precisar, `EVOLUTION_CORS_REQUEST_ORIGIN`) com o URL público do app (ex.: `https://app.climaris.com.br`) para o header `Origin` nas chamadas à Evolution. Sem `EVOLUTION_API_KEY`, o painel de integração falha ao carregar ou iniciar conexão. Pode usar o script `bash scripts/sync-evolution-api-key-into-root-env.sh` após preencher `deploy/evolution/.env`, ou copiar manualmente a partir de `env.docker.example`.

**Migrações:** use sempre `python -m alembic …`. O comando direto `alembic` falha no container (`executable file not found in $PATH`) porque o entrypoint instalado pelo pip nem sempre fica visível para `docker compose exec api alembic`.

Health:

```bash
curl http://127.0.0.1:8000/health
# Opcional: flags extras (URL pública da API, exigência de assinatura MP, etc.)
curl "http://127.0.0.1:8000/health?extended=true"
```

Em produção o caminho é sempre **`/health` no mesmo host** (não repita o domínio no meio da URL). Exemplo:

`https://app.climaris.com.br/health` → `{"status":"ok","public_register_minimal":true}` (o boolean indica API com cadastro sem CPF/CNPJ na primeira etapa).

Se alguém acessar por engano `.../healths.com.br/health`, a API redireciona (308) para `/health`.

## Frontend (React + TypeScript)

Código em **`frontend/`**. Em dev: `cd frontend && npm install && npm run dev` (proxy para `http://127.0.0.1:8000`).

**Produção (mesmo domínio que a API):** não defina `VITE_API_URL` no build — o browser chama `/api/v1/...` no mesmo host. A página **`/register`** envia `tenant_name`, `full_name`, `email`, `password` e, opcionalmente, `phone` e `whatsapp` (somente dígitos, normalizados como telefone BR). Opcional: `VITE_PLATFORM_OPERATOR_EMAIL` no build do frontend (igual a `PLATFORM_OPERATOR_EMAIL` na API) para contato e fallbacks de UI alinharem ao servidor.

1. Ajuste o Nginx usando o exemplo **`deploy/nginx/app.climaris.com.br.conf.example`** (SSL, `root` e `upstream` para `127.0.0.1:8000`).
2. Publique o build:

```bash
chmod +x scripts/deploy-frontend.sh scripts/publish-all.sh
./scripts/deploy-frontend.sh
```

O destino padrão é **`/var/www/climaris-web`**. Sobrescreva com `DEPLOY_ROOT=/caminho ./scripts/deploy-frontend.sh` se precisar. O script roda **`nginx -t`** e **`systemctl reload nginx`** quando o Nginx está ativo (desative com `RELOAD_NGINX=0`).

**API + frontend de uma vez** (no servidor onde rodam Docker e Nginx): por padrão faz **`git pull --ff-only`**, recria a API, aplica migrações, gera o build do React, copia para o `DEPLOY_ROOT` e recarrega o Nginx.

```bash
cd /caminho/do/clone
chmod +x scripts/publish-all.sh
./scripts/publish-all.sh
```

Em **outro host** (produção): faça `git push` no seu ambiente, depois no servidor `cd` no clone, `./scripts/publish-all.sh` — é o fluxo recomendado para código novo na API e no front.

- Sem repositório git na pasta (ex.: só `rsync`): `SKIP_GIT_PULL=1 ./scripts/publish-all.sh`
- Só atualizar API ou só front: use `scripts/deploy-api.sh` ou `scripts/deploy-frontend.sh` separadamente.

Optional: send `X-Request-ID` on any request; the API echoes it on the response and includes it in error payloads as `error.request_id`. Access logs are one JSON line per request (`erp.access` logger) with the same `request_id`, `path`, `status_code`, and `duration_ms`.

## Sync .env para Vercel

Para reduzir erro de login por variavel faltando entre ambientes, use o script:

```bash
node scripts/vercel-env-sync.mjs --env-file=.env --targets=development,preview,production
```

O comando acima roda em **dry-run** (nao altera nada), apenas mostra o que seria criado/atualizado.

Depois, para aplicar de fato:

```bash
export VERCEL_TOKEN=...
export VERCEL_PROJECT_ID=...
# opcional para projetos em time:
export VERCEL_TEAM_ID=...

node scripts/vercel-env-sync.mjs --env-file=.env --targets=development,preview,production --apply
```

Se tambem quiser sobrescrever variaveis que ja existem com valor diferente:

```bash
node scripts/vercel-env-sync.mjs --env-file=.env --targets=development,preview,production --apply --update
```

Opcoes uteis:
- sincronizar apenas algumas chaves: `--include=JWT_SECRET_KEY,SMTP_HOST`
- ignorar chaves: `--exclude=AWS_SECRET_ACCESS_KEY`
- sincronizar por prefixo: `--prefix=SMTP_`

Seguranca:
- nao commitar `.env` no git;
- usar token de Vercel com menor privilegio necessario;
- rotacionar segredos de producao quando houver suspeita de exposicao.

## Auth flow

1) Bootstrap tenant + admin:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/bootstrap-tenant-admin \
  -H "X-Bootstrap-Token: change_this_bootstrap_token" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_name":"Empresa Demo",
    "tax_id_kind":"cnpj",
    "tax_document":"37335118000180",
    "active_plan":"pro",
    "full_name":"Admin Demo",
    "email":"admin@demo.com",
    "password":"Admin@123",
    "timezone":"UTC",
    "business_days":[0,1,2,3,4]
  }'
```

(`tax_document` + `tax_id_kind`: `cnpj` ou `cpf`; o campo legado `cnpj` no JSON ainda é aceito como alias de `tax_document`. CPF/CNPJ são validados com dígitos verificadores.)

**Cadastro público (`POST /api/v1/auth/register`):** obrigatórios `tenant_name`, `full_name`, `email`, `password`; opcionais `phone` e `whatsapp` (gravados no usuário admin para contato e futura integração WhatsApp). O tenant fica com cadastro fiscal pendente até `PATCH /api/v1/auth/me/tenant/fiscal`. Se enviar `tax_document`/`cnpj`, vale o fluxo completo como antes.

Após o cadastro, a conta fica inativa até confirmação de e-mail:
- a API gera token e envia link para `APP_PUBLIC_URL/verify-email?token=...`;
- o frontend confirma via `POST /api/v1/auth/verify-email`;
- somente depois disso o login é liberado.

### SMTP (Hostinger)

Para envio de confirmação de e-mail, configure no `.env` da API:

- `APP_PUBLIC_URL` (URL pública do frontend, usada no link do e-mail)
- `SMTP_HOST` (Hostinger: `smtp.hostinger.com`)
- `SMTP_PORT` (normalmente `587` com STARTTLS)
- `SMTP_USERNAME` e `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL` e `SMTP_FROM_NAME`
- `SMTP_USE_STARTTLS=true` e `SMTP_USE_SSL=false` (padrão Hostinger)
- Para Hostinger em porta `465`, use `SMTP_USE_SSL=true` e `SMTP_USE_STARTTLS=false`.
- `SMTP_ALLOW_DB_OVERRIDE=false` para priorizar `.env` e evitar conflito com credenciais antigas salvas no painel SaaS.
- `EMAIL_VERIFICATION_TOKEN_TTL_HOURS` (ex.: `24`)

Alternativa sem deploy: em `/operacao/chaves-api`, salve o provedor `SMTP` (host, porta, usuário, senha, remetente). A API só usa essa configuração quando `SMTP_ALLOW_DB_OVERRIDE=true`.

**Dispositivos confiáveis (2FA de admin):** com SMTP e 2FA ativo, o front pode enviar `trust_this_device: true` junto com o código; a API grava o token (hash) em `login_trusted_devices`, amarra o vínculo ao **User-Agent** (o IP muda muito no celular e quebrava o “lembrar dispositivo” se misturado ao fingerprint), e envia um cookie **HTTP-only** (padrão `climaris_tf_trust`, duração `TRUST_DEVICE_DAYS`). O fetch do login usa `credentials: "include"`. Revogação: `GET/DELETE /api/v1/auth/me/trusted-devices` ou **Workspace → Dispositivos confiáveis (2FA)**.

**Sessão longa (JWT + refresh):** o login pode devolver `refresh_token` (quando `REFRESH_TOKEN_ENABLED=true`). O SPA guarda em `localStorage`, chama `POST /api/v1/auth/refresh` antes do JWT expirar e no carregamento da página (`bootstrapSession`). `JWT_EXPIRE_MINUTES_ADMIN` (opcional) aumenta só para administradores do workspace. Troca ou reset de senha revoga refresh tokens no servidor.

2) Login (padrão: só e-mail e senha; a resposta inclui `tenant_id` do workspace):

```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin@123"}'
```

Se o mesmo e-mail existir em mais de uma empresa, a API responde **409**; aí inclua `tenant_id` no JSON (fluxo legado / desambiguação).

3) Use `Authorization: Bearer <token>`.

**Operador da plataforma (painel `/operacao` no frontend):** no banco, `users.is_platform_operator` (a migração `20260421_0014` marca `contato@climaris.com.br` se existir). `PLATFORM_OPERATOR_EMAIL` no `.env` da API define o e-mail reservado (cadastro público e criação de usuários de empresa recusam esse endereço). O login retorna `is_platform_operator` e o JWT inclui a claim `po`. Rotas sob `/api/v1/platform/*` exigem esse perfil (ex.: `GET /api/v1/platform/session`).

**Chaves de API (workspace):** administradores gerenciam em **Configurações → Chaves API** (`GET/POST/DELETE /api/v1/api-keys`). Na criação a resposta inclui a chave em texto claro uma vez; no banco só fica hash SHA-256 e um prefixo para exibição. Uso dessas chaves em chamadas HTTP à API (header, etc.) pode ser ligado depois — hoje o fluxo é gestão e armazenamento seguro.

**Credenciais SaaS externas (operação):** em **`/operacao/chaves-api`** o operador salva chaves de provedores (ex.: `cnpja`) via `PUT /api/v1/platform/api-credentials/{provider_slug}`. Leituras (`GET /api/v1/platform/api-credentials*`) retornam apenas metadados e preview mascarado; a chave completa não é exibida após salvar.

As chaves de provedores em `platform_api_credentials.api_key_secret` ficam criptografadas em repouso (`enc:v1:` + Fernet). Configure `PLATFORM_API_CREDENTIALS_KEY` no `.env` da API com uma chave Fernet (base64 URL-safe, 32 bytes). Se ausente, a API deriva chave a partir de `JWT_SECRET_KEY` por compatibilidade.

### Logo da empresa (S3)

O cadastro da empresa agora inclui endereço completo e upload de logo (usado em PDFs e materiais futuros). O upload:
- aceita JPG/PNG/WEBP,
- normaliza e redimensiona para no máximo `640x640`,
- converte para **WEBP** otimizado (reduzindo armazenamento),
- envia para S3 em `AWS_S3_TENANT_LOGO_PREFIX/tenant-{id}/...`.

Variáveis necessárias no backend:
- `AWS_S3_BUCKET`
- `AWS_S3_REGION` (ex.: `us-east-1`)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Opcionais:
- `AWS_S3_ENDPOINT_URL` (S3 compatível)
- `AWS_S3_PUBLIC_BASE_URL` (CDN/domínio público)
- `AWS_S3_TENANT_LOGO_PREFIX` (default: `tenant-logos`)

Fallback por painel SaaS: se faltar variável no `.env`, o upload do logo também tenta ler credenciais e configurações salvas em `/operacao/chaves-api` no provedor `aws-s3` (`bucket`, `region`, `endpoint_url`, `public_base_url`, `prefix`, `aws_access_key_id`, `aws_secret_access_key`).

Se o frontend mostrar `HTTP 413` no upload do logo, ajuste o Nginx para aceitar payload maior no bloco `server`:

```nginx
client_max_body_size 10m;
```

Depois recarregue:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Core scheduling flow

1) Create service (`/api/v1/services`) with `duration_minutes`.
2) Create service order (`/api/v1/service-orders`) with services/products.
3) Approve order (`/api/v1/service-orders/{id}/approve`) with `starts_at`.
4) API generates schedule using service duration sum.

## Calendar management

- Tenant holidays:
  - `POST /api/v1/tenant-holidays`
  - `GET /api/v1/tenant-holidays` (`skip`, `limit`)
  - `DELETE /api/v1/tenant-holidays/{holiday_id}`

- Technician work windows:
  - `POST /api/v1/technicians/work-windows`
  - `GET /api/v1/technicians/work-windows` (`technician_id`, `weekday`, `skip`, `limit`)
  - `PUT /api/v1/technicians/work-windows/{window_id}`
  - `DELETE /api/v1/technicians/work-windows/{window_id}`

- Technician break windows:
  - `POST /api/v1/technicians/break-windows`
  - `GET /api/v1/technicians/break-windows` (`technician_id`, `weekday`, `skip`, `limit`)
  - `PUT /api/v1/technicians/break-windows/{window_id}`
  - `DELETE /api/v1/technicians/break-windows/{window_id}`

- Technician unavailability:
  - `POST /api/v1/technicians/unavailability`
  - `GET /api/v1/technicians/unavailability` (`technician_id`, `from_at`, `to_at`, `skip`, `limit`)
  - `PUT /api/v1/technicians/unavailability/{block_id}`
  - `DELETE /api/v1/technicians/unavailability/{block_id}`

## Rate limiting

Sensitive routes use per-IP limits (via [SlowAPI](https://github.com/laurentS/slowapi)): auth (`login` é **12/minuto** por IP, bootstrap, password change, admin user creation) and scheduling/calendar mutations (approve/reschedule/cancel, slot suggestions, holiday and technician window CRUD, schedule listing). On exceed, the API returns **429** with the same error envelope; check response headers for retry hints when present. Em produção use **HTTPS** e não exponha a API sem proxy.

## Error payload format

HTTP errors are standardized:

```json
{
  "error": {
    "id": "uuid",
    "request_id": "uuid-or-client-supplied",
    "status_code": 409,
    "message": "Detailed message",
    "path": "/endpoint",
    "timestamp": "2026-04-17T00:00:00+00:00"
  }
}
```

Validation errors (`422`) include `details`.
