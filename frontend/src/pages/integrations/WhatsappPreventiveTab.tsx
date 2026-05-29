import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, RotateCcw, Save, Settings2 } from "lucide-react";
import {
  currentPreventiveMonthValue,
  listPreventiveItemsGrouped,
  parsePreventiveMonthValue,
  patchPreventiveSettings,
  patchPreventiveTemplateSettings,
  preventiveBannerPreviewUrl,
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

type ConfigSection = 1 | 2 | 3;

export type PreventiveSettingsDraft = {
  preventive_technical_problem_hint: string;
  preventive_button_more_text: string;
  preventive_button_schedule_text: string;
  preventive_auto_remind_days_before: number;
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
  const fallback =
    settings?.default_message_template?.trim() ||
    "Olá, {cliente}! Notamos que faz {intervalo} desde a última manutenção do seu {equipamento} ({marca_modelo}). Vamos agendar a próxima preventiva?";
  return {
    messageBody: settings?.preventive_message_template?.trim() || fallback,
    imageUrl: preventiveBannerPreviewUrl(settings),
    sendImage: settings?.preventive_promo_image_enabled === true,
  };
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

  const metrics = useMemo((): PreventiveTabMetrics => {
    const pendingLeads = leads.filter((l) => preventiveLeadUiStatus(l) === "pendente").length;
    const scheduled = leads.filter((l) => l.interest_kind === "schedule").length;
    const total = leads.length;
    const schedulingRate = total > 0 ? Math.round((scheduled / total) * 100) : 0;
    return { pendingLeads, activeEquipments, schedulingRate };
  }, [leads, activeEquipments]);

  const defaultMore =
    settings?.preventive_button_more_text?.trim() || "Sim, quero saber mais";
  const defaultSchedule =
    settings?.preventive_button_schedule_text?.trim() || "Agendar agora";

  const handleSaveAll = useCallback(async () => {
    if (!canConfigure || !settings) return;
    setSaving(true);
    try {
      const [templateNext, settingsNext] = await Promise.all([
        patchPreventiveTemplateSettings({
          preventive_message_template: templateDraft.messageBody.trim() || null,
          preventive_promo_image_enabled: templateDraft.sendImage,
        }),
        patchPreventiveSettings({
          preventive_technical_problem_hint:
            settingsDraft.preventive_technical_problem_hint.trim() || null,
          preventive_button_more_text:
            settingsDraft.preventive_button_more_text.trim() || undefined,
          preventive_button_schedule_text:
            settingsDraft.preventive_button_schedule_text.trim() || undefined,
          preventive_auto_remind_days_before: Math.min(
            90,
            Math.max(0, Math.floor(Number(settingsDraft.preventive_auto_remind_days_before) || 0)),
          ),
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
    const fallback =
      settings?.default_message_template?.trim() ||
      "Olá, {cliente}! Notamos que faz {intervalo} desde a última manutenção do seu {equipamento} ({marca_modelo}). Vamos agendar a próxima preventiva?";
    setTemplateDraft({
      messageBody: fallback,
      imageUrl: preventiveBannerPreviewUrl(settings),
      sendImage: false,
    });
  }, [settings]);

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
            Automação WhatsApp desativada — lembretes automáticos e respostas MAIS/AGENDAR não serão processados
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
              Na hora do envio, a IA personaliza o texto dentro deste modelo (sem inventar dados). Respostas usam
              somente texto — MAIS / AGENDAR.
            </p>

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

            <div className={styles.configLayout}>
              <div>
                {configSection === 1 ? (
                  <PreventiveTemplateSettings
                    variant="embedded"
                    activeSection="template"
                    showInlinePreview={false}
                    showFooter={false}
                    data={templateDraft}
                    onDataChange={setTemplateDraft}
                    isLoading={loading || saving}
                  />
                ) : null}

                {configSection === 2 ? (
                  <div className="space-y-4">
                    <div className={styles.buttonHighlightGrid}>
                      <div className={styles.buttonHighlightCard}>
                        <strong>Botão &quot;saber mais&quot;</strong>
                        <span>{settingsDraft.preventive_button_more_text || defaultMore}</span>
                      </div>
                      <div className={styles.buttonHighlightCard}>
                        <strong>Botão agendar</strong>
                        <span>{settingsDraft.preventive_button_schedule_text || defaultSchedule}</span>
                      </div>
                    </div>

                    <label className={styles.fieldLabel} htmlFor="wa-prev-hint">
                      Problema técnico (tag {"{problema}"} em templates legados)
                    </label>
                    <textarea
                      id="wa-prev-hint"
                      className={styles.textarea}
                      value={settingsDraft.preventive_technical_problem_hint}
                      onChange={(e) =>
                        onSettingsDraftChange({ preventive_technical_problem_hint: e.target.value })
                      }
                      placeholder="Ex.: perdas de eficiência energética e PMOC"
                    />

                    <label className={styles.fieldLabel} htmlFor="wa-prev-btn-more">
                      Rótulo botão &quot;saber mais&quot;
                    </label>
                    <input
                      id="wa-prev-btn-more"
                      className={styles.textInput}
                      value={settingsDraft.preventive_button_more_text}
                      onChange={(e) =>
                        onSettingsDraftChange({ preventive_button_more_text: e.target.value })
                      }
                      placeholder={defaultMore}
                    />

                    <label className={styles.fieldLabel} htmlFor="wa-prev-btn-schedule">
                      Rótulo botão agendar
                    </label>
                    <input
                      id="wa-prev-btn-schedule"
                      className={styles.textInput}
                      value={settingsDraft.preventive_button_schedule_text}
                      onChange={(e) =>
                        onSettingsDraftChange({ preventive_button_schedule_text: e.target.value })
                      }
                      placeholder={defaultSchedule}
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
                    <p className={styles.hint}>
                      O envio automático por cliente também pode ser ligado em{" "}
                      <Link to="/app/preventive-maintenance">Gestão preventiva → vencimentos</Link>.
                    </p>
                  </div>
                ) : null}

                {configSection === 3 ? (
                  <PreventiveTemplateSettings
                    variant="embedded"
                    activeSection="attachments"
                    showInlinePreview={false}
                    showFooter={false}
                    data={templateDraft}
                    onDataChange={setTemplateDraft}
                    isLoading={loading || saving}
                    onUploadBanner={async (file) => {
                      const next = await uploadPreventiveBannerImage(file);
                      onSettingsSaved(next);
                      const url = preventiveBannerPreviewUrl(next);
                      setTemplateDraft((d) => ({ ...d, imageUrl: url, sendImage: true }));
                      toast.success("Banner salvo no armazenamento.");
                      return url;
                    }}
                    onRemoveBanner={async () => {
                      const next = await deletePreventiveBannerImage();
                      onSettingsSaved(next);
                      setTemplateDraft((d) => ({ ...d, imageUrl: "", sendImage: false }));
                      toast.success("Banner removido.");
                    }}
                  />
                ) : null}
              </div>

              <aside className={styles.previewSticky} aria-label="Prévia da mensagem">
                <p className={styles.fieldLabel}>Prévia em tempo real</p>
                <div
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-2 flex justify-center"
                >
                  <PreventiveWhatsAppPreview
                    message={templateDraft.messageBody}
                    imageUrl={templateDraft.imageUrl}
                  />
                </div>
                <p className={styles.hint} style={{ marginTop: "0.5rem", textAlign: "center" }}>
                  Reflete template e banner conforme você edita.
                </p>
              </aside>
            </div>

            <div className={styles.stickyFooter}>
              <p>
                Salve template, rótulos dos botões e lembrete automático de uma vez. Lembretes manuais em{" "}
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
            <div className={styles.configLayout}>
              <p className={styles.hint} style={{ margin: 0 }}>
                <MessageSquare size={16} style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />
                Mensagens enviadas com base no template cadastrado pela equipe.
              </p>
              <aside className={styles.previewSticky}>
                <PreventiveWhatsAppPreview
                  message={templateDraft.messageBody}
                  imageUrl={templateDraft.imageUrl}
                />
              </aside>
            </div>
          </section>
        )}

        <PreventiveLeadsDataGrid leads={leads} loading={loading} />
      </main>
    </div>
  );
}
