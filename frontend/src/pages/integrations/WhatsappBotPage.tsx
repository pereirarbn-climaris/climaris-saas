import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  createWhatsappBotFlow,
  createWhatsappBotStep,
  deleteWhatsappBotFlow,
  deleteWhatsappBotStep,
  getWhatsappBotSettings,
  listWhatsappBotFlows,
  patchWhatsappBotFlow,
  patchWhatsappBotSettings,
  patchWhatsappBotStep,
  seedWhatsappBotDefaultFlows,
  testWhatsappBotMessage,
  type WhatsappBotFlow,
  type WhatsappBotSettings,
  type WhatsappBotStep,
  type WhatsappBotTestResponse,
} from "../../api/whatsappBot";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./WhatsappIntegrationPage.module.css";

const DEFAULT_STEP_OPTIONS = `[
  { "key": "1", "label": "Receber informações", "message": "Perfeito! Nossa equipe vai continuar por aqui." },
  { "key": "2", "label": "Falar com atendente", "handoff": true }
]`;

function keywordsToText(items: string[]): string {
  return items.join(", ");
}

function textToKeywords(value: string): string[] {
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function jsonString(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} deve ser um objeto JSON.`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArray(value: string, label: string): Array<Record<string, unknown>> {
  if (!value.trim()) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} deve ser uma lista JSON.`);
  }
  return parsed.map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : { value: item }));
}

function firstStep(flow: WhatsappBotFlow | null): WhatsappBotStep | null {
  if (!flow?.steps.length) return null;
  return [...flow.steps].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)[0] ?? null;
}

export function WhatsappBotPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const role = ctx?.user.role;
  const canConfigure = role === "admin";
  const canView = role === "admin" || role === "receptionist";

  const [settings, setSettings] = useState<WhatsappBotSettings | null>(null);
  const [flows, setFlows] = useState<WhatsappBotFlow[]>([]);
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
  const [stepOptions, setStepOptions] = useState("[]");
  const [stepActions, setStepActions] = useState("{}");
  const [stepNext, setStepNext] = useState("");
  const [stepOrder, setStepOrder] = useState<number>(100);

  const [testText, setTestText] = useState("menu");
  const [testPhone, setTestPhone] = useState("");
  const [testContext, setTestContext] = useState("{}");
  const [testResult, setTestResult] = useState<WhatsappBotTestResponse | null>(null);

  const refresh = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setErr("");
    try {
      const [st, fl] = await Promise.all([getWhatsappBotSettings(), listWhatsappBotFlows()]);
      setSettings(st);
      setFlows(fl);
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
  }, [canView, selectedFlowId]);

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
      setStepOptions("[]");
      setStepActions("{}");
      setStepNext("");
      setStepOrder(100);
      return;
    }
    setStepKey(selectedStep.step_key);
    setStepKind(selectedStep.kind);
    setStepMessage(selectedStep.message_template);
    setStepOptions(jsonString(selectedStep.options));
    setStepActions(jsonString(selectedStep.actions));
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
      const options = stepKind === "menu" ? parseJsonArray(stepOptions, "Opções") : [];
      const actions = parseJsonObject(stepActions, "Ações");
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
      const options = parseJsonArray(stepOptions, "Opções");
      const actions = parseJsonObject(stepActions, "Ações");
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
    setStepOptions("[]");
    setStepActions("{}");
    setStepNext("");
    setStepOrder(((selectedFlow?.steps.length ?? 0) + 1) * 100);
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
            <h2 className={styles.cardTitle}>Passos do fluxo</h2>
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
                        <td>{step.kind}</td>
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
                  <option value="handoff">Atendente</option>
                  <option value="end">Encerrar</option>
                </select>
                <label className={styles.fieldLabel} htmlFor="step-next" style={{ marginTop: "0.85rem" }}>Próximo passo</label>
                <input id="step-next" className={styles.textInput} value={stepNext} disabled={!canConfigure} onChange={(e) => setStepNext(e.target.value)} />
                <label className={styles.fieldLabel} htmlFor="step-order" style={{ marginTop: "0.85rem" }}>Ordem</label>
                <input id="step-order" type="number" className={styles.textInput} value={stepOrder} disabled={!canConfigure} onChange={(e) => setStepOrder(Number(e.target.value || 100))} />
              </div>
              <div>
                <label className={styles.fieldLabel} htmlFor="step-message">Mensagem do passo</label>
                <textarea id="step-message" className={styles.textarea} value={stepMessage} disabled={!canConfigure} onChange={(e) => setStepMessage(e.target.value)} />
                <p className={styles.hint}>Variáveis: {"{empresa}"}, {"{nome_cliente}"}, {"{numero_os}"}, {"{valor_total}"}, {"{link_pagamento}"}.</p>
              </div>
            </div>

            <div className={styles.grid}>
              <div>
                <label className={styles.fieldLabel} htmlFor="step-options">Opções JSON</label>
                <textarea id="step-options" className={styles.textarea} value={stepOptions} disabled={!canConfigure} onChange={(e) => setStepOptions(e.target.value)} />
                <button type="button" className={styles.btnGhost} style={{ marginTop: "0.5rem" }} disabled={!canConfigure} onClick={() => setStepOptions(DEFAULT_STEP_OPTIONS)}>
                  Usar exemplo
                </button>
              </div>
              <div>
                <label className={styles.fieldLabel} htmlFor="step-actions">Ações JSON</label>
                <textarea id="step-actions" className={styles.textarea} value={stepActions} disabled={!canConfigure} onChange={(e) => setStepActions(e.target.value)} />
                <p className={styles.hint}>Para pergunta, use por exemplo: {"{\"save_as\":\"cidade\"}"}.</p>
              </div>
            </div>

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
        </>
      )}
    </div>
  );
}
