import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { isHiddenAppModule } from "../../lib/hiddenAppModules";
import {
  fetchPreventiveSettings,
  listPreventiveLeads,
  type PreventiveLead,
  type PreventiveSettings,
} from "../../api/preventiveMaintenance";
import {
  disconnectWhatsapp,
  getWhatsappConnection,
  getWhatsappMessageSettings,
  getWhatsappModuleStatus,
  getWhatsappReminderRules,
  getWhatsappWebhookInfo,
  listWhatsappJobs,
  patchWhatsappAutomationSettings,
  setupWhatsappConnection,
  syncWhatsappWebhookEvolutionRouter,
  type WhatsappAppointmentMessageSettings,
  type WhatsappMessageJob,
  type WhatsappModuleStatus,
  type WhatsappReminderRules,
  type WhatsappTenantConnection,
  type WhatsappWebhookInfo,
} from "../../api/whatsapp";
import { ToastHost } from "../../components/ToastHost";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import { WhatsappAgendaTab } from "./WhatsappAgendaTab";
import { WhatsappCampaignsTab } from "./WhatsappCampaignsTab";
import { WhatsappPreventiveTab } from "./WhatsappPreventiveTab";
import {
  formatWhatsappScheduledAt,
  whatsappJobShowsScheduledBadge,
} from "./campaignDashboardUtils";
import dashStyles from "./CampaignDashboard.module.css";
import styles from "./WhatsappIntegrationPage.module.css";

/** Evolution às vezes envia base64 puro, data URL completa ou URL — evita prefixo duplicado que quebra o <img>. */
function qrCodeDataUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:image\//i.test(s)) {
    const lower = s.toLowerCase();
    const n = lower.split("base64,").length - 1;
    if (n > 1) {
      const idx = s.lastIndexOf("base64,");
      const payload = s.slice(idx + "base64,".length);
      return `data:image/png;base64,${payload}`;
    }
    return s;
  }
  if (s.startsWith("/9j")) return `data:image/jpeg;base64,${s}`;
  if (s.startsWith("iVBOR")) return `data:image/png;base64,${s}`;
  return `data:image/png;base64,${s}`;
}

function isConnectedStatus(status: string | null | undefined): boolean {
  const x = (status ?? "").toLowerCase();
  return x === "connected" || x === "open";
}

function statusLabel(status: string | null | undefined): { text: string; cls: string } {
  const s = (status ?? "").toLowerCase();
  if (!s || s === "not_configured") return { text: "Não configurado", cls: styles.badgeMuted };
  if (s === "connected" || s === "open")
    return { text: s === "open" ? "Conectado (aberto)" : "Conectado", cls: styles.badgeOk };
  if (s === "connecting") return { text: "Aguardando QR", cls: styles.badgeWarn };
  if (s === "close" || s === "closed") return { text: "Desconectado", cls: styles.badgeErr };
  return { text: status ?? "—", cls: styles.badgeMuted };
}

function jobStatusPt(s: string): string {
  const m: Record<string, string> = {
    pending: "Pendente",
    queued: "Na fila",
    sending: "Enviando",
    sent: "Enviado",
    delivered: "Entregue",
    read: "Lido",
    failed: "Falhou",
  };
  return m[s] ?? s;
}

type WaTab = "conexao" | "agenda" | "preventiva" | "campanhas";

