import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext } from "react-router-dom";
import { listClientsAll } from "../../api/clients";
import { listServiceOrdersAll, type ServiceOrderOut } from "../../api/serviceOrders";
import { listTenantUsers } from "../../api/auth";
import {
  ServiceOrdersListView,
  statusConfig,
  type ServiceOrder,
  type ServiceOrderStatus,
} from "../../components/v0-ui/service-orders";
import { API_MAX_PAGE_LIMIT } from "../../lib/apiPagination";
import {
  computeListMetrics,
  mapOrdersToListView,
  mapTechniciansToListView,
} from "../../lib/serviceOrderFormViewAdapter";
import { isInventoryEnabled } from "../../lib/inventoryEnabled";
import type { DashboardOutletContext } from "../dashboardContext";
import tableStyles from "../listTableCommon.module.css";
import listStyles from "../../components/v0-ui/clients/clients-list.module.css";
import styles from "./ServiceOrdersListPage.module.css";

const SERVICE_ORDERS_UI_PAGE_SIZE = 25;
const CURRENT_PERIOD_DAYS = 90;
type DateFilter = "current" | "today" | "week" | "month" | "all";

function isWithinCurrentWeek(dateValue: Date, now: Date): boolean {
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() + diffToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return dateValue >= weekStart && dateValue < weekEnd;
}

function matchesDateFilter(order: ServiceOrder, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const source = order.scheduledAt ?? order.openedAt;
  if (!source) return false;
  const value = new Date(source);
  if (Number.isNaN(value.getTime())) return false;
  const now = new Date();
  if (filter === "today") {
    return value.toDateString() === now.toDateString();
  }
  if (filter === "week") {
    return isWithinCurrentWeek(value, now);
  }
  if (filter === "month") {
    return value.getMonth() === now.getMonth() && value.getFullYear() === now.getFullYear();
  }
  if (filter === "current") {
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - CURRENT_PERIOD_DAYS);
    return value >= cutoff;
  }
  return true;
}

