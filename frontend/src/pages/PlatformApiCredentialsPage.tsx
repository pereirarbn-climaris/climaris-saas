import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  listPlatformApiCredentials,
  upsertPlatformApiCredential,
  type PlatformApiCredentialOut,
} from "../api/platformApiCredentials";
import styles from "./PlatformApiCredentialsPage.module.css";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function PlatformApiCredentialsPage() {
  const [rows, setRows] = useState<PlatformApiCredentialOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageErr, setPageErr] = useState("");
  const [cnpjaMsg, setCnpjaMsg] = useState("");
  const [awsMsg, setAwsMsg] = useState("");
  const [smtpMsg, setSmtpMsg] = useState("");
  const [googleMsg, setGoogleMsg] = useState("");
  const [claudeMsg, setClaudeMsg] = useState("");
  const [openaiMsg, setOpenaiMsg] = useState("");
  const [stripeMsg, setStripeMsg] = useState("");
  const [whatsOfficialMsg, setWhatsOfficialMsg] = useState("");

  const [cnpjaDisplayName, setCnpjaDisplayName] = useState("CNPJA");
  const [cnpjaBaseUrl, setCnpjaBaseUrl] = useState("https://api.cnpja.com/");
  const [cnpjaApiKey, setCnpjaApiKey] = useState("");
  const [cnpjaExtraConfigText, setCnpjaExtraConfigText] = useState("");
  const [clearCnpjaKey, setClearCnpjaKey] = useState(false);
  const [savingCnpja, setSavingCnpja] = useState(false);

  const [awsDisplayName, setAwsDisplayName] = useState("AWS S3");
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
  const [awsBucketManuais, setAwsBucketManuais] = useState("");
  const [awsBucketImagens, setAwsBucketImagens] = useState("");
  const [awsBucketBackups, setAwsBucketBackups] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [awsEndpointUrl, setAwsEndpointUrl] = useState("");
  const [awsPublicBaseUrl, setAwsPublicBaseUrl] = useState("");
  const [awsPrefix, setAwsPrefix] = useState("tenant-logos");
  const [clearAwsKeys, setClearAwsKeys] = useState(false);
  const [savingAws, setSavingAws] = useState(false);
  const [smtpDisplayName, setSmtpDisplayName] = useState("SMTP Hostinger");
  const [smtpHost, setSmtpHost] = useState("smtp.hostinger.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("Climaris");
  const [smtpUseStarttls, setSmtpUseStarttls] = useState(true);
  const [smtpUseSsl, setSmtpUseSsl] = useState(false);
  const [clearSmtpPassword, setClearSmtpPassword] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);

  const [googleDisplayName, setGoogleDisplayName] = useState("Google OAuth");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [clearGoogleClientSecret, setClearGoogleClientSecret] = useState(false);
  const [savingGoogle, setSavingGoogle] = useState(false);

  const [claudeDisplayName, setClaudeDisplayName] = useState("IA Claude (Anthropic)");
  const [claudeModel, setClaudeModel] = useState("claude-haiku-4-5-20251001");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [clearClaudeKey, setClearClaudeKey] = useState(false);
  const [savingClaude, setSavingClaude] = useState(false);

  const [openaiDisplayName, setOpenaiDisplayName] = useState("OpenAI (embeddings Iris)");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [clearOpenaiKey, setClearOpenaiKey] = useState(false);
  const [savingOpenai, setSavingOpenai] = useState(false);

  const [stripeDisplayName, setStripeDisplayName] = useState("Stripe (planos de acesso)");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [clearStripeSecretKey, setClearStripeSecretKey] = useState(false);
  const [savingStripe, setSavingStripe] = useState(false);

  const [whatsOfficialDisplayName, setWhatsOfficialDisplayName] = useState("WhatsApp API oficial (Meta)");
  const [whatsOfficialAccessToken, setWhatsOfficialAccessToken] = useState("");
  const [whatsOfficialPhoneNumberId, setWhatsOfficialPhoneNumberId] = useState("");
  const [whatsOfficialApiVersion, setWhatsOfficialApiVersion] = useState("v20.0");
  const [clearWhatsOfficialToken, setClearWhatsOfficialToken] = useState(false);
  const [savingWhatsOfficial, setSavingWhatsOfficial] = useState(false);

  const cnpja = useMemo(() => rows.find((r) => r.provider_slug === "cnpja") ?? null, [rows]);
  const aws = useMemo(() => rows.find((r) => r.provider_slug === "aws-s3") ?? null, [rows]);
  const smtp = useMemo(() => rows.find((r) => r.provider_slug === "smtp") ?? null, [rows]);
  const google = useMemo(() => rows.find((r) => r.provider_slug === "google-oauth") ?? null, [rows]);
  const claude = useMemo(() => rows.find((r) => r.provider_slug === "claude") ?? null, [rows]);
  const openai = useMemo(() => rows.find((r) => r.provider_slug === "openai") ?? null, [rows]);
  const stripe = useMemo(() => rows.find((r) => r.provider_slug === "stripe") ?? null, [rows]);
  const whatsOfficial = useMemo(() => rows.find((r) => r.provider_slug === "whatsapp-official") ?? null, [rows]);

  async function refresh() {
    setPageErr("");
    setLoading(true);
    try {
      const list = await listPlatformApiCredentials();
      setRows(list);
    } catch (e) {
      setPageErr(e instanceof Error ? e.message : "Erro ao carregar credenciais.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!cnpja) return;
    setCnpjaDisplayName(cnpja.display_name);
    setCnpjaBaseUrl(cnpja.api_base_url ?? "");
    setCnpjaExtraConfigText(cnpja.extra_config ? JSON.stringify(cnpja.extra_config, null, 2) : "");
    setCnpjaApiKey("");
    setClearCnpjaKey(false);
  }, [cnpja?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aws) return;
    setAwsDisplayName(aws.display_name);
    const legacyBucket =
      typeof aws.extra_config?.bucket === "string" ? aws.extra_config.bucket : "";
    setAwsBucketManuais(
      typeof aws.extra_config?.bucket_manuais === "string"
        ? aws.extra_config.bucket_manuais
        : legacyBucket,
    );
    setAwsBucketImagens(
      typeof aws.extra_config?.bucket_imagens === "string" ? aws.extra_config.bucket_imagens : "",
    );
    setAwsBucketBackups(
      typeof aws.extra_config?.bucket_backups === "string" ? aws.extra_config.bucket_backups : "",
    );
    setAwsRegion(typeof aws.extra_config?.region === "string" ? aws.extra_config.region : "us-east-1");
    setAwsEndpointUrl(typeof aws.extra_config?.endpoint_url === "string" ? aws.extra_config.endpoint_url : "");
    setAwsPublicBaseUrl(typeof aws.extra_config?.public_base_url === "string" ? aws.extra_config.public_base_url : "");
    setAwsPrefix(typeof aws.extra_config?.prefix === "string" ? aws.extra_config.prefix : "tenant-logos");
    setAwsAccessKeyId("");
    setAwsSecretAccessKey("");
    setClearAwsKeys(false);
  }, [aws?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!smtp) return;
    setSmtpDisplayName(smtp.display_name || "SMTP Hostinger");
    setSmtpHost(smtp.api_base_url ?? "smtp.hostinger.com");
    const rawPort = smtp.extra_config?.port;
    setSmtpPort(typeof rawPort === "number" || typeof rawPort === "string" ? String(rawPort) : "587");
    setSmtpUsername(typeof smtp.extra_config?.username === "string" ? smtp.extra_config.username : "");
    setSmtpFromEmail(typeof smtp.extra_config?.from_email === "string" ? smtp.extra_config.from_email : "");
    setSmtpFromName(typeof smtp.extra_config?.from_name === "string" ? smtp.extra_config.from_name : "Climaris");
    setSmtpUseStarttls(
      typeof smtp.extra_config?.use_starttls === "boolean"
        ? smtp.extra_config.use_starttls
        : String(smtpPort) === "587",
    );
    setSmtpUseSsl(typeof smtp.extra_config?.use_ssl === "boolean" ? smtp.extra_config.use_ssl : false);
    setSmtpPassword("");
    setClearSmtpPassword(false);
  }, [smtp?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!google) return;
    setGoogleDisplayName(google.display_name || "Google OAuth");
    setGoogleClientId(typeof google.extra_config?.client_id === "string" ? google.extra_config.client_id : "");
    setGoogleClientSecret("");
    setClearGoogleClientSecret(false);
  }, [google?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!claude) return;
    setClaudeDisplayName(claude.display_name || "IA Claude (Anthropic)");
    setClaudeModel(
      typeof claude.extra_config?.model === "string" && claude.extra_config.model.trim()
        ? claude.extra_config.model
        : "claude-haiku-4-5-20251001",
    );
    setClaudeApiKey("");
    setClearClaudeKey(false);
  }, [claude?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openai) return;
    setOpenaiDisplayName(openai.display_name || "OpenAI (embeddings Iris)");
    setOpenaiApiKey("");
    setClearOpenaiKey(false);
  }, [openai?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!stripe) return;
    setStripeDisplayName(stripe.display_name || "Stripe (planos de acesso)");
    setStripePublishableKey(
      typeof stripe.extra_config?.publishable_key === "string" ? stripe.extra_config.publishable_key : "",
    );
    setStripeWebhookSecret(
      typeof stripe.extra_config?.webhook_secret === "string" ? stripe.extra_config.webhook_secret : "",
    );
    setStripeSecretKey("");
    setClearStripeSecretKey(false);
  }, [stripe?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!whatsOfficial) return;
    setWhatsOfficialDisplayName(whatsOfficial.display_name || "WhatsApp API oficial (Meta)");
    setWhatsOfficialPhoneNumberId(
      typeof whatsOfficial.extra_config?.phone_number_id === "string" ? whatsOfficial.extra_config.phone_number_id : "",
    );
    setWhatsOfficialApiVersion(
      typeof whatsOfficial.extra_config?.api_version === "string" && whatsOfficial.extra_config.api_version.trim()
        ? whatsOfficial.extra_config.api_version
        : "v20.0",
    );
    setWhatsOfficialAccessToken("");
    setClearWhatsOfficialToken(false);
  }, [whatsOfficial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmitCnpja(e: FormEvent) {
    e.preventDefault();
    setPageErr("");
    setCnpjaMsg("");

    let extraConfig: Record<string, unknown> | undefined = undefined;
    if (cnpjaExtraConfigText.trim()) {
      try {
        const parsed = JSON.parse(cnpjaExtraConfigText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setCnpjaMsg("Informações adicionais devem ser um JSON objeto.");
          return;
        }
        extraConfig = parsed as Record<string, unknown>;
      } catch {
        setCnpjaMsg("JSON inválido em informações adicionais.");
        return;
      }
    }

    setSavingCnpja(true);
    try {
      const saved = await upsertPlatformApiCredential("cnpja", {
        display_name: cnpjaDisplayName.trim() || "CNPJA",
        api_base_url: cnpjaBaseUrl.trim() || undefined,
        api_key: cnpjaApiKey.trim() || undefined,
        extra_config: extraConfig,
        clear_api_key: clearCnpjaKey,
      });
      setCnpjaApiKey("");
      setClearCnpjaKey(false);
      setCnpjaMsg(
        saved.has_api_key
          ? "CNPJA salva com sucesso."
          : "CNPJA salva sem chave ativa.",
      );
      await refresh();
    } catch (error) {
      setCnpjaMsg(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSavingCnpja(false);
    }
  }

  async function onSubmitAws(e: FormEvent) {
    e.preventDefault();
    setPageErr("");
    setAwsMsg("");
    const normalizedAwsAccessKeyId = awsAccessKeyId.trim();
    if (normalizedAwsAccessKeyId && !/^[A-Z0-9]{16,32}$/.test(normalizedAwsAccessKeyId)) {
      setAwsMsg("AWS_ACCESS_KEY_ID inválido. Use apenas letras maiúsculas e números (16 a 32 caracteres).");
      return;
    }
    setSavingAws(true);
    try {
      const saved = await upsertPlatformApiCredential("aws-s3", {
        display_name: awsDisplayName.trim() || "AWS S3",
        api_base_url: "https://s3.amazonaws.com",
        aws_access_key_id: normalizedAwsAccessKeyId || undefined,
        aws_secret_access_key: awsSecretAccessKey.trim() || undefined,
        extra_config: {
          bucket: awsBucketManuais.trim() || undefined,
          bucket_manuais: awsBucketManuais.trim() || undefined,
          bucket_imagens: awsBucketImagens.trim() || undefined,
          bucket_backups: awsBucketBackups.trim() || undefined,
          region: awsRegion.trim() || "us-east-1",
          endpoint_url: awsEndpointUrl.trim() || undefined,
          public_base_url: awsPublicBaseUrl.trim() || undefined,
          prefix: awsPrefix.trim() || "tenant-logos",
        },
        clear_aws_keys: clearAwsKeys,
      });
      setAwsAccessKeyId("");
      setAwsSecretAccessKey("");
      setClearAwsKeys(false);
      setAwsMsg(
        saved.has_aws_access_key_id || saved.has_aws_secret_access_key
          ? "Credenciais AWS salvas com sucesso."
          : "AWS salva sem credenciais ativas.",
      );
      await refresh();
    } catch (error) {
      setAwsMsg(error instanceof Error ? error.message : "Não foi possível salvar AWS.");
    } finally {
      setSavingAws(false);
    }
  }

  async function onSubmitSmtp(e: FormEvent) {
    e.preventDefault();
    setPageErr("");
    setSmtpMsg("");
    const port = Number(smtpPort.trim());
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      setSmtpMsg("Porta SMTP inválida. Use um número entre 1 e 65535.");
      return;
    }
    if (!smtpHost.trim()) {
      setSmtpMsg("Informe o host SMTP.");
      return;
    }
    if (!smtpFromEmail.trim()) {
      setSmtpMsg("Informe o e-mail remetente.");
      return;
    }
    setSavingSmtp(true);
    try {
      const saved = await upsertPlatformApiCredential("smtp", {
        display_name: smtpDisplayName.trim() || "SMTP Hostinger",
        api_base_url: smtpHost.trim(),
        api_key: smtpPassword.trim() || undefined,
        extra_config: {
          port,
          username: smtpUsername.trim() || undefined,
          from_email: smtpFromEmail.trim(),
          from_name: smtpFromName.trim() || "Climaris",
          use_starttls: smtpUseStarttls,
          use_ssl: smtpUseSsl,
        },
        clear_api_key: clearSmtpPassword,
      });
      setSmtpPassword("");
      setClearSmtpPassword(false);
      setSmtpMsg(saved.has_api_key ? "SMTP salvo com sucesso." : "SMTP salvo sem senha ativa.");
      await refresh();
    } catch (error) {
      setSmtpMsg(error instanceof Error ? error.message : "Não foi possível salvar SMTP.");
    } finally {
      setSavingSmtp(false);
    }
  }

  async function onSubmitGoogle(e: FormEvent) {
    e.preventDefault();
    setPageErr("");
    setGoogleMsg("");
    if (!googleClientId.trim()) {
      setGoogleMsg("Informe o Google Client ID.");
      return;
    }
    setSavingGoogle(true);
    try {
      const saved = await upsertPlatformApiCredential("google-oauth", {
        display_name: googleDisplayName.trim() || "Google OAuth",
        api_base_url: "https://accounts.google.com",
        api_key: googleClientSecret.trim() || undefined,
        extra_config: {
          client_id: googleClientId.trim(),
        },
        clear_api_key: clearGoogleClientSecret,
      });
      setGoogleClientSecret("");
      setClearGoogleClientSecret(false);
      setGoogleMsg(
        saved.has_api_key
          ? "Google OAuth salvo (Client ID + segredo)."
          : "Google OAuth salvo sem segredo ativo (Client ID já disponível para login).",
      );
      await refresh();
    } catch (error) {
      setGoogleMsg(error instanceof Error ? error.message : "Não foi possível salvar Google OAuth.");
    } finally {
      setSavingGoogle(false);
    }
  }

  async function onSubmitStripe(e: FormEvent) {
    e.preventDefault();
    setPageErr("");
    setStripeMsg("");
    setSavingStripe(true);
    try {
      const saved = await upsertPlatformApiCredential("stripe", {
        display_name: stripeDisplayName.trim() || "Stripe (planos de acesso)",
        api_base_url: "https://api.stripe.com",
        api_key: stripeSecretKey.trim() || undefined,
        extra_config: {
          ...(stripe?.extra_config ?? {}),
          ...(stripePublishableKey.trim() ? { publishable_key: stripePublishableKey.trim() } : {}),
          ...(stripeWebhookSecret.trim() ? { webhook_secret: stripeWebhookSecret.trim() } : {}),
        },
        clear_api_key: clearStripeSecretKey,
      });
      setStripeSecretKey("");
      setClearStripeSecretKey(false);
      const hasWebhook = Boolean(stripeWebhookSecret.trim() || stripe?.extra_config?.webhook_secret);
      setStripeMsg(
        saved.has_api_key
          ? hasWebhook
            ? "Stripe salvo (secret key + webhook)."
            : "Secret key salva. Informe o webhook secret para receber eventos de assinatura."
          : "Configuração salva sem secret key ativa.",
      );
      await refresh();
    } catch (error) {
      setStripeMsg(error instanceof Error ? error.message : "Não foi possível salvar Stripe.");
    } finally {
      setSavingStripe(false);
    }
  }

  async function onSubmitClaude(e: FormEvent) {
    e.preventDefault();
    setPageErr("");
    setClaudeMsg("");
    setSavingClaude(true);
    try {
      const saved = await upsertPlatformApiCredential("claude", {
        display_name: claudeDisplayName.trim() || "IA Claude (Anthropic)",
        api_base_url: "https://api.anthropic.com",
        api_key: claudeApiKey.trim() || undefined,
        extra_config: {
          model: claudeModel.trim() || "claude-haiku-4-5-20251001",
        },
        clear_api_key: clearClaudeKey,
      });
      setClaudeApiKey("");
      setClearClaudeKey(false);
      setClaudeMsg(
        saved.has_api_key
          ? "Chave Claude salva com sucesso."
          : "Configuração salva sem chave ativa.",
      );
      await refresh();
    } catch (error) {
      setClaudeMsg(error instanceof Error ? error.message : "Não foi possível salvar Claude.");
    } finally {
      setSavingClaude(false);
    }
  }

  async function onSubmitOpenai(e: FormEvent) {
    e.preventDefault();
    setPageErr("");
    setOpenaiMsg("");
    setSavingOpenai(true);
    try {
      const saved = await upsertPlatformApiCredential("openai", {
        display_name: openaiDisplayName.trim() || "OpenAI (embeddings Iris)",
        api_base_url: "https://api.openai.com",
        api_key: openaiApiKey.trim() || undefined,
        clear_api_key: clearOpenaiKey,
      });
      setOpenaiApiKey("");
      setClearOpenaiKey(false);
      setOpenaiMsg(
        saved.has_api_key
          ? "Chave OpenAI salva com sucesso."
          : "Configuração salva sem chave ativa.",
      );
      await refresh();
    } catch (error) {
      setOpenaiMsg(error instanceof Error ? error.message : "Não foi possível salvar OpenAI.");
    } finally {
      setSavingOpenai(false);
    }
  }

  async function onSubmitWhatsOfficial(e: FormEvent) {
    e.preventDefault();
    setPageErr("");
    setWhatsOfficialMsg("");
    const phoneNumberId = whatsOfficialPhoneNumberId.trim();
    if (!phoneNumberId) {
      setWhatsOfficialMsg("Informe o Phone Number ID da Cloud API.");
      return;
    }
    const apiVersion = whatsOfficialApiVersion.trim() || "v20.0";
    setSavingWhatsOfficial(true);
    try {
      const saved = await upsertPlatformApiCredential("whatsapp-official", {
        display_name: whatsOfficialDisplayName.trim() || "WhatsApp API oficial (Meta)",
        api_base_url: "https://graph.facebook.com",
        api_key: whatsOfficialAccessToken.trim() || undefined,
        extra_config: {
          phone_number_id: phoneNumberId,
          api_version: apiVersion,
        },
        clear_api_key: clearWhatsOfficialToken,
      });
      setWhatsOfficialAccessToken("");
      setClearWhatsOfficialToken(false);
      setWhatsOfficialMsg(saved.has_api_key ? "Credenciais WhatsApp oficial salvas." : "Configuração salva sem token ativo.");
      await refresh();
    } catch (error) {
      setWhatsOfficialMsg(error instanceof Error ? error.message : "Não foi possível salvar WhatsApp oficial.");
    } finally {
      setSavingWhatsOfficial(false);
    }
  }

  return (
    <div className={styles.panel}>
      <section className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Operação · Integrações</p>
          <h2 className={styles.heroTitle}>Chaves APIs do SaaS</h2>
          <p className={styles.heroLead}>
            CNPJA, AWS, SMTP, WhatsApp oficial, Google OAuth, Stripe e IA Claude ficam separados em blocos independentes. Assim, salvar um
            provedor nunca altera dados do outro.
          </p>
        </div>
        <div className={styles.heroAccent} aria-hidden />
      </section>
      {pageErr ? <p className={styles.contactHint}>{pageErr}</p> : null}

      <section className={styles.integrationGrid}>
        <article className={styles.integrationCard}>
          <div className={styles.integrationHeader}>
            <h3 className={styles.cardTitle}>CNPJA</h3>
            <span className={`${styles.badge} ${cnpja?.has_api_key ? styles.badgeActive : styles.badgeCancelled}`}>
              {cnpja?.has_api_key ? "Conectado" : "Sem chave"}
            </span>
          </div>
          <p className={styles.integrationMeta}>Última atualização: {fmtDate(cnpja?.key_updated_at ?? cnpja?.updated_at ?? null)}</p>
          <form onSubmit={onSubmitCnpja} className={styles.section}>
            <input className={styles.link} value={cnpjaDisplayName} onChange={(e) => setCnpjaDisplayName(e.target.value)} />
            <input className={styles.link} value={cnpjaBaseUrl} onChange={(e) => setCnpjaBaseUrl(e.target.value)} />
            <input
              className={styles.link}
              type="password"
              value={cnpjaApiKey}
              onChange={(e) => setCnpjaApiKey(e.target.value)}
              placeholder="Nova API key CNPJA (vazio = manter)"
              autoComplete="new-password"
            />
            <textarea
              className={styles.link}
              value={cnpjaExtraConfigText}
              onChange={(e) => setCnpjaExtraConfigText(e.target.value)}
              placeholder='JSON adicional (opcional), ex.: {"timeout_ms":10000}'
              rows={5}
            />
            <label className={styles.note}>
              <input type="checkbox" checked={clearCnpjaKey} onChange={(e) => setClearCnpjaKey(e.target.checked)} /> Remover
              API key CNPJA
            </label>
            <button className={`${styles.link} ${styles.linkPrimary}`} disabled={savingCnpja} type="submit">
              {savingCnpja ? "Salvando..." : "Salvar CNPJA"}
            </button>
            {cnpjaMsg ? <p className={styles.contactHint}>{cnpjaMsg}</p> : null}
          </form>
        </article>

        <article className={styles.integrationCard}>
          <div className={styles.integrationHeader}>
            <h3 className={styles.cardTitle}>AWS S3 (manuais, imagens, backup)</h3>
            <span
              className={`${styles.badge} ${
                aws?.has_aws_access_key_id && aws?.has_aws_secret_access_key ? styles.badgeActive : styles.badgeSuspended
              }`}
            >
              {aws?.has_aws_access_key_id && aws?.has_aws_secret_access_key ? "Conectado" : "Pendente"}
            </span>
          </div>
          <p className={styles.integrationMeta}>
            Última atualização: {fmtDate(aws?.aws_keys_updated_at ?? aws?.updated_at ?? null)}
          </p>
          <form onSubmit={onSubmitAws} className={styles.section}>
            <input className={styles.link} value={awsDisplayName} onChange={(e) => setAwsDisplayName(e.target.value)} />
            <input className={styles.link} value="https://s3.amazonaws.com" disabled aria-readonly />
            <input
              className={styles.link}
              value={awsBucketManuais}
              onChange={(e) => setAwsBucketManuais(e.target.value)}
              placeholder="Bucket manuais / PDF (ex.: erp-manuais-prod-climaris)"
            />
            <input
              className={styles.link}
              value={awsBucketImagens}
              onChange={(e) => setAwsBucketImagens(e.target.value)}
              placeholder="Bucket imagens (logos, produtos) — ex.: erp-imagens-prod-climaris"
            />
            <input
              className={styles.link}
              value={awsBucketBackups}
              onChange={(e) => setAwsBucketBackups(e.target.value)}
              placeholder="Bucket backups (restic) — ex.: erp-backups-prod-climaris"
            />
            <input
              className={styles.link}
              value={awsRegion}
              onChange={(e) => setAwsRegion(e.target.value)}
              placeholder="Região (ex.: us-east-1)"
            />
            <input
              className={styles.link}
              value={awsEndpointUrl}
              onChange={(e) => setAwsEndpointUrl(e.target.value)}
              placeholder="Endpoint URL (opcional, S3 compatível)"
            />
            <input
              className={styles.link}
              value={awsPublicBaseUrl}
              onChange={(e) => setAwsPublicBaseUrl(e.target.value)}
              placeholder="URL pública base (opcional CDN/domínio)"
            />
            <input
              className={styles.link}
              value={awsPrefix}
              onChange={(e) => setAwsPrefix(e.target.value)}
              placeholder="Prefixo de pasta (default tenant-logos)"
            />
            <input
              className={styles.link}
              type="password"
              value={awsAccessKeyId}
              onChange={(e) => setAwsAccessKeyId(e.target.value)}
              placeholder="AWS_ACCESS_KEY_ID (vazio = manter)"
              autoComplete="new-password"
            />
            <input
              className={styles.link}
              type="password"
              value={awsSecretAccessKey}
              onChange={(e) => setAwsSecretAccessKey(e.target.value)}
              placeholder="AWS_SECRET_ACCESS_KEY (vazio = manter)"
              autoComplete="new-password"
            />
            <label className={styles.note}>
              <input type="checkbox" checked={clearAwsKeys} onChange={(e) => setClearAwsKeys(e.target.checked)} /> Remover
              credenciais AWS
            </label>
            <button className={`${styles.link} ${styles.linkPrimary}`} disabled={savingAws} type="submit">
              {savingAws ? "Salvando..." : "Salvar AWS"}
            </button>
            {awsMsg ? <p className={styles.contactHint}>{awsMsg}</p> : null}
          </form>
        </article>

        <article className={styles.integrationCard}>
          <div className={styles.integrationHeader}>
            <h3 className={styles.cardTitle}>SMTP (Confirmação de E-mail)</h3>
            <span className={`${styles.badge} ${smtp?.has_api_key ? styles.badgeActive : styles.badgeSuspended}`}>
              {smtp?.has_api_key ? "Conectado" : "Pendente"}
            </span>
          </div>
          <p className={styles.integrationMeta}>Use os dados do seu provedor (ex.: Hostinger).</p>
          <form onSubmit={onSubmitSmtp} className={styles.section}>
            <input
              className={styles.link}
              value={smtpDisplayName}
              onChange={(e) => setSmtpDisplayName(e.target.value)}
              placeholder="Nome de exibição"
            />
            <input
              className={styles.link}
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="Host SMTP (ex.: smtp.hostinger.com)"
            />
            <input
              className={styles.link}
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Porta (587 ou 465)"
            />
            <input
              className={styles.link}
              value={smtpUsername}
              onChange={(e) => setSmtpUsername(e.target.value)}
              placeholder="Usuário SMTP (geralmente o e-mail)"
            />
            <input
              className={styles.link}
              value={smtpFromEmail}
              onChange={(e) => setSmtpFromEmail(e.target.value)}
              placeholder="E-mail remetente (From)"
            />
            <input
              className={styles.link}
              value={smtpFromName}
              onChange={(e) => setSmtpFromName(e.target.value)}
              placeholder="Nome remetente (From Name)"
            />
            <input
              className={styles.link}
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder="Senha SMTP (vazio = manter)"
              autoComplete="new-password"
            />
            <label className={styles.note}>
              <input type="checkbox" checked={smtpUseStarttls} onChange={(e) => setSmtpUseStarttls(e.target.checked)} /> Usar
              STARTTLS
            </label>
            <label className={styles.note}>
              <input type="checkbox" checked={smtpUseSsl} onChange={(e) => setSmtpUseSsl(e.target.checked)} /> Usar SSL direto
              (porta 465)
            </label>
            <label className={styles.note}>
              <input
                type="checkbox"
                checked={clearSmtpPassword}
                onChange={(e) => setClearSmtpPassword(e.target.checked)}
              />{" "}
              Remover senha SMTP salva
            </label>
            <button className={`${styles.link} ${styles.linkPrimary}`} disabled={savingSmtp} type="submit">
              {savingSmtp ? "Salvando..." : "Salvar SMTP"}
            </button>
            {smtpMsg ? <p className={styles.contactHint}>{smtpMsg}</p> : null}
          </form>
        </article>

        <article className={styles.integrationCard}>
          <div className={styles.integrationHeader}>
            <h3 className={styles.cardTitle}>WhatsApp API oficial (Meta)</h3>
            <span className={`${styles.badge} ${whatsOfficial?.has_api_key ? styles.badgeActive : styles.badgeSuspended}`}>
              {whatsOfficial?.has_api_key ? "Conectado" : "Pendente"}
            </span>
          </div>
          <p className={styles.integrationMeta}>
            Usada no provedor oficial do WhatsApp em Operação &gt; WhatsApp. Última atualização:{" "}
            {fmtDate(whatsOfficial?.key_updated_at ?? whatsOfficial?.updated_at ?? null)}
          </p>
          <form onSubmit={onSubmitWhatsOfficial} className={styles.section}>
            <input
              className={styles.link}
              value={whatsOfficialDisplayName}
              onChange={(e) => setWhatsOfficialDisplayName(e.target.value)}
              placeholder="Nome de exibição"
            />
            <input className={styles.link} value="https://graph.facebook.com" disabled aria-readonly />
            <input
              className={styles.link}
              value={whatsOfficialPhoneNumberId}
              onChange={(e) => setWhatsOfficialPhoneNumberId(e.target.value)}
              placeholder="Phone Number ID (Meta)"
              autoComplete="off"
            />
            <input
              className={styles.link}
              value={whatsOfficialApiVersion}
              onChange={(e) => setWhatsOfficialApiVersion(e.target.value)}
              placeholder="Versão da API (ex.: v20.0)"
              autoComplete="off"
            />
            <input
              className={styles.link}
              type="password"
              value={whatsOfficialAccessToken}
              onChange={(e) => setWhatsOfficialAccessToken(e.target.value)}
              placeholder="Access Token permanente (vazio = manter)"
              autoComplete="new-password"
            />
            <label className={styles.note}>
              <input
                type="checkbox"
                checked={clearWhatsOfficialToken}
                onChange={(e) => setClearWhatsOfficialToken(e.target.checked)}
              />{" "}
              Remover access token salvo
            </label>
            <button className={`${styles.link} ${styles.linkPrimary}`} disabled={savingWhatsOfficial} type="submit">
              {savingWhatsOfficial ? "Salvando..." : "Salvar WhatsApp oficial"}
            </button>
            {whatsOfficialMsg ? <p className={styles.contactHint}>{whatsOfficialMsg}</p> : null}
          </form>
        </article>

        <article className={styles.integrationCard}>
          <div className={styles.integrationHeader}>
            <h3 className={styles.cardTitle}>Google OAuth (login e cadastro)</h3>
            <span
              className={`${styles.badge} ${
                googleClientId.trim() ? styles.badgeActive : styles.badgeSuspended
              }`}
            >
              {googleClientId.trim() ? "Conectado" : "Pendente"}
            </span>
          </div>
          <p className={styles.integrationMeta}>
            Configure o Client ID do Google Cloud para liberar o botão &quot;Entrar com Google&quot; no login/cadastro.
            Última atualização: {fmtDate(google?.key_updated_at ?? google?.updated_at ?? null)}
          </p>
          <form onSubmit={onSubmitGoogle} className={styles.section}>
            <input
              className={styles.link}
              value={googleDisplayName}
              onChange={(e) => setGoogleDisplayName(e.target.value)}
              placeholder="Nome de exibição"
            />
            <input className={styles.link} value="https://accounts.google.com" disabled aria-readonly />
            <input
              className={styles.link}
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              placeholder="Google Client ID (obrigatório)"
              autoComplete="off"
            />
            <input
              className={styles.link}
              type="password"
              value={googleClientSecret}
              onChange={(e) => setGoogleClientSecret(e.target.value)}
              placeholder="Google Client Secret (opcional, vazio = manter)"
              autoComplete="new-password"
            />
            <label className={styles.note}>
              <input
                type="checkbox"
                checked={clearGoogleClientSecret}
                onChange={(e) => setClearGoogleClientSecret(e.target.checked)}
              />{" "}
              Remover Client Secret salvo
            </label>
            <button className={`${styles.link} ${styles.linkPrimary}`} disabled={savingGoogle} type="submit">
              {savingGoogle ? "Salvando..." : "Salvar Google OAuth"}
            </button>
            {googleMsg ? <p className={styles.contactHint}>{googleMsg}</p> : null}
          </form>
        </article>

        <article className={styles.integrationCard}>
          <div className={styles.integrationHeader}>
            <h3 className={styles.cardTitle}>Stripe (planos de acesso)</h3>
            <span className={`${styles.badge} ${stripe?.has_api_key ? styles.badgeActive : styles.badgeSuspended}`}>
              {stripe?.has_api_key ? "Conectado" : "Pendente"}
            </span>
          </div>
          <p className={styles.integrationMeta}>
            Cobrança de planos SaaS e add-ons da loja. Webhook:{" "}
            <code className={styles.inlineCode}>/api/v1/webhooks/stripe</code>. Última atualização:{" "}
            {fmtDate(stripe?.key_updated_at ?? stripe?.updated_at ?? null)}
          </p>
          <form onSubmit={onSubmitStripe} className={styles.section}>
            <input
              className={styles.link}
              value={stripeDisplayName}
              onChange={(e) => setStripeDisplayName(e.target.value)}
              placeholder="Nome de exibição"
            />
            <input className={styles.link} value="https://api.stripe.com" disabled aria-readonly />
            <input
              className={styles.link}
              type="password"
              value={stripeSecretKey}
              onChange={(e) => setStripeSecretKey(e.target.value)}
              placeholder="Secret key (sk_test_... ou sk_live_..., vazio = manter)"
              autoComplete="new-password"
            />
            <input
              className={styles.link}
              type="password"
              value={stripePublishableKey}
              onChange={(e) => setStripePublishableKey(e.target.value)}
              placeholder="Publishable key (pk_test_... ou pk_live_...)"
              autoComplete="new-password"
            />
            <input
              className={styles.link}
              type="password"
              value={stripeWebhookSecret}
              onChange={(e) => setStripeWebhookSecret(e.target.value)}
              placeholder="Webhook signing secret (whsec_...)"
              autoComplete="new-password"
            />
            <p className={styles.note}>
              No painel Stripe, crie o endpoint apontando para{" "}
              <strong>https://beta.climaris.com.br/api/v1/webhooks/stripe</strong> (ou o domínio de produção) e
              escute: <code className={styles.inlineCode}>checkout.session.completed</code>,{" "}
              <code className={styles.inlineCode}>customer.subscription.*</code>,{" "}
              <code className={styles.inlineCode}>invoice.paid</code>,{" "}
              <code className={styles.inlineCode}>invoice.payment_failed</code>.
            </p>
            <label className={styles.note}>
              <input
                type="checkbox"
                checked={clearStripeSecretKey}
                onChange={(e) => setClearStripeSecretKey(e.target.checked)}
              />{" "}
              Remover secret key Stripe salva
            </label>
            <button className={`${styles.link} ${styles.linkPrimary}`} disabled={savingStripe} type="submit">
              {savingStripe ? "Salvando..." : "Salvar Stripe"}
            </button>
            {stripeMsg ? <p className={styles.contactHint}>{stripeMsg}</p> : null}
          </form>
        </article>

        <article className={styles.integrationCard}>
          <div className={styles.integrationHeader}>
            <h3 className={styles.cardTitle}>IA Claude (Anthropic)</h3>
            <span className={`${styles.badge} ${claude?.has_api_key ? styles.badgeActive : styles.badgeSuspended}`}>
              {claude?.has_api_key ? "Conectado" : "Pendente"}
            </span>
          </div>
          <p className={styles.integrationMeta}>
            Usada no WhatsApp bot, assistente Iris (respostas) e leitura de etiquetas de equipamentos. Última atualização:{" "}
            {fmtDate(claude?.key_updated_at ?? claude?.updated_at ?? null)}
          </p>
          <form onSubmit={onSubmitClaude} className={styles.section}>
            <input
              className={styles.link}
              value={claudeDisplayName}
              onChange={(e) => setClaudeDisplayName(e.target.value)}
              placeholder="Nome de exibição"
            />
            <input className={styles.link} value="https://api.anthropic.com" disabled aria-readonly />
            <input
              className={styles.link}
              type="password"
              value={claudeApiKey}
              onChange={(e) => setClaudeApiKey(e.target.value)}
              placeholder="Nova API key Claude (sk-ant-..., vazio = manter)"
              autoComplete="new-password"
            />
            <input
              className={styles.link}
              value={claudeModel}
              onChange={(e) => setClaudeModel(e.target.value)}
              placeholder="Modelo (ex.: claude-haiku-4-5-20251001)"
            />
            <label className={styles.note}>
              <input type="checkbox" checked={clearClaudeKey} onChange={(e) => setClearClaudeKey(e.target.checked)} />{" "}
              Remover API key Claude salva
            </label>
            <button className={`${styles.link} ${styles.linkPrimary}`} disabled={savingClaude} type="submit">
              {savingClaude ? "Salvando..." : "Salvar Claude"}
            </button>
            {claudeMsg ? <p className={styles.contactHint}>{claudeMsg}</p> : null}
          </form>
        </article>

        <article className={styles.integrationCard}>
          <div className={styles.integrationHeader}>
            <h3 className={styles.cardTitle}>OpenAI (embeddings Iris)</h3>
            <span className={`${styles.badge} ${openai?.has_api_key ? styles.badgeActive : styles.badgeSuspended}`}>
              {openai?.has_api_key ? "Conectado" : "Pendente"}
            </span>
          </div>
          <p className={styles.integrationMeta}>
            Usada pela Iris para indexar e buscar trechos nos manuais técnicos (modelo text-embedding-3-small). A resposta
            em linguagem natural continua sendo gerada pelo Claude. Última atualização:{" "}
            {fmtDate(openai?.key_updated_at ?? openai?.updated_at ?? null)}
          </p>
          <form onSubmit={onSubmitOpenai} className={styles.section}>
            <input
              className={styles.link}
              value={openaiDisplayName}
              onChange={(e) => setOpenaiDisplayName(e.target.value)}
              placeholder="Nome de exibição"
            />
            <input className={styles.link} value="https://api.openai.com" disabled aria-readonly />
            <input
              className={styles.link}
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder="Nova API key OpenAI (sk-..., vazio = manter)"
              autoComplete="new-password"
            />
            <label className={styles.note}>
              <input type="checkbox" checked={clearOpenaiKey} onChange={(e) => setClearOpenaiKey(e.target.checked)} />{" "}
              Remover API key OpenAI salva
            </label>
            <button className={`${styles.link} ${styles.linkPrimary}`} disabled={savingOpenai} type="submit">
              {savingOpenai ? "Salvando..." : "Salvar OpenAI"}
            </button>
            {openaiMsg ? <p className={styles.contactHint}>{openaiMsg}</p> : null}
          </form>
        </article>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Credenciais salvas</h3>
        {loading ? <p className={styles.note}>Carregando...</p> : null}
        {!loading && rows.length === 0 ? <p className={styles.note}>Nenhuma credencial cadastrada.</p> : null}
        {!loading && rows.length > 0 ? (
          <div className={styles.section}>
            {rows.map((row) => (
              <div key={row.id} className={styles.contactCard}>
                <div>
                  <p className={styles.contactLabel}>
                    {row.display_name} ({row.provider_slug})
                  </p>
                  <p className={styles.note}>Base URL: {row.api_base_url || "—"}</p>
                  <p className={styles.note}>Chave: {row.has_api_key ? row.api_key_preview || "***" : "não definida"}</p>
                  <p className={styles.note}>
                    AWS_ACCESS_KEY_ID: {row.has_aws_access_key_id ? row.aws_access_key_id_preview || "***" : "não definida"}
                  </p>
                  <p className={styles.note}>
                    AWS_SECRET_ACCESS_KEY:{" "}
                    {row.has_aws_secret_access_key ? row.aws_secret_access_key_preview || "***" : "não definida"}
                  </p>
                  <p className={styles.note}>Atualizada: {fmtDate(row.updated_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
