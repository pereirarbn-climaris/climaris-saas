import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RotateCcw, Save, Settings2 } from "lucide-react";
import {
  currentPreventiveMonthValue,
  listPreventiveItemsGrouped,
  parsePreventiveMonthValue,
  patchPreventiveSettings,
  patchPreventiveTemplateSettings,
  uploadPreventiveBannerImage,
  deletePreventiveBannerImage,
  type PreventiveLead,
  type PreventiveSettings,
} from "../../api/preventiveMaintenance";
import {
  PreventiveTemplateSettings,
  PreventiveWhatsAppPreview,
  type TemplateData,
} from "../../components/v0-ui/preventive";
import { CampaignEmptyState } from "./CampaignEmptyState";
import { PreventiveLeadsDataGrid } from "./PreventiveLeadsDataGrid";
import { PreventiveMetricsCards, type PreventiveTabMetrics } from "./PreventiveMetricsCards";
import { preventiveLeadUiStatus } from "../../lib/preventiveLeadStatus";
import styles from "./CampaignDashboard.module.css";
import { toast } from "../../lib/toast";
import {
  activeModelBody,
  activeModelFromList,
  buildPreventiveTemplateData,
  createEmptyPreventiveModel,
  MAX_PREVENTIVE_MESSAGE_MODELS,
  patchModelAttachment,
  patchModelAutomation,
  preventiveModelBannerPreviewUrl,
  preventiveModelOptions,
  updateModelInList,
  type PreventiveModelAutomation,
} from "../../lib/preventiveMessageTemplate";

type ConfigSection = 1 | 2 | 3;

export type PreventiveSettingsDraft = {
  preventive_auto_remind_days_before: number;
  preventive_default_template_model_id: string;
};

type Props = {
  canConfigure: boolean;
  loading: boolean;
  automationActive: boolean;
  settings: PreventiveSettings | null;
  leads: PreventiveLead[];
  settingsDraft: PreventiveSettingsDraft;
  onSettingsDraftChange: (patch: Partial<PreventiveSettingsDraft>) => void;
  onSettingsSaved: (next: PreventiveSettings) => void;
};

const SECTIONS: { id: ConfigSection; label: string }[] = [
  { id: 1, label: "Template da mensagem" },
  { id: 2, label: "Automação" },
  { id: 3, label: "Anexos" },
];

function buildTemplateData(settings: PreventiveSettings | null): TemplateData {
  return buildPreventiveTemplateData(settings);
}

function previewMessageForDraft(draft: TemplateData): string {
  return activeModelBody(draft.models, draft.activeModelId);
}

