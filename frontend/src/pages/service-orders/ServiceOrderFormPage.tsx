import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useMatch, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { listTenantUsers } from "../../api/auth";
import { listClientHvacEquipments, listClientsAll } from "../../api/clients";
import { listProducts } from "../../api/products";
import { listServices } from "../../api/services";
import {
  approveServiceOrder,
  cancelServiceOrderSchedule,
  createServiceOrder,
  getServiceOrder,
  getTechnicianNextSlots,
  isServiceOrderComplianceBlockedError,
  patchServiceOrderDetails,
  patchServiceOrderDiscount,
  patchServiceOrderLaudo,
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
  buildLaudoPatchPayload,
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
import type { ServiceOrderMissingRequirement } from "../../types/serviceOrders";
import { generateTechnicalReportPDF } from "../../lib/laudo/laudoGenerator";
import { generateGarantiaTermPdf } from "../../lib/garantia/garantiaPdfGenerator";
import { buildServiceLinesFromPreventiveLines } from "../../lib/preventiveServiceOrder";
import {
  computeDiscountAmountFromView,
  computeOrderTotalFromView,
} from "../../lib/serviceOrderDiscount";
import { COMPANY_TECHNICIAN_ID, technicianIdsForApi } from "../../lib/serviceOrderCompanyTechnician";
import { buildSchedulingTechnicians } from "../../lib/serviceOrderSchedulingTechnicians";
import { syncGarantiaEquipmentToClient } from "../../lib/serviceOrderGarantiaEquipmentSync";
import { isVacuoPendingUpload, syncAllGarantiaVacuumPending } from "../../lib/garantiaVacuumSync";
import { isStartupPendingUpload, syncAllGarantiaStartupPending } from "../../lib/garantiaStartupSync";
import { ServiceOrderProfitabilityBadge } from "../../features/finance/components/ServiceOrderProfitabilityBadge";
import { useServiceOrderFinanceEntries } from "../../features/finance/hooks";
import {
  ServiceOrderFinanceIntegration,
  useServiceOrderFinanceBadge,
} from "./ServiceOrderFinanceIntegration";
import {
  syncServiceOrderItems,
  syncServiceOrderProducts,
  sanitizeServiceOrderEquipmentSelection,
} from "../../lib/serviceOrderLinesSync";
import { isInventoryEnabled } from "../../lib/inventoryEnabled";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import { useFeature } from "../../lib/featureManager";
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
  const inventoryEnabled = isInventoryEnabled(ctx?.tenant);
  const newLaudoEnabled = useFeature("new_laudo");

  const [serviceOrder, setServiceOrder] = useState<Partial<ServiceOrderData> | undefined>(undefined);
  const [orderRow, setOrderRow] = useState<ServiceOrderOut | null>(null);
  const [clientes, setClientes] = useState<ReturnType<typeof mapClientsToFormView>>([]);
  const [tecnicos, setTecnicos] = useState<ReturnType<typeof mapTechniciansToFormView>>([]);
  const schedulingTecnicos = useMemo(
    () => buildSchedulingTechnicians(tecnicos, ctx?.tenant?.trade_name ?? ctx?.tenant?.name),
    [tecnicos, ctx?.tenant?.trade_name, ctx?.tenant?.name],
  );
  const [equipamentosCliente, setEquipamentosCliente] = useState<ReturnType<typeof mapEquipmentsToFormView>>([]);
  const [servicesCatalog, setServicesCatalog] = useState<Awaited<ReturnType<typeof listServices>>>([]);
  const [productsCatalog, setProductsCatalog] = useState<Awaited<ReturnType<typeof listProducts>>>([]);

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isSavingLaudo, setIsSavingLaudo] = useState(false);
  const [isGeneratingLaudoPdf, setIsGeneratingLaudoPdf] = useState(false);
  const [isGeneratingGarantiaPdf, setIsGeneratingGarantiaPdf] = useState(false);
  const [schedulingPanelKey, setSchedulingPanelKey] = useState("default");
  const [error, setError] = useState<string | null>(null);
  const [complianceBlock, setComplianceBlock] = useState<ServiceOrderMissingRequirement[] | null>(null);
  const [digitalWorkOrderId, setDigitalWorkOrderId] = useState<string | null>(null);

  const isAssignedTech = useMemo(
    () => (orderRow && isTechnician ? isAssignedTechnician(orderRow, userId) : false),
    [orderRow, isTechnician, userId],
  );

  const canEditLines = canEditGeneral || isAssignedTech;
  const canEditLaudo = isAdmin || isAssignedTech;
  const canEditGarantia = canEditGeneral || isAssignedTech;
  const isInstalacaoOrder = serviceOrder?.tipoServico === "instalacao";
  const canSave = canEditGeneral || isAssignedTech;
  const linesReadOnly = orderRow?.status === "done";
  const isOrderDone = orderRow?.status === "done";
  const showOsFinanceProfitability =
    !isNew &&
    orderRow != null &&
    (orderRow.status === "done" || orderRow.status === "in_progress");

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

  const { data: osFinanceEntries = [] } = useServiceOrderFinanceEntries(
    Number.isFinite(idNum) ? idNum : undefined,
    { enabled: showOsFinanceProfitability && Number.isFinite(idNum) },
  );

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
    if (tecnicos.length > 0) return;
    setServiceOrder((prev) => (prev?.tecnicoId ? prev : { ...(prev ?? {}), tecnicoId: COMPANY_TECHNICIAN_ID }));
  }, [tecnicos.length]);

  useEffect(() => {
    if (!isNew) return;
    const startsAt = searchParams.get("starts_at");
    const technicianId = searchParams.get("technician_id");
    const tipo = searchParams.get("tipo");
    if (!startsAt && !technicianId && !tipo) return;

    let cancelled = false;
    void (async () => {
      const partial: Partial<ServiceOrderData> = {};
      if (tipo === "preventiva") partial.tipoServico = "preventiva";
      if (startsAt) {
        const d = new Date(startsAt);
        if (!Number.isNaN(d.getTime())) {
          const pad = (n: number) => String(n).padStart(2, "0");
          partial.dataAgendamento = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          partial.horaAgendamento = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      }
      if (technicianId) partial.tecnicoId = technicianId;
      if (!cancelled && Object.keys(partial).length > 0) {
        setServiceOrder((prev) => ({ ...(prev ?? {}), ...partial }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, searchParams]);

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

  const handleCompleteOrder = useCallback(async (options?: { forceClose?: boolean }) => {
    if (!orderRow || !canCompleteOrder) return;
    setIsCompleting(true);
    if (!options?.forceClose) {
      setComplianceBlock(null);
      setDigitalWorkOrderId(null);
    }
    try {
      await patchServiceOrderStatus(orderRow.id, "done", { force_close: options?.forceClose });
      setComplianceBlock(null);
      setDigitalWorkOrderId(null);
      await refreshOrderState(orderRow.id);
      toast.success("Ordem de serviço concluída. Prazos da gestão preventiva atualizados.");
    } catch (e) {
      if (isServiceOrderComplianceBlockedError(e)) {
        setComplianceBlock(e.missingRequirements);
        setDigitalWorkOrderId(e.digitalWorkOrderId);
        throw e;
      }
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a ordem de serviço.");
      throw e;
    } finally {
      setIsCompleting(false);
    }
  }, [orderRow, canCompleteOrder, refreshOrderState]);

  const handleSaveLaudo = useCallback(
    async (data: ServiceOrderData) => {
      const allowed =
        data.tipoServico === "instalacao" ? canEditGarantia : canEditLaudo && newLaudoEnabled;
      if (!allowed || !orderRow || !Number.isFinite(idNum)) return;
      setIsSavingLaudo(true);
      try {
        let garantia = data.garantia;
        if (data.tipoServico === "instalacao" && isVacuoPendingUpload(garantia)) {
          const vacuoPatch = await syncAllGarantiaVacuumPending(idNum, garantia);
          if (Object.keys(vacuoPatch).length) {
            garantia = { ...garantia, ...vacuoPatch };
          }
        }
        if (data.tipoServico === "instalacao" && isStartupPendingUpload(garantia)) {
          const startupPatch = await syncAllGarantiaStartupPending(idNum, garantia);
          if (Object.keys(startupPatch).length) {
            garantia = { ...garantia, ...startupPatch };
          }
        }
        if (data.tipoServico === "instalacao" && data.clienteId) {
          const clientId = Number(data.clienteId);
          if (Number.isFinite(clientId) && clientId > 0) {
            const synced = await syncGarantiaEquipmentToClient(clientId, data.garantia);
            if (synced) {
              garantia = {
                ...data.garantia,
                clientEquipmentId: synced.clientEquipmentId,
                qrcodeCodeId: synced.qrcodeCodeId || data.garantia.qrcodeCodeId,
              };
            }
          }
        }
        await patchServiceOrderLaudo(idNum, buildLaudoPatchPayload({ ...data, garantia }));
        await refreshOrderState(orderRow.id);
        const savedEquipment = garantia.clientEquipmentId && data.tipoServico === "instalacao";
        toast.success(
          data.tipoServico === "instalacao"
            ? savedEquipment
              ? "Garantia salva e equipamento registrado no cliente."
              : "Garantia salva com sucesso."
            : "Laudo salvo com sucesso.",
        );
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : data.tipoServico === "instalacao"
              ? "Não foi possível salvar a garantia."
              : "Não foi possível salvar o laudo.",
        );
      } finally {
        setIsSavingLaudo(false);
      }
    },
    [canEditGarantia, canEditLaudo, newLaudoEnabled, orderRow, idNum, refreshOrderState],
  );

  const handleGenerateLaudoPdf = useCallback(async () => {
    if (!orderRow || !Number.isFinite(idNum)) return;
    setIsGeneratingLaudoPdf(true);
    try {
      await generateTechnicalReportPDF({ orderId: idNum });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o laudo em PDF.");
    } finally {
      setIsGeneratingLaudoPdf(false);
    }
  }, [orderRow, idNum]);

  const handleGenerateGarantiaPdf = useCallback(async () => {
    if (!orderRow || !Number.isFinite(idNum)) return;
    setIsGeneratingGarantiaPdf(true);
    try {
      await generateGarantiaTermPdf(idNum);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o termo de garantia em PDF.");
    } finally {
      setIsGeneratingGarantiaPdf(false);
    }
  }, [orderRow, idNum]);

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

      const { data: saveData } = sanitizeServiceOrderEquipmentSelection(data, equipamentosCliente);

      try {
        if (isNew) {
          if (!canEditGeneral) {
            toast.error("Sem permissão para criar ordem de serviço.");
            return;
          }
          const payload = viewDataToCreatePayload(saveData, {
            clientName,
            services: servicesCatalog,
            products: productsCatalog,
          });
          console.log("Payload enviado para a OS:", payload);
          const created = await createServiceOrder(payload);
          const startsAt = buildScheduleStartsAt(saveData);
          if (startsAt) {
            await approveServiceOrder(created.id, {
              starts_at: startsAt,
              technician_ids: technicianIdsForApi(saveData.tecnicoId),
              notes: saveData.observacoesInternas?.trim() || undefined,
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
          refreshed = await syncServiceOrderItems(orderId, refreshed, saveData.servicos ?? [], {
            equipmentLinksOnly: linesReadOnly,
          });
        } catch (syncErr) {
          console.error("[ServiceOrderFormPage] falha sync serviços", syncErr);
          toast.error(
            syncErr instanceof Error ? syncErr.message : "Erro ao salvar os itens da OS",
          );
          throw syncErr;
        }

        if (!linesReadOnly) {
          try {
            console.log("[ServiceOrderFormPage] sincronizando peças…", saveData.pecas);
            refreshed = await syncServiceOrderProducts(orderId, refreshed, saveData.pecas ?? []);
          } catch (syncErr) {
            console.error("[ServiceOrderFormPage] falha sync peças", syncErr);
            toast.error("Erro ao salvar os itens da OS");
            throw syncErr;
          }
        }

        const detailsPayload = buildOrderDetailsPayload(saveData);
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
          const patchTarget = mapFormStatusToPatchTarget(orderRow.status, saveData.status);
          if (patchTarget) {
            refreshed = await patchServiceOrderStatus(orderId, patchTarget, {
              schedule_notes: saveData.observacoesInternas?.trim() || null,
            });
          }

          const startsAt = buildScheduleStartsAt(saveData);
          if (startsAt && refreshed.schedule?.id) {
            const currentStart = refreshed.schedule.starts_at;
            if (new Date(currentStart).getTime() !== new Date(startsAt).getTime()) {
              await rescheduleSchedule(refreshed.schedule.id, {
                starts_at: startsAt,
                technician_ids: technicianIdsForApi(saveData.tecnicoId),
                notes: saveData.observacoesInternas?.trim() || undefined,
              });
            }
          } else if (startsAt && !refreshed.schedule) {
            await approveServiceOrder(orderId, {
              starts_at: startsAt,
              technician_ids: technicianIdsForApi(saveData.tecnicoId),
              notes: saveData.observacoesInternas?.trim() || undefined,
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
        if (isServiceOrderComplianceBlockedError(e)) {
          setComplianceBlock(e.missingRequirements);
          setDigitalWorkOrderId(e.digitalWorkOrderId);
          return;
        }
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
      equipamentosCliente,
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
        <p className={styles.msgErr}>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
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
        tenant={ctx?.tenant ?? null}
        tecnicos={schedulingTecnicos}
        equipamentosCliente={equipamentosCliente}
        servicesCatalog={servicesCatalog}
        productsCatalog={productsCatalog}
        inventoryEnabled={inventoryEnabled}
        canEditLines={canEditLines}
        canEditGeneral={canEditGeneral}
        canEditLaudo={canEditLaudo && newLaudoEnabled}
        canEditGarantia={canEditGarantia}
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
        complianceBlock={complianceBlock}
        digitalWorkOrderId={digitalWorkOrderId}
        isAdmin={isAdmin}
        technicianMode={isTechnician}
        financePaymentLabel={financePaymentLabel}
        profitabilityBadge={
          orderRow?.status === "in_progress" && Number.isFinite(idNum) ? (
            <ServiceOrderProfitabilityBadge serviceOrderId={idNum} entries={osFinanceEntries} />
          ) : null
        }
        financeSection={
          showOsFinanceProfitability && Number.isFinite(idNum) && orderRow ? (
            <ServiceOrderFinanceIntegration
              serviceOrderId={idNum}
              clientId={orderRow.client_id}
              clientLabel={clientLabelForFinance}
              orderTotal={orderTotalForFinance}
              orderNumber={serviceOrder?.numero ?? String(orderRow.id)}
              enabled={isOrderDone}
              showProfitability
              showProfitabilityWidget={isOrderDone}
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
        onSaveLaudo={
          !isNew && (isInstalacaoOrder ? canEditGarantia : canEditLaudo && newLaudoEnabled)
            ? handleSaveLaudo
            : undefined
        }
        onGenerateLaudoPdf={!isNew && orderRow && newLaudoEnabled ? handleGenerateLaudoPdf : undefined}
        onGenerateGarantiaPdf={!isNew && orderRow && isInstalacaoOrder ? handleGenerateGarantiaPdf : undefined}
        isSavingLaudo={isSavingLaudo}
        isGeneratingLaudoPdf={isGeneratingLaudoPdf}
        isGeneratingGarantiaPdf={isGeneratingGarantiaPdf}
      />
    </div>
  );
}
