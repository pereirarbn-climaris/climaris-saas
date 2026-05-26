import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { getClient } from "../../api/clients";
import { listProducts } from "../../api/products";
import { listServices } from "../../api/services";
import {
  getServiceOrder,
  patchServiceOrderStatus,
  postServiceOrderServiceItem,
} from "../../api/serviceOrders";
import type { ServiceOrderOut } from "../../types/serviceOrders";
import { API_MAX_PAGE_LIMIT } from "../../lib/apiPagination";
import {
  loadCompletedServiceItemIds,
  toggleCompletedServiceItem,
} from "../../lib/technicianOsProgress";
import type { DashboardOutletContext } from "../dashboardContext";
import { TechnicianServiceOrderView } from "./TechnicianServiceOrderView";
import styles from "./TechnicianServiceOrderPage.module.css";

export function TechnicianServiceOrderPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const { orderId } = useParams<{ orderId: string }>();
  const idNum = orderId ? Number(orderId) : NaN;

  const [order, setOrder] = useState<ServiceOrderOut | null>(null);
  const [clientName, setClientName] = useState("");
  const [productNameById, setProductNameById] = useState<Map<number, string>>(new Map());
  const [servicesCatalog, setServicesCatalog] = useState<Awaited<ReturnType<typeof listServices>>>([]);
  const [completedIds, setCompletedIds] = useState<Set<number>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!Number.isFinite(idNum) || idNum < 1) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [row, products, services] = await Promise.all([
          getServiceOrder(idNum, { bustCache: true }),
          listProducts({ limit: API_MAX_PAGE_LIMIT }),
          listServices({ limit: API_MAX_PAGE_LIMIT }),
        ]);
        if (cancelled) return;
        setOrder(row);
        setServicesCatalog(services);
        setProductNameById(new Map(products.map((p) => [p.id, p.name])));
        setCompletedIds(loadCompletedServiceItemIds(row.id));
        try {
          const client = await getClient(row.client_id);
          setClientName(client.name?.trim() || client.trade_name?.trim() || `Cliente #${row.client_id}`);
        } catch {
          setClientName(`Cliente #${row.client_id}`);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Não foi possível carregar a OS.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idNum]);

  const readOnly = useMemo(() => {
    if (!order) return true;
    return order.status === "done" || order.status === "cancelled";
  }, [order]);

  const handleToggleDone = useCallback(
    (serviceItemId: number, done: boolean) => {
      if (!order) return;
      const next = toggleCompletedServiceItem(order.id, serviceItemId, done);
      setCompletedIds(new Set(next));
    },
    [order],
  );

  const handleAddService = useCallback(
    async (equipmentId: number | null, serviceId: number) => {
      if (!order || equipmentId == null) return;
      setBusy(true);
      setToast(null);
      try {
        const updated = await postServiceOrderServiceItem(order.id, {
          service_id: serviceId,
          equipment_id: equipmentId,
          quantity: 1,
        });
        setOrder(updated);
        setToast({ kind: "ok", text: "Serviço adicionado ao aparelho." });
      } catch (e) {
        setToast({ kind: "err", text: e instanceof Error ? e.message : "Erro ao adicionar serviço." });
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [order],
  );

  const handleStart = useCallback(async () => {
    if (!order) return;
    setBusy(true);
    setToast(null);
    try {
      const updated = await patchServiceOrderStatus(order.id, "in_progress");
      setOrder(updated);
      setToast({ kind: "ok", text: "Atendimento iniciado." });
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Erro ao iniciar atendimento." });
    } finally {
      setBusy(false);
    }
  }, [order]);

  const handleComplete = useCallback(async () => {
    if (!order) return;
    setBusy(true);
    setToast(null);
    try {
      const updated = await patchServiceOrderStatus(order.id, "done");
      setOrder(updated);
      setToast({ kind: "ok", text: "OS concluída com sucesso." });
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Erro ao concluir a OS." });
    } finally {
      setBusy(false);
    }
  }, [order]);

  if (!ctx) {
    return <Navigate to="/login" replace />;
  }

  const isTechnician = ctx.user.role === "technician";
  const canView = isTechnician || ctx.user.role === "admin" || ctx.user.role === "receptionist";

  if (!canView) {
    return <Navigate to="/app" replace />;
  }

  if (!orderId || !Number.isFinite(idNum) || idNum < 1) {
    return <Navigate to="/app/agenda" replace />;
  }

  if (isLoading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando ordem de serviço…</p>
      </div>
    );
  }

  if (error || !order) {
    return <ErrorWrap error={error} />;
  }

  return (
    <div className={styles.wrap}>
      <Link className={styles.back} to={isTechnician ? "/app/agenda" : "/app/service-orders"}>
        ← {isTechnician ? "Voltar à agenda" : "Voltar às OS"}
      </Link>

      {toast ? (
        <p className={`${styles.toast} ${toast.kind === "ok" ? styles.toastOk : styles.toastErr}`}>{toast.text}</p>
      ) : null}

      <TechnicianServiceOrderView
        order={order}
        clientName={clientName}
        productNameById={productNameById}
        servicesCatalog={servicesCatalog}
        completedServiceIds={completedIds}
        busy={busy}
        readOnly={readOnly}
        onToggleServiceDone={handleToggleDone}
        onAddService={handleAddService}
        onStartOrder={
          order.status === "approved" || order.status === "scheduled" ? () => void handleStart() : undefined
        }
        onCompleteOrder={
          order.status === "in_progress" || order.status === "approved" || order.status === "scheduled"
            ? () => void handleComplete()
            : undefined
        }
      />
    </div>
  );
}

function ErrorWrap({ error }: { error: string | null }) {
  return (
    <div className={styles.wrap}>
      <Link className={styles.back} to="/app/agenda">
        ← Voltar à agenda
      </Link>
      <p className={styles.error}>{error ?? "OS não encontrada."}</p>
    </div>
  );
}
