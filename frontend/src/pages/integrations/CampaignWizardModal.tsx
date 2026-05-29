import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gauge,
  ImageIcon,
  Save,
  Send,
  Shield,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { RefObject } from "react";
import type { CampaignAsset, CampaignExternalLead, CampaignPreview } from "../../api/whatsappCampaigns";
import styles from "./CampaignDashboard.module.css";
import {
  SPEED_OPTIONS,
  defaultScheduleDate,
  formatEta,
  formatScheduleSummary,
  type ScheduleMode,
  type SendSpeed,
  type SpeedIconKind,
} from "./campaignDashboardUtils";

const SPEED_ICONS: Record<SpeedIconKind, typeof Zap> = {
  zap: Zap,
  gauge: Gauge,
  shield: Shield,
};

type SelectionMode = "automatic" | "manual";
type ClientRow = CampaignPreview["clients"][number];

const WIZARD_STEPS = [
  { id: 1, label: "Conteúdo" },
  { id: 2, label: "Mídia" },
  { id: 3, label: "Público" },
  { id: 4, label: "Revisão" },
  { id: 5, label: "Agendamento" },
] as const;

export type CampaignWizardModalProps = {
  open: boolean;
  onClose: () => void;
  step: number;
  setStep: (n: number) => void;
  busy: boolean;
  name: string;
  setName: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  asset: CampaignAsset | null;
  fileInputRef: RefObject<HTMLInputElement>;
  onUpload: (file: File | undefined) => void;
  onRemoveAsset: () => void;
  sendSpeed: SendSpeed;
  setSendSpeed: (v: SendSpeed) => void;
  selectionMode: SelectionMode;
  changeSelectionMode: (m: SelectionMode) => void;
  inactiveDays: number;
  setInactiveDays: (n: number) => void;
  externalLeads: CampaignExternalLead[];
  leadsFileInputRef: RefObject<HTMLInputElement>;
  onImportLeads: (file: File | undefined) => void;
  onDownloadTemplate: () => void;
  clearImportedLeads: () => void;
  clients: ClientRow[];
  clientSearch: string;
  setClientSearch: (v: string) => void;
  selectedClients: Map<number, ClientRow>;
  toggleClient: (c: ClientRow, checked: boolean) => void;
  selectedClientList: ClientRow[];
  preview: CampaignPreview | null;
  previewMode: SelectionMode | null;
  previewIsStale: boolean;
  previewRecipients: () => void;
  hasAnyRecipients: boolean;
  currentRecipientCount: number | null;
  dispatchProgress: { pct: number; label: string } | null;
  scheduleMode: ScheduleMode;
  setScheduleMode: (m: ScheduleMode) => void;
  scheduleDate: string;
  setScheduleDate: (v: string) => void;
  scheduleTime: string;
  setScheduleTime: (v: string) => void;
  scheduleSummary: string;
  isScheduledLater: boolean;
  onSaveModel: () => void;
  onSend: () => void;
};

