import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { Check, ClipboardCopy, Printer, RotateCcw, Save } from "lucide-react";
import {
  listEquipmentServicePreventiveSchedules,
  resetEquipmentServicePreventiveScheduleOverride,
  upsertEquipmentServicePreventiveSchedule,
  type EquipmentServicePreventiveScheduleOut,
} from "../../api/preventiveMaintenance";
import { patchServiceOrderStatus } from "../../api/serviceOrders";
import { buildTechnicalSpecRows } from "../../lib/categoryFieldDefinitions";
import { computePreventiveNextDue, formatFriendlyDatePt } from "../../lib/preventiveLastService";
import { ToastHost } from "../ToastHost";
import { toast } from "../../lib/toast";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import type { MaintenanceEvent } from "../v0-ui/clients/PublicEquipmentProfileView v2";
import formLayout from "../../pages/formLayout.module.css";
import { EquipmentHistoryEventCard } from "./EquipmentHistoryEventCard";
import { EquipmentManualsTab } from "./EquipmentManualsTab";
import styles from "./EquipmentSheetEmbeddedView.module.css";

type TabId = "dados" | "preventiva" | "historico" | "manuais";

type Props = {
  equipment: EquipmentItem;
  publicUrl: string | null;
  history: MaintenanceEvent[];
  historyLoading: boolean;
  historyError: string | null;
  middleSlot?: React.ReactNode;
  readOnly?: boolean;
  isEditing?: boolean;
  editForm?: React.ReactNode;
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
  editForm,
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

      <div className={styles.body}>
        {publicUrl ? (
          <section className={styles.qrPanel} aria-label="QR Code e link público">
            <div className={styles.qrImageWrap}>
              {qrSrc ? (
                <img src={qrSrc} alt="" className={styles.qrImage} aria-hidden />
              ) : (
                <div className={styles.qrImage}>{qrError ? "—" : "…"}</div>
              )}
            </div>
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
          </section>
        ) : null}

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
              disabled={isEditing}
              className={`${formLayout.formCardTab} ${styles.tabBtn} ${activeTab === "preventiva" ? formLayout.formCardTabActive : ""} ${activeTab === "preventiva" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("preventiva")}
            >
              Gestão preventiva
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "historico"}
              disabled={isEditing}
              className={`${formLayout.formCardTab} ${styles.tabBtn} ${activeTab === "historico" ? formLayout.formCardTabActive : ""} ${activeTab === "historico" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("historico")}
            >
              Histórico
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "manuais"}
              disabled={isEditing}
              className={`${formLayout.formCardTab} ${styles.tabBtn} ${activeTab === "manuais" ? formLayout.formCardTabActive : ""} ${activeTab === "manuais" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("manuais")}
            >
              Manuais
            </button>
          </div>

          <div className={`${formLayout.formCardContent} ${styles.tabScroll}`}>
            {activeTab === "dados" ? (
              <div className={styles.tabContent}>
                {isEditing && editForm ? (
                  editForm
                ) : (
                  <>
                    <p className={styles.identityTitle}>{equipment.tag}</p>
                    <p className={styles.identitySub}>
                      {[equipment.brandName, equipment.modelName].filter(Boolean).join(" · ") || "—"}
                    </p>
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
                    <div className={styles.metaList}>
                      {equipment.qrcodeCodeId ? (
                        <p>
                          <strong>Etiqueta QR:</strong> {equipment.qrcodeCodeId}
                        </p>
                      ) : null}
                      {equipment.serialNumber ? (
                        <p>
                          <strong>Nº de série:</strong> {equipment.serialNumber}
                        </p>
                      ) : null}
                      {equipment.location ? (
                        <p>
                          <strong>Local:</strong> {equipment.location}
                        </p>
                      ) : null}
                      {equipment.installationDate ? (
                        <p>
                          <strong>Instalado em:</strong>{" "}
                          {new Date(equipment.installationDate + "T12:00:00").toLocaleDateString("pt-BR")}
                        </p>
                      ) : null}
                      {equipment.installationReference ? (
                        <p>
                          <strong>Referência:</strong> {equipment.installationReference}
                        </p>
                      ) : null}
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
                    return (
                      <article key={row.service_id} className={styles.preventiveCard}>
                        <h4 className={styles.preventiveName}>{row.service_name}</h4>
                        {row.service_description ? (
                          <p className={styles.preventiveDesc}>{row.service_description}</p>
                        ) : null}
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
                                disabled={readOnly || savingServiceId === row.service_id}
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
                                disabled={readOnly || savingServiceId === row.service_id}
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
                          {!readOnly ? (
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
            ) : (
              <div className={styles.tabContent}>
                <EquipmentManualsTab equipment={equipment} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
