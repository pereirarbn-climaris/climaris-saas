import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Megaphone, Plus } from "lucide-react";
import {
  confirmCampaignLeadsImport,
  createCampaign,
  deleteCampaignAsset,
  downloadCampaignLeadsTemplate,
  fetchCampaignAnalytics,
  fetchCampaignsCompare,
  listCampaigns,
  listCampaignSelectableClients,
  previewCampaignRecipients,
  runCampaign,
  runCampaignAndWait,
  uploadCampaignAsset,
  validateCampaignLeadsImport,
  type Campaign,
  type CampaignAnalytics,
  type CampaignAsset,
  type CampaignCompareItem,
  type CampaignExternalLead,
  type CampaignLeadsValidateResult,
  type CampaignPreview,
  type SendSpeed,
} from "../../api/whatsappCampaigns";
import { CampaignLeadsImportModal } from "./CampaignLeadsImportModal";
import { buildConversionMap, CampaignDataGrid } from "./CampaignDataGrid";
import { CampaignDetailDrawer } from "./CampaignDetailDrawer";
import { CampaignEmptyState } from "./CampaignEmptyState";
import { CampaignMetricsCards } from "./CampaignMetricsCards";
import { CampaignTemplatesDrawer } from "./CampaignTemplatesDrawer";
import { CampaignWizardModal } from "./CampaignWizardModal";
import styles from "./CampaignDashboard.module.css";
import {
  buildScheduledAtIso,
  defaultCampaignMessage,
  defaultScheduleDate,
  formatScheduleSummary,
  isScheduledInFuture,
  previewRecipientKey,
  type ScheduleMode,
} from "./campaignDashboardUtils";
import { toast } from "../../lib/toast";

type Props = { canConfigure: boolean };
type SelectionMode = "automatic" | "manual";
type ClientRow = CampaignPreview["clients"][number];