export function WhatsappPreventiveTab({
  canConfigure,
  loading,
  automationActive,
  settings,
  leads,
  settingsDraft,
  onSettingsDraftChange,
  onSettingsSaved,
}: Props) {
  const [configSection, setConfigSection] = useState<ConfigSection>(1);
  const [templateDraft, setTemplateDraft] = useState<TemplateData>(() => buildTemplateData(settings));
  const [saving, setSaving] = useState(false);
  const [activeEquipments, setActiveEquipments] = useState(0);

  useEffect(() => {
    setTemplateDraft(buildTemplateData(settings));
  }, [settings]);

  useEffect(() => {
    const parsed = parsePreventiveMonthValue(currentPreventiveMonthValue());
    if (!parsed) return;
    void listPreventiveItemsGrouped(parsed)
      .then((data) => {
        const count = data.clients.reduce((acc, g) => acc + g.equipments.length, 0);
        setActiveEquipments(count);
      })
      .catch(() => setActiveEquipments(0));
  }, []);

  const activeModel = useMemo(
    () => activeModelFromList(templateDraft.models, templateDraft.activeModelId),
    [templateDraft],
  );
  const modelAutomation = activeModel?.automation;

  const patchAutomation = useCallback(
    (patch: Partial<PreventiveModelAutomation>) => {
      setTemplateDraft((draft) => ({
        ...draft,
        models: patchModelAutomation(draft.models, draft.activeModelId, patch),
      }));
    },
    [],
  );

  const handleAddModel = useCallback(() => {
    setTemplateDraft((draft) => {
      if (draft.models.length >= MAX_PREVENTIVE_MESSAGE_MODELS) return draft;
      const nextModel = createEmptyPreventiveModel(draft.models, settings);
      return { models: [...draft.models, nextModel], activeModelId: nextModel.id };
    });
  }, [settings]);

  const handleRemoveModel = useCallback(() => {
    setTemplateDraft((draft) => {
      if (draft.models.length <= 1) return draft;
      const active = activeModelFromList(draft.models, draft.activeModelId);
      if (!active) return draft;
      const nextModels = draft.models.filter((m) => m.id !== active.id);
      return { models: nextModels, activeModelId: nextModels[0]?.id ?? "returning" };
    });
  }, []);

  const previewImageUrl = useMemo(() => {
    if (!activeModel?.attachment.promo_image_enabled) return "";
    return preventiveModelBannerPreviewUrl(activeModel);
  }, [activeModel]);

  const previewButtonEntries = useMemo(() => {
    if (!modelAutomation?.action_buttons_enabled) return [];
    const entries: { label: string; reply: string }[] = [];
    if (modelAutomation.button_schedule_enabled && modelAutomation.auto_schedule_enabled) {
      entries.push({
        label: modelAutomation.button_schedule_text || "Agendar agora",
        reply: "AGENDAR",
      });
    }
    if (modelAutomation.button_custom_enabled) {
      entries.push({
        label: modelAutomation.button_more_text || "Sim, quero saber mais",
        reply: "MAIS",
      });
    }
    return entries;
  }, [modelAutomation]);

  const previewBlock = (
    <div className={styles.messagePreviewBelow}>
      <PreventiveWhatsAppPreview
        message={previewMessageForDraft(templateDraft)}
        imageUrl={previewImageUrl}
        buttonEntries={previewButtonEntries}
        contactName="Ar Ideal Climatizadora"
      />
    </div>
  );

  const metrics = useMemo((): PreventiveTabMetrics => {
    const pendingLeads = leads.filter((l) => preventiveLeadUiStatus(l) === "pendente").length;
    const scheduled = leads.filter((l) => l.interest_kind === "schedule").length;
    const total = leads.length;
    const schedulingRate = total > 0 ? Math.round((scheduled / total) * 100) : 0;
    return { pendingLeads, activeEquipments, schedulingRate };
  }, [leads, activeEquipments]);

  const handleSaveAll = useCallback(async () => {
    if (!canConfigure || !settings) return;
    setSaving(true);
    try {
      const [templateNext, settingsNext] = await Promise.all([
        patchPreventiveTemplateSettings({
          preventive_message_models: templateDraft.models,
          preventive_default_template_model_id: settingsDraft.preventive_default_template_model_id,
        }),
        patchPreventiveSettings({
          preventive_auto_remind_days_before: Math.min(
            90,
            Math.max(0, Math.floor(Number(settingsDraft.preventive_auto_remind_days_before) || 0)),
          ),
          preventive_default_template_model_id: settingsDraft.preventive_default_template_model_id,
        }),
      ]);
      onSettingsSaved(settingsNext);
      setTemplateDraft(buildTemplateData(templateNext));
      toast.success("Configurações preventiva salvas com sucesso.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar configurações preventiva.");
    } finally {
      setSaving(false);
    }
  }, [canConfigure, settings, templateDraft, settingsDraft, onSettingsSaved]);

  const handleRestoreTemplate = useCallback(() => {
    const fallbackReturning =
      settings?.default_message_template_returning?.trim() ||
      settings?.default_message_template?.trim() ||
      "Olá, {cliente}! Notamos que faz {intervalo} desde a última manutenção do seu {equipamento} ({marca_modelo}). Vamos agendar a próxima preventiva?";
    const fallbackFirst =
      settings?.default_message_template_first?.trim() ||
      "Olá, {cliente}! Tudo bem? Está na hora da primeira higienização completa do seu {equipamento}. A limpeza regular garante eficiência energética e qualidade do ar. Vamos agendar?";
    setTemplateDraft((draft) => {
      const active = draft.models.find((m) => m.id === draft.activeModelId) ?? draft.models[0];
      if (!active) return draft;
      const defaultBody = active.id === "first" ? fallbackFirst : fallbackReturning;
      return {
        ...draft,
        models: draft.models.map((m) =>
          m.id === active.id ? { ...m, body: defaultBody } : m,
        ),
      };
    });
  }, [settings]);

  const modelOptions = useMemo(() => preventiveModelOptions(settings), [settings]);

  if (!settings) {
    return (
      <CampaignEmptyState
        icon={<Settings2 size={28} strokeWidth={1.75} />}
        title="Configurações indisponíveis"
        description="Não foi possível carregar as configurações de gestão preventiva. Atualize a página ou verifique o módulo WhatsApp."
      />
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1>Gestão preventiva</h1>
          <p>
            Template de alerta, automação de lembretes e fila de interessados que responderam no WhatsApp.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/app/preventive-maintenance" className={styles.btnGhost}>
            Abrir vencimentos
          </Link>
        </div>
      </header>

      {!automationActive ? (
        <div className={styles.panelCard} style={{ borderColor: "#fcd34d", background: "#fffbeb" }}>
          <p className={styles.hint} style={{ margin: 0, color: "#92400e" }}>
            Automação WhatsApp desativada — lembretes automáticos e respostas AGENDAR não serão processados
            até ativar em Conexão → Automação WhatsApp.
          </p>
        </div>
      ) : null}

      <main className={styles.dashboard}>
        <PreventiveMetricsCards metrics={metrics} loading={loading} />

        {canConfigure ? (
          <section className={styles.panelCard}>
            <h2 className={styles.panelTitle}>Configuração</h2>
            <p className={styles.hint} style={{ marginTop: "-0.75rem" }}>
              Configurações por modelo: texto, automação e anexo são independentes para cada modelo.
              {modelAutomation?.ai_message_enabled
                ? modelAutomation.ai_message_fidelity === "faithful"
                  ? " No envio, a IA faz ajustes leves mantendo o texto o mais fiel possível ao template."
                  : " No envio, a IA personaliza o tom dentro deste modelo."
                : " No envio, a mensagem será enviada exatamente como no template."}
              {modelAutomation?.action_buttons_enabled
                ? " Botões de ação serão enviados junto à mensagem (ou em seguida, se houver banner)."
                : modelAutomation?.auto_schedule_enabled
                  ? " O cliente também pode responder AGENDAR por texto."
                  : ""}
            </p>

            <div className="mb-4">
              <p className={styles.fieldLabel}>
                Modelo em edição ({templateDraft.models.length}/{MAX_PREVENTIVE_MESSAGE_MODELS})
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {templateDraft.models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    disabled={loading || saving}
                    onClick={() => setTemplateDraft((d) => ({ ...d, activeModelId: model.id }))}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      templateDraft.activeModelId === model.id
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {model.name}
                  </button>
                ))}
                {templateDraft.models.length < MAX_PREVENTIVE_MESSAGE_MODELS ? (
                  <button
                    type="button"
                    disabled={loading || saving}
                    onClick={handleAddModel}
                    className="px-3 py-2 rounded-lg text-sm font-medium border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50"
                  >
                    + Novo modelo
                  </button>
                ) : null}
              </div>
              <label className={styles.fieldLabel} htmlFor="wa-prev-model-name">
                Nome do modelo ativo
              </label>
              <input
                id="wa-prev-model-name"
                className={styles.textInput}
                value={activeModel?.name ?? ""}
                maxLength={80}
                disabled={loading || saving}
                onChange={(e) =>
                  setTemplateDraft((draft) => ({
                    ...draft,
                    models: updateModelInList(draft.models, draft.activeModelId, {
                      name: e.target.value,
                    }),
                  }))
                }
              />
              {templateDraft.models.length > 1 ? (
                <button
                  type="button"
                  disabled={loading || saving}
                  onClick={handleRemoveModel}
                  className="mt-2 text-sm text-red-600 hover:underline"
                >
                  Remover modelo &quot;{activeModel?.name}&quot;
                </button>
              ) : null}
            </div>

            <nav className={styles.sectionNav} aria-label="Seções de configuração">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.sectionNavBtn} ${configSection === s.id ? styles.sectionNavBtnActive : ""}`}
                  onClick={() => setConfigSection(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </nav>

            <div className={styles.configLayoutSingle}>
              <div>
                {configSection === 1 ? (
                  <PreventiveTemplateSettings
                    variant="embedded"
                    activeSection="template"
                    showInlinePreview={false}
                    showFooter={false}
                    showModelSelector={false}
                    showBelowMessagePreview
                    previewContactName="Ar Ideal Climatizadora"
                    data={templateDraft}
                    onDataChange={setTemplateDraft}
                    isLoading={loading || saving}
                  />
                ) : null}

                {configSection === 2 && modelAutomation ? (
                  <div className="space-y-4">
                    <div className={styles.aiSettingsCard}>
                      <label className={styles.toggleRow}>
                        <input
                          type="checkbox"
                          checked={modelAutomation.ai_message_enabled}
                          disabled={loading || saving}
                          onChange={(e) => patchAutomation({ ai_message_enabled: e.target.checked })}
                        />
                        <span>Usar IA para personalizar a mensagem no envio</span>
                      </label>
                      {modelAutomation.ai_message_enabled ? (
                        <div className={styles.aiFidelityBlock}>
                          <p className={styles.fieldLabel} id="wa-prev-ai-fidelity-label">
                            Estilo da personalização
                          </p>
                          <div
                            className={styles.aiFidelityOptions}
                            role="radiogroup"
                            aria-labelledby="wa-prev-ai-fidelity-label"
                          >
                            <label className={styles.aiFidelityOption}>
                              <input
                                type="radio"
                                name="preventive-ai-fidelity"
                                value="faithful"
                                checked={modelAutomation.ai_message_fidelity === "faithful"}
                                disabled={loading || saving}
                                onChange={() => patchAutomation({ ai_message_fidelity: "faithful" })}
                              />
                              <span>
                                <strong>Fiel ao template</strong>
                                <small>Polimento leve — preserva frases e estrutura do texto escrito.</small>
                              </span>
                            </label>
                            <label className={styles.aiFidelityOption}>
                              <input
                                type="radio"
                                name="preventive-ai-fidelity"
                                value="balanced"
                                checked={modelAutomation.ai_message_fidelity === "balanced"}
                                disabled={loading || saving}
                                onChange={() => patchAutomation({ ai_message_fidelity: "balanced" })}
                              />
                              <span>
                                <strong>Personalizada</strong>
                                <small>Reescreve com tom cordial, mantendo os mesmos fatos do template.</small>
                              </span>
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <label className={styles.toggleRow}>
                      <input
                        type="checkbox"
                        checked={modelAutomation.action_buttons_enabled}
                        disabled={loading || saving}
                        onChange={(e) =>
                          patchAutomation({ action_buttons_enabled: e.target.checked })
                        }
                      />
                      <span>Incluir botões de ação na mensagem</span>
                    </label>

                    {modelAutomation.action_buttons_enabled ? (
                      <div className={styles.buttonHighlightGrid}>
                        {modelAutomation.button_schedule_enabled &&
                        modelAutomation.auto_schedule_enabled ? (
                          <div className={styles.buttonHighlightCard}>
                            <strong>Botão Agendar</strong>
                            <span>{modelAutomation.button_schedule_text || "Agendar agora"}</span>
                          </div>
                        ) : null}
                        {modelAutomation.button_custom_enabled ? (
                          <div className={styles.buttonHighlightCard}>
                            <strong>Botão personalizado</strong>
                            <span>{modelAutomation.button_more_text || "Sim, quero saber mais"}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <label className={styles.toggleRow}>
                      <input
                        type="checkbox"
                        checked={modelAutomation.auto_schedule_enabled}
                        disabled={loading || saving}
                        onChange={(e) =>
                          patchAutomation({ auto_schedule_enabled: e.target.checked })
                        }
                      />
                      <span>Auto-agendamento (fluxo AGENDAR → quantidade → horários → OS)</span>
                    </label>
                    <p className={styles.hint}>
                      Necessário para o botão <strong>Agendar</strong>. O cliente também pode digitar AGENDAR
                      quando esta opção estiver ativa, mesmo sem botões na mensagem.
                    </p>

                    {modelAutomation.action_buttons_enabled ? (
                      <div className="space-y-4 rounded-lg border border-slate-200 p-4">
                        <p className={styles.fieldLabel} style={{ margin: 0 }}>
                          Botões na mensagem
                        </p>

                        <div className={styles.toggleBlock}>
                          <label className={styles.toggleRow}>
                            <input
                              type="checkbox"
                              checked={
                                modelAutomation.button_schedule_enabled &&
                                modelAutomation.auto_schedule_enabled
                              }
                              disabled={loading || saving || !modelAutomation.auto_schedule_enabled}
                              onChange={(e) =>
                                patchAutomation({ button_schedule_enabled: e.target.checked })
                              }
                            />
                            <span>Botão Agendar (padrão)</span>
                          </label>
                          {!modelAutomation.auto_schedule_enabled ? (
                            <p className={styles.toggleHint}>
                              Ative o auto-agendamento acima para incluir o botão Agendar.
                            </p>
                          ) : null}
                        </div>
                        <label className={styles.fieldLabel} htmlFor="wa-prev-btn-schedule">
                          Texto do botão Agendar
                        </label>
                        <input
                          id="wa-prev-btn-schedule"
                          className={styles.textInput}
                          value={modelAutomation.button_schedule_text}
                          disabled={!modelAutomation.button_schedule_enabled}
                          onChange={(e) =>
                            patchAutomation({ button_schedule_text: e.target.value })
                          }
                          placeholder="Agendar agora"
                        />

                        <label className={styles.toggleRow}>
                          <input
                            type="checkbox"
                            checked={modelAutomation.button_custom_enabled}
                            disabled={loading || saving}
                            onChange={(e) =>
                              patchAutomation({ button_custom_enabled: e.target.checked })
                            }
                          />
                          <span>Botão personalizado</span>
                        </label>
                        <label className={styles.fieldLabel} htmlFor="wa-prev-btn-more">
                          Texto do botão personalizado
                        </label>
                        <input
                          id="wa-prev-btn-more"
                          className={styles.textInput}
                          value={modelAutomation.button_more_text}
                          disabled={!modelAutomation.button_custom_enabled}
                          onChange={(e) => patchAutomation({ button_more_text: e.target.value })}
                          placeholder="Sim, quero saber mais"
                        />

                        <label className={styles.fieldLabel} htmlFor="wa-prev-custom-result">
                          Resultado ao clicar no botão personalizado
                        </label>
                        <select
                          id="wa-prev-custom-result"
                          className={styles.textInput}
                          value={modelAutomation.button_custom_result}
                          disabled={!modelAutomation.button_custom_enabled}
                          onChange={(e) => {
                            const v = e.target.value;
                            const result =
                              v === "reply" || v === "handoff" || v === "url" ? v : "lead";
                            patchAutomation({ button_custom_result: result });
                          }}
                        >
                          <option value="lead">Registrar interesse (lista de Interessados)</option>
                          <option value="reply">Enviar resposta automática ao cliente</option>
                          <option value="handoff">Encaminhar para atendente humano</option>
                          <option value="url">Enviar link (URL) ao cliente</option>
                        </select>

                        {modelAutomation.button_custom_result === "lead" ? (
                          <p className={styles.hint}>
                            O cliente aparecerá em Interessados com status pendente para sua equipe
                            acompanhar.
                          </p>
                        ) : null}

                        {modelAutomation.button_custom_result === "reply" ? (
                          <>
                            <label className={styles.fieldLabel} htmlFor="wa-prev-custom-reply">
                              Mensagem de resposta automática
                            </label>
                            <textarea
                              id="wa-prev-custom-reply"
                              className={styles.textarea}
                              rows={4}
                              value={modelAutomation.button_custom_reply_text}
                              disabled={!modelAutomation.button_custom_enabled}
                              onChange={(e) =>
                                patchAutomation({ button_custom_reply_text: e.target.value })
                              }
                              placeholder="Ex.: Obrigado pelo interesse! Nossa equipe entrará em contato em breve."
                            />
                          </>
                        ) : null}

                        {modelAutomation.button_custom_result === "handoff" ? (
                          <>
                            <p className={styles.hint}>
                              Pausa o assistente de IA para este cliente e sinaliza atendimento humano.
                            </p>
                            <label className={styles.fieldLabel} htmlFor="wa-prev-custom-handoff-msg">
                              Mensagem ao cliente (opcional)
                            </label>
                            <textarea
                              id="wa-prev-custom-handoff-msg"
                              className={styles.textarea}
                              rows={3}
                              value={modelAutomation.button_custom_reply_text}
                              disabled={!modelAutomation.button_custom_enabled}
                              onChange={(e) =>
                                patchAutomation({ button_custom_reply_text: e.target.value })
                              }
                              placeholder="Perfeito! Um atendente vai falar com você em breve."
                            />
                          </>
                        ) : null}

                        {modelAutomation.button_custom_result === "url" ? (
                          <>
                            <label className={styles.fieldLabel} htmlFor="wa-prev-custom-url">
                              Link (URL)
                            </label>
                            <input
                              id="wa-prev-custom-url"
                              className={styles.textInput}
                              type="url"
                              value={modelAutomation.button_custom_url}
                              disabled={!modelAutomation.button_custom_enabled}
                              onChange={(e) =>
                                patchAutomation({ button_custom_url: e.target.value })
                              }
                              placeholder="https://exemplo.com.br/promocao"
                            />
                            <label className={styles.fieldLabel} htmlFor="wa-prev-custom-url-intro">
                              Texto antes do link (opcional)
                            </label>
                            <textarea
                              id="wa-prev-custom-url-intro"
                              className={styles.textarea}
                              rows={2}
                              value={modelAutomation.button_custom_reply_text}
                              disabled={!modelAutomation.button_custom_enabled}
                              onChange={(e) =>
                                patchAutomation({ button_custom_reply_text: e.target.value })
                              }
                              placeholder="Confira os detalhes da promoção:"
                            />
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    <label className={styles.fieldLabel} htmlFor="wa-prev-hint">
                      Problema técnico (tag {"{problema}"} em templates legados)
                    </label>
                    <textarea
                      id="wa-prev-hint"
                      className={styles.textarea}
                      value={modelAutomation.technical_problem_hint}
                      onChange={(e) =>
                        patchAutomation({ technical_problem_hint: e.target.value })
                      }
                      placeholder="Ex.: perdas de eficiência energética e PMOC"
                    />

                    <label className={styles.fieldLabel} htmlFor="wa-prev-auto-days">
                      Lembrete automático (dias antes do vencimento; 0 = no dia)
                    </label>
                    <input
                      id="wa-prev-auto-days"
                      className={styles.textInput}
                      type="number"
                      min={0}
                      max={90}
                      value={settingsDraft.preventive_auto_remind_days_before}
                      onChange={(e) =>
                        onSettingsDraftChange({
                          preventive_auto_remind_days_before: Number(e.target.value),
                        })
                      }
                    />

                    <label className={styles.fieldLabel} htmlFor="wa-prev-default-template">
                      Modelo padrão em novos lembretes
                    </label>
                    <select
                      id="wa-prev-default-template"
                      className={styles.textInput}
                      value={settingsDraft.preventive_default_template_model_id}
                      disabled={loading || saving}
                      onChange={(e) =>
                        onSettingsDraftChange({
                          preventive_default_template_model_id: e.target.value,
                        })
                      }
                    >
                      {modelOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className={styles.hint}>
                      Pré-selecionado ao cadastrar um lembrete em Gestão preventiva. Você pode alterar
                      por lembrete no formulário de cadastro ou edição.
                    </p>
                    <p className={styles.hint}>
                      O envio automático por cliente também pode ser ligado em{" "}
                      <Link to="/app/preventive-maintenance">Gestão preventiva → vencimentos</Link>.
                    </p>
                    {previewBlock}
                  </div>
                ) : null}

                {configSection === 3 ? (
                  <PreventiveTemplateSettings
                    variant="embedded"
                    activeSection="attachments"
                    showInlinePreview={false}
                    showFooter={false}
                    showModelSelector={false}
                    data={templateDraft}
                    onDataChange={setTemplateDraft}
                    isLoading={loading || saving}
                    onUploadBanner={async (file) => {
                      const next = await uploadPreventiveBannerImage(file, templateDraft.activeModelId);
                      onSettingsSaved(next);
                      const url = preventiveModelBannerPreviewUrl(
                        activeModelFromList(
                          buildTemplateData(next).models,
                          templateDraft.activeModelId,
                        )!,
                      );
                      setTemplateDraft((d) => ({
                        ...d,
                        models: patchModelAttachment(
                          buildTemplateData(next).models,
                          d.activeModelId,
                          { promo_image_enabled: true, has_banner: true, promo_image_url: url || null },
                        ),
                      }));
                      toast.success("Banner salvo para este modelo.");
                      return url;
                    }}
                    onRemoveBanner={async () => {
                      const next = await deletePreventiveBannerImage(templateDraft.activeModelId);
                      onSettingsSaved(next);
                      setTemplateDraft((d) => ({
                        ...d,
                        models: patchModelAttachment(d.models, d.activeModelId, {
                          promo_image_enabled: false,
                          has_banner: false,
                          promo_image_url: null,
                        }),
                      }));
                      toast.success("Banner removido deste modelo.");
                    }}
                  />
                ) : null}
                {configSection === 3 ? previewBlock : null}
              </div>
            </div>

            <div className={styles.stickyFooter}>
              <p>
                Salve template, automação e lembrete automático de uma vez. Lembretes manuais em{" "}
                <Link to="/app/preventive-maintenance">vencimentos por equipamento</Link>.
              </p>
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={saving || loading}
                  onClick={handleRestoreTemplate}
                >
                  <RotateCcw size={16} />
                  Restaurar template
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={saving || loading}
                  onClick={() => void handleSaveAll()}
                >
                  <Save size={16} />
                  {saving ? "Salvando…" : "Salvar configurações preventiva"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.panelCard}>
            <h2 className={styles.panelTitle}>Configuração do template</h2>
            <p className={styles.hint}>
              Somente administradores podem editar. Você pode visualizar interessados abaixo.
            </p>
            <div className={styles.messagePreviewBelow}>
              <PreventiveWhatsAppPreview
                message={previewMessageForDraft(templateDraft)}
                imageUrl={previewImageUrl}
                buttonEntries={previewButtonEntries}
                contactName="Ar Ideal Climatizadora"
              />
            </div>
          </section>
        )}

        <PreventiveLeadsDataGrid leads={leads} loading={loading} />
      </main>
    </div>
  );
}
