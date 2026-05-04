import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { listClients } from "../../api/clients";
import { listServiceOrders, type OrderStatus, type ServiceOrderOut } from "../../api/serviceOrders";
import { listServices, type ServiceOut } from "../../api/services";
import type { DashboardOutletContext } from "../dashboardContext";
import tableStyles from "../listTableCommon.module.css";
import styles from "./ServiceOrdersListPage.module.css";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function uiStatusLabel(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    open: "Rascunho",
    approved: "Aprovada",
    scheduled: "Agendada",
    in_progress: "Em Execucao",
    done: "Concluida",
    cancelled: "Cancelada",
  };
  return map[status] ?? status;
}

function uiStatusClass(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    open: styles.statusDraft,
    approved: styles.statusPending,
    scheduled: styles.statusApprovedUi,
    in_progress: styles.statusRunning,
    done: styles.statusDoneUi,
    cancelled: styles.statusCancelledUi,
  };
  return map[status] ?? styles.statusDraft;
}

function rowGrandTotal(row: ServiceOrderOut): number {
  const s = row.service_items.reduce(
    (sum, i) => sum + Math.max(i.quantity, 1) * Number(i.unit_price),
    0,
  );
  const p = row.product_items.reduce(
    (sum, i) => sum + Math.max(i.quantity, 1) * Number(i.unit_price),
    0,
  );
  return s + p;
}

function primaryServiceLabel(row: ServiceOrderOut, servicesMap: Map<number, ServiceOut>): string {
  if (row.service_items.length === 0) return "—";
  const first = row.service_items[0]!;
  return servicesMap.get(first.service_id)?.name ?? `Servico #${first.service_id}`;
}

const STATUS_OPTIONS: { value: "all" | OrderStatus; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "open", label: "Rascunho" },
  { value: "approved", label: "Aprovada" },
  { value: "scheduled", label: "Agendada" },
  { value: "in_progress", label: "Em Execucao" },
  { value: "done", label: "Concluida" },
  { value: "cancelled", label: "Cancelada" },
];