export function CampaignWizardModal(props: CampaignWizardModalProps) {
  if (!props.open) return null;

  const {
    onClose,
    step,
    setStep,
    busy,
    name,
    setName,
    message,
    setMessage,
    asset,
    fileInputRef,
    onUpload,
    onRemoveAsset,
    sendSpeed,
    setSendSpeed,
    selectionMode,
    changeSelectionMode,
    inactiveDays,
    setInactiveDays,
    externalLeads,
    leadsFileInputRef,
    onImportLeads,
    onDownloadTemplate,
    clearImportedLeads,
    clients,
    clientSearch,
    setClientSearch,
    selectedClients,
    toggleClient,
    selectedClientList,
    preview,
    previewMode,
    previewIsStale,
    previewRecipients,
    hasAnyRecipients,
    currentRecipientCount,
    dispatchProgress,
    scheduleMode,
    setScheduleMode,
    scheduleDate,
    setScheduleDate,
    scheduleTime,
    setScheduleTime,
    scheduleSummary,
    isScheduledLater,
    onSaveModel,
    onSend,
  } = props;

  const minDate = defaultScheduleDate();

  const canNext =
    (step === 1 && name.trim().length >= 2 && message.trim().length >= 5) ||
    step === 2 ||
    step === 3 ||
    step === 4 ||
    (step === 5 &&
      scheduleMode === "now") ||
    (step === 5 && scheduleMode === "later" && Boolean(scheduleDate && scheduleTime));

  const primaryActionLabel =
    busy && dispatchProgress
      ? "Processando…"
      : isScheduledLater
        ? "Agendar disparo"
        : "Disparar campanha";

  return (
    <div className={styles.wizardOverlay} role="dialog" aria-modal="true" aria-label="Nova campanha">
      <header className={styles.wizardTop}>
        <button type="button" className={styles.btnIcon} onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <h2>Nova campanha</h2>
        <nav className={styles.stepper} aria-label="Etapas">
          {WIZARD_STEPS.map((s, idx) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className={styles.stepItem}>
                <div
                  className={`${styles.stepDot} ${active ? styles.stepDotActive : ""} ${done ? styles.stepDotDone : ""}`}
                >
                  {done ? <Check size={14} /> : s.id}
                </div>
                <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ""}`}>{s.label}</span>
                {idx < WIZARD_STEPS.length - 1 ? (
                  <div className={`${styles.stepLine} ${done ? styles.stepLineDone : ""}`} />
                ) : null}
              </div>
            );
          })}
        </nav>
        <div style={{ width: "2.25rem" }} />
      </header>

      <div className={styles.wizardBody}>
        <div className={styles.wizardContent}>
          {step === 1 ? (
            <>
              <label className={styles.fieldLabel}>Nome da campanha</label>
              <input
                className={styles.textInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Reativação clientes inativos"
              />
              <label className={styles.fieldLabel}>Mensagem</label>
              <textarea
                className={styles.textarea}
                rows={7}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className={styles.hint}>
                Variáveis: {"{nome_cliente}"}, {"{cliente}"} e {"{empresa}"}.
              </p>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className={styles.hint}>
                <ImageIcon size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                Imagem opcional enviada junto com o texto (WebP/JPEG/PNG).
              </p>
              {asset ? (
                <div className={styles.reviewBox} style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  <img src={asset.url} alt="Mídia da campanha" style={{ maxWidth: 140, borderRadius: 10 }} />
                  <div>
                    <p className={styles.hint} style={{ margin: "0 0 0.5rem" }}>
                      Arquivo no S3.
                    </p>
                    <button type="button" className={styles.btnGhost} disabled={busy} onClick={onRemoveAsset}>
                      Remover imagem
                    </button>
                  </div>
                </div>
              ) : (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => onUpload(e.target.files?.[0])}
                />
              )}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <label className={styles.fieldLabel}>Velocidade de envio (anti-ban)</label>
              <div className={styles.selectionGrid}>
                {SPEED_OPTIONS.map((opt) => {
                  const Icon = SPEED_ICONS[opt.icon];
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`${styles.selectCard} ${sendSpeed === opt.value ? styles.selectCardActive : ""}`}
                      onClick={() => setSendSpeed(opt.value)}
                    >
                      <span className={styles.selectCardIcon}>
                        <Icon size={22} strokeWidth={2} />
                      </span>
                      <p className={styles.selectCardTitle}>{opt.title}</p>
                      <p className={styles.selectCardSub}>{opt.subtitle}</p>
                      <p className={styles.selectCardMeta}>{opt.delay}</p>
                    </button>
                  );
                })}
              </div>

              <label className={styles.fieldLabel}>
                <Users size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                Destinatários
              </label>
              <div className={styles.modeGrid}>
                <button
                  type="button"
                  className={`${styles.selectCard} ${selectionMode === "automatic" ? styles.selectCardActive : ""}`}
                  onClick={() => changeSelectionMode("automatic")}
                >
                  <p className={styles.selectCardTitle}>Segmentação automática</p>
                  <p className={styles.selectCardSub}>Clientes inativos há X dias</p>
                </button>
                <button
                  type="button"
                  className={`${styles.selectCard} ${selectionMode === "manual" ? styles.selectCardActive : ""}`}
                  onClick={() => changeSelectionMode("manual")}
                >
                  <p className={styles.selectCardTitle}>Seleção manual</p>
                  <p className={styles.selectCardSub}>Clientes oficiais + lista importada</p>
                </button>
              </div>

              <input
                ref={leadsFileInputRef}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: "none" }}
                onChange={(e) => onImportLeads(e.target.files?.[0])}
              />
              <div className={styles.row} style={{ marginBottom: "0.75rem" }}>
                <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => leadsFileInputRef.current?.click()}>
                  Importar Excel/CSV
                </button>
                <button type="button" className={styles.templateLink} disabled={busy} onClick={onDownloadTemplate}>
                  Baixar modelo
                </button>
                {externalLeads.length > 0 ? (
                  <button type="button" className={styles.btnGhost} disabled={busy} onClick={clearImportedLeads}>
                    Limpar ({externalLeads.length})
                  </button>
                ) : null}
              </div>

              {selectionMode === "automatic" ? (
                <div className={styles.row}>
                  <input
                    className={styles.textInput}
                    style={{ maxWidth: "6rem", marginBottom: 0 }}
                    type="number"
                    value={inactiveDays}
                    onChange={(e) => setInactiveDays(Number(e.target.value) || 180)}
                  />
                  <span className={styles.hint} style={{ margin: 0 }}>
                    dias sem atendimento
                  </span>
                </div>
              ) : (
                <>
                  <input
                    className={styles.textInput}
                    placeholder="Buscar cliente…"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <tbody>
                        {clients.map((c) => (
                          <tr key={c.id}>
                            <td style={{ width: "2rem" }}>
                              <input
                                type="checkbox"
                                checked={selectedClients.has(c.id)}
                                onChange={(e) => toggleClient(c, e.target.checked)}
                              />
                            </td>
                            <td>{c.name}</td>
                            <td>{c.whatsapp_preview ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.hint}>{selectedClients.size} selecionado(s)</p>
                  {selectedClientList.length > 0 ? (
                    <details>
                      <summary className={styles.hint}>Ver selecionados</summary>
                      <ul className={styles.hint}>
                        {selectedClientList.map((c) => (
                          <li key={c.id}>
                            {c.name} {c.whatsapp_preview ? `· ${c.whatsapp_preview}` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </>
              )}

              <div className={styles.row} style={{ marginTop: "1rem" }}>
                <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void previewRecipients()}>
                  Pré-visualizar destinatários
                </button>
                {preview && previewMode === selectionMode ? (
                  <span className={styles.hint} style={{ margin: 0 }}>
                    <strong>{preview.total}</strong> destinatário(s)
                    {preview.estimated_duration_seconds != null
                      ? ` · ${formatEta(preview.estimated_duration_seconds)}`
                      : ""}
                  </span>
                ) : null}
              </div>
              {preview && previewMode === selectionMode && preview.clients.length > 0 ? (
                <div className={styles.tableWrap} style={{ marginTop: "0.5rem" }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>WhatsApp</th>
                        <th>Origem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.clients.slice(0, 30).map((c) => (
                        <tr key={`${c.source ?? "c"}-${c.id}`}>
                          <td>{c.name}</td>
                          <td>{c.whatsapp_preview ?? "—"}</td>
                          <td>{c.source === "external" ? "Importado" : "Oficial"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className={styles.reviewBox}>
                <strong>Resumo</strong>
                <p className={styles.hint}>
                  Campanha: <strong>{name}</strong>
                </p>
                <p className={styles.hint}>
                  Público: <strong>{currentRecipientCount ?? "—"}</strong> destinatário(s) ·{" "}
                  {selectionMode === "manual" ? "Manual" : `Inativos ${inactiveDays}d`}
                </p>
                <p className={styles.hint}>
                  Velocidade: <strong>{SPEED_OPTIONS.find((s) => s.value === sendSpeed)?.title}</strong>
                  {preview?.estimated_duration_seconds != null
                    ? ` · ${formatEta(preview.estimated_duration_seconds)}`
                    : ""}
                </p>
              </div>
              <div className={styles.reviewBox}>
                <strong>Resumo do agendamento</strong>
                <p className={styles.hint}>{scheduleSummary}</p>
                <p className={styles.hint} style={{ margin: 0, fontSize: "0.75rem" }}>
                  Ajuste data e hora no próximo passo, se necessário.
                </p>
              </div>
              {previewIsStale ? (
                <div className={styles.reviewBox} style={{ borderColor: "#f59e0b" }}>
                  <strong>Atenção</strong>
                  <p className={styles.hint}>Gere a pré-visualização no passo Público antes de disparar.</p>
                </div>
              ) : null}
              <div className={styles.reviewBox}>
                <strong>Prévia da mensagem</strong>
                <p className={styles.hint} style={{ whiteSpace: "pre-wrap" }}>
                  {message
                    .replaceAll("{nome_cliente}", "João Silva")
                    .replaceAll("{cliente}", "João Silva")
                    .replaceAll("{empresa}", "Climaris")}
                </p>
                {asset?.url ? <img src={asset.url} alt="" style={{ maxWidth: 200, borderRadius: 8 }} /> : null}
              </div>
            </>
          ) : null}

          {step === 5 ? (
            <div className={styles.scheduleCardWrap}>
              <article className={styles.scheduleCard}>
                <div className={styles.scheduleCardHeader}>
                  <CalendarClock size={22} />
                  <h3>Quando disparar?</h3>
                </div>
                <p className={styles.hint}>Escolha envio imediato ou programe data e hora.</p>

                <div className={styles.radioGroup}>
                  <label className={styles.radioRow}>
                    <input
                      type="radio"
                      name="schedule-mode"
                      checked={scheduleMode === "now"}
                      onChange={() => setScheduleMode("now")}
                    />
                    <span>
                      <strong>Disparar agora</strong>
                      <small>Inicia o envio assim que você confirmar</small>
                    </span>
                  </label>
                  <label className={styles.radioRow}>
                    <input
                      type="radio"
                      name="schedule-mode"
                      checked={scheduleMode === "later"}
                      onChange={() => setScheduleMode("later")}
                    />
                    <span>
                      <strong>Agendar para uma data específica</strong>
                      <small>O sistema dispara automaticamente no horário escolhido</small>
                    </span>
                  </label>
                </div>

                {scheduleMode === "later" ? (
                  <div className={styles.scheduleFields}>
                    <div>
                      <label className={styles.fieldLabel}>
                        <CalendarClock size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        Data
                      </label>
                      <input
                        type="date"
                        className={styles.textInput}
                        min={minDate}
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>
                        <Clock size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        Hora
                      </label>
                      <input
                        type="time"
                        className={styles.textInput}
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className={styles.scheduleSummaryBox}>
                  <strong>Resumo</strong>
                  <p>{formatScheduleSummary(scheduleMode, scheduleDate, scheduleTime)}</p>
                </div>

                {dispatchProgress ? (
                  <div className={styles.reviewBox} style={{ marginTop: "1rem", marginBottom: 0 }}>
                    <strong>{dispatchProgress.label}</strong>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${dispatchProgress.pct}%` }} />
                    </div>
                  </div>
                ) : null}
              </article>
            </div>
          ) : null}
        </div>
      </div>

      <footer className={styles.wizardFooter}>
        <div>
          {step > 1 ? (
            <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => setStep(step - 1)}>
              <ChevronLeft size={16} />
              Voltar
            </button>
          ) : (
            <button type="button" className={styles.btnGhost} onClick={onClose}>
              Cancelar
            </button>
          )}
        </div>
        <div className={styles.row}>
          {step < 5 ? (
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={busy || !canNext}
              onClick={() => setStep(step + 1)}
            >
              Continuar
              <ChevronRight size={16} />
            </button>
          ) : (
            <>
              <button type="button" className={styles.btnSecondary} disabled={busy} onClick={() => void onSaveModel()}>
                <Save size={16} />
                Salvar modelo
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy || !hasAnyRecipients || previewIsStale || !canNext}
                onClick={() => void onSend()}
              >
                <Send size={16} />
                {primaryActionLabel}
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
