import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useOutletContext } from "react-router-dom";
import { listClients } from "../../api/clients";
import { listServiceOrders, type ServiceOrderOut } from "../../api/serviceOrders";
import { listTenantUsers } from "../../api/auth";
import {
  ServiceOrdersListView,
  type ServiceOrder,
  type ServiceOrderStatus,
} from "../../components/v0-ui/service-orders";
import {
  computeListMetrics,
  mapOrdersToListView,
  mapTechniciansToListView,
} from "../../lib/serviceOrderFormViewAdapter";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./ServiceOrdersListPage.module.css";

export function ServiceOrdersListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();

  const [allRows, setAllRows] = useState<ServiceOrderOut[]>([]);
  const [clientsById, setClientsById] = useState<Map<number, string>>(new Map());
  const [technicians, setTechnicians] = useState<ReturnType<typeof mapTechniciansToListView>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceOrderStatus | null>(null);
  const [technicianFilter, setTechnicianFilter] = useState<string | null>(null);

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [orders, clients, users] = await Promise.all([
        listServiceOrders({ limit: 500 }),
        listClients({ limit: 500 }),
        listTenantUsers({ limit: 200 }),
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
    const q = searchText.trim().toLowerCase();
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

  const openOrder = useCallback(
    (order: ServiceOrder) => {
      navigate(`/app/service-orders/${order.id}`);
    },
    [navigate],
  );

  if (!ctx) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={styles.wrap}>
      {error ? <p className={styles.msgErr}>{error}</p> : null}

      <ServiceOrdersListView
        orders={filteredOrders}
        metrics={metrics}
        technicians={technicians}
        isLoading={isLoading}
        onNewOrder={canEdit ? () => navigate("/app/service-orders/new") : undefined}
        onView={openOrder}
        onEdit={canEdit ? openOrder : undefined}
        onPrint={openOrder}
        onSearch={setSearchText}
        onFilterStatus={setStatusFilter}
        onFilterTechnician={setTechnicianFilter}
      />
    </div>
  );
}
