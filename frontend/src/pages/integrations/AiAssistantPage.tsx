import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  getAiSettings,
  listAiHistory,
  listAiTools,
  patchAiSettings,
  resetAiSettings,
  type AIChatHistoryRow,
  type AIToolDefinition,
  type TenantAISettings,
} from "../../api/ai";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./AiAssistantPage.module.css";

const TONE_PRESETS = [
  { value: "amigavel", label: "Amigável" },
  { value: "formal", label: "Formal" },
  { value: "objetivo", label: "Objetivo" },
  { value: "consultivo", label: "Consultivo" },
  { value: "__custom__", label: "Outro (personalizado)" },
] as const;

function formatDt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function AiAssistantPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const role = ctx?.user.role;
  const isAdmin = role === "admin";
  const canView = role === "admin" || role === "receptionist";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<TenantAISettings | null>(null);
  const [history, setHistory] = useState<AIChatHistoryRow[]>([]);
  const [tools, setTools] = useState<AIToolDefinition[]>([]);

  const [agentName, setAgentName] = useState("");
  const [tonePreset, setTonePreset] = useState<string>("amigavel");
  const [toneCustom, setToneCustom] = useState("");
  const [instructions, setInstructions] = useState("");
  const [modelSlug, setModelSlug] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [contextProducts, setContextProducts] = useState(true);
  const [contextServicePrices, setContextServicePrices] = useState(true);
  const [contextServicesCatalog, setContextServicesCatalog] = useState(true);
  const [toolBilling, setToolBilling] = useState(false);
  const [toolCancel, setToolCancel] = useState(true);
  const [toolReschedule, setToolReschedule] = useState(true);
  const [toolAgendaRead, setToolAgendaRead] = useState(true);
  const [allowDirectSchedule, setAllowDirectSchedule] = useState(false);
  const [allowAutoClientCreate, setAllowAutoClientCreate] = useState(false);
  const [clarificationInstructions, setClarificationInstructions] = useState("");

  const applySettingsToForm = useCallback((s: TenantAISettings) => {
    setAgentName(s.agent_name);
    const presetHit = TONE_PRESETS.find((p) => p.value === s.tone_of_voice && p.value !== "__custom__");
    if (presetHit) {
      setTonePreset(s.tone_of_voice);
      setToneCustom("");
    } else {
      setTonePreset("__custom__");
      setToneCustom(s.tone_of_voice);
    }
    setInstructions(s.instructions ?? "");
    setModelSlug(s.model_slug ?? "");
    setIsEnabled(s.is_enabled);
    setContextProducts(s.ai_context_products ?? true);
    setContextServicePrices(s.ai_context_service_prices ?? true);
    setContextServicesCatalog(s.ai_context_services_catalog ?? true);
    setToolBilling(s.ai_tool_billing ?? false);
    setToolCancel(s.ai_tool_cancel ?? true);
    setToolReschedule(s.ai_tool_reschedule ?? true);
    setToolAgendaRead(s.ai_tool_agenda_read ?? true);
    setAllowDirectSchedule(s.ai_allow_direct_schedule ?? false);
    setAllowAutoClientCreate(s.ai_allow_auto_client_create ?? false);
    setClarificationInstructions(s.ai_clarification_instructions ?? "");
  }, []);

  const refresh = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setErr("");
    const warnings: string[] = [];
    try {
      const st = await getAiSettings();
      setSettings(st);
      applySettingsToForm(st);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar configurações do assistente.");
      setSettings(null);
      setHistory([]);
      setTools([]);
      setLoading(false);
      return;
    }
    try {
      const hi = await listAiHistory({ limit: 40 });
      setHistory(hi);
    } catch (e) {
      setHistory([]);
      warnings.push(
        e instanceof Error ? e.message : "Não foi possível carregar o histórico (verifique migrações do banco no servidor)."
      );
    }
    try {
      const tl = await listAiTools();
      setTools(tl);
    } catch (e) {
      setTools([]);
      warnings.push(e instanceof Error ? e.message : "Não foi possível carregar a lista de ferramentas da IA.");
    }
    if (warnings.length) {
      setErr(warnings.join(" "));
    }
    setLoading(false);
  }, [canView, applySettingsToForm]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function resolvedTone(): string {
    if (tonePreset === "__custom__") {
      return toneCustom.trim() || "amigavel";
    }
    return tonePreset;
  }

  async function onSave() {
    if (!isAdmin) return;
    const tone = resolvedTone();
    if (tone.length < 3 || tone.length > 20) {
      setErr("Tom de voz: use entre 3 e 20 caracteres (ou escolha um preset).");
      return;
    }
    if (agentName.trim().length < 2) {
      setErr("Nome do assistente: mínimo 2 caracteres.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const next = await patchAiSettings({
        agent_name: agentName.trim(),
        tone_of_voice: tone,
        instructions: instructions.trim() ? instructions.trim() : null,
        model_slug: modelSlug.trim() || null,
        is_enabled: isEnabled,
        ai_context_products: contextProducts,
        ai_context_service_prices: contextServicePrices,
        ai_context_services_catalog: contextServicesCatalog,
        ai_tool_billing: toolBilling,
        ai_tool_cancel: toolCancel,
        ai_tool_reschedule: toolReschedule,
        ai_tool_agenda_read: toolAgendaRead,
        ai_allow_direct_schedule: allowDirectSchedule,
        ai_allow_auto_client_create: allowAutoClientCreate,
        ai_clarification_instructions: clarificationInstructions.trim() ? clarificationInstructions.trim() : null,
      });
      setSettings(next);
      applySettingsToForm(next);
      try {
        const tl = await listAiTools();
        setTools(tl);
      } catch {
        /* lista opcional */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    if (!isAdmin) return;
    if (!window.confirm("Restaurar padrões do assistente? Suas instruções personalizadas serão apagadas.")) return;
    setErr("");
    try {
      await resetAiSettings();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao restaurar.");
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
          <h1 className={styles.heroTitle}>Chat IA — Assistente Claude</h1>
          <p className={styles.heroLead}>
            Personalize como a IA responde clientes no WhatsApp (quando o webhook e a resposta automática estiverem ativos no
            servidor). Administradores editam; recepção pode consultar histórico e ferramentas.
          </p>
          <div className={styles.heroLinks}>
            <Link to="/app" className={styles.heroLink}>
              Voltar ao painel
            </Link>
            <Link to="/app/integrations/whatsapp" className={styles.heroLink}>
              WhatsApp (Evolution)
            </Link>
          </div>
        </div>
      </header>

      {err ? <div className={styles.errBox}>{err}</div> : null}

      {loading ? (
        <p className={styles.hint}>Carregando…</p>
      ) : (
        <>
          <div className={styles.grid}>
            <section className={`${styles.card} ${styles.cardWide}`}>
              <h2 className={styles.cardTitle}>Identidade e comportamento</h2>
              {!isAdmin ? (
                <p className={styles.readOnlyNote}>Somente administradores podem alterar estes campos.</p>
              ) : null}
              <div className={styles.row} style={{ marginBottom: "0.75rem" }}>
                <span className={`${styles.badge} ${isEnabled ? styles.badgeOk : styles.badgeMuted}`}>
                  {isEnabled ? "Assistente ativo" : "Assistente desligado"}
                </span>
                {settings ? (
                  <span className={styles.mono}>
                    Atualizado {formatDt(settings.updated_at)}
                  </span>
                ) : null}
              </div>

              <label className={styles.toggleRow} style={{ marginBottom: "1rem" }}>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  disabled={!isAdmin}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                />
                Permitir que o assistente responda (requer IA habilitada no servidor e WhatsApp conectado)
              </label>

              <label className={styles.fieldLabel} htmlFor="ai-agent-name">
                Nome do assistente
              </label>
              <input
                id="ai-agent-name"
                className={styles.textInput}
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                disabled={!isAdmin}
                maxLength={80}
                autoComplete="off"
              />

              <label className={styles.fieldLabel} htmlFor="ai-tone" style={{ marginTop: "0.85rem" }}>
                Tom de voz
              </label>
              <select
                id="ai-tone"
                className={styles.select}
                value={tonePreset}
                onChange={(e) => setTonePreset(e.target.value)}
                disabled={!isAdmin}
              >
                {TONE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {tonePreset === "__custom__" ? (
                <>
                  <label className={styles.fieldLabel} htmlFor="ai-tone-custom" style={{ marginTop: "0.65rem" }}>
                    Texto do tom (3–20 caracteres)
                  </label>
                  <input
                    id="ai-tone-custom"
                    className={styles.textInput}
                    value={toneCustom}
                    onChange={(e) => setToneCustom(e.target.value)}
                    disabled={!isAdmin}
                    maxLength={20}
                    minLength={3}
                    placeholder="ex.: descontraido"
                    autoComplete="off"
                  />
                </>
              ) : null}

              <label className={styles.fieldLabel} htmlFor="ai-model" style={{ marginTop: "0.85rem" }}>
                Modelo (opcional)
              </label>
              <input
                id="ai-model"
                className={styles.textInput}
                value={modelSlug}
                onChange={(e) => setModelSlug(e.target.value)}
                disabled={!isAdmin}
                maxLength={80}
                placeholder="ex.: claude-haiku-4-5-20251201"
                autoComplete="off"
              />
              <p className={styles.hint}>
                Haiku (ex.: claude-haiku-4-5-20251201) costuma ser bem mais barato que Sonnet para triagem rápida no
                WhatsApp. Deixe em branco para usar o padrão do servidor (<code>CLAUDE_MODEL</code>).
              </p>

              <label className={styles.fieldLabel} htmlFor="ai-instructions" style={{ marginTop: "0.85rem" }}>
                Instruções adicionais
              </label>
              <textarea
                id="ai-instructions"
                className={styles.textarea}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={!isAdmin}
                maxLength={4000}
                placeholder="Regras da empresa, tom extra, o que nunca prometer, horário de atendimento humano…"
              />
              <p className={styles.hint}>
                Máximo 4000 caracteres. Texto mais curto e objetivo reduz tokens de entrada a cada mensagem. Complementa
                o contexto de serviços e preços já enviado ao modelo.
              </p>

              <h3 className={styles.subsectionTitle} style={{ marginTop: "1.25rem" }}>
                O que a IA pode ver no contexto
              </h3>
              <p className={styles.hint}>
                Controla quais dados do sistema são enviados ao modelo (não impede o cliente de perguntar — a IA deve seguir as restrições abaixo).
              </p>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={contextServicesCatalog}
                  disabled={!isAdmin}
                  onChange={(e) => setContextServicesCatalog(e.target.checked)}
                />
                Catálogo de serviços (nome, descrição, duração)
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={contextServicePrices}
                  disabled={!isAdmin}
                  onChange={(e) => setContextServicePrices(e.target.checked)}
                />
                Preços base dos serviços
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={contextProducts}
                  disabled={!isAdmin}
                  onChange={(e) => setContextProducts(e.target.checked)}
                />
                Produtos e estoque (amostra)
              </label>

              <h3 className={styles.subsectionTitle} style={{ marginTop: "1.25rem" }}>
                Ações automáticas (ferramentas)
              </h3>
              <p className={styles.hint}>
                Cobrança e links de pagamento ficam desligados por padrão. Agenda leitura inclui listar visitas e consultar horários.
              </p>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={toolAgendaRead}
                  disabled={!isAdmin}
                  onChange={(e) => setToolAgendaRead(e.target.checked)}
                />
                Consultar agenda (minhas visitas, horários livres, opções de remarcação)
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={toolReschedule}
                  disabled={!isAdmin}
                  onChange={(e) => setToolReschedule(e.target.checked)}
                />
                Aplicar remarcação (após confirmação SIM do cliente)
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={toolCancel}
                  disabled={!isAdmin}
                  onChange={(e) => setToolCancel(e.target.checked)}
                />
                Cancelar visita (após confirmação SIM)
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={toolBilling}
                  disabled={!isAdmin}
                  onChange={(e) => setToolBilling(e.target.checked)}
                />
                Cobrança: link de pagamento e finalizar serviço
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={allowDirectSchedule}
                  disabled={!isAdmin}
                  onChange={(e) => setAllowDirectSchedule(e.target.checked)}
                />
                Permitir agendamento direto na agenda (sem aguardar confirmação humana)
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={allowAutoClientCreate}
                  disabled={!isAdmin || !allowDirectSchedule}
                  onChange={(e) => setAllowAutoClientCreate(e.target.checked)}
                />
                Se não houver cadastro, permitir criar cliente automaticamente ao agendar
              </label>

              <label className={styles.fieldLabel} htmlFor="ai-clarification" style={{ marginTop: "1rem" }}>
                Perguntas e esclarecimentos obrigatórios
              </label>
              <textarea
                id="ai-clarification"
                className={styles.textarea}
                value={clarificationInstructions}
                onChange={(e) => setClarificationInstructions(e.target.value)}
                disabled={!isAdmin}
                maxLength={4000}
                placeholder="Ex.: antes de falar em garantia, pergunte modelo do equipamento e data da instalação; antes de valores fechados, confirme endereço e escopo."
              />
              <p className={styles.hint}>
                Texto extra injetado no prompt: a IA deve fazer essas perguntas quando o tema exigir dados que não estão no sistema.
              </p>

              {isAdmin ? (
                <div className={styles.actions}>
                  <button type="button" className={styles.btnPrimary} disabled={saving} onClick={() => void onSave()}>
                    {saving ? "Salvando…" : "Salvar configurações"}
                  </button>
                  <button type="button" className={styles.btnDanger} disabled={saving} onClick={() => void onReset()}>
                    Restaurar padrões
                  </button>
                </div>
              ) : null}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Ferramentas (tools)</h2>
              <p className={styles.hint}>
                Ferramentas disponíveis para este tenant conforme as permissões acima (somente leitura). Salve as configurações para atualizar a lista.
              </p>
              <ul className={styles.toolList}>
                {tools.map((t) => (
                  <li key={t.name}>
                    <span className={styles.toolName}>{t.name}</span> — {t.description}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Histórico recente</h2>
            <p className={styles.hint}>Últimas interações registradas (mensagem do usuário → resposta do assistente).</p>
            {history.length === 0 ? (
              <p className={styles.hint}>Nenhum registro ainda.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>WhatsApp</th>
                      <th>Cliente</th>
                      <th>Resposta</th>
                      <th>Modelo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td className={styles.mono}>{formatDt(row.created_at)}</td>
                        <td className={styles.mono}>{row.client_whatsapp ?? "—"}</td>
                        <td>{truncate(row.user_message, 120)}</td>
                        <td>{truncate(row.assistant_response, 160)}</td>
                        <td className={styles.mono}>{row.used_model ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
