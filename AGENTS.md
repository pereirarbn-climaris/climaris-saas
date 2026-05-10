# AGENTS.md

## Cursor Cloud specific instructions

### Architecture

- **Backend**: Python 3.12 FastAPI app (`app/main.py`), served via Uvicorn on port 8000.
- **Frontend**: React 18 + TypeScript + Vite SPA in `frontend/`, dev server on port 5173 with proxy to backend.
- **Database**: PostgreSQL 16 (`erp_db`, user `erp_user`).

### Running services

1. **Start PostgreSQL**: `sudo pg_ctlcluster 16 main start`
2. **Start backend**: `cd /workspace && set -a && source .env && set +a && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
3. **Start frontend**: `cd /workspace/frontend && npm run dev`

### Environment

- `.env` in repo root configures the backend. Key variable: `DATABASE_URL=postgresql+psycopg://erp_user:erp_password@localhost:5432/erp_db`
- Frontend uses Vite proxy (see `frontend/vite.config.ts`), no separate `.env` needed for dev.
- Python packages installed to `~/.local` — ensure `$HOME/.local/bin` is on `PATH`.

### Migrations (Alembic)

Run with: `DATABASE_URL="postgresql+psycopg://erp_user:erp_password@localhost:5432/erp_db" python3 -m alembic upgrade heads`

**Known gotcha**: Migration `20260430_0056` adds a new PostgreSQL enum value (`cash`) and uses it in the same transaction. PostgreSQL requires a commit between `ALTER TYPE ... ADD VALUE` and any usage. If this migration fails, manually run the enum alteration outside a transaction, then stamp or skip:

```bash
sudo -u postgres psql -d erp_db -c "ALTER TYPE finance_account_type ADD VALUE IF NOT EXISTS 'cash';"
sudo -u postgres psql -d erp_db -c "UPDATE alembic_version SET version_num = '20260430_0056' WHERE version_num = '20260430_0055';"
DATABASE_URL="..." python3 -m alembic upgrade heads
```

### Lint / Type checks

- **Frontend**: `cd frontend && npx tsc -b` (TypeScript strict mode, no ESLint configured).
- **Backend**: No linter/formatter configured (no flake8/ruff/mypy). Pytest is installed but no test files exist.

### Build

- **Frontend**: `cd frontend && npm run build` (outputs to `frontend/dist/`).

### Hello world test

Bootstrap a tenant and admin via:
```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/bootstrap-tenant-admin \
  -H "X-Bootstrap-Token: dev_bootstrap_token" \
  -H "Content-Type: application/json" \
  -d '{"tenant_name":"Empresa Demo","tax_id_kind":"cnpj","tax_document":"37335118000180","active_plan":"pro","full_name":"Admin Demo","email":"admin@demo.com","password":"Admin@123","timezone":"UTC","business_days":[0,1,2,3,4]}'
```

Login: `POST /api/v1/auth/login` with `{"email":"admin@demo.com","password":"Admin@123"}`.

### Notes

- The `docker-compose.yml` references an external network `evolution_evolution_net` which is optional (WhatsApp integration). Not needed for core dev.
- `v0-referencia/` is a reference-only Next.js prototype — not part of the product.
- The WhatsApp reminder worker is controlled by `WHATSAPP_REMINDER_WORKER_ENABLED`; set to `false` for local dev to avoid background noise.
