# Evolution API + Manager (Docker)

## Por que `evolution_api:8080` não abre no navegador

`evolution_api` é o **nome do container** na rede Docker. Só outros containers (ex.: API Climaris) resolvem esse nome. No seu PC, no Chrome, use **`127.0.0.1`** ou o **domínio público** que você configurou no Nginx — nunca `evolution_api` como URL.

## Onde cada serviço escuta (neste `docker-compose`)

| Serviço           | Dentro do Docker        | No host (VPS) depois do `ports:` |
|------------------|-------------------------|----------------------------------|
| Evolution API    | `http://evolution_api:8080` | `http://127.0.0.1:8080`          |
| Evolution Manager| (interno ao container)  | `http://127.0.0.1:3001`          |

## Acessar o **Evolution Manager** (painel web)

### Opção A — Já está em SSH no servidor

Abra um navegador **no próprio servidor** (se tiver desktop) ou use links/links2:

```text
http://127.0.0.1:3001
```

Na tela de conexão, use **URL da API**:

```text
http://127.0.0.1:8080
```

**API Key:** o valor de `AUTHENTICATION_API_KEY` deste diretório (`deploy/evolution/.env`).

### Opção B — No seu notebook (recomendado)

O Manager só está em `127.0.0.1` **do VPS**. Faça um túnel SSH (troque usuário e IP pelos seus):

```bash
ssh -L 3001:127.0.0.1:3001 -L 8080:127.0.0.1:8080 root@SEU_IP_OU_HOST
```

Depois no **Chrome do seu PC**:

- Manager: `http://127.0.0.1:3001`
- URL da API no Manager: `http://127.0.0.1:8080`

Use a mesma **`AUTHENTICATION_API_KEY`** do `deploy/evolution/.env`.

### Opção C — Domínio público (produção)

Se no Nginx você expôs `https://evo.seudominio.com` para a API e/ou Manager, use essas URLs no navegador e no Manager em vez de `127.0.0.1`.

## Webhook Climaris ↔ Evolution (401 “token inválido”)

A Evolution costuma enviar um **JWT** em `?token=...`, não a mesma string curta do `.env`.

No **`.env` da API Climaris** (raiz do projeto ERP):

1. Garanta `WHATSAPP_WEBHOOK_ENABLED=true`.
2. Se o JWT da Evolution for assinado com a **mesma chave** que `EVOLUTION_API_KEY` / `AUTHENTICATION_API_KEY`:
   - `EVOLUTION_WEBHOOK_JWT_USE_APIKEY=true`
3. Se a Evolution usar um **`jwt_key` próprio** no webhook da instância:
   - `EVOLUTION_WEBHOOK_JWT_SECRET=<mesmo segredo>`
4. Evite depender só de `EVOLUTION_WEBHOOK_TOKEN` com valor curto **se** o que chega na URL for sempre JWT (nesse caso confira JWT como acima).

Reinicie a API Climaris após alterar o `.env`:

```bash
docker compose restart api
```

## Subir a stack Evolution

```bash
cd deploy/evolution
cp .env.example .env   # se ainda não existir
# edite .env (AUTHENTICATION_API_KEY forte, DATABASE_*, etc.)
docker compose up -d
```

Rede externa `evolution_evolution_net`: se o ERP usa overlay `docker-compose.evolution.yml`, suba a Evolution **antes** e use o mesmo projeto/rede documentado no README principal.

## HTTPS retorna 500 (Express / `X-Powered-By: Express`)

O **`500` vem da própria Evolution API**, não do DNS.

1. Veja o corpo do erro (mensagem JSON):

   ```bash
   curl -sS https://evo.climaris.com.br/
   ```

2. Logs do container:

   ```bash
   docker logs evolution_api --tail 150
   ```

3. **Credenciais do Postgres:** em `deploy/evolution/.env`, o `DATABASE_CONNECTION_URI` deve usar **o mesmo usuário e senha** que `POSTGRES_PASSWORD` / `POSTGRES_USER` (valores reais, não placeholders diferentes entre linhas).

4. **Redis:** `CACHE_REDIS_URI` deve apontar para o serviço `evolution-redis` na rede Docker (como no exemplo).

5. Reinicie após alterar `.env`:

   ```bash
   cd deploy/evolution && docker compose up -d --force-recreate
   ```

## Nginx `app.climaris.com.br`: webhook Climaris

Se aparecer `upstream prematurely closed` ou timeout ao postar no webhook, use no site do **app** o bloco com timeouts maiores para `/api/v1/whatsapp/webhook/evolution` (ver `deploy/nginx/app.climaris.com.br.conf.example`).
