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

const SERVICE_ORDERS_UI_PAGE_SIZE = 25;

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
  const [listPage, setListPage] = useState(1);

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
  }, [allOrders, statusFilter, technicianFilter, searchText]);

  const totalFiltered = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / SERVICE_ORDERS_UI_PAGE_SIZE));

  const pagedOrders = useMemo(() => {
    const safePage = Math.min(Math.max(listPage, 1), totalPages);
    const start = (safePage - 1) * SERVICE_ORDERS_UI_PAGE_SIZE;
    return filteredOrders.slice(start, start + SERVICE_ORDERS_UI_PAGE_SIZE);
  }, [filteredOrders, listPage, totalPages]);

  useEffect(() => {
    setListPage(1);
  }, [statusFilter, technicianFilter, searchText]);

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
      statusOptions={statusOptions}
      technicians={technicians}
      onStatusFilter={setStatusFilter}
      onTechnicianFilter={setTechnicianFilter}
    />
  );

  if (!ctx) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={listStyles.wrap}>
      <header className={listStyles.pageHeader}>
        <div>
          <h1 className={listStyles.pageTitle}>Ordens de serviço</h1>
          <p className={listStyles.pageSubtitle}>Gerencie todas as OS da sua empresa</p>
        </div>
        {canEdit ? (
          <Link className={tableStyles.listToolbarBtnPrimary} to="/app/service-orders/new">
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
  statusOptions,
  technicians,
  onStatusFilter,
  onTechnicianFilter,
}: {
  searchInput: string;
  onSearchInput: (v: string) => void;
  statusFilter: ServiceOrderStatus | "";
  technicianFilter: string;
  statusOptions: { value: ServiceOrderStatus; label: string }[];
  technicians: { id: string; name: string }[];
  onStatusFilter: (v: ServiceOrderStatus | "") => void;
  onTechnicianFilter: (v: string) => void;
}) {
  return (
    <div className={tableStyles.listToolbar}>
      <div className={tableStyles.listToolbarSearchCol}>
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
            placeholder="Número da OS, cliente ou técnico"
            autoComplete="off"
          />
        </div>
      </div>

      <div className={tableStyles.listToolbarActions}>
        <div className={tableStyles.listToolbarFilterBlock}>
          <label className={tableStyles.listToolbarLabel} htmlFor="os-status">
            Status
          </label>
          <select
            id="os-status"
            className={`${tableStyles.listToolbarSelect} ${tableStyles.listToolbarSelectShrink}`}
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
        />
      </div>
    </div>
  );
}

function OsTechnicianFilter({
  technicianFilter,
  technicians,
  onTechnicianFilter,
}: {
  technicianFilter: string;
  technicians: { id: string; name: string }[];
  onTechnicianFilter: (v: string) => void;
}) {
  return (
    <div className={tableStyles.listToolbarFilterBlock}>
      <label className={tableStyles.listToolbarLabel} htmlFor="os-tech">
        Técnico
      </label>
      <select
        id="os-tech"
        className={`${tableStyles.listToolbarSelect} ${tableStyles.listToolbarSelectShrink}`}
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
