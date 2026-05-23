# Climaris ERP — Agent Instructions

## Cursor Cloud specific instructions

### Services overview

| Service | Command | Port |
|---------|---------|------|
| PostgreSQL 16 | Docker container `erp_db` (see below) | 5432 |
| FastAPI backend | `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` | 8000 |
| React frontend (Vite) | `cd frontend && npm run dev` | 5173 |

### Starting services

1. **Docker daemon** must be running: `sudo dockerd &>/tmp/dockerd.log &` (wait ~5s).
2. **PostgreSQL**: `sudo docker start erp_db` (container already created; if missing: `sudo docker run -d --name erp_db -e POSTGRES_USER=erp_user -e POSTGRES_PASSWORD=erp_password -e POSTGRES_DB=erp_db -p 5432:5432 postgres:16-alpine`).
3. **Backend**: source the `.env` and run uvicorn from `/workspace`:
   ```bash
   set -a && source .env && set +a
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
4. **Frontend**: `cd frontend && npm run dev`

### Key gotchas

- **DATABASE_URL** in `.env` must point to `127.0.0.1:5432` (not `db:5432` which is the Docker Compose internal name).
- **SMTP_HOST** must be empty (or removed) for local dev so admin 2FA is skipped. Keep `SMTP_PORT=587` as a valid int even if SMTP_HOST is empty (otherwise `app/config.py` raises `ValueError`).
- **Alembic migrations**: always use `python3 -m alembic upgrade heads` (not bare `alembic`). Migration `20260430_0056` adds a PostgreSQL enum value and uses it in the same transaction; on a fresh DB you must first run `upgrade 20260430_0055`, then add the enum value outside a transaction (see setup), then `upgrade heads`.
- **Tests**: `python3 -m pytest tests/ -v` — all 77 tests pass without external services.
- **Frontend typecheck**: `cd frontend && npx tsc -b --noEmit`
- **Frontend build**: `cd frontend && npm run build`
- **No trailing slashes** on API routes when using curl (FastAPI returns 307 redirect).
- The `.env` file is gitignored. For dev, copy `.env.example` and adjust `DATABASE_URL`, `POSTGRES_PASSWORD`, clear `SMTP_HOST`, and set `CORS_ORIGINS` to include `http://localhost:5173`.
- `JWT_BOOTSTRAP_TOKEN` in `.env` is required for the bootstrap-tenant-admin endpoint.
- The frontend Vite config proxies `/api/v1` and `/health` to `http://127.0.0.1:8000`.