export function WhatsappCampaignsTab({ canConfigure }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [templatesDrawerOpen, setTemplatesDrawerOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [compareData, setCompareData] = useState<CampaignCompareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [previewMode, setPreviewMode] = useState<SelectionMode | null>(null);
  const [selectedPreviewRecipients, setSelectedPreviewRecipients] = useState<Map<string, ClientRow>>(new Map());
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedClients, setSelectedClients] = useState<Map<number, ClientRow>>(new Map());
  const [clientSearch, setClientSearch] = useState("");
  const [step, setStep] = useState(1);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("automatic");

  const [reportCampaign, setReportCampaign] = useState<Campaign | null>(null);
  const [reportAnalytics, setReportAnalytics] = useState<CampaignAnalytics | null>(null);
  const [reportCompare, setReportCompare] = useState<CampaignCompareItem[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const [modelId, setModelId] = useState<number | null>(null);
  const [name, setName] = useState("Campanha de reativação");
  const [message, setMessage] = useState(defaultCampaignMessage);
  const [inactiveDays, setInactiveDays] = useState(180);
  const [asset, setAsset] = useState<CampaignAsset | null>(null);
  const [sendSpeed, setSendSpeed] = useState<SendSpeed>("medium");
  const [externalLeads, setExternalLeads] = useState<CampaignExternalLead[]>([]);
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const [dispatchProgress, setDispatchProgress] = useState<{ pct: number; label: string } | null>(null);
  const [importReview, setImportReview] = useState<CampaignLeadsValidateResult | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduleDate, setScheduleDate] = useState(defaultScheduleDate);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const leadsFileInputRef = useRef<HTMLInputElement | null>(null);

  const externalLeadIds = useMemo(() => externalLeads.map((l) => l.id), [externalLeads]);
  const selectedClientIds = useMemo(() => Array.from(selectedClients.keys()), [selectedClients]);
  const selectedClientList = useMemo(() => Array.from(selectedClients.values()), [selectedClients]);

  const templates = useMemo(() => campaigns.filter((c) => c.status === "draft"), [campaigns]);
  const historyCampaigns = useMemo(
    () => campaigns.filter((c) => c.status !== "draft").sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [campaigns],
  );
  const conversionById = useMemo(() => buildConversionMap(compareData), [compareData]);

  const globalMetrics = useMemo(() => {
    const sent = historyCampaigns.reduce((acc, c) => acc + c.sent_count, 0);
    const total = historyCampaigns.reduce((acc, c) => acc + c.total_contacts, 0);
    const running = historyCampaigns.filter((c) => c.status === "running").length;
    const rates = compareData.map((c) => c.conversion_rate).filter((r) => r > 0);
    const avgConversion =
      rates.length > 0 ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : 0;
    return { sent, total, running, avgConversion, count: historyCampaigns.length };
  }, [historyCampaigns, compareData]);

  const hasAnyRecipients = useMemo(() => {
    if (preview && previewMode === selectionMode) return selectedPreviewRecipients.size > 0;
    if (selectionMode === "manual") return selectedClients.size > 0 || externalLeads.length > 0;
    return externalLeads.length > 0;
  }, [preview, previewMode, selectionMode, selectedPreviewRecipients.size, selectedClients.size, externalLeads.length]);

  const currentRecipientCount =
    preview && previewMode === selectionMode ? selectedPreviewRecipients.size : null;

  const previewAllSelected = useMemo(() => {
    if (!preview || preview.clients.length === 0) return false;
    return preview.clients.every((c) => selectedPreviewRecipients.has(previewRecipientKey(c)));
  }, [preview, selectedPreviewRecipients]);

  const previewSomeSelected = selectedPreviewRecipients.size > 0 && !previewAllSelected;

  const selectedPreviewEtaSeconds = useMemo(() => {
    if (!preview?.estimated_duration_seconds || preview.total <= 0 || selectedPreviewRecipients.size === 0) {
      return null;
    }
    return Math.round(
      (preview.estimated_duration_seconds * selectedPreviewRecipients.size) / preview.total,
    );
  }, [preview, selectedPreviewRecipients.size]);
  const previewIsStale = preview == null || previewMode !== selectionMode;

  const scheduleSummary = useMemo(
    () => formatScheduleSummary(scheduleMode, scheduleDate, scheduleTime),
    [scheduleMode, scheduleDate, scheduleTime],
  );
  const isScheduledLater = scheduleMode === "later";

  const campaignSegmentPayload = useMemo(
    () => ({
      selection_mode: selectionMode,
      client_ids: selectionMode === "manual" ? selectedClientIds : [],
      inactive_days: selectionMode === "automatic" ? inactiveDays : null,
      external_lead_ids: externalLeadIds,
      import_batch_id: importBatchId,
      send_speed: sendSpeed,
    }),
    [selectionMode, selectedClientIds, inactiveDays, externalLeadIds, importBatchId, sendSpeed],
  );

  const campaignPayloadBase = useMemo(() => {
    if (preview && previewMode === selectionMode && selectedPreviewRecipients.size > 0) {
      const selected = Array.from(selectedPreviewRecipients.values());
      const clientIds = selected.filter((c) => c.source !== "external").map((c) => c.id);
      const extIds = selected
        .filter((c) => c.source === "external")
        .map((c) => {
          if (c.external_lead_id != null && c.external_lead_id > 0) return c.external_lead_id;
          return c.id < 0 ? -c.id : null;
        })
        .filter((id): id is number => id != null && id > 0);
      return {
        ...campaignSegmentPayload,
        selection_mode: "manual" as const,
        client_ids: clientIds,
        inactive_days: null,
        external_lead_ids: extIds,
        import_batch_id: extIds.length > 0 ? null : importBatchId,
      };
    }

    return campaignSegmentPayload;
  }, [campaignSegmentPayload, preview, previewMode, selectionMode, selectedPreviewRecipients, importBatchId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, compare] = await Promise.all([listCampaigns(), fetchCampaignsCompare()]);
      setCampaigns(rows);
      setCompareData(compare);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar campanhas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void listCampaignSelectableClients(clientSearch, 200)
        .then((res) => setClients(res.clients))
        .catch(() => setClients([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [clientSearch]);

  function resetWizardState() {
    setModelId(null);
    setName("Campanha de reativação");
    setMessage(defaultCampaignMessage());
    setInactiveDays(180);
    setAsset(null);
    setSendSpeed("medium");
    setSelectionMode("automatic");
    setSelectedClients(new Map());
    setExternalLeads([]);
    setImportBatchId(null);
    setPreview(null);
    setPreviewMode(null);
    setSelectedPreviewRecipients(new Map());
    setStep(1);
    setDispatchProgress(null);
    setScheduleMode("now");
    setScheduleDate(defaultScheduleDate());
    setScheduleTime("09:00");
  }

  function openNewCampaign() {
    resetWizardState();
    setWizardOpen(true);
  }

  function loadFromTemplate(c: Campaign, edit = false) {
    setModelId(c.id);
    setName(c.name);
    setMessage(c.message_template);
    setInactiveDays(Number(c.segment_params.inactive_days || 180));
    setAsset(
      c.asset_id && c.asset_url
        ? { id: c.asset_id, url: c.asset_url, content_type: c.asset_content_type, s3_key: null }
        : null,
    );
    setSelectionMode("automatic");
    setSelectedClients(new Map());
    setExternalLeads([]);
    setImportBatchId(null);
    clearPreviewSelection();
    setStep(edit ? 1 : 3);
    setWizardOpen(true);
    if (!edit) toast.success("Modelo carregado. Revise o público e dispare.");
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      setAsset(await uploadCampaignAsset(file));
      toast.success("Mídia salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onRemoveAsset() {
    if (!asset) return;
    setBusy(true);
    try {
      await deleteCampaignAsset(asset.id);
      setAsset(null);
      toast.success("Mídia removida.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover.");
    } finally {
      setBusy(false);
    }
  }

  async function saveModel() {
    if (!canConfigure) return;
    setBusy(true);
    try {
      const campaign = await createCampaign({
        name: name.trim(),
        message_template: message.trim(),
        segment_kind: "inactive_since",
        segment_params: { inactive_days: inactiveDays, respect_preventive_opt_out: true },
        asset_id: asset?.id ?? null,
        status: "draft",
      });
      setCampaigns((rows) => [campaign, ...rows]);
      setModelId(campaign.id);
      toast.success("Modelo salvo na biblioteca.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function finalizeLeadsImport(
    leads: Array<{ name: string; phone: string }>,
    sourceFilename: string | null,
    discardedInvalidCount: number,
  ) {
    const result = await confirmCampaignLeadsImport({
      leads,
      source_filename: sourceFilename,
      discarded_invalid_count: discardedInvalidCount,
    });
    setExternalLeads(result.leads);
    setImportBatchId(result.import_batch_id);
    clearPreviewSelection();
    toast.success(result.summary_message ?? `${result.imported_count} contato(s) importados.`);
  }

  async function onImportLeads(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const validation = await validateCampaignLeadsImport(file);
      if (validation.invalid_count > 0 || validation.valid_count === 0) {
        setImportReview(validation);
        setImportModalOpen(true);
        return;
      }
      await finalizeLeadsImport(
        validation.valid_rows.map((r) => ({ name: r.name, phone: r.phone })),
        validation.source_filename,
        0,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validação falhou.");
    } finally {
      setBusy(false);
      if (leadsFileInputRef.current) leadsFileInputRef.current.value = "";
    }
  }

  function clearImportedLeads() {
    setExternalLeads([]);
    setImportBatchId(null);
    clearPreviewSelection();
  }

  function clearPreviewSelection() {
    setPreview(null);
    setPreviewMode(null);
    setSelectedPreviewRecipients(new Map());
  }

  function selectAllPreviewRecipients(checked: boolean) {
    if (!preview) return;
    if (checked) {
      setSelectedPreviewRecipients(new Map(preview.clients.map((c) => [previewRecipientKey(c), c])));
      return;
    }
    setSelectedPreviewRecipients(new Map());
  }

  function togglePreviewRecipient(client: ClientRow, checked: boolean) {
    const key = previewRecipientKey(client);
    setSelectedPreviewRecipients((prev) => {
      const next = new Map(prev);
      if (checked) next.set(key, client);
      else next.delete(key);
      return next;
    });
  }

  function selectAllManualClients(checked: boolean) {
    if (checked) {
      setSelectedClients(new Map(clients.map((c) => [c.id, c])));
      return;
    }
    setSelectedClients(new Map());
    clearPreviewSelection();
  }

  const manualAllSelected = clients.length > 0 && clients.every((c) => selectedClients.has(c.id));
  const manualSomeSelected = selectedClients.size > 0 && !manualAllSelected;

  async function previewRecipients() {
    if (selectionMode === "manual" && selectedClientIds.length === 0 && externalLeads.length === 0) {
      toast.error("Selecione clientes ou importe uma lista.");
      return;
    }
    setBusy(true);
    try {
      const result = await previewCampaignRecipients(campaignSegmentPayload);
      setPreview(result);
      setPreviewMode(selectionMode);
      setSelectedPreviewRecipients(new Map(result.clients.map((c) => [previewRecipientKey(c), c])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Prévia indisponível.");
    } finally {
      setBusy(false);
    }
  }

  async function sendCampaign() {
    if (!canConfigure) return;
    if (previewIsStale) {
      toast.error('Gere a pré-visualização no passo "Público" antes de disparar.');
      return;
    }
    if (selectedPreviewRecipients.size === 0) {
      toast.error("Selecione ao menos um destinatário na pré-visualização.");
      return;
    }
    if (scheduleMode === "later") {
      if (!scheduleDate || !scheduleTime) {
        toast.error("Informe data e hora para o agendamento.");
        return;
      }
      if (!isScheduledInFuture(scheduleMode, scheduleDate, scheduleTime)) {
        toast.error("A data e hora do agendamento devem ser no futuro.");
        return;
      }
    }

    const scheduledAt = buildScheduledAtIso(scheduleMode, scheduleDate, scheduleTime);
    setBusy(true);
    setDispatchProgress({
      pct: 1,
      label: isScheduledLater ? "Salvando agendamento…" : "Iniciando disparo…",
    });
    try {
      let baseId = modelId;
      if (!baseId) {
        const saved = await createCampaign({
          name: name.trim(),
          message_template: message.trim(),
          segment_kind: "inactive_since",
          segment_params: { inactive_days: inactiveDays, respect_preventive_opt_out: true },
          asset_id: asset?.id ?? null,
          status: "draft",
        });
        baseId = saved.id;
      }

      const runPayload = { ...campaignPayloadBase, scheduled_at: scheduledAt };

      if (isScheduledLater) {
        await runCampaign(baseId, { ...runPayload, run_async: false });
        const all = await listCampaigns();
        const compare = await fetchCampaignsCompare();
        setCampaigns(all);
        setCompareData(compare);
        setWizardOpen(false);
        toast.success(
          scheduleSummary.startsWith("Disparo programado")
            ? scheduleSummary.replace("Disparo programado para", "Campanha agendada para")
            : "Campanha agendada com sucesso.",
        );
        return;
      }

      const { started, final } = await runCampaignAndWait(baseId, runPayload, (st) => {
        const label =
          st.total > 0
            ? `Enviando… ${st.sent}/${st.total} (${st.failed} falha${st.failed === 1 ? "" : "s"})`
            : "Enviando…";
        setDispatchProgress({ pct: Math.max(1, st.progress_pct), label });
      });
      setDispatchProgress({ pct: 100, label: "Concluído" });
      const all = await listCampaigns();
      const compare = await fetchCampaignsCompare();
      setCampaigns(all);
      setCompareData(compare);
      const dispatchId = started.campaign_id ?? started.campaign.id;
      const row = all.find((c) => c.id === dispatchId) ?? started.campaign;
      setWizardOpen(false);
      openReport(row);
      toast.success(`Disparo concluído: ${final.sent} enviados.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no disparo.");
    } finally {
      setDispatchProgress(null);
      setBusy(false);
    }
  }

  function toggleClient(client: ClientRow, checked: boolean) {
    setSelectedClients((prev) => {
      const next = new Map(prev);
      if (checked) next.set(client.id, client);
      else next.delete(client.id);
      return next;
    });
    clearPreviewSelection();
  }

  function changeSelectionMode(mode: SelectionMode) {
    if (mode === selectionMode) return;
    setSelectionMode(mode);
    clearPreviewSelection();
  }

  function openReport(campaign: Campaign) {
    setReportCampaign(campaign);
    setReportAnalytics(null);
    setReportCompare([]);
    setReportLoading(true);
    void Promise.all([fetchCampaignAnalytics(campaign.id), fetchCampaignsCompare()])
      .then(([analytics, compare]) => {
        setReportAnalytics(analytics);
        setReportCompare(compare);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Relatório indisponível.");
        setReportCampaign(null);
      })
      .finally(() => setReportLoading(false));
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1>Campanhas</h1>
          <p>Disparos WhatsApp, conversão e modelos reutilizáveis.</p>
        </div>
        {canConfigure ? (
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setTemplatesDrawerOpen(true)}
            >
              <FileText size={16} />
              Modelos
              {templates.length > 0 ? ` (${templates.length})` : ""}
            </button>
            <button type="button" className={styles.btnPrimary} onClick={openNewCampaign}>
              <Plus size={18} />
              Nova campanha
            </button>
          </div>
        ) : null}
      </header>

      <main className={styles.dashboard}>
        <CampaignMetricsCards metrics={globalMetrics} loading={loading} />

        <section className={styles.panelCard}>
          <h2 className={styles.panelTitle}>Campanhas</h2>
          {!loading && !historyCampaigns.length ? (
            <CampaignEmptyState
              icon={<Megaphone size={30} strokeWidth={1.75} />}
              title="Comece sua primeira campanha agora"
              description="Envie mensagens segmentadas com controle de velocidade anti-ban e acompanhe quem converteu em OS."
              action={
                canConfigure ? (
                  <button type="button" className={styles.btnPrimary} onClick={openNewCampaign}>
                    <Plus size={16} />
                    Nova campanha
                  </button>
                ) : undefined
              }
            />
          ) : (
            <CampaignDataGrid
              campaigns={historyCampaigns}
              conversionById={conversionById}
              loading={loading}
              onReport={openReport}
            />
          )}
        </section>
      </main>

      {canConfigure ? (
        <CampaignWizardModal
          open={wizardOpen}
          onClose={() => {
            if (!busy) setWizardOpen(false);
          }}
          step={step}
          setStep={setStep}
          busy={busy}
          name={name}
          setName={setName}
          message={message}
          setMessage={setMessage}
          asset={asset}
          fileInputRef={fileInputRef}
          onUpload={(f) => void onUpload(f)}
          onRemoveAsset={() => void onRemoveAsset()}
          sendSpeed={sendSpeed}
          setSendSpeed={setSendSpeed}
          selectionMode={selectionMode}
          changeSelectionMode={changeSelectionMode}
          inactiveDays={inactiveDays}
          setInactiveDays={setInactiveDays}
          externalLeads={externalLeads}
          leadsFileInputRef={leadsFileInputRef}
          onImportLeads={(f) => void onImportLeads(f)}
          onDownloadTemplate={() => void downloadCampaignLeadsTemplate().catch((e) => toast.error(String(e)))}
          clearImportedLeads={clearImportedLeads}
          clients={clients}
          clientSearch={clientSearch}
          setClientSearch={setClientSearch}
          selectedClients={selectedClients}
          toggleClient={toggleClient}
          selectedClientList={selectedClientList}
          preview={preview}
          previewMode={previewMode}
          previewIsStale={previewIsStale}
          previewRecipients={() => void previewRecipients()}
          selectedPreviewRecipients={selectedPreviewRecipients}
          togglePreviewRecipient={togglePreviewRecipient}
          selectAllPreviewRecipients={selectAllPreviewRecipients}
          previewAllSelected={previewAllSelected}
          previewSomeSelected={previewSomeSelected}
          selectedPreviewEtaSeconds={selectedPreviewEtaSeconds}
          selectAllManualClients={selectAllManualClients}
          manualAllSelected={manualAllSelected}
          manualSomeSelected={manualSomeSelected}
          hasAnyRecipients={hasAnyRecipients}
          currentRecipientCount={currentRecipientCount}
          dispatchProgress={dispatchProgress}
          scheduleMode={scheduleMode}
          setScheduleMode={setScheduleMode}
          scheduleDate={scheduleDate}
          setScheduleDate={setScheduleDate}
          scheduleTime={scheduleTime}
          setScheduleTime={setScheduleTime}
          scheduleSummary={scheduleSummary}
          isScheduledLater={isScheduledLater}
          onSaveModel={() => void saveModel()}
          onSend={() => void sendCampaign()}
        />
      ) : null}

      <CampaignTemplatesDrawer
        open={templatesDrawerOpen}
        templates={templates}
        loading={loading}
        canConfigure={canConfigure}
        onClose={() => setTemplatesDrawerOpen(false)}
        onEdit={(c) => {
          setTemplatesDrawerOpen(false);
          loadFromTemplate(c, true);
        }}
        onUse={(c) => {
          setTemplatesDrawerOpen(false);
          loadFromTemplate(c, false);
        }}
        onCreate={() => {
          setTemplatesDrawerOpen(false);
          openNewCampaign();
        }}
      />

      <CampaignDetailDrawer
        campaign={reportCampaign}
        analytics={reportAnalytics}
        compareData={reportCompare}
        loading={reportLoading}
        onClose={() => {
          setReportCampaign(null);
          setReportAnalytics(null);
        }}
      />

      {importReview && importModalOpen ? (
        <CampaignLeadsImportModal
          key={`${importReview.valid_count}-${importReview.invalid_count}`}
          open={importModalOpen}
          busy={busy}
          validation={importReview}
          onClose={() => {
            setImportModalOpen(false);
            setImportReview(null);
          }}
          onConfirm={async ({ leads, discarded_invalid_count }) => {
            setBusy(true);
            try {
              await finalizeLeadsImport(leads, importReview.source_filename, discarded_invalid_count);
              setImportModalOpen(false);
              setImportReview(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Importação falhou.");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
