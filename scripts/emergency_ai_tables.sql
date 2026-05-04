-- Emergência: alinhar schema ao Alembic 20260430_0053 / 0054 / 0055.
-- Ajuste usuário e database conforme seu .env (padrão compose: erp_user / erp_db).
--
-- Conferir antes:
--   docker compose exec db psql -U erp_user -d erp_db -c "\dt tenant_ai_settings"
--
-- Preferível sempre: docker compose exec api alembic upgrade head

BEGIN;

-- tenant_ai_settings (0053 + coluna is_enabled da 0054)
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

-- Se a tabela já existia sem is_enabled (0054 não aplicada):
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_ai_settings' AND column_name = 'is_enabled'
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

-- ai_chat_history (0054)
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    client_whatsapp VARCHAR(20),
    user_message TEXT NOT NULL,
    assistant_response TEXT NOT NULL,
    used_model VARCHAR(80),
    used_tools_json TEXT,
    system_prompt_xml TEXT,
    is_mock BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_chat_history_tenant_id ON ai_chat_history (tenant_id);
CREATE INDEX IF NOT EXISTS ix_ai_chat_history_client_whatsapp ON ai_chat_history (client_whatsapp);
CREATE INDEX IF NOT EXISTS ix_ai_chat_history_is_mock ON ai_chat_history (is_mock);
CREATE INDEX IF NOT EXISTS ix_ai_chat_history_created_at ON ai_chat_history (created_at);

-- ai_pending_tool_confirmations (0055)
CREATE TABLE IF NOT EXISTS ai_pending_tool_confirmations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    client_whatsapp VARCHAR(20) NOT NULL,
    tool_name VARCHAR(80) NOT NULL,
    arguments_json TEXT NOT NULL,
    confirmation_prompt TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_ai_pending_tool_tenant_client UNIQUE (tenant_id, client_whatsapp)
);

CREATE INDEX IF NOT EXISTS ix_ai_pending_tool_confirmations_tenant_id ON ai_pending_tool_confirmations (tenant_id);
CREATE INDEX IF NOT EXISTS ix_ai_pending_tool_confirmations_expires_at ON ai_pending_tool_confirmations (expires_at);

COMMIT;
