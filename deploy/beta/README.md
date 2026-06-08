# Ambiente Beta — `beta.climaris.com.br`

Ambiente de testes **isolado** da produção (`app.climaris.com.br`):

| Recurso | Produção | Beta |
|---------|----------|------|
| Domínio | `app.climaris.com.br` | `beta.climaris.com.br` |
| API (host) | `127.0.0.1:8000` | `127.0.0.1:8001` |
| Container API | `erp_api` | `erp_api_beta` |
| Banco PostgreSQL | `erp_db` | `climaris_beta` |
| Static root | `/var/www/climaris-web` | `/var/www/climaris-beta-web` |
| Env file | `.env` | `.env.beta` |

O Postgres é o **mesmo container** (`erp_db`), com **database separada** — dados de clientes reais não são alterados pelos testes no Beta.

> **Porta 3001:** já usada pelo Evolution Manager (`manager-evo.climaris.com.br`). O Beta usa **8001** para a API, no mesmo padrão da produção (Nginx + estático, sem Node em produção).

## Primeira instalação no servidor

### 1. DNS

Registro `A` (ou `CNAME`) apontando `beta.climaris.com.br` para o mesmo IP do VPS.

### 2. Variáveis de ambiente

```bash
cp env.docker.beta.example .env.beta
# Edite JWT, Evolution (se necessário), buckets S3 de teste, etc.
```

### 3. Banco de dados

```bash
bash scripts/init-beta-db.sh
bash scripts/db_clone.sh                    # só estrutura (recomendado)
# ou, para dados anonimizados:
bash scripts/db_clone.sh --with-data --sanitize
```

### 4. Nginx

```bash
sudo cp deploy/nginx/beta.climaris.com.br.conf.example \
  /etc/nginx/sites-available/beta.climaris.com.br
sudo ln -sf /etc/nginx/sites-available/beta.climaris.com.br \
  /etc/nginx/sites-enabled/beta.climaris.com.br
sudo certbot certonly --nginx -d beta.climaris.com.br
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Deploy

```bash
bash scripts/deploy-beta-all.sh
```

## Operação contínua

```bash
# Só API + migrações
bash scripts/deploy-beta-api.sh

# Só frontend
bash scripts/deploy-beta-frontend.sh

# Atualizar estrutura do Beta a partir de produção (sem dados)
bash scripts/db_clone.sh

# Deploy completo + refresh do schema
DB_CLONE=1 bash scripts/deploy-beta-all.sh
```

## Compose

O Beta é um overlay Docker:

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.evolution.yml:docker-compose.beta.yml
docker compose ps
docker compose logs -f api-beta
```

## Segurança

- `.env.beta` deve ter `JWT_SECRET_KEY` **diferente** de produção.
- Workers WhatsApp vêm **desligados** no exemplo (`WHATSAPP_*_ENABLED=false`).
- Use `db_clone.sh --with-data --sanitize` em vez de cópia integral de dados de clientes.
- Webhooks de pagamento: prefira sandbox ou deixe tokens vazios no Beta.

## Verificação

```bash
curl -sS http://127.0.0.1:8001/health
curl -sS https://beta.climaris.com.br/health
```
