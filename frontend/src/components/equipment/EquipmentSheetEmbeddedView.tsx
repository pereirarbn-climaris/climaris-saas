import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { Check, ClipboardCopy, Printer, RotateCcw, Save } from "lucide-react";
import {
  listEquipmentServicePreventiveSchedules,
  resetEquipmentServicePreventiveScheduleOverride,
  setEquipmentServicePreventiveActive,
  upsertEquipmentServicePreventiveSchedule,
  type EquipmentServicePreventiveScheduleOut,
} from "../../api/preventiveMaintenance";
import { patchServiceOrderStatus } from "../../api/serviceOrders";
import { buildTechnicalSpecRows } from "../../lib/categoryFieldDefinitions";
import { computePreventiveNextDue, formatFriendlyDatePt } from "../../lib/preventiveLastService";
import { ToastHost } from "../ToastHost";
import { FormSwitch } from "../ui/form-switch";
import { toast } from "../../lib/toast";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import type { MaintenanceEvent } from "../v0-ui/clients/PublicEquipmentProfileView v2";
import formLayout from "../../pages/formLayout.module.css";
import { EquipmentHistoryEventCard } from "./EquipmentHistoryEventCard";
import { EquipmentManualsTab } from "./EquipmentManualsTab";
import { EquipmentKnowledgeChat } from "./EquipmentKnowledgeChat";
import styles from "./EquipmentSheetEmbeddedView.module.css";

type TabId = "dados" | "preventiva" | "historico" | "manuais" | "assistente";

type Props = {
  equipment: EquipmentItem;
  publicUrl: string | null;
  history: MaintenanceEvent[];
  historyLoading: boolean;
  historyError: string | null;
  middleSlot?: React.ReactNode;
  readOnly?: boolean;
  isEditing?: boolean;
  /** Quando true, o cabeçalho interno fica oculto (o modal pai já renderiza o título). */
  hideHeader?: boolean;
  editForm?: React.ReactNode;
  /** Substitui o painel QR padrão (ex.: fluxo de alterar/cadastrar etiqueta). */
  qrPanelSlot?: React.ReactNode;
  /** Ações extras no painel QR (ex.: botão Alterar QR na edição). */
  qrExtraActions?: React.ReactNode;
  onClose?: () => void;
  onPrintLabel?: () => void;
};

type IntervalDraft = {
  interval_value: number;
  interval_type: "days" | "months" | "years";
};

