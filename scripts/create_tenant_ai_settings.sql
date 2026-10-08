-- Cria apenas a tabela tenant_ai_settings e semeia uma linha por tenant (idempotente).
-- Alinhado a models.TenantAISettings e às revisões Alembic 0053/0054.
--
-- Preferível no deploy: docker compose exec api alembic upgrade head
-- Atalho se migrações não puderem rodar:
--   bash scripts/run_create_tenant_ai_settings.sh

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_ai_settings (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    agent_name VARCHAR(80) NOT NULL DEFAULT 'Assistente',
    tone_of_voice VARCHAR(20) NOT NULL DEFAULT 'amigavel',
    instructions TEXT,
    model_slug VARCHAR(80) NOT NULL DEFAULT 'claude-3-5-sonnet-latest',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_tenant_ai_settings_tenant UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS ix_tenant_ai_settings_tenant_id ON tenant_ai_settings (tenant_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tenant_ai_settings'
          AND column_name = 'is_enabled'
    ) THEN
        ALTER TABLE tenant_ai_settings
            ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

INSERT INTO tenant_ai_settings (tenant_id, agent_name, tone_of_voice, instructions, model_slug, is_enabled)
SELECT
    t.id,
    'Assistente',
    'amigavel',
    'Reagendamentos e cancelamentos devem ser confirmados por um atendente humano.',
    'claude-3-5-sonnet-latest',
    TRUE
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM tenant_ai_settings tas WHERE tas.tenant_id = t.id
);

COMMIT;
