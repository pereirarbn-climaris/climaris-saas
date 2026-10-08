import { useEffect, useMemo, useState } from "react";
import {
  deletePlatformTenant,
  downloadPlatformTenantPlanChangeLogsCsv,
  getPlatformTenant,
  listPlatformTenantPlanChangeLogs,
  listPlatformTenants,
  updatePlatformTenantPlan,
  type PlatformTenantPlanChangeLog,
  type PlatformTenantDetail,
  type PlatformTenantListItem,
} from "../api/platformTenants";
import { listPlatformSaasPlans, type SaasPlanCatalogRow } from "../api/platformSaasPlans";
import styles from "./saas/SaasDashboardPage.module.css";

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
const FALLBACK_FINANCE_BLURB: Record<string, string> = {
  free_30d: "Financeiro básico incluído",
  basic: "Financeiro básico incluído",
  professional: "Financeiro até intermediário incluído",
  enterprise: "Gestão financeira completa incluída",
  beta_internal: "Todos os recursos liberados para testes internos (developer)",
};

export function PlatformTenantsPage() {
  const [planCatalog, setPlanCatalog] = useState<SaasPlanCatalogRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PlatformTenantListItem[]>([]);
  const [selected, setSelected] = useState<PlatformTenantDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [planDraft, setPlanDraft] = useState("");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExporting, setHistoryExporting] = useState(false);
  const [planHistory, setPlanHistory] = useState<PlatformTenantPlanChangeLog[]>([]);

  const totalRows = rows.length;

  async function refresh(search = q) {
    setLoading(true);
    setError("");
    try {
      const list = await listPlatformTenants({ q: search, limit: 200 });
      setRows(list);
      if (selected) {
        const stillThere = list.find((t) => t.id === selected.id);
        setSelected(stillThere ? selected : null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar clientes SaaS.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listPlatformSaasPlans({ for_tenant_select: true })
      .then((rows) => {
        if (!cancelled) setPlanCatalog(rows);
      })
      .catch(() => {
        if (!cancelled) setPlanCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const PLAN_OPTIONS = useMemo(() => {
    if (planCatalog.length === 0) return [...FALLBACK_PLAN_OPTIONS];
    return planCatalog.map((p) => p.plan_key);
  }, [planCatalog]);

  const PLAN_LABELS = useMemo(() => {
    if (planCatalog.length === 0) return { ...FALLBACK_LABELS };
    return Object.fromEntries(planCatalog.map((p) => [p.plan_key, p.display_name]));
  }, [planCatalog]);

  const PLAN_FINANCE_CAPABILITIES = useMemo(() => {
    if (planCatalog.length === 0) return { ...FALLBACK_FINANCE_BLURB };
    return Object.fromEntries(planCatalog.map((p) => [p.plan_key, p.description]));
  }, [planCatalog]);

  const selectedTitle = useMemo(() => (selected ? `Cadastro: ${selected.name}` : "Detalhes do cadastro"), [selected]);

  async function openDetails(tenantId: number) {
    setDetailsLoading(true);
    setError("");
    try {
      const row = await getPlatformTenant(tenantId);
      setSelected(row);
      setPlanDraft(row.active_plan);
      setPlanHistory(row.plan_change_logs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar detalhes.");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function removeTenant(tenantId: number, tenantName: string) {
    const ok = window.confirm(`Tem certeza que deseja excluir o cliente "${tenantName}"? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    setDeletingId(tenantId);
    setError("");
    try {
      await deletePlatformTenant(tenantId);
      if (selected?.id === tenantId) {
        setSelected(null);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir cliente.");
    } finally {
      setDeletingId(null);
    }
  }

  async function savePlanChange() {
    if (!selected) return;
    const nextPlan = planDraft.trim();
    if (!nextPlan) return;
    if (nextPlan === selected.active_plan) return;
    setUpdatingPlan(true);
    setError("");
    try {
      const updated = await updatePlatformTenantPlan(selected.id, nextPlan);
      setSelected(updated);
      setPlanDraft(updated.active_plan);
      setPlanHistory(updated.plan_change_logs ?? []);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar o plano.");
    } finally {
      setUpdatingPlan(false);
    }
  }

  async function applyHistoryFilter() {
    if (!selected) return;
    setHistoryLoading(true);
    setError("");
    try {
      const logs = await listPlatformTenantPlanChangeLogs({
        tenantId: selected.id,
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
    if (!selected) return;
    setHistoryExporting(true);
    setError("");
    try {
      const blob = await downloadPlatformTenantPlanChangeLogsCsv({
        tenantId: selected.id,
        startDate: historyStartDate || undefined,
        endDate: historyEndDate || undefined,
        limit: 3000,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tenant-${selected.id}-plan-change-logs.csv`;
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

  return (
    <div className={styles.panel}>
      <section className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Operação · Backend SaaS</p>
          <h2 className={styles.heroTitle}>Clientes cadastrados</h2>
          <p className={styles.heroLead}>Gerencie tenants cadastrados na plataforma. Você pode visualizar o cadastro e excluir clientes.</p>
          <p className={styles.heroMeta}>Total carregado: {totalRows}</p>
        </div>
        <div className={styles.heroAccent} aria-hidden />
      </section>

      <section className={styles.card}>
        <div className={styles.section}>
          <input
            className={styles.link}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, e-mail ou CPF/CNPJ"
          />
          <button className={`${styles.link} ${styles.linkPrimary}`} type="button" onClick={() => void refresh(q)} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
      </section>

      {error ? <p className={styles.contactHint}>{error}</p> : null}

      <section className={styles.grid2}>
        <article className={styles.card}>
          <h3 className={styles.cardTitle}>Lista de clientes</h3>
          {loading ? <p className={styles.note}>Carregando...</p> : null}
          {!loading && rows.length === 0 ? <p className={styles.note}>Nenhum cliente encontrado.</p> : null}
          {!loading && rows.length > 0 ? (
            <div className={styles.section}>
              {rows.map((row) => (
                <div key={row.id} className={styles.contactCard}>
                  <div>
                    <p className={styles.contactLabel}>{row.name}</p>
                    <p className={styles.note}>ID: {row.id}</p>
                    <p className={styles.note}>Documento: {row.tax_document}</p>
                    <p className={styles.note}>Plano: {PLAN_LABELS[row.active_plan] ?? row.active_plan}</p>
                    <p className={styles.note}>{PLAN_FINANCE_CAPABILITIES[row.active_plan] ?? "Financeiro customizável"}</p>
                    <p className={styles.note}>
                      Acessos: {row.users_count} / {row.total_user_limit ?? "Ilimitado"} (base {row.base_user_limit ?? "∞"} + extras{" "}
                      {row.extra_user_seats})
                    </p>
                    <p className={styles.note}>E-mail cadastro: {row.registration_email || "—"}</p>
                    <p className={styles.note}>Agendamentos: {row.schedules_count}</p>
                  </div>
                  <div className={styles.linkGrid}>
                    <button className={styles.link} type="button" onClick={() => void openDetails(row.id)} disabled={detailsLoading}>
                      Ver cadastro
                    </button>
                    <button
                      className={`${styles.link} ${styles.linkPrimary}`}
                      type="button"
                      onClick={() => void removeTenant(row.id, row.name)}
                      disabled={deletingId === row.id}
                    >
                      {deletingId === row.id ? "Excluindo..." : "Deletar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </article>

        <article className={styles.card}>
          <h3 className={styles.cardTitle}>{selectedTitle}</h3>
          {!selected ? <p className={styles.note}>Selecione um cliente e clique em "Ver cadastro".</p> : null}
          {selected ? (
            <ul className={styles.metaList}>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>ID</span>
                <span className={styles.metaVal}>{selected.id}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Empresa</span>
                <span className={styles.metaVal}>{selected.name}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Documento</span>
                <span className={styles.metaVal}>{selected.tax_document}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Plano</span>
                <span className={styles.metaVal}>
                  {PLAN_LABELS[selected.active_plan] ?? selected.active_plan ?? "—"} -{" "}
                  {PLAN_FINANCE_CAPABILITIES[selected.active_plan] ?? "Financeiro customizável"}
                </span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Alterar plano</span>
                <span className={styles.metaVal}>
                  <span className={styles.linkGrid}>
                    <select className={styles.link} value={planDraft} onChange={(e) => setPlanDraft(e.target.value)}>
                      {!PLAN_OPTIONS.includes(planDraft) && planDraft ? <option value={planDraft}>{planDraft}</option> : null}
                      {PLAN_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {PLAN_LABELS[p] ?? p}
                        </option>
                      ))}
                    </select>
                    <button
                      className={`${styles.link} ${styles.linkPrimary}`}
                      type="button"
                      onClick={() => void savePlanChange()}
                      disabled={updatingPlan || !planDraft.trim() || planDraft.trim() === selected.active_plan}
                    >
                      {updatingPlan ? "Salvando..." : "Salvar plano"}
                    </button>
                  </span>
                </span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Upgrade de financeiro por marketplace</span>
                <span className={styles.metaVal}>
                  Se o cliente quiser mais do que o plano inclui, pode contratar na Loja de integrações:{" "}
                  <code>finance-intermediate</code> ou <code>finance-management</code>.
                </span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Status</span>
                <span className={styles.metaVal}>{selected.status}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Criado em</span>
                <span className={styles.metaVal}>{fmtDate(selected.created_at)}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Fuso</span>
                <span className={styles.metaVal}>{selected.timezone}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Horário</span>
                <span className={styles.metaVal}>
                  {selected.workday_start} - {selected.workday_end}
                </span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>E-mail de cadastro</span>
                <span className={styles.metaVal}>{selected.registration_email || "—"}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Contato</span>
                <span className={styles.metaVal}>{selected.email || selected.phone || "—"}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Cidade/UF</span>
                <span className={styles.metaVal}>
                  {selected.address_city && selected.address_state ? `${selected.address_city}/${selected.address_state}` : "—"}
                </span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Usuários</span>
                <span className={styles.metaVal}>
                  {selected.users_count} / {selected.total_user_limit ?? "Ilimitado"} (base{" "}
                  {selected.base_user_limit ?? "∞"} + extras {selected.extra_user_seats})
                </span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Clientes finais</span>
                <span className={styles.metaVal}>{selected.clients_count}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Ordens de serviço</span>
                <span className={styles.metaVal}>{selected.service_orders_count}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Agendamentos</span>
                <span className={styles.metaVal}>{selected.schedules_count}</span>
              </li>
              <li className={styles.metaRow}>
                <span className={styles.metaKey}>Histórico de plano</span>
                <span className={styles.metaVal}>
                  <span className={styles.linkGrid}>
                    <input
                      className={styles.link}
                      type="date"
                      value={historyStartDate}
                      onChange={(e) => setHistoryStartDate(e.target.value)}
                      placeholder="De"
                    />
                    <input
                      className={styles.link}
                      type="date"
                      value={historyEndDate}
                      onChange={(e) => setHistoryEndDate(e.target.value)}
                      placeholder="Até"
                    />
                    <button className={styles.link} type="button" onClick={() => void applyHistoryFilter()} disabled={historyLoading}>
                      {historyLoading ? "Filtrando..." : "Filtrar"}
                    </button>
                    <button
                      className={`${styles.link} ${styles.linkPrimary}`}
                      type="button"
                      onClick={() => void exportHistoryCsv()}
                      disabled={historyExporting}
                    >
                      {historyExporting ? "Exportando..." : "Exportar CSV"}
                    </button>
                  </span>
                  {planHistory.length === 0 ? (
                    "Sem alterações registradas."
                  ) : (
                    <span className={styles.section}>
                      {planHistory.map((log) => (
                        <span key={log.id} className={styles.note}>
                          {fmtDate(log.changed_at)} · {log.previous_plan} → {log.new_plan}
                          {log.changed_by_email ? ` · por ${log.changed_by_email}` : ""}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            </ul>
          ) : null}
        </article>
      </section>
    </div>
  );
}
