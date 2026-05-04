import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  listPlatformApiCredentials,
  upsertPlatformApiCredential,
  type PlatformApiCredentialOut,
} from "../api/platformApiCredentials";
import styles from "./saas/SaasDashboardPage.module.css";

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

  const [cnpjaDisplayName, setCnpjaDisplayName] = useState("CNPJA");
  const [cnpjaBaseUrl, setCnpjaBaseUrl] = useState("https://api.cnpja.com/");
  const [cnpjaApiKey, setCnpjaApiKey] = useState("");
  const [cnpjaExtraConfigText, setCnpjaExtraConfigText] = useState("");
  const [clearCnpjaKey, setClearCnpjaKey] = useState(false);
  const [savingCnpja, setSavingCnpja] = useState(false);

  const [awsDisplayName, setAwsDisplayName] = useState("AWS S3");
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
  const [awsBucket, setAwsBucket] = useState("");
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

  const cnpja = useMemo(() => rows.find((r) => r.provider_slug === "cnpja") ?? null, [rows]);
  const aws = useMemo(() => rows.find((r) => r.provider_slug === "aws-s3") ?? null, [rows]);
  const smtp = useMemo(() => rows.find((r) => r.provider_slug === "smtp") ?? null, [rows]);

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
    setAwsBucket(typeof aws.extra_config?.bucket === "string" ? aws.extra_config.bucket : "");
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
          bucket: awsBucket.trim(),
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

  return (
    <div className={styles.panel}>
      <section className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Operação · Integrações</p>
          <h2 className={styles.heroTitle}>Chaves APIs do SaaS</h2>
          <p className={styles.heroLead}>
            CNPJA, AWS e SMTP ficam separados em blocos independentes. Assim, salvar um provedor nunca altera dados do outro.
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
            <h3 className={styles.cardTitle}>AWS (Imagens e Backup)</h3>
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
              value={awsBucket}
              onChange={(e) => setAwsBucket(e.target.value)}
              placeholder="Bucket (ex.: erp-imagens-prod-climaris)"
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