function useQrDataUrl(publicUrl: string | undefined, width: number) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!publicUrl) {
      setSrc(null);
      setError(false);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(publicUrl, { width, margin: 1 })
      .then((url) => {
        if (!cancelled) {
          setSrc(url);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publicUrl, width]);

  return { src, error };
}

function intervalLabel(type: string, value: number): string {
  if (type === "days") return value === 1 ? "1 dia" : `${value} dias`;
  if (type === "years") return value === 1 ? "1 ano" : `${value} anos`;
  return value === 1 ? "1 mês" : `${value} meses`;
}

function scheduleToDraft(row: EquipmentServicePreventiveScheduleOut): IntervalDraft {
  return {
    interval_value: row.override_interval_value ?? row.default_interval_value,
    interval_type: row.override_interval_type ?? row.default_interval_type,
  };
}

export function EquipmentSheetEmbeddedView({
  equipment,
  publicUrl,
  history,
  historyLoading,
  historyError,
  middleSlot,
  readOnly = false,
  isEditing = false,
  hideHeader = false,
  editForm,
  qrPanelSlot,
  qrExtraActions,
  onClose,
  onPrintLabel,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("dados");
  const [schedules, setSchedules] = useState<EquipmentServicePreventiveScheduleOut[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesErr, setSchedulesErr] = useState("");
  const [drafts, setDrafts] = useState<Record<number, IntervalDraft>>({});
  const [savingServiceId, setSavingServiceId] = useState<number | null>(null);
  const [completingOsId, setCompletingOsId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const { src: qrSrc, error: qrError } = useQrDataUrl(publicUrl ?? undefined, 80);

  const specs = useMemo(() => {
    const defs = equipment.fieldDefinitions ?? [];
    return buildTechnicalSpecRows(defs, equipment.technicalData ?? {});
  }, [equipment.fieldDefinitions, equipment.technicalData]);

  const legacyId = equipment.legacyEquipmentId;

  const loadSchedules = useCallback(async () => {
    if (!legacyId) {
      setSchedules([]);
      return;
    }
    setSchedulesLoading(true);
    setSchedulesErr("");
    try {
      const rows = await listEquipmentServicePreventiveSchedules(legacyId);
      setSchedules(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.service_id, scheduleToDraft(row)])));
    } catch (e) {
      setSchedules([]);
      setSchedulesErr(e instanceof Error ? e.message : "Não foi possível carregar a gestão preventiva.");
    } finally {
      setSchedulesLoading(false);
    }
  }, [legacyId]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  useEffect(() => {
    if (isEditing) setActiveTab("dados");
  }, [isEditing]);

  async function handleCopyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Link copiado.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  async function handleSaveSchedule(serviceId: number) {
    if (!legacyId || readOnly) return;
    const draft = drafts[serviceId];
    if (!draft) return;
    setSavingServiceId(serviceId);
    try {
      const saved = await upsertEquipmentServicePreventiveSchedule(legacyId, serviceId, draft);
      setSchedules((prev) => prev.map((row) => (row.service_id === serviceId ? saved : row)));
      setDrafts((prev) => ({ ...prev, [serviceId]: scheduleToDraft(saved) }));
      toast.success("Validade preventiva salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingServiceId(null);
    }
  }

  async function handleResetSchedule(serviceId: number) {
    if (!legacyId || readOnly) return;
    setSavingServiceId(serviceId);
    try {
      const saved = await resetEquipmentServicePreventiveScheduleOverride(legacyId, serviceId);
      setSchedules((prev) => prev.map((row) => (row.service_id === serviceId ? saved : row)));
      setDrafts((prev) => ({ ...prev, [serviceId]: scheduleToDraft(saved) }));
      toast.success("Padrão do serviço restaurado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao restaurar.");
    } finally {
      setSavingServiceId(null);
    }
  }

  async function handleToggleScheduleActive(serviceId: number, isActive: boolean) {
    if (!legacyId || readOnly) return;
    setSavingServiceId(serviceId);
    try {
      const saved = await setEquipmentServicePreventiveActive(legacyId, serviceId, isActive);
      setSchedules((prev) => prev.map((row) => (row.service_id === serviceId ? saved : row)));
      toast.success(isActive ? "Manutenção preventiva ativada." : "Manutenção preventiva desativada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar a manutenção preventiva.");
    } finally {
      setSavingServiceId(null);
    }
  }

  async function handleCompletePendingOs(orderId: number) {
    if (readOnly) return;
    const confirmed = window.confirm(
      `Concluir a OS #${orderId}? Isso registrará a manutenção neste equipamento e atualizará os prazos preventivos.`,
    );
    if (!confirmed) return;
    setCompletingOsId(orderId);
    try {
      await patchServiceOrderStatus(orderId, "done");
      toast.success(`OS #${orderId} concluída.`);
      await loadSchedules();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a OS.");
    } finally {
      setCompletingOsId(null);
    }
  }

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [history],
  );

  return (
    <div className={styles.sheet}>
      <ToastHost />
      {!hideHeader ? (
        <header className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>{equipment.tag || "Equipamento"}</h2>
            <p className={styles.headerSub}>
              {[equipment.brandName, equipment.modelName].filter(Boolean).join(" · ") || "Ficha interna"}
            </p>
          </div>
          {onClose ? (
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar ficha">
              ×
            </button>
          ) : null}
        </header>
      ) : null}

      <div className={styles.body}>
        {qrPanelSlot ? (
          qrPanelSlot
        ) : (
          <section className={styles.qrPanel} aria-label="QR Code e link público">
            <div className={styles.qrImageWrap}>
              {publicUrl && qrSrc ? (
                <img src={qrSrc} alt="" className={styles.qrImage} aria-hidden />
              ) : (
                <div className={styles.qrImageEmpty}>{publicUrl ? (qrError ? "—" : "…") : "QR"}</div>
              )}
            </div>
            <div className={styles.qrMeta}>
              <p className={styles.qrTitle}>QR Code do equipamento</p>
              <p className={styles.qrHint}>
                {publicUrl
                  ? "Escaneie ou compartilhe o link da ficha pública do aparelho."
                  : "Nenhuma etiqueta QR vinculada a este equipamento ainda."}
              </p>
              {publicUrl ? (
                <>
                  <div className={styles.qrActions}>
                    <button type="button" className={styles.btnSecondary} onClick={() => void handleCopyLink()}>
                      {copied ? <Check size={15} aria-hidden /> : <ClipboardCopy size={15} aria-hidden />}
                      {copied ? "Copiado" : "Copiar link"}
                    </button>
                    {onPrintLabel ? (
                      <button type="button" className={styles.btnPrimary} onClick={onPrintLabel}>
                        <Printer size={15} aria-hidden />
                        Imprimir etiqueta
                      </button>
                    ) : null}
                    {qrExtraActions}
                  </div>
                  <div className={styles.linkField}>
                    <label className={styles.linkLabel} htmlFor="equipment-public-link">
                      Link da ficha web
                    </label>
                    <input
                      id="equipment-public-link"
                      className={styles.linkInput}
                      readOnly
                      value={publicUrl}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </div>
                </>
              ) : (
                <div className={styles.qrActions}>
                  {equipment.qrcodeCodeId ? (
                    <p className={styles.qrCodeId}>Código: {equipment.qrcodeCodeId}</p>
                  ) : null}
                  {qrExtraActions}
                </div>
              )}
            </div>
          </section>
        )}

        <div className={`${formLayout.formCard} ${styles.tabsCard}`}>
          <div className={`${formLayout.formCardTabs} ${styles.tabsBar}`} role="tablist" aria-label="Seções da ficha">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "dados"}
              className={`${formLayout.formCardTab} ${styles.tabBtn} ${activeTab === "dados" ? formLayout.formCardTabActive : ""} ${activeTab === "dados" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("dados")}
            >
              Dados do equipamento
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "preventiva"}
              className={`${formLayout.formCardTab} ${styles.tabBtn} ${activeTab === "preventiva" ? formLayout.formCardTabActive : ""} ${activeTab === "preventiva" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("preventiva")}
            >
              Gestão preventiva
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "historico"}
              className={`${formLayout.formCardTab} ${styles.tabBtn} ${activeTab === "historico" ? formLayout.formCardTabActive : ""} ${activeTab === "historico" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("historico")}
            >
              Histórico
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "manuais"}
              className={`${formLayout.formCardTab} ${styles.tabBtn} ${activeTab === "manuais" ? formLayout.formCardTabActive : ""} ${activeTab === "manuais" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("manuais")}
            >
              Manuais
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "assistente"}
              className={`${formLayout.formCardTab} ${styles.tabBtn} ${activeTab === "assistente" ? formLayout.formCardTabActive : ""} ${activeTab === "assistente" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("assistente")}
            >
              Iris
            </button>
          </div>

          <div className={`${formLayout.formCardContent} ${styles.tabScroll}`}>
            {activeTab === "dados" ? (
              <div className={styles.tabContent}>
                {isEditing && editForm ? (
                  editForm
                ) : (
                  <>
                    <div className={styles.viewCard}>
                      <div className={styles.viewCardHead}>
                        <div>
                          <p className={styles.identityTitle}>{equipment.tag}</p>
                          <p className={styles.identitySub}>
                            {[equipment.brandName, equipment.modelName].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <div className={styles.badges}>
                          <span className={equipment.status === "ativo" ? styles.badgeOk : styles.badgeMuted}>
                            {equipment.status === "ativo" ? "Ativo" : "Inativo"}
                          </span>
                          {equipment.categoryName ? (
                            <span className={styles.badgeCategory}>{equipment.categoryName}</span>
                          ) : null}
                          {equipment.siteName ? (
                            <span className={styles.badgeCategory}>{equipment.siteName}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className={styles.metaGrid}>
                        {equipment.qrcodeCodeId ? (
                          <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Etiqueta QR</span>
                            <span className={styles.metaValue}>{equipment.qrcodeCodeId}</span>
                          </div>
                        ) : null}
                        {equipment.serialNumber ? (
                          <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Nº de série</span>
                            <span className={styles.metaValue}>{equipment.serialNumber}</span>
                          </div>
                        ) : null}
                        {equipment.location ? (
                          <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Local</span>
                            <span className={styles.metaValue}>{equipment.location}</span>
                          </div>
                        ) : null}
                        {equipment.installationDate ? (
                          <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Instalado em</span>
                            <span className={styles.metaValue}>
                              {new Date(equipment.installationDate + "T12:00:00").toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                        ) : null}
                        {equipment.installationReference ? (
                          <div className={`${styles.metaItem} ${styles.metaItemWide}`}>
                            <span className={styles.metaLabel}>Referência</span>
                            <span className={styles.metaValue}>{equipment.installationReference}</span>
                          </div>
                        ) : null}
                        {equipment.manufactureYear ? (
                          <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Ano de fabricação</span>
                            <span className={styles.metaValue}>{equipment.manufactureYear}</span>
                          </div>
                        ) : null}
                        {equipment.gasChargeKg ? (
                          <div className={styles.metaItem}>
                            <span className={styles.metaLabel}>Carga de gás</span>
                            <span className={styles.metaValue}>
                              {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(equipment.gasChargeKg)} kg
                            </span>
                          </div>
                        ) : null}
                        {equipment.notes ? (
                          <div className={`${styles.metaItem} ${styles.metaItemWide}`}>
                            <span className={styles.metaLabel}>Observações</span>
                            <span className={styles.metaValue}>{equipment.notes}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {specs.length > 0 ? (
                      <div className={styles.specGrid}>
                        {specs.map((spec) => (
                          <div key={spec.key} className={styles.specCard}>
                            <p className={styles.specLabel}>{spec.label}</p>
                            <p className={styles.specValue}>{spec.value}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {middleSlot ? <div className={styles.middleSlot}>{middleSlot}</div> : null}
                  </>
                )}
              </div>
            ) : activeTab === "preventiva" ? (
              <div className={styles.tabContent}>
                {!legacyId ? (
                  <p className={styles.emptyState}>
                    Sincronize este equipamento com o cadastro HVAC para habilitar a gestão preventiva por serviço.
                  </p>
                ) : schedulesLoading ? (
                  <p className={styles.loading}>Carregando gestão preventiva…</p>
                ) : schedulesErr ? (
                  <p className={styles.err}>{schedulesErr}</p>
                ) : schedules.length === 0 ? (
                  <p className={styles.emptyState}>
                    Nenhum serviço preventivo configurado neste equipamento. Vincule um serviço com gestão
                    preventiva ativa em uma ordem de serviço concluída para registrar prazos aqui.
                  </p>
                ) : (
                  schedules.map((row) => {
                    const draft = drafts[row.service_id] ?? scheduleToDraft(row);
                    const defaultLabel = intervalLabel(row.default_interval_type, row.default_interval_value);
                    const previewNextDue = computePreventiveNextDue(
                      row.last_performed_at,
                      draft.interval_value,
                      draft.interval_type,
                    );
                    const awaiting = row.awaiting_completion === true;
                    const isActive = row.is_active !== false;
                    return (
                      <article
                        key={row.service_id}
                        className={`${styles.preventiveCard}${isActive ? "" : ` ${styles.preventiveCardInactive}`}`}
                      >
                        <div className={styles.preventiveCardHead}>
                          <div>
                            <h4 className={styles.preventiveName}>{row.service_name}</h4>
                            {row.service_description ? (
                              <p className={styles.preventiveDesc}>{row.service_description}</p>
                            ) : null}
                          </div>
                          {!awaiting ? (
                            <label
                              htmlFor={`prev-active-${row.service_id}`}
                              className={styles.preventiveToggle}
                            >
                              <span className={styles.preventiveToggleLabel}>
                                {isActive ? "Preventiva ativa" : "Preventiva inativa"}
                              </span>
                              <FormSwitch
                                id={`prev-active-${row.service_id}`}
                                checked={isActive}
                                disabled={readOnly || savingServiceId === row.service_id}
                                onChange={(value) => void handleToggleScheduleActive(row.service_id, value)}
                                ariaLabel="Ativar ou desativar manutenção preventiva"
                              />
                            </label>
                          ) : null}
                        </div>
                        {awaiting ? (
                          <>
                            <p className={styles.preventivePending}>
                              OS #{row.pending_service_order_id ?? "—"} agendada — conclua a ordem de serviço para
                              registrar a última manutenção e calcular a próxima validade (
                              {intervalLabel(draft.interval_type, draft.interval_value)}).
                            </p>
                            {row.pending_service_order_id ? (
                              <div className={styles.preventivePendingActions}>
                                <Link
                                  to={`/app/service-orders/${row.pending_service_order_id}`}
                                  className={styles.btnGhost}
                                >
                                  Abrir OS #{row.pending_service_order_id}
                                </Link>
                                {!readOnly ? (
                                  <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    disabled={completingOsId === row.pending_service_order_id}
                                    onClick={() => void handleCompletePendingOs(row.pending_service_order_id!)}
                                  >
                                    <Check size={15} aria-hidden />
                                    {completingOsId === row.pending_service_order_id
                                      ? "Concluindo…"
                                      : "Concluir OS"}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        <div className={styles.preventiveRow}>
                          <div className={styles.metaBox}>
                            <p className={styles.metaBoxLabel}>Última realização</p>
                            <p className={styles.metaBoxValue}>
                              {awaiting ? "Aguardando conclusão da OS" : formatFriendlyDatePt(row.last_performed_at) ?? "—"}
                              {!awaiting && row.last_service_order_id ? ` · OS #${row.last_service_order_id}` : ""}
                            </p>
                          </div>
                          <div className={styles.metaBox}>
                            <p className={styles.metaBoxLabel}>Próxima validade</p>
                            <p className={`${styles.metaBoxValue} ${styles.metaBoxValueDue}`}>
                              {awaiting ? "—" : formatFriendlyDatePt(previewNextDue) ?? "—"}
                            </p>
                          </div>
                          <div className={styles.metaBox}>
                            <p className={styles.metaBoxLabel}>Padrão do serviço</p>
                            <p className={styles.metaBoxValue}>{defaultLabel}</p>
                          </div>
                          <div className={styles.metaBox}>
                            <p className={styles.metaBoxLabel} id={`prev-label-${row.service_id}`}>
                              {row.has_override ? "Validade customizada" : "Validade neste equipamento"}
                            </p>
                            <div className={styles.intervalInputs} aria-labelledby={`prev-label-${row.service_id}`}>
                              <input
                                id={`prev-val-${row.service_id}`}
                                className={`${styles.input} ${styles.numberInput}`}
                                type="number"
                                aria-label="Intervalo de validade"
                                min={1}
                                max={draft.interval_type === "days" ? 3650 : 12}
                                value={draft.interval_value}
                                disabled={readOnly || !isActive || savingServiceId === row.service_id}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  if (!Number.isFinite(val) || val < 1) return;
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [row.service_id]: { ...draft, interval_value: val },
                                  }));
                                }}
                              />
                              <select
                                className={styles.select}
                                value={draft.interval_type}
                                disabled={readOnly || !isActive || savingServiceId === row.service_id}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [row.service_id]: {
                                      ...draft,
                                      interval_type: e.target.value as IntervalDraft["interval_type"],
                                    },
                                  }))
                                }
                              >
                                <option value="months">Meses</option>
                                <option value="years">Anos</option>
                                <option value="days">Dias</option>
                              </select>
                            </div>
                          </div>
                          {!readOnly && isActive ? (
                            <div className={styles.preventiveActions}>
                              <button
                                type="button"
                                className={styles.btnPrimary}
                                disabled={savingServiceId === row.service_id}
                                onClick={() => void handleSaveSchedule(row.service_id)}
                              >
                                <Save size={15} aria-hidden />
                                {savingServiceId === row.service_id ? "Salvando…" : "Salvar"}
                              </button>
                              {row.has_override ? (
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  disabled={savingServiceId === row.service_id}
                                  onClick={() => void handleResetSchedule(row.service_id)}
                                  title="Usar padrão do serviço"
                                >
                                  <RotateCcw size={15} aria-hidden />
                                  Padrão
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            ) : activeTab === "historico" ? (
              <div className={styles.tabContent}>
                {historyError ? <p className={styles.err}>{historyError}</p> : null}
                {historyLoading ? <p className={styles.loading}>Carregando histórico…</p> : null}
                {!historyLoading && !historyError && sortedHistory.length === 0 ? (
                  <p className={styles.emptyState}>Nenhum serviço registrado neste equipamento.</p>
                ) : null}
                {!historyLoading && sortedHistory.length > 0 ? (
                  <div className={styles.historyList}>
                    {sortedHistory.map((event, index) => (
                      <EquipmentHistoryEventCard
                        key={event.id}
                        event={event}
                        isLast={index === sortedHistory.length - 1}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : activeTab === "manuais" ? (
              <div className={styles.tabContent}>
                <EquipmentManualsTab equipment={equipment} />
              </div>
            ) : activeTab === "assistente" ? (
              <div className={styles.tabContent}>
                <EquipmentKnowledgeChat
                  equipmentId={equipment.id}
                  brandName={equipment.brandName}
                  modelName={equipment.modelName}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