export function ServiceOrdersListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();

  const [allRows, setAllRows] = useState<ServiceOrderOut[]>([]);
  const [clientsById, setClientsById] = useState<Map<number, string>>(new Map());
  const [technicians, setTechnicians] = useState<ReturnType<typeof mapTechniciansToListView>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceOrderStatus | "">("");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [listPage, setListPage] = useState(1);
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const inventoryEnabled = isInventoryEnabled(ctx?.tenant);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchText(searchInput.trim()), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [orders, clients, users] = await Promise.all([
        listServiceOrdersAll(),
        listClientsAll(),
        listTenantUsers({ skip: 0, limit: API_MAX_PAGE_LIMIT }),
      ]);
      setAllRows(orders);
      setClientsById(new Map(clients.map((c) => [c.id, c.name])));
      setTechnicians(mapTechniciansToListView(users));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar ordens de serviço.");
      setAllRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobileLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const allOrders = useMemo(
    () => mapOrdersToListView(allRows, clientsById),
    [allRows, clientsById],
  );

  const metrics = useMemo(() => computeListMetrics(allOrders), [allOrders]);

  const filteredOrders = useMemo(() => {
    let rows = allOrders;
    if (statusFilter) {
      rows = rows.filter((o) => o.status === statusFilter);
    }
    if (technicianFilter) {
      rows = rows.filter((o) => o.technician?.id === technicianFilter);
    }
    const q = searchText.toLowerCase();
    const applyDateFilter = dateFilter !== "all" && !q;
    if (applyDateFilter) {
      rows = rows.filter((o) => matchesDateFilter(o, dateFilter));
    }
    if (q) {
      rows = rows.filter((o) => {
        const idMatch = o.number.includes(q) || o.id.includes(q.replace("#", ""));
        return (
          idMatch ||
          o.clientName.toLowerCase().includes(q) ||
          (o.description ?? "").toLowerCase().includes(q) ||
          (o.technician?.name ?? "").toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [allOrders, statusFilter, technicianFilter, dateFilter, searchText]);

  const totalFiltered = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / SERVICE_ORDERS_UI_PAGE_SIZE));

  const pagedOrders = useMemo(() => {
    const safePage = Math.min(Math.max(listPage, 1), totalPages);
    const start = (safePage - 1) * SERVICE_ORDERS_UI_PAGE_SIZE;
    return filteredOrders.slice(start, start + SERVICE_ORDERS_UI_PAGE_SIZE);
  }, [filteredOrders, listPage, totalPages]);

  useEffect(() => {
    setListPage(1);
  }, [statusFilter, technicianFilter, dateFilter, searchText]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  const openOrder = useCallback(
    (order: ServiceOrder) => {
      navigate(`/app/service-orders/${order.id}`);
    },
    [navigate],
  );

  const statusOptions = useMemo(
    () =>
      (Object.keys(statusConfig) as ServiceOrderStatus[])
        .filter((key) => inventoryEnabled || key !== "aguardando_pecas")
        .map((key) => ({
          value: key,
          label: statusConfig[key].label,
        })),
    [inventoryEnabled],
  );

  const toolbar = (
    <OsListToolbar
      searchInput={searchInput}
      onSearchInput={setSearchInput}
      statusFilter={statusFilter}
      technicianFilter={technicianFilter}
      dateFilter={dateFilter}
      statusOptions={statusOptions}
      technicians={technicians}
      onStatusFilter={setStatusFilter}
      onTechnicianFilter={setTechnicianFilter}
      onDateFilter={setDateFilter}
      isMobileLayout={isMobileLayout}
    />
  );

  if (!ctx) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={`${listStyles.wrap} ${styles.wrap}`}>
      <header className={listStyles.pageHeader}>
        <div>
          <h1 className={listStyles.pageTitle}>Ordens de serviço</h1>
          <p className={listStyles.pageSubtitle}>Gerencie as ordens de serviço da sua empresa</p>
        </div>
        {canEdit && !isMobileLayout ? (
          <Link className={`${tableStyles.listToolbarBtnPrimary} ${styles.newOsDesktopBtn}`} to="/app/service-orders/new">
            <span className={tableStyles.listToolbarBtnIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
            Nova OS
          </Link>
        ) : null}
      </header>

      <ServiceOrdersListView
        orders={pagedOrders}
        metrics={metrics}
        inventoryEnabled={inventoryEnabled}
        isLoading={isLoading}
        error={error}
        totalFiltered={totalFiltered}
        onRowClick={openOrder}
        onNewOrder={canEdit ? () => navigate("/app/service-orders/new") : undefined}
        toolbar={toolbar}
        pagination={
          totalFiltered > SERVICE_ORDERS_UI_PAGE_SIZE
            ? {
                currentPage: Math.min(listPage, totalPages),
                totalPages,
                totalItems: totalFiltered,
                itemsPerPage: SERVICE_ORDERS_UI_PAGE_SIZE,
                onPageChange: setListPage,
              }
            : undefined
        }
      />
    </div>
  );
}

function OsListToolbar({
  searchInput,
  onSearchInput,
  statusFilter,
  technicianFilter,
  dateFilter,
  statusOptions,
  technicians,
  onStatusFilter,
  onTechnicianFilter,
  onDateFilter,
  isMobileLayout,
}: {
  searchInput: string;
  onSearchInput: (v: string) => void;
  statusFilter: ServiceOrderStatus | "";
  technicianFilter: string;
  dateFilter: DateFilter;
  statusOptions: { value: ServiceOrderStatus; label: string }[];
  technicians: { id: string; name: string }[];
  onStatusFilter: (v: ServiceOrderStatus | "") => void;
  onTechnicianFilter: (v: string) => void;
  onDateFilter: (v: DateFilter) => void;
  isMobileLayout: boolean;
}) {
  return (
    <div className={`${tableStyles.listToolbar} ${styles.osToolbar}`}>
      <div className={`${tableStyles.listToolbarSearchCol} ${isMobileLayout ? styles.toolbarSearchMobile : ""}`}>
        <label className={tableStyles.listToolbarLabel} htmlFor="os-search">
          Buscar
        </label>
        <div className={tableStyles.listToolbarSearchWrap}>
          <span className={tableStyles.listToolbarSearchIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            id="os-search"
            className={tableStyles.listToolbarSearchInput}
            value={searchInput}
            onChange={(e) => onSearchInput(e.target.value)}
            placeholder="Buscar nº OS, cliente ou técnico..."
            autoComplete="off"
          />
        </div>
      </div>

      <div className={`${tableStyles.listToolbarActions} ${isMobileLayout ? styles.toolbarActionsMobile : ""}`}>
        <div className={`${tableStyles.listToolbarFilterBlock} ${isMobileLayout ? styles.toolbarFilterMobile : ""}`}>
          <label className={tableStyles.listToolbarLabel} htmlFor="os-status">
            Status
          </label>
          <select
            id="os-status"
            className={`${tableStyles.listToolbarSelect} ${tableStyles.listToolbarSelectShrink} ${isMobileLayout ? styles.toolbarSelectMobile : ""}`}
            value={statusFilter}
            onChange={(e) => onStatusFilter((e.target.value || "") as ServiceOrderStatus | "")}
          >
            <option value="">Todos os status</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <OsTechnicianFilter
          technicianFilter={technicianFilter}
          technicians={technicians}
          onTechnicianFilter={onTechnicianFilter}
          isMobileLayout={isMobileLayout}
        />
        <div className={`${tableStyles.listToolbarFilterBlock} ${isMobileLayout ? styles.toolbarFilterMobile : ""}`}>
          <label className={tableStyles.listToolbarLabel} htmlFor="os-date">
            Data
          </label>
          <select
            id="os-date"
            className={`${tableStyles.listToolbarSelect} ${tableStyles.listToolbarSelectShrink} ${isMobileLayout ? styles.toolbarSelectMobile : ""}`}
            value={dateFilter}
            onChange={(e) => onDateFilter(e.target.value as DateFilter)}
          >
            <option value="current">Últimos 90 dias</option>
            <option value="today">Hoje</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mês</option>
            <option value="all">Todas</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function OsTechnicianFilter({
  technicianFilter,
  technicians,
  onTechnicianFilter,
  isMobileLayout,
}: {
  technicianFilter: string;
  technicians: { id: string; name: string }[];
  onTechnicianFilter: (v: string) => void;
  isMobileLayout: boolean;
}) {
  return (
    <div className={`${tableStyles.listToolbarFilterBlock} ${isMobileLayout ? styles.toolbarFilterMobile : ""}`}>
      <label className={tableStyles.listToolbarLabel} htmlFor="os-tech">
        Técnico
      </label>
      <select
        id="os-tech"
        className={`${tableStyles.listToolbarSelect} ${tableStyles.listToolbarSelectShrink} ${isMobileLayout ? styles.toolbarSelectMobile : ""}`}
        value={technicianFilter}
        onChange={(e) => onTechnicianFilter(e.target.value)}
      >
        <option value="">Todos os técnicos</option>
        {technicians.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