export function ServiceOrdersListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [allRows, setAllRows] = useState<ServiceOrderOut[]>([]);
  const [clientsMap, setClientsMap] = useState<Map<number, string>>(new Map());
  const [servicesMap, setServicesMap] = useState<Map<number, ServiceOut>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [searchText, setSearchText] = useState("");

  const canEdit = useMemo(() => ctx?.user.role === "admin" || ctx?.user.role === "receptionist", [ctx?.user.role]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [orders, clients, services] = await Promise.all([
        listServiceOrders({ limit: 500 }),
        listClients({ limit: 100 }),
        listServices({ limit: 100 }),
      ]);
      setAllRows(orders);
      setClientsMap(new Map(clients.map((c) => [c.id, c.name])));
      setServicesMap(new Map(services.map((s) => [s.id, s])));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const total = allRows.length;
    const emAberto = allRows.filter((o) =>
      ["open", "approved", "scheduled", "in_progress"].includes(o.status),
    ).length;
    const concluidas = allRows.filter((o) => o.status === "done").length;
    const canceladas = allRows.filter((o) => o.status === "cancelled").length;
    return { total, emAberto, concluidas, canceladas };
  }, [allRows]);

  const filteredRows = useMemo(() => {
    let r = allRows;
    if (statusFilter !== "all") {
      r = r.filter((o) => o.status === statusFilter);
    }
    const q = searchText.trim().toLowerCase();
    if (q) {
      r = r.filter((o) => {
        const client = (clientsMap.get(o.client_id) ?? "").toLowerCase();
        const idMatch = String(o.id).includes(q.replace("#", ""));
        const servicesStr = o.service_items
          .map((i) => (servicesMap.get(i.service_id)?.name ?? "").toLowerCase())
          .join(" ");
        const title = (o.title ?? "").toLowerCase();
        return idMatch || client.includes(q) || servicesStr.includes(q) || title.includes(q);
      });
    }
    return r;
  }, [allRows, statusFilter, searchText, clientsMap, servicesMap]);

  return (
    <div className={styles.wrap}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ordens de Servico</h1>
          <p className={styles.pageSubtitle}>Gerencie todas as ordens de servico da sua empresa</p>
        </div>
        {canEdit && (
          <Link className={styles.btnPrimary} to="/app/service-orders/new">
            <span className={styles.btnIcon} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
            Nova OS
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Total de OS</p>
              <p className={styles.statValue}>{stats.total}</p>
            </div>
            <span className={`${styles.statIconWrap} ${styles.statIconBlue}`} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>{stats.total > 0 ? "Cadastradas no sistema" : "Sem registros"}</p>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Em Aberto</p>
              <p className={styles.statValue}>{stats.emAberto}</p>
            </div>
            <span className={`${styles.statIconWrap} ${styles.statIconOrange}`} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>{stats.total > 0 ? `${Math.round((stats.emAberto / stats.total) * 100)}% do total` : "0% do total"}</p>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Concluidas</p>
              <p className={styles.statValue}>{stats.concluidas}</p>
            </div>
            <span className={`${styles.statIconWrap} ${styles.statIconGreen}`} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <path d="M22 4L12 14.01l-3-3" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>{stats.total > 0 ? `${Math.round((stats.concluidas / stats.total) * 100)}% do total` : "0% do total"}</p>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Canceladas</p>
              <p className={styles.statValue}>{stats.canceladas}</p>
            </div>
            <span className={`${styles.statIconWrap} ${styles.statIconRed}`} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>{stats.total > 0 ? `${Math.round((stats.canceladas / stats.total) * 100)}% do total` : "0% do total"}</p>
        </article>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchCol}>
          <label className={styles.searchLabel} htmlFor="os-search">
            Buscar
          </label>
          <div className={styles.searchInputWrap}>
            <span className={styles.searchIcon} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              id="os-search"
              className={styles.searchInput}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar por cliente, servico ou numero..."
              autoComplete="off"
            />
          </div>
        </div>

        <div className={styles.filterCol}>
          <label className={styles.filterLabel} htmlFor="os-status-filter">
            Status
          </label>
          <div className={styles.filterSelectWrap}>
            <span className={styles.filterIcon} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
            </span>
            <select
              id="os-status-filter"
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | OrderStatus)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {err && <p className={styles.msgErr}>{err}</p>}

      {/* Loading State */}
      {loading && <p className={styles.empty}>Carregando...</p>}

      {/* Empty State */}
      {!loading && !err && filteredRows.length === 0 && (
        <p className={styles.empty}>Nenhuma OS encontrada.</p>
      )}

      {/* Table */}
      {!loading && !err && filteredRows.length > 0 && (
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>OS</th>
                <th>Cliente</th>
                <th>Servico</th>
                <th>Status</th>
                <th>Agendamento</th>
                <th>Tecnico</th>
                <th className={tableStyles.cellRight}>Total</th>
                <th className={tableStyles.tailCol} aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={tableStyles.rowClickable}
                  onClick={() => navigate(`/app/service-orders/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/app/service-orders/${row.id}`);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                  aria-label={`Abrir ordem de servico ${row.id}`}
                >
                  <td>
                    <Link
                      className={styles.osLink}
                      to={`/app/service-orders/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{row.id}
                    </Link>
                  </td>
                  <td>
                    <div className={styles.clientCell}>
                      <span className={styles.clientIcon}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <span className={styles.clientName}>
                        {clientsMap.get(row.client_id) ?? `Cliente #${row.client_id}`}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.serviceCell} title={primaryServiceLabel(row, servicesMap)}>
                      {primaryServiceLabel(row, servicesMap)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.statusPill} ${uiStatusClass(row.status)}`}>
                      {uiStatusLabel(row.status)}
                    </span>
                  </td>
                  <td>
                    <span className={styles.scheduleCell}>
                      <span className={styles.scheduleIcon}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                      </span>
                      {formatDateTime(row.schedule?.starts_at)}
                    </span>
                  </td>
                  <td>
                    <span className={row.assigned_technician_name?.trim() ? styles.technicianCell : styles.technicianUnassigned}>
                      {row.assigned_technician_name?.trim() || "Nao atribuido"}
                    </span>
                  </td>
                  <td className={styles.totalCell}>
                    {formatCurrency(rowGrandTotal(row))}
                  </td>
                  <td className={`${tableStyles.tailCol} ${tableStyles.rowHint}`} aria-hidden="true">
                    <span className={tableStyles.rowHintIcon}>
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                        <path
                          d="M7 4L13 10L7 16"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {!loading && filteredRows.length > 0 && (
        <p className={styles.listFoot}>
          Mostrando {filteredRows.length} de {allRows.length} ordens de servico
        </p>
      )}
    </div>
  );
}