export function WhatsappIntegrationPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const role = ctx?.user.role;
  const isAdmin = role === "admin";
  const canConfigure = isAdmin;
  const canViewMessaging = role === "admin" || role === "receptionist";

  const [activeTab, setActiveTab] = useState<WaTab>("conexao");
  const [connection, setConnection] = useState<WhatsappTenantConnection | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<WhatsappWebhookInfo | null>(null);
  const [msgSettings, setMsgSettings] = useState<WhatsappAppointmentMessageSettings | null>(null);
  const [rules, setRules] = useState<WhatsappReminderRules | null>(null);
  const [jobs, setJobs] = useState<WhatsappMessageJob[]>([]);
  const [moduleStatus, setModuleStatus] = useState<WhatsappModuleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [instanceOverride, setInstanceOverride] = useState("");

  const [qrModalOpen, setQrModalOpen] = useState(false);
  /** Mantém o último QR retornado pelo setup — o GET /connection não devolve base64 de novo. */
  const [qrRawForModal, setQrRawForModal] = useState<string | null>(null);
  const [pairingForModal, setPairingForModal] = useState<string | null>(null);

  const [preventiveSettings, setPreventiveSettings] = useState<PreventiveSettings | null>(null);
  const [preventiveLeads, setPreventiveLeads] = useState<PreventiveLead[]>([]);
  const [preventiveSettingsDraft, setPreventiveSettingsDraft] = useState({
    preventive_technical_problem_hint: "",
    preventive_button_more_text: "",
    preventive_button_schedule_text: "",
    preventive_auto_remind_days_before: 0,
  });
  const [showHistory, setShowHistory] = useState(false);
  const [syncingWebhook, setSyncingWebhook] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const mod = await getWhatsappModuleStatus();
      setModuleStatus(mod);
      if (!mod.entitlement_active) {
        setConnection(null);
        setMsgSettings(null);
        setRules(null);
        setJobs([]);
        return;
      }
      const conn = await getWhatsappConnection();
      setConnection(conn);
      if (canViewMessaging) {
        const [ms, rs, jb, wh, prevSt, prevLeads] = await Promise.all([
          getWhatsappMessageSettings(),
          getWhatsappReminderRules(),
          listWhatsappJobs({ limit: 15 }),
          getWhatsappWebhookInfo(),
          fetchPreventiveSettings(),
          listPreventiveLeads(80),
        ]);
        setMsgSettings(ms);
        setRules(rs);
        setWebhookInfo(wh);
        setPreventiveSettings(prevSt);
        setPreventiveLeads(prevLeads);
        setPreventiveSettingsDraft({
          preventive_technical_problem_hint: prevSt.preventive_technical_problem_hint ?? "",
          preventive_button_more_text: prevSt.preventive_button_more_text,
          preventive_button_schedule_text: prevSt.preventive_button_schedule_text,
          preventive_auto_remind_days_before: prevSt.preventive_auto_remind_days_before ?? 0,
        });
        setJobs(jb);
      } else {
        setMsgSettings(null);
        setRules(null);
        setWebhookInfo(null);
        setPreventiveSettings(null);
        setPreventiveLeads([]);
        setJobs([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setConnection(null);
      setModuleStatus(null);
    } finally {
      setLoading(false);
    }
  }, [canViewMessaging]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!qrModalOpen || !connection?.instance_name) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const conn = await getWhatsappConnection();
          setConnection((prev) => ({
            ...conn,
            qrcode_base64: conn.qrcode_base64 ?? prev?.qrcode_base64 ?? null,
          }));
          if (isConnectedStatus(conn.status)) {
            setQrModalOpen(false);
            setQrRawForModal(null);
            setPairingForModal(null);
            toast.success("WhatsApp conectado com sucesso.");
            await refresh();
          }
        } catch {
          /* ignorar falhas pontuais do poll */
        }
      })();
    }, 2800);
    return () => clearInterval(id);
  }, [qrModalOpen, connection?.instance_name, refresh]);

  useEffect(() => {
    if (!qrModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQrModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrModalOpen]);

  async function onConnect() {
    if (!canConfigure) return;
    setBusy(true);
    setErr("");
    try {
      const name = instanceOverride.trim() || undefined;
      const next = await setupWhatsappConnection(name || null);
      setConnection(next);
      const raw = next.qrcode_base64?.trim() || null;
      if (raw && !isConnectedStatus(next.status)) {
        setQrRawForModal(raw);
        setPairingForModal(next.pairing_code?.trim() || null);
        setQrModalOpen(true);
      } else {
        setPairingForModal(next.pairing_code?.trim() || null);
        if (isConnectedStatus(next.status)) {
          setQrModalOpen(false);
          setQrRawForModal(null);
          setPairingForModal(null);
          toast.success("WhatsApp conectado com sucesso.");
        } else if (next.pairing_code?.trim() && !isConnectedStatus(next.status)) {
          setQrModalOpen(true);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao conectar.");
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    if (!canConfigure || !window.confirm("Desconectar WhatsApp deste workspace na Evolution?")) return;
    setBusy(true);
    setErr("");
    try {
      const next = await disconnectWhatsapp();
      setConnection(next);
      setQrModalOpen(false);
      setQrRawForModal(null);
      setPairingForModal(null);
      toast.success("WhatsApp desconectado.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao desconectar.");
    } finally {
      setBusy(false);
    }
  }

  async function copyWebhookUrl(url: string | null | undefined) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copiada para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar a URL do webhook.");
    }
  }

  async function onSyncEvolutionWebhook() {
    if (!canConfigure) return;
    setSyncingWebhook(true);
    setErr("");
    try {
      await syncWhatsappWebhookEvolutionRouter();
      const wh = await getWhatsappWebhookInfo();
      setWebhookInfo(wh);
      toast.success("Webhook sincronizado na Evolution.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao sincronizar webhook na Evolution.");
    } finally {
      setSyncingWebhook(false);
    }
  }

  async function onToggleAutomation(enabled: boolean) {
    if (!canConfigure || !webhookInfo) return;
    if (enabled && !webhookInfo.automation_allowed_by_plan) return;
    setSavingAutomation(true);
    setErr("");
    try {
      const next = await patchWhatsappAutomationSettings(enabled);
      setWebhookInfo((prev) =>
        prev
          ? {
              ...prev,
              automation_enabled: next.automation_enabled,
              automation_allowed_by_plan: next.automation_allowed_by_plan,
              automation_active: next.automation_active,
              plan_key: next.plan_key,
              plan_label: next.plan_label,
            }
          : prev,
      );
      if (enabled) {
        const wh = await getWhatsappWebhookInfo();
        setWebhookInfo(wh);
      }
      toast.success(enabled ? "Automação WhatsApp ativada." : "Automação WhatsApp desativada.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao atualizar automação WhatsApp.");
    } finally {
      setSavingAutomation(false);
    }
  }

  const st = statusLabel(connection?.status);
  const isLinked =
    connection &&
    connection.instance_name &&
    ["connected", "open"].includes((connection.status ?? "").toLowerCase());
  const qrSrc = qrCodeDataUrl(qrRawForModal || connection?.qrcode_base64);
  const showQrAgain =
    canConfigure &&
    Boolean(qrSrc || pairingForModal) &&
    !isLinked &&
    !qrModalOpen &&
    (connection?.status ?? "").toLowerCase() === "connecting";

  if (!loading && moduleStatus && !moduleStatus.entitlement_active) {
    return (
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>Integrações</p>
            <h1 className={styles.heroTitle}>WhatsApp (Evolution)</h1>
            <p className={styles.heroLead}>
              A conexão e as mensagens automáticas ficam disponíveis após liberação do módulo WhatsApp na Loja.
            </p>
            {!isHiddenAppModule("marketplace") ? (
              <p className={styles.heroLead} style={{ marginTop: "0.75rem" }}>
                <Link to="/app/marketplace" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)" }}>
                  Abrir Loja de integrações
                </Link>
              </p>
            ) : null}
          </div>
        </header>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Acesso bloqueado</h2>
          <p className={styles.hint}>
            {moduleStatus.blocked_reason ?? "Módulo WhatsApp não contratado ou pendente de aprovação."}
            {moduleStatus.entitlement_status ? ` Status atual: ${moduleStatus.entitlement_status}.` : ""}
          </p>
        </section>
      </div>
    );
  }

  const historySection =
    canViewMessaging && showHistory ? (
      <section className={styles.card} style={{ marginTop: "1.25rem" }}>
        <h2 className={styles.cardTitle}>Histórico de envios</h2>
        <p className={styles.hint}>Últimas mensagens WhatsApp enviadas por este workspace.</p>
        {jobs.length === 0 ? (
          <p className={styles.hint}>Nenhum envio registrado ainda.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Destino</th>
                  <th>Status</th>
                  <th>Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const scheduled = whatsappJobShowsScheduledBadge(j);
                  const whenLabel = scheduled && j.scheduled_for
                    ? formatWhatsappScheduledAt(j.scheduled_for)
                    : new Date(j.created_at).toLocaleString("pt-BR");
                  return (
                    <tr key={j.id}>
                      <td className={styles.mono}>{whenLabel}</td>
                      <td>{j.recipient_whatsapp}</td>
                      <td>
                        <div className={dashStyles.statusCellStack}>
                          <span>{jobStatusPt(j.status)}</span>
                          {scheduled && j.scheduled_for ? (
                            <span
                              className={`${dashStyles.badge} ${dashStyles.badgeInfo}`}
                              title={`Disparo programado para ${formatWhatsappScheduledAt(j.scheduled_for)}`}
                            >
                              Agendado · {formatWhatsappScheduledAt(j.scheduled_for)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {j.rendered_message.slice(0, 120)}
                        {j.rendered_message.length > 120 ? "…" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    ) : null;

  return (
    <div className={styles.page}>
      <ToastHost />
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Integrações</p>
          <h1 className={styles.heroTitle}>WhatsApp (Evolution)</h1>
          <p className={styles.heroLead}>
            Conecte o número da empresa para lembretes e mensagens automáticas. Administradores gerenciam a conexão e as
            regras; recepção pode acompanhar o status e o histórico de envios.
          </p>
          <p className={styles.heroLead} style={{ marginTop: "0.75rem" }}>
            <Link to="/app" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)" }}>
              Voltar ao painel
            </Link>
            {!isHiddenAppModule("whatsappCampanhas") ? (
              <Link to="/app/integrations/whatsapp-campanhas" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)", marginLeft: "0.5rem" }}>
                Campanhas WhatsApp
              </Link>
            ) : null}
            {!isHiddenAppModule("whatsappBot") ? (
              <Link to="/app/integrations/whatsapp-bot" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)", marginLeft: "0.5rem" }}>
                Bot WhatsApp
              </Link>
            ) : null}
          </p>
        </div>
      </header>

      {err ? <div className={styles.errBox}>{err}</div> : null}

      {loading ? (
        <p className={styles.hint}>Carregando…</p>
      ) : (
        <>
          {canViewMessaging ? (
            <>
              <div className={styles.tabs} role="tablist" aria-label="Configurações WhatsApp">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "conexao"}
                  className={`${styles.tab} ${activeTab === "conexao" ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab("conexao")}
                >
                  Conexão
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "agenda"}
                  className={`${styles.tab} ${activeTab === "agenda" ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab("agenda")}
                >
                  Agenda
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "preventiva"}
                  className={`${styles.tab} ${activeTab === "preventiva" ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab("preventiva")}
                >
                  Gestão preventiva
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "campanhas"}
                  className={`${styles.tab} ${activeTab === "campanhas" ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab("campanhas")}
                >
                  Campanhas
                </button>
              </div>
              <div className={styles.historyBar}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  aria-expanded={showHistory}
                  onClick={() => setShowHistory((v) => !v)}
                >
                  {showHistory ? "Ocultar histórico de envios" : "Ver histórico de envios"}
                </button>
                {jobs.length > 0 ? (
                  <span className={styles.hint} style={{ margin: 0 }}>
                    {jobs.length} mensagem{jobs.length === 1 ? "" : "ens"} recente{jobs.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}

          {activeTab === "conexao" || !canViewMessaging ? (
            <section className={styles.card} style={{ marginBottom: "1.25rem" }}>
              <h2 className={styles.cardTitle}>Conexão</h2>
              <div className={styles.row}>
                <span className={`${styles.badge} ${st.cls}`}>{st.text}</span>
                {connection?.instance_name ? (
                  <span className={styles.mono}>Instância: {connection.instance_name}</span>
                ) : null}
              </div>
              {isLinked ? (
                <p className={styles.hint}>
                  Sessão ativa. Não é necessário escanear QR novamente enquanto o número permanecer conectado na Evolution.
                </p>
              ) : null}
              {!isLinked && (connection?.status ?? "").toLowerCase() === "connecting" ? (
                <p className={styles.hint}>
                  O código QR abre em uma janela ao clicar em &quot;Conectar / atualizar QR&quot;. Assim que o WhatsApp
                  conectar, a janela fecha sozinha.
                </p>
              ) : null}
              {showQrAgain ? (
                <div className={styles.actions} style={{ marginTop: "0.5rem" }}>
                  <button type="button" className={styles.btnGhost} onClick={() => setQrModalOpen(true)}>
                    Mostrar QR novamente
                  </button>
                </div>
              ) : null}
              {!isLinked &&
              (connection?.status ?? "").toLowerCase() === "connecting" &&
              !qrSrc &&
              !pairingForModal ? (
                <p className={styles.hint}>
                  Aguardando dados do QR. Clique em &quot;Conectar / atualizar QR&quot; ou atualize o status.
                </p>
              ) : null}

              {canConfigure ? (
                <>
                  <label className={styles.fieldLabel} htmlFor="wa-instance">
                    Nome da instância (opcional)
                  </label>
                  <input
                    id="wa-instance"
                    className={styles.textInput}
                    value={instanceOverride}
                    onChange={(e) => setInstanceOverride(e.target.value)}
                    placeholder="Deixe vazio para usar o padrão do workspace"
                    autoComplete="off"
                  />
                  <div className={styles.actions}>
                    <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void onConnect()}>
                      {busy ? "Processando…" : "Conectar / atualizar QR"}
                    </button>
                    <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void refresh()}>
                      Atualizar status
                    </button>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={busy || !connection?.instance_name}
                      onClick={() => void onDisconnect()}
                    >
                      Desconectar
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.actions}>
                  <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void refresh()}>
                    Atualizar status
                  </button>
                </div>
              )}

              {canViewMessaging && webhookInfo ? (
                <div className={styles.webhookBox}>
                  <h3 className={styles.subsectionTitle}>Automação WhatsApp</h3>
                  <p className={styles.hint}>
                    Quando ativa, o sistema envia lembretes automáticos (agenda e preventiva) e processa respostas
                    dos clientes (confirmar, remarcar, MAIS, AGENDAR). Com desativada, você ainda pode enviar mensagens
                    manualmente pela Agenda ou Gestão preventiva. Plano atual: {webhookInfo.plan_label}.
                  </p>
                  <div className={styles.row} style={{ marginTop: "0.75rem", gap: "0.75rem", flexWrap: "wrap" }}>
                    <span
                      className={`${styles.badge} ${
                        webhookInfo.automation_active
                          ? styles.badgeOk
                          : webhookInfo.automation_enabled
                            ? styles.badgeWarn
                            : styles.badgeMuted
                      }`}
                    >
                      {webhookInfo.automation_active
                        ? "Automação ativa"
                        : webhookInfo.automation_enabled
                          ? "Ativada, bloqueada pelo plano"
                          : "Automação desativada (manual)"}
                    </span>
                    {canConfigure ? (
                      <label className={styles.checkRow} style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={webhookInfo.automation_enabled}
                          disabled={
                            savingAutomation || (!webhookInfo.automation_allowed_by_plan && !webhookInfo.automation_enabled)
                          }
                          onChange={(e) => void onToggleAutomation(e.target.checked)}
                        />
                        {savingAutomation ? "Salvando…" : "Ativar lembretes e respostas automáticas"}
                      </label>
                    ) : null}
                  </div>
                  {!webhookInfo.automation_allowed_by_plan ? (
                    <p className={styles.hint} style={{ marginTop: "0.5rem" }}>
                      Seu plano ({webhookInfo.plan_label}) permite apenas envios manuais. Faça upgrade para Professional
                      ou Enterprise para ativar a automação.
                    </p>
                  ) : null}
                  {webhookInfo.automation_allowed_by_plan && !webhookInfo.automation_enabled ? (
                    <p className={styles.hint} style={{ marginTop: "0.5rem" }}>
                      Ative a automação acima para registrar o webhook na Evolution e processar mensagens automaticamente.
                    </p>
                  ) : null}

                  <div className={styles.sectionDivider} style={{ marginTop: "1.25rem" }}>
                    <h3 className={styles.subsectionTitle}>Webhooks Evolution (código separado)</h3>
                  </div>
                  <p className={styles.hint}>
                    Cada fluxo tem endpoint e handler próprios — não misture agenda com preventiva na mesma URL,
                    exceto pelo roteador abaixo. A Evolution aceita <strong>uma URL por instância</strong>: use o
                    roteador <code>/webhook/evolution</code> (recomendado) ou aponte manualmente para{" "}
                    <code>/webhook/agenda</code> ou <code>/webhook/preventiva</code> se tiver outro encaminhador.
                    Eventos sugeridos: {webhookInfo.suggested_events.join(", ")}.
                  </p>
                  <div className={styles.row} style={{ marginTop: "0.5rem" }}>
                    <span className={`${styles.badge} ${webhookInfo.webhook_enabled ? styles.badgeOk : styles.badgeWarn}`}>
                      Webhook {webhookInfo.webhook_enabled ? "ativo no servidor" : "desativado no servidor"}
                    </span>
                  </div>
                  {webhookInfo.webhook_evolution_router_url_with_tenant ? (
                    <>
                      <label className={styles.fieldLabel} htmlFor="wa-webhook-router-url">
                        URL roteador Evolution (recomendada)
                      </label>
                      <input
                        id="wa-webhook-router-url"
                        className={styles.textInput}
                        readOnly
                        value={webhookInfo.webhook_evolution_router_url_with_tenant}
                      />
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => void copyWebhookUrl(webhookInfo.webhook_evolution_router_url_with_tenant)}
                        >
                          Copiar URL
                        </button>
                        {canConfigure ? (
                          <button
                            type="button"
                            className={styles.btnPrimary}
                            disabled={syncingWebhook}
                            onClick={() => void onSyncEvolutionWebhook()}
                          >
                            {syncingWebhook ? "Sincronizando…" : "Sincronizar na Evolution"}
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className={styles.hint}>
                      Defina <code>API_PUBLIC_BASE_URL</code> no backend para exibir a URL do webhook aqui.
                    </p>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}

          {activeTab === "agenda" && canViewMessaging ? (
            <WhatsappAgendaTab
              canConfigure={canConfigure}
              loading={loading}
              automationActive={webhookInfo?.automation_active !== false}
              msgSettings={msgSettings}
              rules={rules}
              onSaved={(ms, rs) => {
                setMsgSettings(ms);
                setRules(rs);
              }}
            />
          ) : null}

          {activeTab === "preventiva" && canViewMessaging ? (
            <WhatsappPreventiveTab
              canConfigure={canConfigure}
              loading={loading}
              automationActive={webhookInfo?.automation_active !== false}
              settings={preventiveSettings}
              leads={preventiveLeads}
              settingsDraft={preventiveSettingsDraft}
              onSettingsDraftChange={(patch) => setPreventiveSettingsDraft((s) => ({ ...s, ...patch }))}
              onSettingsSaved={(next) => {
                setPreventiveSettings(next);
                setPreventiveSettingsDraft({
                  preventive_technical_problem_hint: next.preventive_technical_problem_hint ?? "",
                  preventive_button_more_text: next.preventive_button_more_text,
                  preventive_button_schedule_text: next.preventive_button_schedule_text,
                  preventive_auto_remind_days_before: next.preventive_auto_remind_days_before ?? 0,
                });
              }}
            />
          ) : null}

          {activeTab === "campanhas" && canViewMessaging ? (
            <WhatsappCampaignsTab canConfigure={canConfigure} />
          ) : null}

          {historySection}
        </>
      )}

      {qrModalOpen ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wa-qr-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQrModalOpen(false);
          }}
        >
          <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.modalClose}
              aria-label="Fechar"
              onClick={() => setQrModalOpen(false)}
            >
              ×
            </button>
            <h2 id="wa-qr-modal-title" className={styles.modalTitle}>
              Conectar WhatsApp
            </h2>
            <div className={styles.modalBody}>
              {qrSrc ? (
                <div className={styles.modalQr}>
                  <img src={qrSrc} alt="QR Code para conectar o WhatsApp" width={280} height={280} />
                </div>
              ) : pairingForModal ? (
                <p className={styles.modalHint}>Use o código de pareamento abaixo neste aparelho.</p>
              ) : (
                <p className={styles.modalHint}>
                  Gerando QR… Se nada aparecer, feche e clique em &quot;Conectar / atualizar QR&quot; de novo.
                </p>
              )}
              <p className={styles.modalHint}>
                No celular: WhatsApp → menu (⋮) → Aparelhos conectados → Conectar um aparelho → escaneie o código.
              </p>
              {pairingForModal ? (
                <p className={styles.modalPairing}>
                  Código de pareamento: <span className={styles.mono}>{pairingForModal}</span>
                </p>
              ) : null}
              <p className={styles.modalHint} style={{ marginTop: "0.75rem", fontSize: "0.78rem" }}>
                Esta janela fecha automaticamente quando a conexão for detectada.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
