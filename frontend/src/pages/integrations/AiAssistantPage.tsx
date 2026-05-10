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

const AI_ASSISTANT_V2_ENABLED = false;

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

  if (!AI_ASSISTANT_V2_ENABLED) {
    return (
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>Integrações</p>
            <h1 className={styles.heroTitle}>Assistente IA — reservado para V2</h1>
            <p className={styles.heroLead}>
              A V1 do bot WhatsApp usará fluxos determinísticos, menus e respostas pré-programadas por empresa. A camada de
              IA fica desativada até a próxima fase do produto.
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
        <section className={`${styles.card} ${styles.cardWide}`}>
          <h2 className={styles.cardTitle}>O que fica ativo agora</h2>
          <p className={styles.hint}>
            Configuração da conexão Evolution, lembretes de agendamento e o futuro construtor de bot sem IA. Nenhuma chamada
            para endpoints de IA é feita nesta página enquanto a V2 estiver desligada.
          </p>
        </section>
      </div>
    );
  }

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
      });
      setSettings(next);
      applySettingsToForm(next);
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
                placeholder="ex.: claude-3-5-sonnet-latest"
                autoComplete="off"
              />
              <p className={styles.hint}>Deixe em branco para usar o padrão configurado no servidor.</p>

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
              <p className={styles.hint}>Máximo 4000 caracteres. Complementa o contexto de serviços e preços já enviado ao modelo.</p>

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
                Ações que o modelo pode solicitar (agenda, links de pagamento, etc.). Somente leitura.
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
