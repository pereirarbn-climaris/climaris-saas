import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  createWhatsappBotFlow,
  createWhatsappBotStep,
  clearWhatsappBotSession,
  deleteWhatsappBotFlow,
  deleteWhatsappBotStep,
  getWhatsappBotMetrics,
  getWhatsappBotStatus,
  getWhatsappBotSettings,
  listWhatsappBotEvents,
  listWhatsappBotSessions,
  listWhatsappBotFlows,
  patchWhatsappBotFlow,
  patchWhatsappBotSettings,
  patchWhatsappBotStep,
  seedWhatsappBotDefaultFlows,
  testWhatsappBotMessage,
  type WhatsappBotEvent,
  type WhatsappBotFlow,
  type WhatsappBotMetrics,
  type WhatsappBotSession,
  type WhatsappBotSettings,
  type WhatsappBotStatus,
  type WhatsappBotStep,
  type WhatsappBotTestResponse,
} from "../../api/whatsappBot";
import { WhatsappBotFlowDiagram } from "../../components/whatsapp/WhatsappBotFlowDiagram";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./WhatsappIntegrationPage.module.css";

type StepOptionDraft = {
  key: string;
  label: string;
  message: string;
  next_step_key: string;
  handoff: boolean;
  aliasesText: string;
};

const DEFAULT_OPTION_ROWS: StepOptionDraft[] = [
  {
    key: "1",
    label: "Receber informações",
    message: "Perfeito! Nossa equipe vai continuar por aqui.",
    next_step_key: "",
    handoff: false,
    aliasesText: "",
  },
  {
    key: "2",
    label: "Falar com atendente",
    message: "",
    next_step_key: "",
    handoff: true,
    aliasesText: "atendente, humano",
  },
];

function keywordsToText(items: string[]): string {
  return items.join(", ");
}

