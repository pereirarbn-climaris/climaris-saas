import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deletePlatformTenant,
  downloadPlatformTenantPlanChangeLogsCsv,
  getPlatformTenant,
  listPlatformTenantPlanChangeLogs,
  listPlatformTenants,
  updatePlatformTenantPlan,
  type PlatformTenantDetail,
  type PlatformTenantListItem,
  type PlatformTenantPlanChangeLog,
} from "../api/platformTenants";
import { listPlatformSaasPlans, type SaasPlanCatalogRow } from "../api/platformSaasPlans";
import { SaaSAdminDashboardView } from "../components/v0-ui/admin/SaaSAdminDashboardView";
import {
  buildPlatformSaasMetrics,
  mapPlatformTenantToView,
} from "../lib/platformTenantsAdapter";
import styles from "./PlatformTenantsPage.module.css";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const FALLBACK_PLAN_OPTIONS = ["free_30d", "basic", "professional", "enterprise", "beta_internal"] as const;
const FALLBACK_LABELS: Record<string, string> = {
  free_30d: "Free 30 dias",
  basic: "Basic",
  professional: "Professional",
  enterprise: "Enterprise",
  beta_internal: "Developer (uso interno)",
};

export function PlatformTenantsPage() {
  const [planCatalog, setPlanCatalog] = useState<SaasPlanCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rows, setRows] = useState<PlatformTenantListItem[]>([]);
  const [detailsById, setDetailsById] = useState<Record<number, PlatformTenantDetail>>({});
  const [planModalTenantId, setPlanModalTenantId] = useState<number | null>(null);
  const [planDraft, setPlanDraft] = useState("");
  const [planModalLoading, setPlanModalLoading] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState(false);

  const [logsModalTenantId, setLogsModalTenantId] = useState<number | null>(null);
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExporting, setHistoryExporting] = useState(false);
  const [planHistory, setPlanHistory] = useState<PlatformTenantPlanChangeLog[]>([]);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const PLAN_OPTIONS = useMemo(() => {
    if (planCatalog.length === 0) return [...FALLBACK_PLAN_OPTIONS];
    return planCatalog.map((p) => p.plan_key);
  }, [planCatalog]);

  const PLAN_LABELS = useMemo(() => {
    if (planCatalog.length === 0) return { ...FALLBACK_LABELS };
    return Object.fromEntries(planCatalog.map((p) => [p.plan_key, p.display_name]));
  }, [planCatalog]);

  const planFilterOptions = useMemo(
    () => [{ value: "", label: "Todos os Planos" }, ...PLAN_OPTIONS.map((key) => ({ value: key, label: PLAN_LABELS[key] ?? key }))],
    [PLAN_OPTIONS, PLAN_LABELS],
  );

  const refresh = useCallback(async (search = "") => {
    setLoading(true);
    setError("");
    try {
      const list = await listPlatformTenants({ q: search, limit: 200 });
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar clientes SaaS.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listPlatformSaasPlans({ for_tenant_select: true })
      .then((catalogRows) => {
        if (!cancelled) setPlanCatalog(catalogRows);
      })
      .catch(() => {
        if (!cancelled) setPlanCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tenants = useMemo(
    () => rows.map((row) => mapPlatformTenantToView(row, detailsById[row.id], PLAN_LABELS)),
    [rows, detailsById, PLAN_LABELS],
  );

  const metrics = useMemo(() => buildPlatformSaasMetrics(rows), [rows]);

  const planModalDetail = planModalTenantId != null ? detailsById[planModalTenantId] : null;
  const logsModalRow = logsModalTenantId != null ? rows.find((r) => r.id === logsModalTenantId) : null;

  async function ensureDetail(tenantId: number): Promise<PlatformTenantDetail> {
    const cached = detailsById[tenantId];
    if (cached) return cached;
    const detail = await getPlatformTenant(tenantId);
    setDetailsById((prev) => ({ ...prev, [tenantId]: detail }));
    return detail;
  }

  async function openPlanModal(tenantId: string) {
    const id = Number(tenantId);
    if (!Number.isFinite(id) || id < 1) return;
    setPlanModalTenantId(id);
    setPlanModalLoading(true);
    setError("");
    try {
      const detail = await ensureDetail(id);
      setPlanDraft(detail.active_plan);
      setPlanHistory(detail.plan_change_logs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o cadastro.");
      setPlanModalTenantId(null);
    } finally {
      setPlanModalLoading(false);
    }
  }

  async function savePlanChange() {
    if (planModalTenantId == null || !planDraft.trim()) return;
    const current = detailsById[planModalTenantId]?.active_plan ?? rows.find((r) => r.id === planModalTenantId)?.active_plan;
    if (planDraft.trim() === current) return;

    setUpdatingPlan(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updatePlatformTenantPlan(planModalTenantId, planDraft.trim());
      setDetailsById((prev) => ({ ...prev, [planModalTenantId]: updated }));
      setPlanDraft(updated.active_plan);
      setPlanHistory(updated.plan_change_logs ?? []);
      setSuccess("Plano atualizado com sucesso.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar o plano.");
    } finally {
      setUpdatingPlan(false);
    }
  }

  async function openLogsModal(tenantId: string) {
    const id = Number(tenantId);
    if (!Number.isFinite(id) || id < 1) return;
    setLogsModalTenantId(id);
    setHistoryStartDate("");
    setHistoryEndDate("");
    setHistoryLoading(true);
    setError("");
    try {
      const detail = await ensureDetail(id);
      setPlanHistory(detail.plan_change_logs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar histórico.");
      setLogsModalTenantId(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function applyHistoryFilter() {
    if (logsModalTenantId == null) return;
    setHistoryLoading(true);
    setError("");
    try {
      const logs = await listPlatformTenantPlanChangeLogs({
        tenantId: logsModalTenantId,
        startDate: historyStartDate || undefined,
        endDate: historyEndDate || undefined,
        limit: 300,
      });
      setPlanHistory(logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível filtrar histórico.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function exportHistoryCsv() {
    if (logsModalTenantId == null) return;
    setHistoryExporting(true);
    setError("");
    try {
      const blob = await downloadPlatformTenantPlanChangeLogsCsv({
        tenantId: logsModalTenantId,
        startDate: historyStartDate || undefined,
        endDate: historyEndDate || undefined,
        limit: 3000,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tenant-${logsModalTenantId}-plan-change-logs.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar histórico.");
    } finally {
      setHistoryExporting(false);
    }
  }

  async function removeTenant(tenantId: string) {
    const id = Number(tenantId);
    if (!Number.isFinite(id) || id < 1) return;
    const row = rows.find((r) => r.id === id);
    const name = row?.name ?? `ID ${id}`;
    const ok = window.confirm(`Tem certeza que deseja excluir o cliente "${name}"? Essa ação não pode ser desfeita.`);
    if (!ok) return;

    setDeletingId(id);
    setError("");
    setSuccess("");
    try {
      await deletePlatformTenant(id);
      setDetailsById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (planModalTenantId === id) setPlanModalTenantId(null);
      if (logsModalTenantId === id) setLogsModalTenantId(null);
      setSuccess("Cliente excluído com sucesso.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir cliente.");
    } finally {
      setDeletingId(null);
    }
  }

  const handleSearchChange = useCallback(
    (query: string) => {
      void refresh(query);
    },
    [refresh],
  );

  return (
    <>
      {error ? (
        <p className={styles.bannerErr} role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className={styles.bannerOk} role="status">
          {success}
        </p>
      ) : null}

      <SaaSAdminDashboardView
        metrics={metrics}
        tenants={tenants}
        isLoading={loading || deletingId != null}
        planLabels={PLAN_LABELS}
        planFilterOptions={planFilterOptions}
        onSearchChange={handleSearchChange}
        onProvisionTenant={() => {
          setError("Provisionamento manual de tenant ainda não está disponível nesta tela.");
        }}
        onManagePlan={(tenantId) => void openPlanModal(tenantId)}
        onViewLogs={(tenantId) => void openLogsModal(tenantId)}
        onBlockTenant={() => {
          setError("Bloqueio de tenant via operação ainda não está disponível na API.");
        }}
        onUnblockTenant={() => {
          setError("Desbloqueio de tenant via operação ainda não está disponível na API.");
        }}
        onResetAdminPassword={() => {
          setError("Reset de senha do admin do tenant ainda não está disponível na API.");
        }}
        onDeleteTenant={(tenantId) => void removeTenant(tenantId)}
        onToggleModule={() => {
          setError("Gestão de módulos por tenant ainda não está disponível na API.");
        }}
      />

      {planModalTenantId != null ? (
        <div className={styles.modalRoot} role="presentation">
          <button
            type="button"
            className={styles.modalBackdrop}
            aria-label="Fechar"
            onClick={() => setPlanModalTenantId(null)}
          />
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="plan-modal-title">
            <h3 id="plan-modal-title" className={styles.modalTitle}>
              Gerenciar plano
            </h3>
            <p className={styles.modalSubtitle}>
              {planModalDetail?.name ?? rows.find((r) => r.id === planModalTenantId)?.name ?? "Cliente"}
            </p>

            {planModalLoading ? (
              <p className={styles.modalHint}>Carregando cadastro…</p>
            ) : (
              <>
                <label className={styles.fieldLabel} htmlFor="tenant-plan-select">
                  Plano ativo
                </label>
                <select
                  id="tenant-plan-select"
                  className={styles.select}
                  value={planDraft}
                  onChange={(e) => setPlanDraft(e.target.value)}
                  disabled={updatingPlan}
                >
                  {!PLAN_OPTIONS.includes(planDraft) && planDraft ? (
                    <option value={planDraft}>{PLAN_LABELS[planDraft] ?? planDraft}</option>
                  ) : null}
                  {PLAN_OPTIONS.map((planKey) => (
                    <option key={planKey} value={planKey}>
                      {PLAN_LABELS[planKey] ?? planKey}
                    </option>
                  ))}
                </select>

                <div className={styles.modalActions}>
                  <button type="button" className={styles.btnSecondary} onClick={() => setPlanModalTenantId(null)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => void savePlanChange()}
                    disabled={updatingPlan || !planDraft.trim()}
                  >
                    {updatingPlan ? "Salvando…" : "Salvar plano"}
                  </button>
                </div>

                <div className={styles.historyBlock}>
                  <h4 className={styles.historyTitle}>Histórico recente</h4>
                  {planHistory.length === 0 ? (
                    <p className={styles.modalHint}>Sem alterações registradas.</p>
                  ) : (
                    <ul className={styles.historyList}>
                      {planHistory.map((log) => (
                        <li key={log.id}>
                          {fmtDate(log.changed_at)} · {PLAN_LABELS[log.previous_plan] ?? log.previous_plan} →{" "}
                          {PLAN_LABELS[log.new_plan] ?? log.new_plan}
                          {log.changed_by_email ? ` · ${log.changed_by_email}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {logsModalTenantId != null ? (
        <div className={styles.modalRoot} role="presentation">
          <button
            type="button"
            className={styles.modalBackdrop}
            aria-label="Fechar"
            onClick={() => setLogsModalTenantId(null)}
          />
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="logs-modal-title">
            <h3 id="logs-modal-title" className={styles.modalTitle}>
              Histórico de plano
            </h3>
            <p className={styles.modalSubtitle}>{logsModalRow?.name ?? "Cliente"}</p>

            <div className={styles.filterRow}>
              <input
                className={styles.input}
                type="date"
                value={historyStartDate}
                onChange={(e) => setHistoryStartDate(e.target.value)}
              />
              <input
                className={styles.input}
                type="date"
                value={historyEndDate}
                onChange={(e) => setHistoryEndDate(e.target.value)}
              />
              <button type="button" className={styles.btnSecondary} onClick={() => void applyHistoryFilter()} disabled={historyLoading}>
                {historyLoading ? "Filtrando…" : "Filtrar"}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => void exportHistoryCsv()}
                disabled={historyExporting}
              >
                {historyExporting ? "Exportando…" : "Exportar CSV"}
              </button>
            </div>

            {historyLoading ? (
              <p className={styles.modalHint}>Carregando histórico…</p>
            ) : planHistory.length === 0 ? (
              <p className={styles.modalHint}>Sem alterações registradas.</p>
            ) : (
              <ul className={styles.historyList}>
                {planHistory.map((log) => (
                  <li key={log.id}>
                    {fmtDate(log.changed_at)} · {PLAN_LABELS[log.previous_plan] ?? log.previous_plan} →{" "}
                    {PLAN_LABELS[log.new_plan] ?? log.new_plan}
                    {log.changed_by_email ? ` · ${log.changed_by_email}` : ""}
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setLogsModalTenantId(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
