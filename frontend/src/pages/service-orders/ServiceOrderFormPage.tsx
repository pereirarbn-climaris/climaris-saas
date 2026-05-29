import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useMatch, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { listTenantUsers } from "../../api/auth";
import { listClientHvacEquipments, listClientsAll } from "../../api/clients";
import { getPmocPlan } from "../../api/pmoc";
import { listProducts } from "../../api/products";
import { listServices } from "../../api/services";
import {
  approveServiceOrder,
  cancelServiceOrderSchedule,
  createServiceOrder,
  getServiceOrder,
  getTechnicianNextSlots,
  patchServiceOrderDetails,
  patchServiceOrderDiscount,
  patchServiceOrderStatus,
  rescheduleSchedule,
  fetchServiceOrderPdf,
  type ServiceOrderOut,
} from "../../api/serviceOrders";
import {
  ServiceOrderFormView,
  type ServiceOrderData,
} from "../../components/v0-ui/service-orders";
import { API_MAX_PAGE_LIMIT } from "../../lib/apiPagination";
import {
  buildOrderDetailsPayload,
  buildScheduleStartsAt,
  enrichOrderViewLines,
  mapClientsToFormView,
  mapEquipmentsToFormView,
  mapFormStatusToPatchTarget,
  mapTechniciansToFormView,
  orderGrandTotal,
  serviceOrderOutToViewData,
  viewDataToCreatePayload,
} from "../../lib/serviceOrderFormViewAdapter";
import { monthYearFromDateString } from "../../lib/pmocOsSchedule";
import { buildServiceLinesFromPreventiveLines } from "../../lib/preventiveServiceOrder";
import {
  computeDiscountAmountFromView,
  computeOrderTotalFromView,
} from "../../lib/serviceOrderDiscount";
import {
  ServiceOrderFinanceIntegration,
  useServiceOrderFinanceBadge,
} from "./ServiceOrderFinanceIntegration";
import { ToastHost } from "../../components/ToastHost";
import {
  syncServiceOrderItems,
  syncServiceOrderProducts,
} from "../../lib/serviceOrderLinesSync";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./ServiceOrderFormPage.module.css";

function isAssignedTechnician(order: ServiceOrderOut, userId: number): boolean {
  return (order.technician_ids ?? []).includes(userId);
}