function textToKeywords(value: string): string[] {
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} deve ser um objeto JSON.`);
  }
  return parsed as Record<string, unknown>;
}

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function optionRowsFromOptions(options: Array<Record<string, unknown>>): StepOptionDraft[] {
  if (!options.length) return [];
  return options.map((option, index) => {
    const aliases = Array.isArray(option.aliases) ? option.aliases.map(stringFromUnknown).filter(Boolean) : [];
    return {
      key: stringFromUnknown(option.key || option.value) || String(index + 1),
      label: stringFromUnknown(option.label || option.text),
      message: stringFromUnknown(option.message),
      next_step_key: stringFromUnknown(option.next_step_key || option.next),
      handoff: Boolean(option.handoff),
      aliasesText: aliases.join(", "),
    };
  });
}

function buildStepActions(
  prev: Record<string, unknown> | undefined,
  opts: { saveAs: string; builtin: string },
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(prev ?? {}) };
  if (opts.saveAs.trim()) out.save_as = opts.saveAs.trim();
  else delete out.save_as;
  if (opts.builtin.trim()) out.builtin = opts.builtin.trim();
  else delete out.builtin;
  return out;
}

function optionsFromRows(rows: StepOptionDraft[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const key = row.key.trim();
    const label = row.label.trim();
    const message = row.message.trim();
    const next = row.next_step_key.trim();
    const aliases = textToKeywords(row.aliasesText);
    if (!key && !label && !message && !next && !row.handoff && !aliases.length) continue;
    out.push({
      key: key || label,
      label: label || key,
      ...(message ? { message } : {}),
      ...(next ? { next_step_key: next } : {}),
      ...(row.handoff ? { handoff: true } : {}),
      ...(aliases.length ? { aliases } : {}),
    });
  }
  return out;
}

function firstStep(flow: WhatsappBotFlow | null): WhatsappBotStep | null {
  if (!flow?.steps.length) return null;
  return [...flow.steps].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)[0] ?? null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function isPaused(session: WhatsappBotSession): boolean {
  return Boolean(session.paused_until && new Date(session.paused_until).getTime() > Date.now());
}

function contextPreview(context: Record<string, unknown>): string {
  const entries = Object.entries(context)
    .filter(([, value]) => value != null && String(value).trim())
    .slice(0, 4);
  if (!entries.length) return "—";
  return entries.map(([key, value]) => `${key}: ${String(value).slice(0, 60)}`).join(" | ");
}

export function WhatsappBotPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const role = ctx?.user.role;
  const canConfigure = role === "admin";
  const canView = role === "admin" || role === "receptionist";

  const [settings, setSettings] = useState<WhatsappBotSettings | null>(null);
  const [moduleStatus, setModuleStatus] = useState<WhatsappBotStatus | null>(null);
  const [flows, setFlows] = useState<WhatsappBotFlow[]>([]);
  const [sessions, setSessions] = useState<WhatsappBotSession[]>([]);
  const [events, setEvents] = useState<WhatsappBotEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [welcome, setWelcome] = useState("");
  const [fallback, setFallback] = useState("");
  const [handoff, setHandoff] = useState("");
  const [handoffKeywords, setHandoffKeywords] = useState("");
  const [handoffPause, setHandoffPause] = useState<number>(240);

  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null);
  const selectedFlow = useMemo(
    () => flows.find((flow) => flow.id === selectedFlowId) ?? flows[0] ?? null,
    [flows, selectedFlowId],
  );
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const selectedStep = useMemo(
    () => selectedFlow?.steps.find((step) => step.id === editingStepId) ?? firstStep(selectedFlow),
    [selectedFlow, editingStepId],
  );
  const creatingStep = editingStepId === -1;

  const [flowSlug, setFlowSlug] = useState("");
  const [flowName, setFlowName] = useState("");
  const [flowDescription, setFlowDescription] = useState("");
  const [flowEnabled, setFlowEnabled] = useState(true);
  const [triggerType, setTriggerType] = useState("keyword");
  const [triggerKeywords, setTriggerKeywords] = useState("");
  const [systemEvent, setSystemEvent] = useState("");
  const [priority, setPriority] = useState<number>(100);

  const [stepKey, setStepKey] = useState("inicio");
  const [stepKind, setStepKind] = useState("message");
  const [stepMessage, setStepMessage] = useState("");
  const [stepOptionRows, setStepOptionRows] = useState<StepOptionDraft[]>([]);
  const [stepSaveAs, setStepSaveAs] = useState("");
  const [stepBuiltin, setStepBuiltin] = useState("");
  const [stepNext, setStepNext] = useState("");
  const [stepOrder, setStepOrder] = useState<number>(100);

  const [testText, setTestText] = useState("menu");
  const [testPhone, setTestPhone] = useState("");
  const [testContext, setTestContext] = useState("{}");
  const [testResult, setTestResult] = useState<WhatsappBotTestResponse | null>(null);
  const [sessionPhoneQ, setSessionPhoneQ] = useState("");
  const [eventPhoneQ, setEventPhoneQ] = useState("");
  const sessionPhoneQRef = useRef(sessionPhoneQ);
  const eventPhoneQRef = useRef(eventPhoneQ);
  sessionPhoneQRef.current = sessionPhoneQ;
  eventPhoneQRef.current = eventPhoneQ;

  const [metrics, setMetrics] = useState<WhatsappBotMetrics | null>(null);
  const [metricsDays, setMetricsDays] = useState(7);
  const [showFlowDiagram, setShowFlowDiagram] = useState(true);

  const refresh = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setErr("");
    try {
      const status = await getWhatsappBotStatus();
      setModuleStatus(status);
      if (!status.entitlement_active) {
        setSettings(null);
        setFlows([]);
        setSessions([]);
        setEvents([]);
        setMetrics(null);
        return;
      }
      const [st, fl, ss, ev, met] = await Promise.all([
        getWhatsappBotSettings(),
        listWhatsappBotFlows(),
        listWhatsappBotSessions({
          phone_contains: sessionPhoneQRef.current.trim() || undefined,
          limit: 120,
        }),
        listWhatsappBotEvents({
          phone_contains: eventPhoneQRef.current.trim() || undefined,
          limit: 120,
        }),
        getWhatsappBotMetrics(metricsDays),
      ]);
      setSettings(st);
      setFlows(fl);
      setSessions(ss);
      setEvents(ev);
      setMetrics(met);
      setEnabled(st.enabled);
      setWelcome(st.welcome_message);
      setFallback(st.fallback_message);
      setHandoff(st.handoff_message);
      setHandoffKeywords(keywordsToText(st.handoff_keywords));
      setHandoffPause(st.handoff_pause_minutes);
      if (!selectedFlowId && fl.length) setSelectedFlowId(fl[0].id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar bot.");
    } finally {
      setLoading(false);
    }
  }, [canView, selectedFlowId, metricsDays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedFlow) {
      setFlowSlug("");
      setFlowName("");
      setFlowDescription("");
      setFlowEnabled(true);
      setTriggerType("keyword");
      setTriggerKeywords("");
      setSystemEvent("");
      setPriority(100);
      return;
    }
    setFlowSlug(selectedFlow.slug);
    setFlowName(selectedFlow.name);
    setFlowDescription(selectedFlow.description ?? "");
    setFlowEnabled(selectedFlow.enabled);
    setTriggerType(selectedFlow.trigger_type);
    setTriggerKeywords(keywordsToText(selectedFlow.trigger_keywords));
    setSystemEvent(selectedFlow.system_event ?? "");
    setPriority(selectedFlow.priority);
  }, [selectedFlow]);

  useEffect(() => {
    if (editingStepId === -1) return;
    if (!selectedStep) {
      setStepKey("inicio");
      setStepKind("message");
      setStepMessage("");
      setStepOptionRows([]);
      setStepSaveAs("");
      setStepBuiltin("");
      setStepNext("");
      setStepOrder(100);
      return;
    }
    setStepKey(selectedStep.step_key);
    setStepKind(selectedStep.kind);
    setStepMessage(selectedStep.message_template);
    setStepOptionRows(optionRowsFromOptions(selectedStep.options));
    setStepSaveAs(stringFromUnknown(selectedStep.actions.save_as));
    setStepBuiltin(stringFromUnknown(selectedStep.actions.builtin));
    setStepNext(selectedStep.next_step_key ?? "");
    setStepOrder(selectedStep.sort_order);
  }, [selectedStep, editingStepId]);

  async function onSaveSettings() {
    if (!canConfigure) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const next = await patchWhatsappBotSettings({
        enabled,
        welcome_message: welcome,
        fallback_message: fallback,
        handoff_message: handoff,
        handoff_keywords: textToKeywords(handoffKeywords),
        handoff_pause_minutes: handoffPause,
      });
      setSettings(next);
      setOk("Configurações do bot salvas.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar configurações.");
    } finally {
      setBusy(false);
    }
  }

  async function onSeedDefaults() {
    if (!canConfigure) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const result = await seedWhatsappBotDefaultFlows();
      setFlows(result.flows);
      if (result.flows.length) setSelectedFlowId(result.flows[0].id);
      setEditingStepId(null);
      setOk(
        result.created_flows > 0
          ? `${result.created_flows} fluxo(s) pronto(s) criados. ${result.skipped_existing} já existiam.`
          : "Os fluxos prontos já existiam para este workspace.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao criar fluxos prontos.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateFlow() {
    if (!canConfigure) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const options = optionsFromRows(stepOptionRows);
      const actions = buildStepActions(undefined, { saveAs: stepSaveAs, builtin: stepBuiltin });
      const flow = await createWhatsappBotFlow({
        slug: flowSlug || flowName,
        name: flowName,
        description: flowDescription || null,
        enabled: flowEnabled,
        trigger_type: triggerType,
        trigger_keywords: textToKeywords(triggerKeywords),
        system_event: systemEvent || null,
        priority,
        steps: [
          {
            step_key: stepKey || "inicio",
            kind: stepKind,
            message_template: stepMessage || "Como posso ajudar?",
            options,
            actions,
            next_step_key: stepNext || null,
            sort_order: stepOrder,
          },
        ],
      });
      await refresh();
      setSelectedFlowId(flow.id);
      setEditingStepId(null);
      setOk("Fluxo criado.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao criar fluxo.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveFlow() {
    if (!canConfigure || !selectedFlow) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await patchWhatsappBotFlow(selectedFlow.id, {
        slug: flowSlug,
        name: flowName,
        description: flowDescription || null,
        enabled: flowEnabled,
        trigger_type: triggerType,
        trigger_keywords: textToKeywords(triggerKeywords),
        system_event: systemEvent || null,
        priority,
      });
      await refresh();
      setOk("Fluxo salvo.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar fluxo.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteFlow() {
    if (!canConfigure || !selectedFlow) return;
    if (!window.confirm(`Excluir o fluxo "${selectedFlow.name}"?`)) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await deleteWhatsappBotFlow(selectedFlow.id);
      setSelectedFlowId(null);
      await refresh();
      setOk("Fluxo excluído.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao excluir fluxo.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveStep() {
    if (!canConfigure || !selectedFlow) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const options = optionsFromRows(stepOptionRows);
      const prevActions = !creatingStep && selectedStep ? selectedStep.actions : undefined;
      const builtinForSave = stepKind === "action" ? stepBuiltin : "";
      const actions = buildStepActions(prevActions, { saveAs: stepSaveAs, builtin: builtinForSave });
      if (selectedStep && !creatingStep) {
        await patchWhatsappBotStep(selectedFlow.id, selectedStep.id, {
          step_key: stepKey,
          kind: stepKind,
          message_template: stepMessage,
          options,
          actions,
          next_step_key: stepNext || null,
          sort_order: stepOrder,
        });
      } else {
        await createWhatsappBotStep(selectedFlow.id, {
          step_key: stepKey,
          kind: stepKind,
          message_template: stepMessage,
          options,
          actions,
          next_step_key: stepNext || null,
          sort_order: stepOrder,
        });
      }
      await refresh();
      setEditingStepId(null);
      setOk("Passo salvo.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar passo.");
    } finally {
      setBusy(false);
    }
  }

  async function onAddNewStep() {
    setEditingStepId(-1);
    setStepKey(`passo-${(selectedFlow?.steps.length ?? 0) + 1}`);
    setStepKind("message");
    setStepMessage("Digite a mensagem deste passo.");
    setStepOptionRows([]);
    setStepSaveAs("");
    setStepBuiltin("");
    setStepNext("");
    setStepOrder(((selectedFlow?.steps.length ?? 0) + 1) * 100);
  }

  function updateOptionRow(index: number, patch: Partial<StepOptionDraft>) {
    setStepOptionRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeOptionRow(index: number) {
    setStepOptionRows((rows) => rows.filter((_, i) => i !== index));
  }

  function addOptionRow() {
    setStepOptionRows((rows) => [
      ...rows,
      { key: String(rows.length + 1), label: "", message: "", next_step_key: "", handoff: false, aliasesText: "" },
    ]);
  }

  async function onDeleteStep(step: WhatsappBotStep) {
    if (!canConfigure || !selectedFlow) return;
    if (!window.confirm(`Excluir o passo "${step.step_key}"?`)) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await deleteWhatsappBotStep(selectedFlow.id, step.id);
      if (editingStepId === step.id) setEditingStepId(null);
      await refresh();
      setOk("Passo excluído.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao excluir passo.");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setBusy(true);
    setErr("");
    setOk("");
    setTestResult(null);
    try {
      const result = await testWhatsappBotMessage({
        message_text: testText,
        client_whatsapp: testPhone || null,
        context: parseJsonObject(testContext, "Contexto de teste"),
        reset_session: true,
      });
      setTestResult(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao testar bot.");
    } finally {
      setBusy(false);
    }
  }

  async function onClearSession(session: WhatsappBotSession) {
    if (!window.confirm(`Limpar conversa do bot com ${session.client_whatsapp}?`)) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await clearWhatsappBotSession(session.id);
      setSessions((rows) => rows.filter((row) => row.id !== session.id));
      setOk("Conversa limpa. O próximo contato começará um novo fluxo.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao limpar conversa.");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className={styles.page}>
        <div className={styles.errBox}>Você não tem permissão para ver esta página.</div>
        <Link to="/app" className={styles.btnGhost}>
          Voltar ao painel
        </Link>
      </div>
    );
  }

  if (!loading && moduleStatus && !moduleStatus.entitlement_active) {
    return (
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>Integrações</p>
            <h1 className={styles.heroTitle}>Bot WhatsApp</h1>
            <p className={styles.heroLead}>As configurações do bot ficam disponíveis após liberação do módulo WhatsApp.</p>
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

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Integrações</p>
          <h1 className={styles.heroTitle}>Bot WhatsApp</h1>
          <p className={styles.heroLead}>
            Configure menus, palavras-chave e respostas pré-programadas por empresa. Esta V1 não usa IA: cada tenant decide
            seus fluxos e mensagens.
          </p>
          <p className={styles.heroLead} style={{ marginTop: "0.75rem" }}>
            <Link to="/app/integrations/whatsapp" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)" }}>
              Configurar conexão WhatsApp
            </Link>
          </p>
        </div>
      </header>

      {err ? <div className={styles.errBox}>{err}</div> : null}
      {ok ? <div className={styles.card} style={{ marginBottom: "1rem", color: "#15803d" }}>{ok}</div> : null}

      {loading ? (
        <p className={styles.hint}>Carregando…</p>
      ) : (
        <>
          {metrics ? (
            <section className={styles.card} style={{ marginBottom: "1rem" }}>
              <div className={styles.row} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                  Resumo do bot
                </h2>
                <label className={styles.hint} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  Período
                  <select
                    className={styles.textInput}
                    style={{ width: "auto", minWidth: "7rem" }}
                    value={metricsDays}
                    onChange={(e) => setMetricsDays(Number(e.target.value))}
                  >
                    <option value={7}>7 dias</option>
                    <option value={14}>14 dias</option>
                    <option value={30}>30 dias</option>
                    <option value={90}>90 dias</option>
                  </select>
                </label>
              </div>
              <p className={styles.hint} style={{ marginTop: "0.35rem" }}>
                De {formatDateTime(metrics.since_utc)} até {formatDateTime(metrics.until_utc)} (UTC no servidor).
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
                  gap: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                <div className={styles.card} style={{ padding: "0.85rem", margin: 0 }}>
                  <p className={styles.hint} style={{ margin: 0 }}>
                    Respostas enviadas
                  </p>
                  <p className={styles.heroTitle} style={{ fontSize: "1.35rem", margin: "0.25rem 0 0" }}>
                    {metrics.replies_sent}
                  </p>
                </div>
                <div className={styles.card} style={{ padding: "0.85rem", margin: 0 }}>
                  <p className={styles.hint} style={{ margin: 0 }}>
                    Falha no envio
                  </p>
                  <p className={styles.heroTitle} style={{ fontSize: "1.35rem", margin: "0.25rem 0 0" }}>
                    {metrics.replies_failed}
                  </p>
                </div>
                <div className={styles.card} style={{ padding: "0.85rem", margin: 0 }}>
                  <p className={styles.hint} style={{ margin: 0 }}>
                    Erro antes do envio
                  </p>
                  <p className={styles.heroTitle} style={{ fontSize: "1.35rem", margin: "0.25rem 0 0" }}>
                    {metrics.routing_failed}
                  </p>
                </div>
                <div className={styles.card} style={{ padding: "0.85rem", margin: 0 }}>
                  <p className={styles.hint} style={{ margin: 0 }}>
                    Textos processados
                  </p>
                  <p className={styles.heroTitle} style={{ fontSize: "1.35rem", margin: "0.25rem 0 0" }}>
                    {metrics.incoming_text_events}
                  </p>
                </div>
                <div className={styles.card} style={{ padding: "0.85rem", margin: 0 }}>
                  <p className={styles.hint} style={{ margin: 0 }}>
                    Taxa envio OK
                  </p>
                  <p className={styles.heroTitle} style={{ fontSize: "1.35rem", margin: "0.25rem 0 0" }}>
                    {metrics.reply_success_rate != null ? `${metrics.reply_success_rate}%` : "—"}
                  </p>
                </div>
                <div className={styles.card} style={{ padding: "0.85rem", margin: 0 }}>
                  <p className={styles.hint} style={{ margin: 0 }}>
                    Sessões ativas
                  </p>
                  <p className={styles.heroTitle} style={{ fontSize: "1.35rem", margin: "0.25rem 0 0" }}>
                    {metrics.sessions_total}
                  </p>
                </div>
                <div className={styles.card} style={{ padding: "0.85rem", margin: 0 }}>
                  <p className={styles.hint} style={{ margin: 0 }}>
                    Pausadas (humano)
                  </p>
                  <p className={styles.heroTitle} style={{ fontSize: "1.35rem", margin: "0.25rem 0 0" }}>
                    {metrics.sessions_paused_now}
                  </p>
                </div>
              </div>
              <p className={styles.hint} style={{ marginTop: "0.85rem" }}>
                Contagem bruta por tipo: bot_incoming_replied {metrics.bot_incoming_replied} (confirma que o roteador
                decidiu responder; cada envio bem-sucedido também gera bot_reply_sent).
              </p>
            </section>
          ) : null}
          <div className={styles.grid}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Geral</h2>
              <div className={styles.row}>
                <span className={`${styles.badge} ${enabled ? styles.badgeOk : styles.badgeMuted}`}>
                  {enabled ? "Bot ativo" : "Bot inativo"}
                </span>
                {settings ? <span className={styles.mono}>Atualizado {new Date(settings.updated_at).toLocaleString()}</span> : null}
              </div>
              <label className={styles.checkRow} style={{ marginTop: "0.85rem" }}>
                <input type="checkbox" checked={enabled} disabled={!canConfigure} onChange={(e) => setEnabled(e.target.checked)} />
                Ativar respostas automáticas do bot
              </label>
              <label className={styles.fieldLabel} htmlFor="bot-welcome" style={{ marginTop: "0.85rem" }}>
                Mensagem inicial
              </label>
              <textarea id="bot-welcome" className={styles.textarea} value={welcome} disabled={!canConfigure} onChange={(e) => setWelcome(e.target.value)} />
              <label className={styles.fieldLabel} htmlFor="bot-fallback" style={{ marginTop: "0.85rem" }}>
                Mensagem quando não entender
              </label>
              <textarea id="bot-fallback" className={styles.textarea} value={fallback} disabled={!canConfigure} onChange={(e) => setFallback(e.target.value)} />
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Atendimento humano</h2>
              <label className={styles.fieldLabel} htmlFor="bot-handoff">
                Mensagem de transferência
              </label>
              <textarea id="bot-handoff" className={styles.textarea} value={handoff} disabled={!canConfigure} onChange={(e) => setHandoff(e.target.value)} />
              <label className={styles.fieldLabel} htmlFor="bot-handoff-kw" style={{ marginTop: "0.85rem" }}>
                Palavras para chamar atendente (separadas por vírgula)
              </label>
              <input id="bot-handoff-kw" className={styles.textInput} value={handoffKeywords} disabled={!canConfigure} onChange={(e) => setHandoffKeywords(e.target.value)} />
              <label className={styles.fieldLabel} htmlFor="bot-handoff-pause" style={{ marginTop: "0.85rem" }}>
                Pausar bot por quantos minutos
              </label>
              <input
                id="bot-handoff-pause"
                className={styles.textInput}
                type="number"
                min={1}
                value={handoffPause}
                disabled={!canConfigure}
                onChange={(e) => setHandoffPause(Number(e.target.value || 1))}
              />
              {canConfigure ? (
                <div className={styles.actions}>
                  <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void onSaveSettings()}>
                    Salvar configurações
                  </button>
                </div>
              ) : null}
            </section>
          </div>

          <div className={styles.grid}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Fluxos</h2>
              {flows.length ? (
                <div className={styles.checkGrid}>
                  {flows.map((flow) => (
                    <button
                      key={flow.id}
                      type="button"
                      className={flow.id === selectedFlow?.id ? styles.btnPrimary : styles.btnGhost}
                      onClick={() => {
                        setSelectedFlowId(flow.id);
                        setEditingStepId(null);
                      }}
                    >
                      {flow.name} {flow.enabled ? "" : "(inativo)"}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <p className={styles.hint}>Nenhum fluxo criado ainda. Comece pelos modelos prontos ou use o formulário ao lado.</p>
                  {canConfigure ? (
                    <div className={styles.actions}>
                      <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void onSeedDefaults()}>
                        Criar fluxos prontos
                      </button>
                    </div>
                  ) : null}
                </>
              )}
              {flows.length && canConfigure ? (
                <div className={styles.actions}>
                  <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void onSeedDefaults()}>
                    Completar com modelos faltantes
                  </button>
                </div>
              ) : null}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{selectedFlow ? "Editar fluxo" : "Novo fluxo"}</h2>
              <label className={styles.fieldLabel} htmlFor="flow-name">
                Nome
              </label>
              <input id="flow-name" className={styles.textInput} value={flowName} disabled={!canConfigure} onChange={(e) => setFlowName(e.target.value)} />
              <label className={styles.fieldLabel} htmlFor="flow-slug" style={{ marginTop: "0.85rem" }}>
                Slug
              </label>
              <input id="flow-slug" className={styles.textInput} value={flowSlug} disabled={!canConfigure} onChange={(e) => setFlowSlug(e.target.value)} />
              <label className={styles.fieldLabel} htmlFor="flow-trigger" style={{ marginTop: "0.85rem" }}>
                Tipo de gatilho
              </label>
              <select id="flow-trigger" className={styles.textInput} value={triggerType} disabled={!canConfigure} onChange={(e) => setTriggerType(e.target.value)}>
                <option value="keyword">Palavras-chave</option>
                <option value="menu_option">Opção do menu inicial</option>
                <option value="system_event">Evento do sistema</option>
                <option value="manual">Manual</option>
              </select>
              <label className={styles.fieldLabel} htmlFor="flow-keywords" style={{ marginTop: "0.85rem" }}>
                Palavras/opções de entrada
              </label>
              <input id="flow-keywords" className={styles.textInput} value={triggerKeywords} disabled={!canConfigure} onChange={(e) => setTriggerKeywords(e.target.value)} placeholder="1, limpeza, orçamento" />
              <label className={styles.fieldLabel} htmlFor="flow-event" style={{ marginTop: "0.85rem" }}>
                Evento do sistema
              </label>
              <input id="flow-event" className={styles.textInput} value={systemEvent} disabled={!canConfigure} onChange={(e) => setSystemEvent(e.target.value)} placeholder="service_order_done" />
              <label className={styles.checkRow} style={{ marginTop: "0.85rem" }}>
                <input type="checkbox" checked={flowEnabled} disabled={!canConfigure} onChange={(e) => setFlowEnabled(e.target.checked)} />
                Fluxo ativo
              </label>
              <label className={styles.fieldLabel} htmlFor="flow-priority" style={{ marginTop: "0.85rem" }}>
                Prioridade
              </label>
              <input id="flow-priority" className={styles.textInput} type="number" value={priority} disabled={!canConfigure} onChange={(e) => setPriority(Number(e.target.value || 100))} />
              <label className={styles.fieldLabel} htmlFor="flow-desc" style={{ marginTop: "0.85rem" }}>
                Descrição interna
              </label>
              <textarea id="flow-desc" className={styles.textarea} value={flowDescription} disabled={!canConfigure} onChange={(e) => setFlowDescription(e.target.value)} />
              {canConfigure ? (
                <div className={styles.actions}>
                  <button type="button" className={styles.btnPrimary} disabled={busy || !flowName.trim()} onClick={() => void (selectedFlow ? onSaveFlow() : onCreateFlow())}>
                    {selectedFlow ? "Salvar fluxo" : "Criar fluxo"}
                  </button>
                  {selectedFlow ? (
                    <button type="button" className={styles.btnDanger} disabled={busy} onClick={() => void onDeleteFlow()}>
                      Excluir fluxo
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>

          <section className={styles.card} style={{ marginBottom: "1.25rem" }}>
            <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                Passos do fluxo
              </h2>
              <label className={styles.checkRow} style={{ margin: 0 }}>
                <input type="checkbox" checked={showFlowDiagram} onChange={(e) => setShowFlowDiagram(e.target.checked)} />
                Diagrama visual
              </label>
            </div>
            {showFlowDiagram && selectedFlow && selectedFlow.steps.length ? (
              <div style={{ marginTop: "0.75rem", marginBottom: "1rem" }}>
                <p className={styles.hint} style={{ marginTop: 0 }}>
                  Camadas pela ordem de dependência entre passos. Arestas laranja: próximo passo ainda não existe (corrija a chave). Clique no
                  cartão para selecionar o passo no formulário.
                </p>
                <WhatsappBotFlowDiagram
                  key={`${selectedFlow.id}-${selectedFlow.updated_at}-${selectedFlow.steps.map((s) => s.id).join("-")}`}
                  flow={selectedFlow}
                  selectedStepId={editingStepId && editingStepId > 0 ? editingStepId : selectedStep?.id ?? null}
                  onSelectStep={(id) => {
                    setEditingStepId(id);
                    setOk("");
                  }}
                />
              </div>
            ) : null}
            {selectedFlow?.steps.length ? (
              <div className={styles.tableWrap} style={{ marginBottom: "1rem" }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ordem</th>
                      <th>Chave</th>
                      <th>Tipo</th>
                      <th>Mensagem</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedFlow.steps.map((step) => (
                      <tr key={step.id}>
                        <td>{step.sort_order}</td>
                        <td className={styles.mono}>{step.step_key}</td>
                        <td>
                          {step.kind}
                          {String(step.actions?.builtin || "").trim() ? (
                            <span className={styles.mono} style={{ display: "block", fontSize: "0.8rem", color: "#64748b" }}>
                              {String(step.actions.builtin)}
                            </span>
                          ) : null}
                        </td>
                        <td>{step.message_template.slice(0, 90)}{step.message_template.length > 90 ? "…" : ""}</td>
                        <td>
                          {canConfigure ? (
                            <div className={styles.actions} style={{ marginTop: 0 }}>
                              <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => setEditingStepId(step.id)}>
                                Editar
                              </button>
                              <button type="button" className={styles.btnDanger} disabled={busy} onClick={() => void onDeleteStep(step)}>
                                Excluir
                              </button>
                            </div>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.hint}>Este fluxo ainda não tem passos.</p>
            )}

            <div className={styles.grid}>
              <div>
                <label className={styles.fieldLabel} htmlFor="step-key">Chave do passo</label>
                <input id="step-key" className={styles.textInput} value={stepKey} disabled={!canConfigure} onChange={(e) => setStepKey(e.target.value)} />
                <label className={styles.fieldLabel} htmlFor="step-kind" style={{ marginTop: "0.85rem" }}>Tipo</label>
                <select id="step-kind" className={styles.textInput} value={stepKind} disabled={!canConfigure} onChange={(e) => setStepKind(e.target.value)}>
                  <option value="message">Mensagem</option>
                  <option value="question">Pergunta</option>
                  <option value="menu">Menu</option>
                  <option value="action">Ação (resposta gerada no servidor)</option>
                  <option value="handoff">Atendente</option>
                  <option value="end">Encerrar</option>
                </select>
                {stepKind === "action" ? (
                  <>
                    <label className={styles.fieldLabel} htmlFor="step-builtin" style={{ marginTop: "0.85rem" }}>
                      Ação interna (builtin)
                    </label>
                    <select
                      id="step-builtin"
                      className={styles.textInput}
                      value={stepBuiltin}
                      disabled={!canConfigure}
                      onChange={(e) => setStepBuiltin(e.target.value)}
                    >
                      <option value="">Nenhuma — usa só o texto do passo</option>
                      <option value="finance_open_entries">Financeiro: listar cobranças em aberto + links (Asaas / MP / Stone)</option>
                      <option value="lookup_status">Consultar status (orçamentos e OS)</option>
                      <option value="create_budget_draft">Criar rascunho de orçamento</option>
                      <option value="create_schedule_request">Registrar solicitação de visita/agenda</option>
                      <option value="register_nf_request">Registrar pedido de nota fiscal</option>
                      <option value="register_satisfaction_feedback">Registrar pesquisa de satisfação</option>
                    </select>
                    <p className={styles.hint}>
                      Com builtin, a mensagem do passo costuma ser um prefácio curto; o servidor acrescenta o resultado
                      (por exemplo, links de fatura Asaas, PIX/boleto Mercado Pago ou PDF/QR Stone).
                    </p>
                  </>
                ) : null}
                <label className={styles.fieldLabel} htmlFor="step-next" style={{ marginTop: "0.85rem" }}>
                  Próximo passo
                </label>
                <input id="step-next" className={styles.textInput} value={stepNext} disabled={!canConfigure} onChange={(e) => setStepNext(e.target.value)} />
                <label className={styles.fieldLabel} htmlFor="step-order" style={{ marginTop: "0.85rem" }}>Ordem</label>
                <input id="step-order" type="number" className={styles.textInput} value={stepOrder} disabled={!canConfigure} onChange={(e) => setStepOrder(Number(e.target.value || 100))} />
                {stepKind === "question" ? (
                  <>
                    <label className={styles.fieldLabel} htmlFor="step-save-as" style={{ marginTop: "0.85rem" }}>
                      Salvar resposta como
                    </label>
                    <input
                      id="step-save-as"
                      className={styles.textInput}
                      value={stepSaveAs}
                      disabled={!canConfigure}
                      onChange={(e) => setStepSaveAs(e.target.value)}
                      placeholder="Ex.: cidade, dados_orcamento"
                    />
                    <p className={styles.hint}>Use uma chave simples para guardar a resposta no contexto do atendimento.</p>
                  </>
                ) : null}
              </div>
              <div>
                <label className={styles.fieldLabel} htmlFor="step-message">Mensagem do passo</label>
                <textarea id="step-message" className={styles.textarea} value={stepMessage} disabled={!canConfigure} onChange={(e) => setStepMessage(e.target.value)} />
                <p className={styles.hint}>
                  Variáveis no texto (placeholders {"{chave}"}): {"{empresa}"}, {"{nome_cliente}"}, {"{telefone_cliente}"},{" "}
                  {"{email_cliente}"}, {"{documento_cliente}"}, {"{numero_os}"}, {"{titulo_os}"}, {"{valor_total}"},{" "}
                  {"{mensagem_cliente}"}, {"{opcao_escolhida}"}. Os links de pagamento (Asaas, Mercado Pago, Stone / Pagar.me) são
                  montados automaticamente na ação interna <code style={{ fontSize: "0.9em" }}>finance_open_entries</code>, não por
                  variável no template.
                </p>
                {stepBuiltin === "finance_open_entries" || selectedFlow?.slug === "financeiro-pagamentos" ? (
                  <div
                    className={styles.card}
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.85rem",
                      borderLeft: "4px solid #0d9488",
                      background: "#f0fdfa",
                    }}
                  >
                    <p className={styles.hint} style={{ marginTop: 0, color: "#115e59" }}>
                      <strong>Financeiro no WhatsApp:</strong> com Asaas conectado, o cliente recebe o link da fatura no Asaas (PIX
                      ou boleto, conforme a cobrança). Com Mercado Pago, enviamos o link de checkout ou o de PIX ou boleto já emitido.
                      Com Stone / Pagar.me, buscamos o PDF do boleto ou a página com QR de PIX no pedido do gateway.
                    </p>
                    <p className={styles.hint} style={{ marginBottom: 0, color: "#115e59" }}>
                      Conecte os gateways em{" "}
                      <Link to="/app/finance/settings/accounts" className={styles.btnGhost} style={{ display: "inline", padding: "0.15rem 0.45rem" }}>
                        Financeiro → Contas e gateways
                      </Link>
                      . Os lançamentos em aberto precisam estar vinculados ao WhatsApp do cliente ou à OS presente no contexto
                      (ex.: fluxo de OS concluída).
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <section className={styles.card} style={{ marginTop: "1rem", background: "var(--color-surface, #f8f9fb)" }}>
              <div className={styles.row} style={{ justifyContent: "space-between" }}>
                <div>
                  <h3 className={styles.cardTitle} style={{ marginBottom: "0.25rem" }}>Opções e respostas</h3>
                  <p className={styles.hint} style={{ marginTop: 0 }}>
                    Use para passos do tipo menu. Cada opção pode responder direto, ir para outro passo ou chamar atendente.
                  </p>
                </div>
                {canConfigure ? (
                  <div className={styles.actions} style={{ marginTop: 0 }}>
                    <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => setStepOptionRows(DEFAULT_OPTION_ROWS)}>
                      Usar exemplo
                    </button>
                    <button type="button" className={styles.btnPrimary} disabled={busy} onClick={addOptionRow}>
                      Adicionar opção
                    </button>
                  </div>
                ) : null}
              </div>

              {stepOptionRows.length ? (
                <div className={styles.checkGrid} style={{ marginTop: "1rem" }}>
                  {stepOptionRows.map((row, index) => (
                    <div key={index} className={styles.card}>
                      <div className={styles.grid} style={{ marginBottom: 0 }}>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`option-key-${index}`}>Opção digitada</label>
                          <input
                            id={`option-key-${index}`}
                            className={styles.textInput}
                            value={row.key}
                            disabled={!canConfigure}
                            onChange={(e) => updateOptionRow(index, { key: e.target.value })}
                            placeholder="Ex.: 1"
                          />
                          <label className={styles.fieldLabel} htmlFor={`option-label-${index}`} style={{ marginTop: "0.75rem" }}>Texto no menu</label>
                          <input
                            id={`option-label-${index}`}
                            className={styles.textInput}
                            value={row.label}
                            disabled={!canConfigure}
                            onChange={(e) => updateOptionRow(index, { label: e.target.value })}
                            placeholder="Ex.: Orçamento"
                          />
                          <label className={styles.fieldLabel} htmlFor={`option-alias-${index}`} style={{ marginTop: "0.75rem" }}>Atalhos opcionais</label>
                          <input
                            id={`option-alias-${index}`}
                            className={styles.textInput}
                            value={row.aliasesText}
                            disabled={!canConfigure}
                            onChange={(e) => updateOptionRow(index, { aliasesText: e.target.value })}
                            placeholder="Ex.: orçamento, valor"
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`option-message-${index}`}>Resposta imediata</label>
                          <textarea
                            id={`option-message-${index}`}
                            className={styles.textarea}
                            value={row.message}
                            disabled={!canConfigure || row.handoff}
                            onChange={(e) => updateOptionRow(index, { message: e.target.value })}
                            placeholder="Mensagem enviada quando esta opção não aponta para outro passo."
                          />
                          <label className={styles.fieldLabel} htmlFor={`option-next-${index}`} style={{ marginTop: "0.75rem" }}>Ir para passo</label>
                          <input
                            id={`option-next-${index}`}
                            className={styles.textInput}
                            value={row.next_step_key}
                            disabled={!canConfigure || row.handoff}
                            onChange={(e) => updateOptionRow(index, { next_step_key: e.target.value })}
                            placeholder="Ex.: coletar-cidade"
                          />
                          <label className={styles.checkRow} style={{ marginTop: "0.75rem" }}>
                            <input
                              type="checkbox"
                              checked={row.handoff}
                              disabled={!canConfigure}
                              onChange={(e) =>
                                updateOptionRow(index, {
                                  handoff: e.target.checked,
                                  message: e.target.checked ? "" : row.message,
                                  next_step_key: e.target.checked ? "" : row.next_step_key,
                                })
                              }
                            />
                            Falar com atendente e pausar bot
                          </label>
                          {canConfigure ? (
                            <div className={styles.actions}>
                              <button type="button" className={styles.btnDanger} disabled={busy} onClick={() => removeOptionRow(index)}>
                                Remover opção
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.hint} style={{ marginTop: "0.75rem" }}>
                  Nenhuma opção configurada para este passo. Para mensagens simples ou perguntas abertas, isso é normal.
                </p>
              )}
            </section>

            {canConfigure ? (
              <div className={styles.actions}>
                <button type="button" className={styles.btnPrimary} disabled={busy || !selectedFlow} onClick={() => void onSaveStep()}>
                  {creatingStep || !selectedStep ? "Criar passo" : "Salvar passo"}
                </button>
                <button type="button" className={styles.btnGhost} disabled={busy || !selectedFlow} onClick={() => void onAddNewStep()}>
                  Preparar novo passo
                </button>
              </div>
            ) : null}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Testar bot</h2>
            <label className={styles.fieldLabel} htmlFor="bot-test-text">Mensagem recebida</label>
            <input id="bot-test-text" className={styles.textInput} value={testText} onChange={(e) => setTestText(e.target.value)} />
            <label className={styles.fieldLabel} htmlFor="bot-test-phone" style={{ marginTop: "0.85rem" }}>WhatsApp de teste opcional</label>
            <input id="bot-test-phone" className={styles.textInput} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="11999999999" />
            <label className={styles.fieldLabel} htmlFor="bot-test-context" style={{ marginTop: "0.85rem" }}>Contexto JSON opcional</label>
            <textarea id="bot-test-context" className={styles.textarea} value={testContext} onChange={(e) => setTestContext(e.target.value)} />
            <div className={styles.actions}>
              <button type="button" className={styles.btnPrimary} disabled={busy || !testText.trim()} onClick={() => void onTest()}>
                Testar resposta
              </button>
            </div>
            {testResult ? (
              <div className={styles.card} style={{ marginTop: "1rem", background: "var(--color-surface, #f8f9fb)" }}>
                <p className={styles.hint}>Fluxo: {testResult.flow_name ?? "nenhum"} | Passo: {testResult.step_key ?? "—"}</p>
                <pre className={styles.mono} style={{ whiteSpace: "pre-wrap" }}>{testResult.reply_text ?? "(sem resposta)"}</pre>
              </div>
            ) : null}
          </section>

          <section className={styles.card} style={{ marginTop: "1.25rem" }}>
            <div className={styles.row} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <h2 className={styles.cardTitle}>Conversas recentes</h2>
                <p className={styles.hint} style={{ marginTop: 0 }}>
                  Acompanhe sessões abertas, pausas para atendimento humano e contexto coletado pelo bot.
                </p>
              </div>
              <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void refresh()}>
                Atualizar lista
              </button>
            </div>
            <label className={styles.fieldLabel} htmlFor="bot-sess-phone" style={{ marginTop: "0.75rem" }}>
              Filtrar por número (contém) — depois clique em &quot;Atualizar lista&quot;
            </label>
            <input
              id="bot-sess-phone"
              className={styles.textInput}
              style={{ maxWidth: "22rem" }}
              value={sessionPhoneQ}
              onChange={(e) => setSessionPhoneQ(e.target.value)}
              placeholder="Ex.: 5511 ou final 9999"
            />

            {sessions.length ? (
              <div className={styles.tableWrap} style={{ marginTop: "1rem" }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Status</th>
                      <th>Fluxo / passo</th>
                      <th>Contexto</th>
                      <th>Atualizado</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => {
                      const paused = isPaused(session);
                      return (
                        <tr key={session.id}>
                          <td className={styles.mono}>{session.client_whatsapp}</td>
                          <td>
                            <span className={`${styles.badge} ${paused ? styles.badgeWarn : styles.badgeOk}`}>
                              {paused ? `Pausado até ${formatDateTime(session.paused_until)}` : "Em fluxo"}
                            </span>
                          </td>
                          <td>
                            {session.current_flow_name ?? "—"}
                            {session.current_step_key ? <span className={styles.mono}> / {session.current_step_key}</span> : null}
                          </td>
                          <td>{contextPreview(session.context)}</td>
                          <td>{formatDateTime(session.updated_at)}</td>
                          <td>
                            <button type="button" className={styles.btnDanger} disabled={busy} onClick={() => void onClearSession(session)}>
                              Limpar / reativar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.hint} style={{ marginTop: "0.75rem" }}>
                Nenhuma conversa ativa ou pausada no bot ainda.
              </p>
            )}
          </section>

          <section className={styles.card} style={{ marginTop: "1.25rem" }}>
            <div className={styles.row} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                Histórico do bot
              </h2>
              <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void refresh()}>
                Atualizar histórico
              </button>
            </div>
            <p className={styles.hint}>
              Últimos eventos de entrada, resposta e falha do bot. Use para auditar o que aconteceu no WhatsApp real.
            </p>
            <label className={styles.fieldLabel} htmlFor="bot-ev-phone" style={{ marginTop: "0.75rem" }}>
              Filtrar por número no payload (contém) — depois use &quot;Atualizar histórico&quot;
            </label>
            <input
              id="bot-ev-phone"
              className={styles.textInput}
              style={{ maxWidth: "22rem" }}
              value={eventPhoneQ}
              onChange={(e) => setEventPhoneQ(e.target.value)}
              placeholder="Ex.: 5511999999999"
            />
            {events.length ? (
              <div className={styles.tableWrap} style={{ marginTop: "1rem" }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Evento</th>
                      <th>Job</th>
                      <th>Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>{formatDateTime(event.created_at)}</td>
                        <td>{event.event_type}</td>
                        <td>{event.job_id ?? "—"}</td>
                        <td className={styles.mono}>{JSON.stringify(event.payload).slice(0, 220)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.hint} style={{ marginTop: "0.75rem" }}>Nenhum evento do bot registrado ainda.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
