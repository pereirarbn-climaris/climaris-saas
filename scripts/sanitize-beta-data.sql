-- Executado após db_clone.sh --with-data --sanitize
-- Remove ou anonimiza dados sensíveis no banco Beta (climaris_beta).
-- Ajuste conforme novas tabelas/colunas forem adicionadas ao ERP.

BEGIN;

-- Tokens de sessão e chaves de API
DO $$
BEGIN
  IF to_regclass('public.login_refresh_tokens') IS NOT NULL THEN
    TRUNCATE login_refresh_tokens;
  END IF;
  IF to_regclass('public.tenant_api_keys') IS NOT NULL THEN
    TRUNCATE tenant_api_keys;
  END IF;
  IF to_regclass('public.platform_api_credentials') IS NOT NULL THEN
    TRUNCATE platform_api_credentials;
  END IF;
  IF to_regclass('public.password_reset_tokens') IS NOT NULL THEN
    TRUNCATE password_reset_tokens;
  END IF;
  IF to_regclass('public.email_verification_tokens') IS NOT NULL THEN
    TRUNCATE email_verification_tokens;
  END IF;
END $$;

-- Usuários: e-mails fictícios; senha padrão Beta123! (troque após o primeiro login).
UPDATE users
SET
  email = 'user_' || id::text || '@beta.climaris.local',
  password_hash = '$2b$12$/7mmPZEvyptNqF.KVLmIFeIUzE.Va6jWwIebkwJsmogcyunEzw5zW'
WHERE email NOT ILIKE '%@beta.climaris.local';

-- Credenciais de gateways financeiros (cifrado no servidor)
DO $$
BEGIN
  IF to_regclass('public.tenant_finance_gateways') IS NOT NULL THEN
    UPDATE tenant_finance_gateways
    SET
      asaas_api_key_encrypted = NULL,
      asaas_webhook_auth_encrypted = NULL,
      asaas_webhook_path_token = NULL,
      mercadopago_access_token_encrypted = NULL,
      mercadopago_public_key_encrypted = NULL,
      mercadopago_webhook_signature_secret_encrypted = NULL,
      mercadopago_webhook_path_token = NULL,
      stone_secret_key_encrypted = NULL,
      stone_public_key_encrypted = NULL,
      stone_webhook_path_token = NULL;
  END IF;
END $$;

COMMIT;
