import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  fetchPlatformBroadcastAudiencePreview,
  listPlatformNotificationBroadcasts,
  postPlatformNotificationBroadcast,
  type PlatformBroadcastAudience,
  type PlatformNotificationAudiencePreviewOut,
  type PlatformNotificationBroadcastOut,
} from "../api/platformNotifications";
import {
  PLATFORM_BROADCAST_AUDIENCE_LABELS,
  PLATFORM_BROADCAST_TEMPLATE_CATEGORIES,
  PLATFORM_BROADCAST_TEMPLATES,
  type PlatformBroadcastTemplate,
} from "../lib/platformBroadcastTemplates";
import styles from "./PlatformNotificationsPage.module.css";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function PlatformNotificationsPage() {
  const [history, setHistory] = useState<PlatformNotificationBroadcastOut[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkPath, setLinkPath] = useState("");
  const [audience, setAudience] = useState<PlatformBroadcastAudience>("all");
  const [preview, setPreview] = useState<PlatformNotificationAudiencePreviewOut | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const templatesByCategory = useMemo(() => {
    const groups = new Map<PlatformBroadcastTemplate["category"], PlatformBroadcastTemplate[]>();
    for (const template of PLATFORM_BROADCAST_TEMPLATES) {
      const list = groups.get(template.category) ?? [];
      list.push(template);
      groups.set(template.category, list);
    }
    return groups;
  }, []);

  const refreshHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const rows = await listPlatformNotificationBroadcasts({ limit: 40 });
      setHistory(rows);
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar histórico." });
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const refreshPreview = useCallback(async (nextAudience: PlatformBroadcastAudience) => {
    setLoadingPreview(true);
    try {
      const result = await fetchPlatformBroadcastAudiencePreview(nextAudience);
      setPreview(result);
    } catch (e) {
      setPreview(null);
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao calcular público." });
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    void refreshPreview(audience);
  }, [audience, refreshPreview]);

  function applyTemplate(template: PlatformBroadcastTemplate) {
    setTitle(template.title);
    setBody(template.body);
    setLinkPath(template.linkPath ?? "");
    setAudience(template.audience);
    setMessage(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!title.trim() || !body.trim()) {
      setMessage({ kind: "err", text: "Preencha título e mensagem." });
      return;
    }
    const audienceLabel = PLATFORM_BROADCAST_AUDIENCE_LABELS[audience];
    const userCount = preview?.user_count ?? 0;
    const tenantCount = preview?.tenant_count ?? 0;
    if (userCount === 0) {
      setMessage({ kind: "err", text: "Nenhum destinatário encontrado para o público selecionado." });
      return;
    }
    const confirmed = window.confirm(
      `Enviar este aviso para ${userCount} usuário(s) em ${tenantCount} workspace(s)?\n\nPúblico: ${audienceLabel}`,
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const result = await postPlatformNotificationBroadcast({
        title: title.trim(),
        body: body.trim(),
        link_path: linkPath.trim() || null,
        audience,
      });
      setMessage({
        kind: "ok",
        text: `Aviso enviado para ${result.recipients_count} usuário(s) em ${result.tenant_count} workspace(s) (${result.audience_label ?? audienceLabel}).`,
      });
      setTitle("");
      setBody("");
      setLinkPath("");
      await refreshHistory();
      await refreshPreview(audience);
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Não foi possível enviar o aviso." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Operação · Comunicação</p>
        <h2 className={styles.title}>Avisos para clientes</h2>
        <p className={styles.lead}>
          Envie notificações in-app por público: todos os workspaces, novos cadastros, clientes em teste, teste
          expirando ou inadimplentes. Use os modelos prontos ou personalize a mensagem.
        </p>
      </section>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Novo aviso</h3>
          <p className={styles.hint}>O aviso aparece no sino de notificações de cada usuário do público escolhido.</p>

          <div className={styles.templateSection}>
            <p className={styles.templateSectionTitle}>Modelos rápidos</p>
            {[...templatesByCategory.entries()].map(([category, templates]) => (
              <div key={category} className={styles.templateGroup}>
                <p className={styles.templateGroupLabel}>{PLATFORM_BROADCAST_TEMPLATE_CATEGORIES[category]}</p>
                <div className={styles.templateRow}>
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={styles.templateBtn}
                      onClick={() => applyTemplate(template)}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="broadcast-audience">
                Público
              </label>
              <select
                id="broadcast-audience"
                className={styles.select}
                value={audience}
                onChange={(e) => setAudience(e.target.value as PlatformBroadcastAudience)}
              >
                {(Object.keys(PLATFORM_BROADCAST_AUDIENCE_LABELS) as PlatformBroadcastAudience[]).map((key) => (
                  <option key={key} value={key}>
                    {PLATFORM_BROADCAST_AUDIENCE_LABELS[key]}
                  </option>
                ))}
              </select>
              <p className={styles.previewMeta}>
                {loadingPreview
                  ? "Calculando destinatários…"
                  : preview
                    ? `${preview.user_count} usuário(s) · ${preview.tenant_count} workspace(s)`
                    : "—"}
              </p>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="broadcast-title">
                Título
              </label>
              <input
                id="broadcast-title"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Seu teste está acabando"
                maxLength={160}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="broadcast-body">
                Mensagem
              </label>
              <textarea
                id="broadcast-body"
                className={styles.textarea}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Descreva a novidade ou o comunicado..."
                maxLength={4000}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="broadcast-link">
                Link interno (opcional)
              </label>
              <input
                id="broadcast-link"
                className={styles.input}
                value={linkPath}
                onChange={(e) => setLinkPath(e.target.value)}
                placeholder="/app/conta ou /app/service-orders"
                maxLength={255}
              />
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.btnPrimary} disabled={sending || loadingPreview || (preview?.user_count ?? 0) === 0}>
                {sending ? "Enviando…" : "Enviar aviso"}
              </button>
            </div>
          </form>

          {message ? <p className={message.kind === "ok" ? styles.alertOk : styles.alertErr}>{message.text}</p> : null}

          {(title.trim() || body.trim()) && (
            <div className={styles.previewBox} aria-label="Pré-visualização">
              <p className={styles.previewTitle}>{title.trim() || "Título do aviso"}</p>
              <p className={styles.previewBody}>{body.trim() || "Mensagem do aviso"}</p>
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Histórico</h3>
          <p className={styles.hint}>Últimos avisos enviados pela operação da plataforma.</p>

          {loadingHistory ? <p className={styles.empty}>Carregando…</p> : null}
          {!loadingHistory && history.length === 0 ? <p className={styles.empty}>Nenhum aviso enviado ainda.</p> : null}

          {!loadingHistory && history.length > 0 ? (
            <ul className={styles.historyList}>
              {history.map((row) => (
                <li key={row.id} className={styles.historyItem}>
                  <p className={styles.historyTitle}>{row.title}</p>
                  <p className={styles.historyBody}>{row.body}</p>
                  <p className={styles.historyMeta}>
                    {fmtDate(row.created_at)}
                    {row.created_by_name ? ` · ${row.created_by_name}` : ""}
                    {` · ${row.audience_label ?? row.audience}`}
                    {` · ${row.recipients_count} usuário(s) · ${row.tenant_count} workspace(s)`}
                    {row.link_path ? ` · ${row.link_path}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
