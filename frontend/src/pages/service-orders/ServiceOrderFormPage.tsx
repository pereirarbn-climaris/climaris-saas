import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useMatch, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { listTenantUsers } from "../../api/auth";
import { listClientEquipments, listClients } from "../../api/clients";
import { listProducts } from "../../api/products";
import { listServices } from "../../api/services";
import {
  approveServiceOrder,
  createServiceOrder,
  getServiceOrder,
  patchServiceOrderDiscount,
  patchServiceOrderStatus,
  rescheduleSchedule,
  updateServiceOrderItemEquipment,
  type ServiceOrderOut,
} from "../../api/serviceOrders";
import {
  ServiceOrderFormView,
  type ServiceOrderData,
} from "../../components/v0-ui/service-orders";
import {
  buildScheduleStartsAt,
  computeOrderTotalFromView,
  mapClientsToFormView,
  mapEquipmentsToFormView,
  mapFormStatusToPatchTarget,
  mapTechniciansToFormView,
  orderGrandTotal,
  serviceOrderOutToViewData,
  viewDataToCreatePayload,
} from "../../lib/serviceOrderFormViewAdapter";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./ServiceOrderFormPage.module.css";

export function ServiceOrderFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const isNew = useMatch({ path: "/app/service-orders/new", end: true }) != null;
  const { orderId } = useParams<{ orderId: string }>();
  const idNum = orderId ? Number(orderId) : NaN;

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  const [serviceOrder, setServiceOrder] = useState<Partial<ServiceOrderData> | undefined>(undefined);
  const [orderRow, setOrderRow] = useState<ServiceOrderOut | null>(null);
  const [clientes, setClientes] = useState<ReturnType<typeof mapClientsToFormView>>([]);
  const [tecnicos, setTecnicos] = useState<ReturnType<typeof mapTechniciansToFormView>>([]);
  const [equipamentosCliente, setEquipamentosCliente] = useState<ReturnType<typeof mapEquipmentsToFormView>>([]);
  const [servicesCatalog, setServicesCatalog] = useState<Awaited<ReturnType<typeof listServices>>>([]);
  const [productsCatalog, setProductsCatalog] = useState<Awaited<ReturnType<typeof listProducts>>>([]);

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadEquipments = useCallback(async (clientId: string) => {
    const cid = Number(clientId);
    if (!Number.isFinite(cid) || cid < 1) {
      setEquipamentosCliente([]);
      return;
    }
    try {
      const rows = await listClientEquipments(cid, { only_active: true });
      setEquipamentosCliente(mapEquipmentsToFormView(rows));
    } catch {
      setEquipamentosCliente([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [clients, users, services, products] = await Promise.all([
          listClients({ limit: 500 }),
          listTenantUsers({ limit: 200 }),
          listServices({ limit: 200 }),
          listProducts({ limit: 200 }),
        ]);
        if (cancelled) return;
        setClientes(mapClientsToFormView(clients));
        setTecnicos(mapTechniciansToFormView(users));
        setServicesCatalog(services);
        setProductsCatalog(products);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar dados auxiliares.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isNew) {
      setServiceOrder(undefined);
      setOrderRow(null);
      setIsLoading(false);
      setEquipamentosCliente([]);
      return;
    }
    if (!orderId || !Number.isFinite(idNum) || idNum < 1) return;

    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const order = await getServiceOrder(idNum, { bustCache: true });
        if (cancelled) return;
        const view = serviceOrderOutToViewData(order);
        setServiceOrder(view);
        setOrderRow(order);
        await loadEquipments(view.clienteId);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar ordem de serviço.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, orderId, idNum, loadEquipments]);

  const handleClienteChange = useCallback(
    (clienteId: string) => {
      void loadEquipments(clienteId);
    },
    [loadEquipments],
  );

  const clientNameById = useMemo(() => new Map(clientes.map((c) => [c.id, c.nome])), [clientes]);

  const handleSave = useCallback(
    async (data: ServiceOrderData) => {
      if (!canEdit) return;
      setIsSaving(true);
      setMsg(null);

      const desiredTotal = computeOrderTotalFromView(data);
      const clientName = clientNameById.get(data.clienteId) ?? `Cliente ${data.clienteId}`;

      try {
        if (isNew) {
          const payload = viewDataToCreatePayload(data, {
            clientName,
            services: servicesCatalog,
            products: productsCatalog,
          });
          const created = await createServiceOrder(payload);
          const startsAt = buildScheduleStartsAt(data);
          if (startsAt) {
            await approveServiceOrder(created.id, {
              starts_at: startsAt,
              technician_ids: data.tecnicoId ? [Number(data.tecnicoId)] : undefined,
              notes: data.observacoesInternas?.trim() || undefined,
            });
          }
          navigate(`/app/service-orders/${created.id}`, { replace: true });
          return;
        }

        if (!orderRow) return;

        let refreshed = orderRow;

        const patchTarget = mapFormStatusToPatchTarget(orderRow.status, data.status);
        if (patchTarget) {
          refreshed = await patchServiceOrderStatus(orderRow.id, patchTarget, {
            schedule_notes: data.observacoesInternas?.trim() || null,
          });
        }

        const currentTotal = orderGrandTotal(refreshed);
        if (Math.abs(currentTotal - desiredTotal) > 0.009) {
          const servicesTotal = refreshed.service_items.reduce(
            (s, i) => s + Math.max(i.quantity, 1) * Number(i.unit_price),
            0,
          );
          const productsTotal = refreshed.product_items.reduce(
            (s, i) => s + Math.max(i.quantity, 1) * Number(i.unit_price),
            0,
          );
          const discount = Math.max(0, servicesTotal + productsTotal - desiredTotal);
          refreshed = await patchServiceOrderDiscount(orderRow.id, discount);
        }

        const equipmentIds = data.equipamentosIds.map((id) => Number(id)).filter((id) => id > 0);
        for (let i = 0; i < refreshed.service_items.length; i++) {
          const item = refreshed.service_items[i]!;
          const nextEq = equipmentIds[i] ?? equipmentIds[0] ?? null;
          if (nextEq && item.equipment_id !== nextEq) {
            refreshed = await updateServiceOrderItemEquipment(orderRow.id, item.id, nextEq);
          }
        }

        const startsAt = buildScheduleStartsAt(data);
        if (startsAt && refreshed.schedule?.id) {
          const currentStart = refreshed.schedule.starts_at;
          if (new Date(currentStart).getTime() !== new Date(startsAt).getTime()) {
            await rescheduleSchedule(refreshed.schedule.id, {
              starts_at: startsAt,
              technician_ids: data.tecnicoId ? [Number(data.tecnicoId)] : undefined,
              notes: data.observacoesInternas?.trim() || undefined,
            });
          }
        } else if (startsAt && !refreshed.schedule) {
          await approveServiceOrder(orderRow.id, {
            starts_at: startsAt,
            technician_ids: data.tecnicoId ? [Number(data.tecnicoId)] : undefined,
            notes: data.observacoesInternas?.trim() || undefined,
          });
        }

        const latest = await getServiceOrder(orderRow.id, { bustCache: true });
        const view = serviceOrderOutToViewData(latest);
        setServiceOrder(view);
        setOrderRow(latest);
        setMsg({ kind: "ok", text: `OS salva. Total: ${desiredTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` });
      } catch (e) {
        setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar ordem de serviço." });
      } finally {
        setIsSaving(false);
      }
    },
    [
      canEdit,
      clientNameById,
      isNew,
      navigate,
      orderRow,
      productsCatalog,
      servicesCatalog,
    ],
  );

  if (!ctx) {
    return <Navigate to="/login" replace />;
  }

  if (isNew && !canEdit) {
    return <Navigate to="/app/service-orders" replace />;
  }

  if (!isNew && (!orderId || !Number.isFinite(idNum) || idNum < 1)) {
    return <Navigate to="/app/service-orders" replace />;
  }

  if (!isNew && isLoading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando ordem de serviço…</p>
      </div>
    );
  }

  if (!isNew && error) {
    return (
      <div className={styles.wrap}>
        <Link className={styles.back} to="/app/service-orders">
          ← Voltar à lista
        </Link>
        <p className={styles.msgErr}>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <Link className={styles.back} to="/app/service-orders">
        ← Voltar à lista
      </Link>

      {msg?.kind === "ok" ? <p className={styles.msgOk}>{msg.text}</p> : null}
      {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}
      {error && isNew ? <p className={styles.msgErr}>{error}</p> : null}

      <ServiceOrderFormView
        mode={isNew ? "create" : "edit"}
        serviceOrder={serviceOrder}
        clientes={clientes}
        tecnicos={tecnicos}
        equipamentosCliente={equipamentosCliente}
        isLoading={isLoading || isSaving}
        onSave={(data) => void handleSave(data)}
        onCancel={() => navigate("/app/service-orders")}
        onClienteChange={handleClienteChange}
        onGeneratePDF={
          !isNew && serviceOrder?.id
            ? () => {
                window.alert("Geração de laudo/PDF será disponibilizada em breve nesta tela.");
              }
            : undefined
        }
      />
    </div>
  );
}
