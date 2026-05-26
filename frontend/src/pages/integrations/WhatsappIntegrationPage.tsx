import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  fetchPreventiveSettings,
  listPreventiveLeads,
  patchPreventiveSettings,
  patchPreventiveTemplateSettings,
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
  patchWhatsappMessageSettings,
  patchWhatsappReminderRules,
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
import { PreventiveTemplateSettings } from "../../components/v0-ui/preventive";
import type { TemplateData } from "../../components/v0-ui/preventive/PreventiveTemplateSettings";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
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

type WaTab = "conexao" | "agenda" | "preventiva";

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

  const [tplBody, setTplBody] = useState("");
  const [kwConfirm, setKwConfirm] = useState("");
  const [kwReschedule, setKwReschedule] = useState("");
  const [replyConfirm, setReplyConfirm] = useState("");
  const [replyReschedule, setReplyReschedule] = useState("");
  const [replyCancel, setReplyCancel] = useState("");
  const [savingMsg, setSavingMsg] = useState(false);

  const [r15, setR15] = useState(false);
  const [r30, setR30] = useState(false);
  const [r1h, setR1h] = useState(false);
  const [r1d, setR1d] = useState(false);
  const [rCustomOn, setRCustomOn] = useState(false);
  const [rCustomMin, setRCustomMin] = useState<number | "">("");
  const [savingRules, setSavingRules] = useState(false);
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
  const [savingPreventiveSettings, setSavingPreventiveSettings] = useState(false);
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
        setTplBody(ms.template_body);
        setKwConfirm(ms.confirm_keyword);
        setKwReschedule(ms.reschedule_keyword);
        setReplyConfirm(ms.confirm_reply);
        setReplyReschedule(ms.reschedule_reply);
        setReplyCancel(ms.cancel_reply);
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
        setR15(rs.offset_15m);
        setR30(rs.offset_30m);
        setR1h(rs.offset_1h);
        setR1d(rs.offset_1d);
        setRCustomOn(rs.custom_enabled);
        setRCustomMin(rs.custom_minutes ?? "");
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

  async function onSaveAgendaSettings() {
    if (!canConfigure) return;
    setSavingMsg(true);
    setSavingRules(true);
    setErr("");
    try {
      const minutes =
        rCustomOn && rCustomMin !== "" && typeof rCustomMin === "number" && rCustomMin > 0 ? rCustomMin : null;
      const [ms, rs] = await Promise.all([
        patchWhatsappMessageSettings({
          template_body: tplBody.trim(),
          confirm_keyword: kwConfirm.trim(),
          reschedule_keyword: kwReschedule.trim(),
          confirm_reply: replyConfirm.trim(),
          reschedule_reply: replyReschedule.trim(),
          cancel_reply: replyCancel.trim(),
        }),
        patchWhatsappReminderRules({
          offset_15m: r15,
          offset_30m: r30,
          offset_1h: r1h,
          offset_1d: r1d,
          custom_enabled: rCustomOn,
          custom_minutes: minutes,
        }),
      ]);
      setMsgSettings(ms);
      setRules(rs);
      toast.success("Configurações da agenda salvas com sucesso.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar configurações da agenda.");
    } finally {
      setSavingMsg(false);
      setSavingRules(false);
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

  const preventiveTemplateInitialData = useMemo((): TemplateData | undefined => {
    if (!preventiveSettings) return undefined;
    const fallback =
      preventiveSettings.default_message_template?.trim() ||
      "Olá, {cliente}! Notamos que faz {intervalo} desde a última manutenção do seu {equipamento} ({marca_modelo}). Vamos agendar a próxima preventiva?";
    return {
      messageBody: preventiveSettings.preventive_message_template?.trim() || fallback,
      imageUrl: preventiveSettings.preventive_image_url ?? preventiveSettings.preventive_promo_image_url ?? "",
    };
  }, [preventiveSettings]);

  async function onSavePreventiveTemplate(data: TemplateData) {
    try {
      const next = await patchPreventiveTemplateSettings({
        preventive_message_template: data.messageBody.trim() || null,
        preventive_image_url: data.imageUrl.trim() || null,
      });
      setPreventiveSettings(next);
      toast.success("Template de alerta salvo com sucesso.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o template.");
      throw e;
    }
  }

  function onRestorePreventiveTemplateDefault() {
    const fallback =
      preventiveSettings?.default_message_template?.trim() ||
      "Olá, {cliente}! Notamos que faz {intervalo} desde a última manutenção do seu {equipamento} ({marca_modelo}). Vamos agendar a próxima preventiva?";
    void onSavePreventiveTemplate({ messageBody: fallback, imageUrl: "" }).catch(() => undefined);
  }

  async function onSavePreventiveSettings() {
    if (!canConfigure) return;
    setSavingPreventiveSettings(true);
    setErr("");
    try {
      const next = await patchPreventiveSettings({
        preventive_technical_problem_hint: preventiveSettingsDraft.preventive_technical_problem_hint.trim() || null,
        preventive_button_more_text: preventiveSettingsDraft.preventive_button_more_text.trim() || undefined,
        preventive_button_schedule_text: preventiveSettingsDraft.preventive_button_schedule_text.trim() || undefined,
        preventive_auto_remind_days_before: Math.min(
          90,
          Math.max(0, Math.floor(Number(preventiveSettingsDraft.preventive_auto_remind_days_before) || 0)),
        ),
      });
      setPreventiveSettings(next);
      toast.success("Configurações de preventiva salvas com sucesso.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar configurações preventiva.");
    } finally {
      setSavingPreventiveSettings(false);
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
            <p className={styles.heroLead} style={{ marginTop: "0.75rem" }}>
              <Link to="/app/marketplace" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)" }}>
                Abrir Loja de integrações
              </Link>
            </p>
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
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className={styles.mono}>{new Date(j.created_at).toLocaleString()}</td>
                    <td>{j.recipient_whatsapp}</td>
                    <td>{jobStatusPt(j.status)}</td>
                    <td>
                      {j.rendered_message.slice(0, 120)}
                      {j.rendered_message.length > 120 ? "…" : ""}
                    </td>
                  </tr>
                ))}
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
            <Link to="/app/integrations/whatsapp-campanhas" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)", marginLeft: "0.5rem" }}>
              Campanhas WhatsApp
            </Link>
            <Link to="/app/integrations/whatsapp-bot" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)", marginLeft: "0.5rem" }}>
              Bot WhatsApp
            </Link>
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

          {activeTab === "agenda" && canViewMessaging && msgSettings && rules ? (
            <>
              {webhookInfo && !webhookInfo.automation_active ? (
                <div className={styles.errBox} style={{ marginBottom: "1rem" }}>
                  Automação WhatsApp desativada — lembretes automáticos e respostas (confirmar/remarcar) não serão
                  processados. Envios manuais continuam disponíveis. Ative em Conexão → Automação WhatsApp.
                </div>
              ) : null}
              <section className={styles.card} style={{ marginBottom: "1.25rem" }}>
                <h2 className={styles.cardTitle}>Lembretes automáticos</h2>
                <p className={styles.hint}>
                  Escolha quanto tempo antes do horário agendado o sistema envia o lembrete via WhatsApp. Ativos agora
                  (minutos): {rules.active_offsets_minutes.length ? rules.active_offsets_minutes.join(", ") : "—"}
                </p>
                <div className={styles.checkGrid}>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={r15} onChange={(e) => setR15(e.target.checked)} disabled={!canConfigure} />
                    15 minutos antes
                  </label>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={r30} onChange={(e) => setR30(e.target.checked)} disabled={!canConfigure} />
                    30 minutos antes
                  </label>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={r1h} onChange={(e) => setR1h(e.target.checked)} disabled={!canConfigure} />
                    1 hora antes
                  </label>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={r1d} onChange={(e) => setR1d(e.target.checked)} disabled={!canConfigure} />
                    1 dia antes
                  </label>
                  <label className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={rCustomOn}
                      onChange={(e) => setRCustomOn(e.target.checked)}
                      disabled={!canConfigure}
                    />
                    Personalizado (minutos antes)
                  </label>
                </div>
                {rCustomOn ? (
                  <>
                    <label className={styles.fieldLabel} htmlFor="wa-custom-min">
                      Minutos personalizados
                    </label>
                    <input
                      id="wa-custom-min"
                      type="number"
                      min={1}
                      className={styles.textInput}
                      value={rCustomMin}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRCustomMin(v === "" ? "" : Number(v));
                      }}
                      disabled={!canConfigure}
                    />
                  </>
                ) : null}

                <div className={styles.sectionDivider}>
                  <h3 className={styles.subsectionTitle}>Mensagem de lembrete (envio)</h3>
                  <p className={styles.hint}>
                    Variáveis permitidas: {msgSettings.allowed_variables.join(", ")}
                  </p>
                </div>
                <label className={styles.fieldLabel} htmlFor="wa-tpl">
                  Corpo do template
                </label>
                <textarea
                  id="wa-tpl"
                  className={styles.textarea}
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  disabled={!canConfigure}
                />
                <label className={styles.fieldLabel} htmlFor="wa-kw1">
                  Palavra para confirmar
                </label>
                <input
                  id="wa-kw1"
                  className={styles.textInput}
                  value={kwConfirm}
                  onChange={(e) => setKwConfirm(e.target.value)}
                  disabled={!canConfigure}
                />
                <label className={styles.fieldLabel} htmlFor="wa-kw2">
                  Palavra para reagendar
                </label>
                <input
                  id="wa-kw2"
                  className={styles.textInput}
                  value={kwReschedule}
                  onChange={(e) => setKwReschedule(e.target.value)}
                  disabled={!canConfigure}
                />
                <p className={styles.hint}>
                  O sistema também reconhece respostas como SIM, OK, REAGENDAR e CANCELAR (este último não aparece no
                  template).
                </p>

                <div className={styles.sectionDivider}>
                  <h3 className={styles.subsectionTitle}>Mensagens de resposta (agradecimento)</h3>
                  <p className={styles.hint}>
                    Enviadas automaticamente quando o cliente confirma, reagenda ou cancela pelo WhatsApp.
                  </p>
                </div>
                <label className={styles.fieldLabel} htmlFor="wa-reply-confirm">
                  Após confirmar
                </label>
                <textarea
                  id="wa-reply-confirm"
                  className={styles.textarea}
                  style={{ minHeight: "4.5rem" }}
                  value={replyConfirm}
                  onChange={(e) => setReplyConfirm(e.target.value)}
                  disabled={!canConfigure}
                />
                <label className={styles.fieldLabel} htmlFor="wa-reply-reschedule">
                  Após reagendar (variável: {"{data_hora}"})
                </label>
                <textarea
                  id="wa-reply-reschedule"
                  className={styles.textarea}
                  style={{ minHeight: "4.5rem" }}
                  value={replyReschedule}
                  onChange={(e) => setReplyReschedule(e.target.value)}
                  disabled={!canConfigure}
                />
                <label className={styles.fieldLabel} htmlFor="wa-reply-cancel">
                  Após cancelar
                </label>
                <textarea
                  id="wa-reply-cancel"
                  className={styles.textarea}
                  style={{ minHeight: "4.5rem" }}
                  value={replyCancel}
                  onChange={(e) => setReplyCancel(e.target.value)}
                  disabled={!canConfigure}
                />

                {canConfigure ? (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={savingMsg || savingRules}
                      onClick={() => void onSaveAgendaSettings()}
                    >
                      {savingMsg || savingRules ? "Salvando…" : "Salvar configurações da agenda"}
                    </button>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          {activeTab === "preventiva" && canViewMessaging && preventiveSettings ? (
            <>
              {webhookInfo && !webhookInfo.automation_active ? (
                <div className={styles.errBox} style={{ marginBottom: "1rem" }}>
                  Automação WhatsApp desativada — lembretes automáticos de preventiva e respostas MAIS/AGENDAR não
                  serão processados. Envios manuais continuam disponíveis. Ative em Conexão → Automação WhatsApp.
                </div>
              ) : null}
              <section className={styles.card} style={{ marginBottom: "1.25rem" }}>
                <h2 className={styles.cardTitle}>Webhook preventiva</h2>
                <p className={styles.hint}>
                  Respostas aos botões &quot;Quero saber mais&quot; e &quot;Agendar&quot; das campanhas de manutenção
                  preventiva. Na prática, use o roteador Evolution na aba Conexão — ele encaminha agenda e preventiva.
                </p>
                {webhookInfo?.webhook_preventiva_url_with_tenant ? (
                  <>
                    <label className={styles.fieldLabel} htmlFor="wa-webhook-preventiva-url">
                      URL webhook preventiva (com tenant)
                    </label>
                    <input
                      id="wa-webhook-preventiva-url"
                      className={styles.textInput}
                      readOnly
                      value={webhookInfo.webhook_preventiva_url_with_tenant}
                    />
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => void copyWebhookUrl(webhookInfo.webhook_preventiva_url_with_tenant)}
                      >
                        Copiar URL
                      </button>
                    </div>
                  </>
                ) : null}
                <p className={styles.hint} style={{ marginTop: "0.75rem" }}>
                  <Link to="/app/preventive-maintenance">Abrir gestão preventiva</Link> para enviar lembretes e
                  acompanhar contratos.
                </p>
              </section>

              {canConfigure && preventiveTemplateInitialData ? (
                <section className={styles.card} style={{ marginBottom: "1.25rem" }}>
                  <h2 className={styles.cardTitle}>Template de mensagem</h2>
                  <p className={styles.hint}>
                    Texto e imagem enviados nos alertas de vencimento de manutenção preventiva.
                  </p>
                  <PreventiveTemplateSettings
                    initialData={preventiveTemplateInitialData}
                    isLoading={loading}
                    onSave={onSavePreventiveTemplate}
                    onRestoreDefault={onRestorePreventiveTemplateDefault}
                  />
                </section>
              ) : null}

              {canConfigure ? (
                <section className={styles.card} style={{ marginBottom: "1.25rem" }}>
                  <h2 className={styles.cardTitle}>Botões e lembrete automático</h2>
                  <p className={styles.hint}>
                    Rótulos dos botões interativos e antecedência do lembrete automático (fuso da empresa).
                  </p>
                  <label className={styles.fieldLabel} htmlFor="wa-prev-hint">
                    Problema técnico (tag {"{problema}"} em templates legados)
                  </label>
                  <textarea
                    id="wa-prev-hint"
                    className={styles.textarea}
                    value={preventiveSettingsDraft.preventive_technical_problem_hint}
                    onChange={(e) =>
                      setPreventiveSettingsDraft((s) => ({
                        ...s,
                        preventive_technical_problem_hint: e.target.value,
                      }))
                    }
                    placeholder="Ex.: perdas de eficiência energética e PMOC"
                  />
                  <label className={styles.fieldLabel} htmlFor="wa-prev-btn-more">
                    Rótulo botão &quot;saber mais&quot;
                  </label>
                  <input
                    id="wa-prev-btn-more"
                    className={styles.textInput}
                    value={preventiveSettingsDraft.preventive_button_more_text}
                    onChange={(e) =>
                      setPreventiveSettingsDraft((s) => ({ ...s, preventive_button_more_text: e.target.value }))
                    }
                  />
                  <label className={styles.fieldLabel} htmlFor="wa-prev-btn-schedule">
                    Rótulo botão agendar
                  </label>
                  <input
                    id="wa-prev-btn-schedule"
                    className={styles.textInput}
                    value={preventiveSettingsDraft.preventive_button_schedule_text}
                    onChange={(e) =>
                      setPreventiveSettingsDraft((s) => ({ ...s, preventive_button_schedule_text: e.target.value }))
                    }
                  />
                  <label className={styles.fieldLabel} htmlFor="wa-prev-auto-days">
                    Lembrete automático (dias antes do vencimento; 0 = só no dia)
                  </label>
                  <input
                    id="wa-prev-auto-days"
                    className={styles.textInput}
                    type="number"
                    min={0}
                    max={90}
                    value={preventiveSettingsDraft.preventive_auto_remind_days_before}
                    onChange={(e) =>
                      setPreventiveSettingsDraft((s) => ({
                        ...s,
                        preventive_auto_remind_days_before: Number(e.target.value),
                      }))
                    }
                  />
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={savingPreventiveSettings}
                      onClick={() => void onSavePreventiveSettings()}
                    >
                      {savingPreventiveSettings ? "Salvando…" : "Salvar configurações preventiva"}
                    </button>
                  </div>
                </section>
              ) : null}

              <section className={styles.card}>
                <h2 className={styles.cardTitle}>Interessados (respostas WhatsApp)</h2>
                <p className={styles.hint}>
                  Clientes que responderam aos botões da campanha ou enviaram MAIS / AGENDAR em texto.
                </p>
                {preventiveLeads.length === 0 ? (
                  <p className={styles.hint}>Nenhuma resposta registrada ainda.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Quando</th>
                          <th>Cliente ID</th>
                          <th>Tipo</th>
                          <th>WhatsApp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preventiveLeads.map((l) => (
                          <tr key={l.id}>
                            <td className={styles.mono}>{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                            <td>{l.client_id}</td>
                            <td>{l.interest_kind === "more" ? "Quero saber mais" : "Agendar"}</td>
                            <td>{l.whatsapp_digits}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
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