export function ServiceOrderFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const isNew = useMatch({ path: "/app/service-orders/new", end: true }) != null;
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const idNum = orderId ? Number(orderId) : NaN;

  const role = ctx?.user.role;
  const userId = ctx?.user.id ?? 0;
  const isAdmin = role === "admin";
  const isReceptionist = role === "receptionist";
  const isTechnician = role === "technician";
  const canEditGeneral = isAdmin || isReceptionist;

  const [serviceOrder, setServiceOrder] = useState<Partial<ServiceOrderData> | undefined>(undefined);
  const [orderRow, setOrderRow] = useState<ServiceOrderOut | null>(null);
  const [clientes, setClientes] = useState<ReturnType<typeof mapClientsToFormView>>([]);
  const [tecnicos, setTecnicos] = useState<ReturnType<typeof mapTechniciansToFormView>>([]);
  const [equipamentosCliente, setEquipamentosCliente] = useState<ReturnType<typeof mapEquipmentsToFormView>>([]);
  const [servicesCatalog, setServicesCatalog] = useState<Awaited<ReturnType<typeof listServices>>>([]);
  const [productsCatalog, setProductsCatalog] = useState<Awaited<ReturnType<typeof listProducts>>>([]);

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [schedulingPanelKey, setSchedulingPanelKey] = useState("default");
  const [error, setError] = useState<string | null>(null);

  const isAssignedTech = useMemo(
    () => (orderRow && isTechnician ? isAssignedTechnician(orderRow, userId) : false),
    [orderRow, isTechnician, userId],
  );

  const canEditLines = canEditGeneral || isAssignedTech;
  const canEditLaudo = isAdmin || isAssignedTech;
  const canSave = canEditGeneral || isAssignedTech;
  const linesReadOnly = orderRow?.status === "done";
  const isOrderDone = orderRow?.status === "done";

  const orderTotalForFinance = useMemo(() => {
    if (orderRow) return orderGrandTotal(orderRow);
    if (serviceOrder) return computeOrderTotalFromView(serviceOrder as ServiceOrderData);
    return 0;
  }, [orderRow, serviceOrder]);

  const clientLabelForFinance = useMemo(() => {
    const cid = serviceOrder?.clienteId ?? (orderRow ? String(orderRow.client_id) : "");
    const found = clientes.find((c) => c.id === cid);
    if (found?.nome) return found.nome;
    return `Cliente #${orderRow?.client_id ?? cid}`;
  }, [serviceOrder?.clienteId, orderRow, clientes]);

  const financePaymentLabel = useServiceOrderFinanceBadge({
    serviceOrderId: idNum,
    orderTotal: orderTotalForFinance,
    enabled: isOrderDone && !isNew && Number.isFinite(idNum),
  });

  const canStartAttendance = useMemo(
    () =>
      !isNew &&
      isTechnician &&
      isAssignedTech &&
      orderRow != null &&
      (orderRow.status === "scheduled" || orderRow.status === "approved"),
    [isNew, isTechnician, isAssignedTech, orderRow],
  );

  const canCancelSchedule = useMemo(() => {
    if (isNew || !orderRow || !canEditGeneral) return false;
    if (orderRow.status === "done" || orderRow.status === "cancelled" || orderRow.status === "in_progress") {
      return false;
    }
    const sched = orderRow.schedule;
    return Boolean(sched?.starts_at && sched.status !== "cancelled");
  }, [isNew, orderRow, canEditGeneral]);

  const canCancelOrder = useMemo(() => {
    if (isNew || !orderRow || !canEditGeneral) return false;
    return orderRow.status !== "done" && orderRow.status !== "cancelled";
  }, [isNew, orderRow, canEditGeneral]);

  const canCompleteOrder = useMemo(() => {
    if (isNew || !orderRow || !canEditGeneral) return false;
    return orderRow.status === "scheduled" || orderRow.status === "approved" || orderRow.status === "in_progress";
  }, [isNew, orderRow, canEditGeneral]);

  const loadEquipments = useCallback(async (clientId: string) => {
    const cid = Number(clientId);
    if (!Number.isFinite(cid) || cid < 1) {
      setEquipamentosCliente([]);
      return;
    }
    try {
      const rows = await listClientHvacEquipments(cid, { only_active: true });
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
          listClientsAll(),
          listTenantUsers({ limit: API_MAX_PAGE_LIMIT }),
          listServices({ limit: API_MAX_PAGE_LIMIT }),
          listProducts({ limit: API_MAX_PAGE_LIMIT }),
        ]);
        if (cancelled) return;
        setClientes(mapClientsToFormView(clients));
        setTecnicos(mapTechniciansToFormView(users));
        setServicesCatalog(services);
        setProductsCatalog(products);
      } catch {
        /* Catálogo auxiliar opcional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isNew) return;
    const pmocId = searchParams.get("pmoc_id");
    const startsAt = searchParams.get("starts_at");
    const technicianId = searchParams.get("technician_id");
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");
    const tipo = searchParams.get("tipo");
    if (!pmocId && !startsAt && !technicianId && !tipo) return;

    let cancelled = false;
    void (async () => {
      const partial: Partial<ServiceOrderData> = {};
      if (tipo === "preventiva") partial.tipoServico = "preventiva";
      if (pmocId) partial.pmocPlanId = pmocId;
      if (yearParam && monthParam) {
        partial.pmocPeriodYear = Number(yearParam);
        partial.pmocPeriodMonth = Number(monthParam);
      }
      if (startsAt) {
        const d = new Date(startsAt);
        if (!Number.isNaN(d.getTime())) {
          const pad = (n: number) => String(n).padStart(2, "0");
          partial.dataAgendamento = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          partial.horaAgendamento = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
          if (!yearParam || !monthParam) {
            const period = monthYearFromDateString(partial.dataAgendamento);
            if (period) {
              partial.pmocPeriodYear = period.year;
              partial.pmocPeriodMonth = period.month;
            }
          }
        }
      }
      if (technicianId) partial.tecnicoId = technicianId;
      if (pmocId) {
        try {
          const plan = await getPmocPlan(Number(pmocId));
          if (cancelled) return;
          partial.clienteId = String(plan.client_id);
          await loadEquipments(String(plan.client_id));
        } catch {
          /* plano opcional no prefill */
        }
      }
      if (!cancelled && Object.keys(partial).length > 0) {
        setServiceOrder((prev) => ({ ...(prev ?? {}), ...partial }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, searchParams, loadEquipments]);

  useEffect(() => {
    if (!isNew) return;
    const clientIdParam = searchParams.get("client_id");
    if (!clientIdParam) return;

    const tipo = searchParams.get("tipo");
    const equipmentIdParam = searchParams.get("equipment_id");
    const equipmentIdsParam = searchParams.get("equipment_ids");

    let equipmentIds: string[] = [];
    if (equipmentIdsParam) {
      equipmentIds = equipmentIdsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (equipmentIdParam) {
      equipmentIds = [equipmentIdParam];
    }

    let cancelled = false;
    void (async () => {
      const partial: Partial<ServiceOrderData> = { clienteId: clientIdParam };
      if (tipo === "preventiva") partial.tipoServico = "preventiva";
      if (equipmentIds.length > 0) partial.equipamentosIds = equipmentIds;
      await loadEquipments(clientIdParam);
      if (!cancelled) {
        setServiceOrder((prev) => ({ ...(prev ?? {}), ...partial }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, searchParams, loadEquipments]);

  useEffect(() => {
    if (!isNew) return;
    const preventiveLines = searchParams.get("preventive_lines");
    if (!preventiveLines || servicesCatalog.length === 0) return;

    const servicos = buildServiceLinesFromPreventiveLines(preventiveLines, servicesCatalog);
    if (servicos.length === 0) return;

    setServiceOrder((prev) => {
      if (prev?.servicos?.length) return prev;
      return { ...(prev ?? {}), servicos };
    });
  }, [isNew, searchParams, servicesCatalog]);

  useEffect(() => {
    if (isNew) {
      setOrderRow(null);
      setIsLoading(false);
      setEquipamentosCliente([]);
      const hasPrefill =
        searchParams.get("pmoc_id") ||
        searchParams.get("starts_at") ||
        searchParams.get("technician_id") ||
        searchParams.get("tipo") ||
        searchParams.get("client_id") ||
        searchParams.get("equipment_ids") ||
        searchParams.get("preventive_lines");
      if (!hasPrefill) setServiceOrder(undefined);
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
        if (isTechnician && !isAssignedTechnician(order, userId)) {
          setError("Você não tem acesso a esta ordem de serviço.");
          return;
        }
        let view = serviceOrderOutToViewData(order);
        if (productsCatalog.length > 0) {
          view = enrichOrderViewLines(view, productsCatalog);
        }
        setServiceOrder(view);
        setOrderRow(order);
        setSchedulingPanelKey(`order-${order.id}-${order.schedule?.starts_at ?? "none"}-${order.status}`);
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
  }, [isNew, orderId, idNum, loadEquipments, isTechnician, userId, searchParams]);

  useEffect(() => {
    if (!orderRow || productsCatalog.length === 0) return;
    setServiceOrder((prev) =>
      prev ? enrichOrderViewLines({ ...prev, pecas: prev.pecas ?? [] } as ServiceOrderData, productsCatalog) : prev,
    );
  }, [orderRow?.id, productsCatalog]);

  const handleClienteChange = useCallback(
    (clienteId: string) => {
      void loadEquipments(clienteId);
    },
    [loadEquipments],
  );

  const handleSuggestSlots = useCallback(
    async (params: { orderId?: number; durationMinutes: number; technicianId?: number }) => {
      const fromAt = new Date().toISOString();
      return getTechnicianNextSlots({
        service_order_id: params.orderId,
        duration_minutes: params.durationMinutes,
        from_at: fromAt,
        technician_id: params.technicianId,
        limit: 4,
      });
    },
    [],
  );

  const refreshOrderState = useCallback(
    async (orderId: number) => {
      const latest = await getServiceOrder(orderId, { bustCache: true });
      const view = enrichOrderViewLines(serviceOrderOutToViewData(latest), productsCatalog);
      setOrderRow(latest);
      setServiceOrder(view);
      setSchedulingPanelKey(`order-${latest.id}-${latest.schedule?.starts_at ?? "none"}-${latest.status}`);
      return latest;
    },
    [productsCatalog],
  );

  const handleCancelSchedule = useCallback(async () => {
    if (!orderRow || !canCancelSchedule) return;
    setIsCancellingSchedule(true);
    try {
      await cancelServiceOrderSchedule(orderRow.id);
      await refreshOrderState(orderRow.id);
      toast.success("Agendamento cancelado. Você pode sugerir novos horários.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar o agendamento.");
    } finally {
      setIsCancellingSchedule(false);
    }
  }, [orderRow, canCancelSchedule, refreshOrderState]);

  const handleCancelOrder = useCallback(async (cancelReason: string) => {
    if (!orderRow || !canCancelOrder) return;
    const reason = cancelReason.trim();
    if (!reason) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    setIsCancellingOrder(true);
    try {
      await patchServiceOrderStatus(orderRow.id, "cancelled", { cancel_reason: reason });
      await refreshOrderState(orderRow.id);
      toast.success("Ordem de serviço cancelada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar a ordem de serviço.");
    } finally {
      setIsCancellingOrder(false);
    }
  }, [orderRow, canCancelOrder, refreshOrderState]);

  const handleStartAttendance = useCallback(async () => {
    if (!orderRow || !canStartAttendance) return;
    setIsStarting(true);
    try {
      const updated = await patchServiceOrderStatus(orderRow.id, "in_progress");
      const latest = await getServiceOrder(updated.id, { bustCache: true });
      const view = enrichOrderViewLines(serviceOrderOutToViewData(latest), productsCatalog);
      setServiceOrder(view);
      setOrderRow(latest);
      toast.success("Atendimento iniciado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar o atendimento.");
    } finally {
      setIsStarting(false);
    }
  }, [orderRow, canStartAttendance, productsCatalog]);

  const handleCompleteOrder = useCallback(async () => {
    if (!orderRow || !canCompleteOrder) return;
    setIsCompleting(true);
    try {
      await patchServiceOrderStatus(orderRow.id, "done");
      await refreshOrderState(orderRow.id);
      toast.success("Ordem de serviço concluída. Prazos da gestão preventiva atualizados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a ordem de serviço.");
    } finally {
      setIsCompleting(false);
    }
  }, [orderRow, canCompleteOrder, refreshOrderState]);

  const clientNameById = useMemo(() => new Map(clientes.map((c) => [c.id, c.nome])), [clientes]);

  const handleSave = useCallback(
    async (data: ServiceOrderData) => {
      if (!canSave) {
        console.warn("[ServiceOrderFormPage] save ignorado: sem permissão");
        toast.error("Sem permissão para salvar esta ordem de serviço.");
        return;
      }

      setIsSaving(true);

      const desiredTotal = computeOrderTotalFromView(data);
      const discountAmount = computeDiscountAmountFromView(data);
      const clientName = clientNameById.get(data.clienteId) ?? `Cliente ${data.clienteId}`;

      console.log("[ServiceOrderFormPage] handleSave início", {
        orderId: orderRow?.id,
        isNew,
        servicos: data.servicos?.length,
        pecas: data.pecas?.length,
        valorMaoDeObra: data.valorMaoDeObra,
        valorPecas: data.valorPecas,
        desiredTotal,
      });

      try {
        if (isNew) {
          if (!canEditGeneral) {
            toast.error("Sem permissão para criar ordem de serviço.");
            return;
          }
          const payload = viewDataToCreatePayload(data, {
            clientName,
            services: servicesCatalog,
            products: productsCatalog,
          });
          console.log("Payload enviado para a OS:", payload);
          const created = await createServiceOrder(payload);
          const startsAt = buildScheduleStartsAt(data);
          if (startsAt) {
            await approveServiceOrder(created.id, {
              starts_at: startsAt,
              technician_ids: data.tecnicoId ? [Number(data.tecnicoId)] : undefined,
              notes: data.observacoesInternas?.trim() || undefined,
            });
          }
          toast.success("Ordem de serviço criada.");
          navigate(`/app/service-orders/${created.id}`, { replace: true });
          return;
        }

        if (!orderRow) {
          toast.error("OS não carregada. Atualize a página.");
          return;
        }

        const orderId = orderRow.id;
        let refreshed = orderRow;

        try {
          console.log("[ServiceOrderFormPage] sincronizando serviços…", data.servicos, {
            equipmentLinksOnly: linesReadOnly,
          });
          refreshed = await syncServiceOrderItems(orderId, refreshed, data.servicos ?? [], {
            equipmentLinksOnly: linesReadOnly,
          });
        } catch (syncErr) {
          console.error("[ServiceOrderFormPage] falha sync serviços", syncErr);
          toast.error("Erro ao salvar os itens da OS");
          throw syncErr;
        }

        if (!linesReadOnly) {
          try {
            console.log("[ServiceOrderFormPage] sincronizando peças…", data.pecas);
            refreshed = await syncServiceOrderProducts(orderId, refreshed, data.pecas ?? []);
          } catch (syncErr) {
            console.error("[ServiceOrderFormPage] falha sync peças", syncErr);
            toast.error("Erro ao salvar os itens da OS");
            throw syncErr;
          }
        }

        const detailsPayload = buildOrderDetailsPayload(data);
        const osDetailsPayload = { description: detailsPayload.description };
        console.log("Payload enviado para a OS:", {
          orderId,
          details: osDetailsPayload,
          fechamento: {
            valorMaoDeObra: detailsPayload.valorMaoDeObra,
            valorPecas: detailsPayload.valorPecas,
            total: detailsPayload.total,
          },
        });

        if (canEditLaudo || canEditGeneral) {
          refreshed = await patchServiceOrderDetails(orderId, osDetailsPayload);
        }

        const servicesTotal = refreshed.service_items.reduce(
          (s, i) => s + Math.max(i.quantity, 1) * Number(i.unit_price),
          0,
        );
        const productsTotal = refreshed.product_items.reduce(
          (s, i) => s + Math.max(i.quantity, 1) * Number(i.unit_price),
          0,
        );
        if (
          canEditGeneral &&
          Math.abs(orderGrandTotal(refreshed) - desiredTotal) > 0.009
        ) {
          console.log("[ServiceOrderFormPage] ajustando desconto", {
            discountAmount,
            desiredTotal,
            servicesTotal,
            productsTotal,
          });
          refreshed = await patchServiceOrderDiscount(orderId, discountAmount);
        }

        if (canEditGeneral) {
          const patchTarget = mapFormStatusToPatchTarget(orderRow.status, data.status);
          if (patchTarget) {
            refreshed = await patchServiceOrderStatus(orderId, patchTarget, {
              schedule_notes: data.observacoesInternas?.trim() || null,
            });
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
            await approveServiceOrder(orderId, {
              starts_at: startsAt,
              technician_ids: data.tecnicoId ? [Number(data.tecnicoId)] : undefined,
              notes: data.observacoesInternas?.trim() || undefined,
            });
          }
        }

        const latest = await refreshOrderState(orderId);
        toast.success("Alterações salvas com sucesso!");
        console.log("[ServiceOrderFormPage] save concluído", {
          orderId,
          savedTotal: orderGrandTotal(latest),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Erro ao salvar ordem de serviço.";
        console.error("[ServiceOrderFormPage] handleSave erro", e);
        if (!String(message).includes("itens da OS")) {
          toast.error(message);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [
      canSave,
      canEditGeneral,
      canEditLaudo,
      clientNameById,
      isNew,
      navigate,
      orderRow,
      productsCatalog,
      servicesCatalog,
      linesReadOnly,
      refreshOrderState,
    ],
  );

  if (!ctx) {
    return <Navigate to="/login" replace />;
  }

  if (isNew && !canEditGeneral) {
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
        <Link className={styles.back} to={isTechnician ? "/app/tecnico" : "/app/service-orders"}>
          ← Voltar
        </Link>
        <p className={styles.msgErr}>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <Link className={styles.back} to={isTechnician ? "/app/tecnico" : "/app/service-orders"}>
        ← Voltar
      </Link>

      <ToastHost />
      {error && isNew ? <p className={styles.msgErr}>{error}</p> : null}

      {canStartAttendance ? (
        <div className={styles.infoStrip} style={{ marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.65rem" }}>
            Esta OS está agendada. Ao chegar no cliente, inicie o atendimento para registrar o horário e liberar o laudo.
          </p>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={isStarting || isSaving}
            onClick={() => void handleStartAttendance()}
          >
            {isStarting ? "Iniciando…" : "▶️ Iniciar Atendimento"}
          </button>
        </div>
      ) : null}

      <ServiceOrderFormView
        mode={isNew ? "create" : "edit"}
        serviceOrder={serviceOrder}
        clientes={clientes}
        tecnicos={tecnicos}
        equipamentosCliente={equipamentosCliente}
        servicesCatalog={servicesCatalog}
        productsCatalog={productsCatalog}
        canEditLines={canEditLines}
        canEditGeneral={canEditGeneral}
        canEditLaudo={canEditLaudo}
        isLoading={isLoading || isSaving}
        onSave={handleSave}
        onCancel={() => navigate(isTechnician ? "/app/tecnico" : "/app/service-orders")}
        onClienteChange={handleClienteChange}
        orderId={!isNew && Number.isFinite(idNum) ? idNum : undefined}
        onSuggestSlots={handleSuggestSlots}
        linesReadOnly={linesReadOnly}
        canCancelSchedule={canCancelSchedule}
        canCancelOrder={canCancelOrder}
        onCancelSchedule={handleCancelSchedule}
        onCancelOrder={handleCancelOrder}
        schedulingPanelKey={schedulingPanelKey}
        isCancellingSchedule={isCancellingSchedule}
        isCancellingOrder={isCancellingOrder}
        canCompleteOrder={canCompleteOrder}
        onCompleteOrder={handleCompleteOrder}
        isCompletingOrder={isCompleting}
        financePaymentLabel={financePaymentLabel}
        financeSection={
          isOrderDone && Number.isFinite(idNum) && orderRow ? (
            <ServiceOrderFinanceIntegration
              serviceOrderId={idNum}
              clientId={orderRow.client_id}
              clientLabel={clientLabelForFinance}
              orderTotal={orderTotalForFinance}
              orderNumber={serviceOrder?.numero ?? String(orderRow.id)}
              enabled
            />
          ) : null
        }
        onGeneratePDF={
          !isNew && orderRow
            ? async (osId) => {
                try {
                  const blob = await fetchServiceOrderPdf(Number(osId));
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = `os-${osId}.pdf`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                  toast.success("PDF gerado com sucesso.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
                }
              }
            : undefined
        }
      />
    </div>
  );
}
