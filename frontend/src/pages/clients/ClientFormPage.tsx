import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type SVGProps } from "react";
import {
  Link,
  Navigate,
  useMatch,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  checkClientDuplicate,
  cnpjCommercialCooldownDaysRemaining,
  createClient,
  deleteClient,
  getClient,
  listClientAudit,
  listClientSites,
  refreshClientCnpjCommercial,
  updateClient,
  type ClientAuditEntryOut,
  type ClientSiteOut,
} from "../../api/clients";
import {
  createClientCatalogEquipment,
  deleteClientCatalogEquipment,
  listClientCatalogEquipments,
  listAllEquipmentCatalog,
  listCatalogCategories,
  updateClientCatalogEquipmentStatus,
} from "../../api/equipmentCatalog";
import { fetchCnpjCommercial, fetchCnpjOpen } from "../../api/cnpj";
import { listBudgets } from "../../api/budgets";
import { listPmocPlans, type PmocPlanOut } from "../../api/pmoc";
import { listServiceOrders } from "../../api/serviceOrders";
import {
  type Budget,
  type ClientData,
  type EquipmentCatalog,
  type EquipmentCategoryPickerOption,
  type EquipmentItem,
  type NewEquipmentData,
  type ServiceOrder,
} from "../../components/v0-ui/clients";
import {
  buildEquipmentCatalogView,
  mapClientEquipmentToView,
  newEquipmentDataToCreatePayload,
} from "../../lib/clientEquipmentAdapter";
import { mapApiCategoryToOption } from "../../lib/equipmentCatalogAdminAdapter";
import { digitsOnly } from "../../lib/brMask";
import {
  clientOutToViewData,
  emptyViewData,
  mapAuditToHistory,
  mapBudgetsToView,
  mapOrdersToView,
  mapPmocPlansToView,
  mergeCnpjLookupToViewData,
  mergeViewData,
  serializeClientFormSnapshot,
  viewDataToCreatePayload,
  viewDataToUpdatePayload,
} from "../../lib/clientFormViewAdapter";
import { DeactivateEquipmentConfirmModal } from "../../components/equipment/DeactivateEquipmentConfirmModal";
import { DeleteEquipmentConfirmModal } from "../../components/equipment/DeleteEquipmentConfirmModal";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import { ClientRegistrationTab, type RegistrationSummary } from "../../components/clients/detail/ClientRegistrationTab";
import { ClientAddressesTab } from "../../components/clients/detail/ClientAddressesTab";
import { ClientUnitsTab } from "../../components/clients/detail/ClientUnitsTab";
import { ClientContactsTab } from "../../components/clients/detail/ClientContactsTab";
import { ClientEquipmentTab } from "../../components/clients/detail/ClientEquipmentTab";
import { ClientPMOCTab } from "../../components/clients/detail/ClientPMOCTab";
import { ClientContractsTab } from "../../components/clients/detail/ClientContractsTab";
import { ClientOrdersTab } from "../../components/clients/detail/ClientOrdersTab";
import { ClientFinanceTab } from "../../components/clients/detail/ClientFinanceTab";
import { ClientHistoryTab } from "../../components/clients/detail/ClientHistoryTab";
import {
  IconBuilding,
  IconClipboardList,
  IconFileText,
  IconHistory,
  IconMapPin,
  IconShield,
  IconTool,
  IconUser,
  IconUsers,
  IconWallet,
} from "../../components/clients/detail/icons";
import type { DetailTabId } from "../../components/clients/detail/types";
import styles from "./ClientDetail.module.css";

function fiscalLookupErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (error && typeof error === "object") {
    const o = error as { message?: unknown; detail?: unknown };
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.detail === "string" && o.detail.trim()) return o.detail.trim();
  }
  return fallback;
}

const TAB_DEFS: { id: DetailTabId; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "cadastro", label: "Dados cadastrais", Icon: IconUser },
  { id: "unidades", label: "Unidades / Filiais", Icon: IconBuilding },
  { id: "enderecos", label: "Endereços", Icon: IconMapPin },
  { id: "contatos", label: "Contatos", Icon: IconUsers },
  { id: "equipamentos", label: "Equipamentos", Icon: IconTool },
  { id: "pmoc", label: "PMOC", Icon: IconShield },
  { id: "contratos", label: "Contratos", Icon: IconFileText },
  { id: "ordens", label: "Ordens de serviço", Icon: IconClipboardList },
  { id: "financeiro", label: "Financeiro", Icon: IconWallet },
  { id: "historico", label: "Histórico", Icon: IconHistory },
];

export function ClientFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = useMatch({ path: "/app/clients/new", end: true }) != null;
  const { clientId } = useParams<{ clientId: string }>();
  const idNum = clientId ? Number(clientId) : NaN;

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const canDelete = ctx?.user.role === "admin";
  const readOnly = !canEdit;

  const [clientData, setClientData] = useState<ClientData>(emptyViewData);
  const savedClientSnapshotRef = useRef("");
  const [isLoading, setIsLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjCommercialLoading, setCnpjCommercialLoading] = useState(false);
  const [cnpjCommercialRefreshLoading, setCnpjCommercialRefreshLoading] = useState(false);
  const [cnpjLookupErr, setCnpjLookupErr] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTabId>("cadastro");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [clientSites, setClientSites] = useState<ClientSiteOut[]>([]);
  const [catalogEquipments, setCatalogEquipments] = useState<EquipmentItem[]>([]);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentCatalog>({ brands: [], models: [] });
  const [equipmentCategoryOptions, setEquipmentCategoryOptions] = useState<EquipmentCategoryPickerOption[]>(
    [],
  );
  const [catalogEquipmentsLoading, setCatalogEquipmentsLoading] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [pmocData, setPmocData] = useState<ReturnType<typeof mapPmocPlansToView>>(undefined);
  const [pmocPlansRaw, setPmocPlansRaw] = useState<PmocPlanOut[]>([]);
  const [pmocLoading, setPmocLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<ClientAuditEntryOut[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [addressesCount, setAddressesCount] = useState(0);
  const [contactsCount, setContactsCount] = useState(0);
  const [contractsCount, setContractsCount] = useState(0);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedErr, setRelatedErr] = useState("");
  const [equipmentModalRequest, setEquipmentModalRequest] = useState<{ clientSiteId: number } | null>(
    null,
  );
  const [unitDrawerRequest, setUnitDrawerRequest] = useState<"new" | { site: ClientSiteOut } | null>(null);
  const [pmocSiteFilter, setPmocSiteFilter] = useState<number | null>(null);
  const [deactivateEquipmentTarget, setDeactivateEquipmentTarget] = useState<EquipmentItem | null>(null);
  const [deleteEquipmentTarget, setDeleteEquipmentTarget] = useState<EquipmentItem | null>(null);
  const [duplicateErrors, setDuplicateErrors] = useState<{ documento?: string; whatsapp?: string }>({});

  const docDigits = useMemo(() => digitsOnly(clientData.documento).slice(0, 14), [clientData.documento]);
  const whatsappDigits = useMemo(() => digitsOnly(clientData.whatsapp ?? "").slice(0, 11), [clientData.whatsapp]);
  const docDigitsRef = useRef(docDigits);
  const whatsappDigitsRef = useRef(whatsappDigits);

  useEffect(() => {
    docDigitsRef.current = docDigits;
  }, [docDigits]);

  useEffect(() => {
    whatsappDigitsRef.current = whatsappDigits;
  }, [whatsappDigits]);

  const isDirty = useMemo(() => {
    if (isNew) {
      return serializeClientFormSnapshot(clientData) !== serializeClientFormSnapshot(emptyViewData());
    }
    return serializeClientFormSnapshot(clientData) !== savedClientSnapshotRef.current;
  }, [clientData, isNew]);

  const isPj = clientData.type === "pj";
  const canConsultCnpjCommercial = ctx?.user.role === "admin";
  const fiscalFieldsLocked = !readOnly && isPj && Boolean(clientData.isVerifiedCnpj);
  const cnpjCommercialCooldownDays = useMemo(
    () => cnpjCommercialCooldownDaysRemaining(clientData.lastCnpjCommercialUpdate),
    [clientData.lastCnpjCommercialUpdate],
  );

  useEffect(() => {
    if (!msg) return;
    if (msg.kind === "err") toast.error(msg.text);
    else toast.success(msg.text);
  }, [msg]);

  useEffect(() => {
    if (cnpjLookupErr) toast.error(cnpjLookupErr);
  }, [cnpjLookupErr]);

  useEffect(() => {
    if (relatedErr) toast.error(relatedErr);
  }, [relatedErr]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (isNew) {
      setClientData(emptyViewData());
      setIsLoading(false);
      return;
    }
    if (!clientId || !Number.isFinite(idNum) || idNum < 1) return;

    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const c = await getClient(idNum);
        if (!cancelled) {
          const view = clientOutToViewData(c);
          setClientData(view);
          savedClientSnapshotRef.current = serializeClientFormSnapshot(view);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar cliente.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, clientId, idNum]);

  useEffect(() => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1 || isLoading) return;
    const tab = searchParams.get("tab");
    const tabMap: Record<string, DetailTabId> = {
      pmoc: "pmoc",
      preventiva: "equipamentos",
      historico: "historico",
      contatos: "contatos",
      contratos: "contratos",
      enderecos: "enderecos",
      financeiro: "financeiro",
      ordens: "ordens",
      equipamentos: "equipamentos",
      cadastro: "cadastro",
      unidades: "unidades",
    };
    if (tab && tabMap[tab]) {
      setActiveTab(tabMap[tab]);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("tab");
        return next;
      },
      { replace: true },
    );
  }, [isNew, idNum, isLoading, searchParams, setSearchParams]);

  useEffect(() => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1) return;

    let cancelled = false;
    void (async () => {
      setRelatedLoading(true);
      setAuditLoading(true);
      setRelatedErr("");
      try {
        const [budgetRows, orderRows, auditRows] = await Promise.all([
          listBudgets({ limit: 100 }),
          listServiceOrders({ limit: 100 }),
          listClientAudit(idNum, 100).catch(() => [] as ClientAuditEntryOut[]),
        ]);
        if (cancelled) return;
        const budgetsArr = Array.isArray(budgetRows) ? budgetRows : [];
        const ordersArr = Array.isArray(orderRows) ? orderRows : [];
        setBudgets(mapBudgetsToView(budgetsArr.filter((b) => b.client_id === idNum)));
        setOrders(mapOrdersToView(ordersArr.filter((o) => o.client_id === idNum)));
        setAuditEntries(auditRows);
      } catch (e) {
        if (!cancelled) {
          setRelatedErr(e instanceof Error ? e.message : "Não foi possível carregar dados relacionados.");
        }
      } finally {
        if (!cancelled) {
          setRelatedLoading(false);
          setAuditLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, idNum]);

  const reloadCatalogEquipments = useCallback(async () => {
    if (!Number.isFinite(idNum) || idNum < 1) return;
    setCatalogEquipmentsLoading(true);
    try {
      const [rows, sites] = await Promise.all([
        listClientCatalogEquipments(idNum),
        listClientSites(idNum).catch(() => [] as ClientSiteOut[]),
      ]);
      setClientSites(sites);
      const items = rows.map((row) => mapClientEquipmentToView(row, sites));
      setCatalogEquipments(items);
    } catch (e) {
      setRelatedErr(e instanceof Error ? e.message : "Não foi possível carregar equipamentos do cliente.");
    } finally {
      setCatalogEquipmentsLoading(false);
    }
  }, [idNum]);

  const reloadEquipmentCatalog = useCallback(async () => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1) return;
    setRelatedErr("");
    const [catalogResult, categoriesResult] = await Promise.allSettled([
      listAllEquipmentCatalog(),
      listCatalogCategories(),
    ]);

    if (categoriesResult.status === "fulfilled") {
      setEquipmentCategoryOptions(
        categoriesResult.value.items.map((c) => {
          const opt = mapApiCategoryToOption(c);
          return { id: opt.id, name: opt.name, iconKey: opt.iconKey };
        }),
      );
    } else {
      setEquipmentCategoryOptions([]);
      setRelatedErr(
        categoriesResult.reason instanceof Error
          ? categoriesResult.reason.message
          : "Não foi possível carregar as categorias de equipamento.",
      );
    }

    if (catalogResult.status === "fulfilled") {
      setEquipmentCatalog(buildEquipmentCatalogView(catalogResult.value));
    } else {
      setEquipmentCatalog({ brands: [], models: [] });
      const catalogMsg =
        catalogResult.reason instanceof Error
          ? catalogResult.reason.message
          : "Não foi possível carregar o catálogo de equipamentos.";
      setRelatedErr((prev) => (prev ? `${prev} ${catalogMsg}` : catalogMsg));
    }
  }, [isNew, idNum]);

  useEffect(() => {
    void reloadEquipmentCatalog();
  }, [reloadEquipmentCatalog]);

  useEffect(() => {
    if (activeTab === "equipamentos") {
      void reloadEquipmentCatalog();
    }
  }, [activeTab, reloadEquipmentCatalog]);

  useEffect(() => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1) return;
    void reloadCatalogEquipments();
  }, [isNew, idNum, reloadCatalogEquipments]);

  useEffect(() => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1 || activeTab !== "pmoc" || !isPj) {
      return;
    }
    let cancelled = false;
    setPmocLoading(true);
    void (async () => {
      try {
        const plans = await listPmocPlans({ client_id: idNum, limit: 100 });
        if (!cancelled) {
          setPmocData(mapPmocPlansToView(plans));
          setPmocPlansRaw(plans);
        }
      } catch {
        if (!cancelled) {
          setPmocData({ status: "sem_contrato" });
          setPmocPlansRaw([]);
        }
      } finally {
        if (!cancelled) setPmocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, idNum, isNew, isPj]);

  const handleClientChange = useCallback((patch: Partial<ClientData>) => {
    if (Object.prototype.hasOwnProperty.call(patch, "documento")) {
      setDuplicateErrors((prev) => (prev.documento ? { ...prev, documento: undefined } : prev));
    }
    if (Object.prototype.hasOwnProperty.call(patch, "whatsapp")) {
      setDuplicateErrors((prev) => (prev.whatsapp ? { ...prev, whatsapp: undefined } : prev));
    }
    setClientData((prev) => mergeViewData(prev, patch));
  }, []);

  const validateDuplicateFields = useCallback(
    async (fields: { checkDocument: boolean; checkWhatsapp: boolean }): Promise<boolean> => {
      const payload: { document?: string; whatsapp?: string; excludeClientId?: number } = {};
      const requestDoc = docDigitsRef.current;
      const requestWa = whatsappDigitsRef.current;

      if (fields.checkDocument) {
        if (!requestDoc) {
          setDuplicateErrors((prev) => (prev.documento ? { ...prev, documento: undefined } : prev));
        } else if (requestDoc.length === 11 || requestDoc.length === 14) {
          payload.document = requestDoc;
        }
      }

      if (fields.checkWhatsapp) {
        if (!requestWa) {
          setDuplicateErrors((prev) => (prev.whatsapp ? { ...prev, whatsapp: undefined } : prev));
        } else if (requestWa.length >= 10) {
          payload.whatsapp = requestWa;
        }
      }

      if (!payload.document && !payload.whatsapp) return true;
      if (!isNew && Number.isFinite(idNum) && idNum > 0) payload.excludeClientId = idNum;

      try {
        const result = await checkClientDuplicate(payload);
        if (payload.document && docDigitsRef.current === requestDoc) {
          setDuplicateErrors((prev) => ({
            ...prev,
            documento: result.document_exists ? "CPF/CNPJ já cadastrado." : undefined,
          }));
        }
        if (payload.whatsapp && whatsappDigitsRef.current === requestWa) {
          setDuplicateErrors((prev) => ({
            ...prev,
            whatsapp: result.whatsapp_exists ? "WhatsApp já cadastrado." : undefined,
          }));
        }
        return !(result.document_exists || result.whatsapp_exists);
      } catch (e) {
        setMsg({
          kind: "err",
          text: e instanceof Error ? e.message : "Não foi possível validar duplicidade no cadastro.",
        });
        return false;
      }
    },
    [idNum, isNew],
  );

  const onDocumentoBlur = useCallback(async () => {
    await validateDuplicateFields({ checkDocument: true, checkWhatsapp: false });
  }, [validateDuplicateFields]);

  const onWhatsappBlur = useCallback(async () => {
    await validateDuplicateFields({ checkDocument: false, checkWhatsapp: true });
  }, [validateDuplicateFields]);

  const applyCnpjLookupResult = useCallback(
    (lu: Awaited<ReturnType<typeof fetchCnpjOpen>>) => {
      setClientData((prev) => {
        const cur = digitsOnly(prev.documento).slice(0, 14);
        if (cur !== docDigits) return prev;
        return mergeCnpjLookupToViewData(prev, lu, true);
      });
      const sourceLabel =
        lu.source === "commercial"
          ? "validação fiscal (CNPJA Comercial)"
          : lu.source === "brasilapi"
            ? "consulta alternativa (BrasilAPI)"
            : "consulta rápida (CNPJA Open)";
      setMsg({
        kind: "ok",
        text: `Dados aplicados via ${sourceLabel}, incluindo endereço. CNPJ, razão social e tipo de cadastro ficam protegidos após salvar.`,
      });
    },
    [docDigits],
  );

  const onConsultCNPJ = useCallback(
    async (_cnpj: string) => {
      if (readOnly || clientData.type !== "pj" || docDigits.length !== 14) {
        setCnpjLookupErr("Informe um CNPJ válido com 14 dígitos.");
        return;
      }
      setCnpjLookupLoading(true);
      setCnpjLookupErr("");
      setMsg(null);
      try {
        const lu = await fetchCnpjOpen(docDigits);
        applyCnpjLookupResult(lu);
      } catch (error) {
        console.error("Erro detalhado da consulta fiscal:", error);
        setCnpjLookupErr(
          fiscalLookupErrorMessage(error, "Não foi possível consultar o CNPJ na Receita (CNPJA Open)."),
        );
      } finally {
        setCnpjLookupLoading(false);
      }
    },
    [applyCnpjLookupResult, clientData.type, docDigits, readOnly],
  );

  const onConsultCNPJCommercial = useCallback(
    async (_cnpj: string) => {
      if (readOnly || !canConsultCnpjCommercial || clientData.type !== "pj" || docDigits.length !== 14) {
        setCnpjLookupErr("Informe um CNPJ válido com 14 dígitos.");
        return;
      }
      setCnpjCommercialLoading(true);
      setCnpjLookupErr("");
      setMsg(null);
      try {
        const lu = await fetchCnpjCommercial(docDigits, true);
        applyCnpjLookupResult(lu);
      } catch (error) {
        console.error("Erro detalhado da consulta fiscal:", error);
        setCnpjLookupErr(
          fiscalLookupErrorMessage(
            error,
            "Consulta comercial indisponível. Verifique CNPJA_API_KEY no servidor.",
          ),
        );
      } finally {
        setCnpjCommercialLoading(false);
      }
    },
    [applyCnpjLookupResult, canConsultCnpjCommercial, clientData.type, docDigits, readOnly],
  );

  const onRefreshCnpjCommercial = useCallback(async () => {
    if (readOnly || isNew || !Number.isFinite(idNum) || idNum < 1 || clientData.type !== "pj") return;
    setCnpjCommercialRefreshLoading(true);
    setCnpjLookupErr("");
    setMsg(null);
    try {
      const result = await refreshClientCnpjCommercial(idNum, true);
      setClientData(
        mergeCnpjLookupToViewData(clientOutToViewData(result.client), result.lookup, true),
      );
      setMsg({
        kind: "ok",
        text: "Cadastro atualizado via Receita (Comercial), incluindo endereço.",
      });
    } catch (error) {
      console.error("Erro detalhado da atualização comercial:", error);
      setCnpjLookupErr(
        fiscalLookupErrorMessage(
          error,
          "Não foi possível atualizar via Receita (Comercial). Verifique a chave CNPJá nas credenciais da plataforma.",
        ),
      );
    } finally {
      setCnpjCommercialRefreshLoading(false);
    }
  }, [clientData.type, idNum, isNew, readOnly]);

  const onAddCatalogEquipment = useCallback(
    async (data: NewEquipmentData) => {
      if (!canEdit || readOnly || !Number.isFinite(idNum) || idNum < 1) return;
      setCatalogSaving(true);
      setMsg(null);
      try {
        await createClientCatalogEquipment(idNum, newEquipmentDataToCreatePayload(data));
        await reloadCatalogEquipments();
        await reloadEquipmentCatalog();
        const n = data.components?.length ?? 1;
        setMsg({
          kind: "ok",
          text:
            data.isMultiSplit && n > 1
              ? `Conjunto Multi-Split cadastrado (${n} componentes em uma instalação).`
              : "Equipamento cadastrado com sucesso.",
        });
      } catch (e) {
        setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao cadastrar equipamento." });
        throw e;
      } finally {
        setCatalogSaving(false);
      }
    },
    [canEdit, idNum, readOnly, reloadCatalogEquipments, reloadEquipmentCatalog],
  );

  const onDeactivateCatalogEquipment = useCallback(
    (equipmentId: string) => {
      if (!canEdit || readOnly) return;
      const item = catalogEquipments.find((e) => e.id === equipmentId);
      if (!item) return;
      setDeactivateEquipmentTarget(item);
    },
    [canEdit, catalogEquipments, readOnly],
  );

  const onConfirmDeactivateCatalogEquipment = useCallback(async () => {
    if (!deactivateEquipmentTarget || !canEdit || readOnly) return;
    const equipmentId = deactivateEquipmentTarget.id;
    setCatalogSaving(true);
    setMsg(null);
    try {
      await updateClientCatalogEquipmentStatus(equipmentId, false);
      await reloadCatalogEquipments();
      setDeactivateEquipmentTarget(null);
      setMsg({ kind: "ok", text: "Equipamento desativado." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao desativar equipamento." });
    } finally {
      setCatalogSaving(false);
    }
  }, [canEdit, deactivateEquipmentTarget, readOnly, reloadCatalogEquipments]);

  const onDeleteCatalogEquipment = useCallback(
    (equipmentId: string) => {
      if (!canEdit || readOnly) return;
      const item = catalogEquipments.find((e) => e.id === equipmentId);
      if (!item) return;
      if (!item.canDelete) {
        setMsg({
          kind: "err",
          text: item.deleteBlockReason ?? "Este equipamento não pode ser excluído.",
        });
        return;
      }
      setDeleteEquipmentTarget(item);
    },
    [canEdit, catalogEquipments, readOnly],
  );

  const onConfirmDeleteCatalogEquipment = useCallback(async () => {
    if (!deleteEquipmentTarget || !canEdit || readOnly) return;
    const equipmentId = deleteEquipmentTarget.id;
    setCatalogSaving(true);
    setMsg(null);
    try {
      await deleteClientCatalogEquipment(equipmentId);
      await reloadCatalogEquipments();
      setDeleteEquipmentTarget(null);
      setMsg({ kind: "ok", text: "Equipamento excluído." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao excluir equipamento." });
    } finally {
      setCatalogSaving(false);
    }
  }, [canEdit, deleteEquipmentTarget, readOnly, reloadCatalogEquipments]);

  const onOrderAction = useCallback(
    (action: "view" | "edit", order: ServiceOrder) => {
      const path = `/app/service-orders/${order.id}`;
      if (action === "edit" && canEdit) navigate(path);
      else navigate(path);
    },
    [canEdit, navigate],
  );

  const onBudgetAction = useCallback(
    (action: "view" | "edit" | "send", budget: Budget) => {
      void action;
      navigate(`/app/budgets/${budget.id}`);
    },
    [navigate],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (readOnly) return;

    if (!clientData.type) {
      setMsg({ kind: "err", text: "Selecione o tipo de cadastro (Pessoa Física ou Pessoa Jurídica)." });
      return;
    }

    const digits = digitsOnly(clientData.documento);
    if (digits && digits.length !== 11 && digits.length !== 14) {
      setMsg({ kind: "err", text: "Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)." });
      return;
    }

    const duplicatesOk = await validateDuplicateFields({ checkDocument: true, checkWhatsapp: true });
    if (!duplicatesOk) {
      setMsg({ kind: "err", text: "CPF/CNPJ ou WhatsApp já cadastrado para outro cliente." });
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const created = await createClient(viewDataToCreatePayload(clientData));
        toast.success("Cliente salvo com sucesso");
        navigate(`/app/clients/${created.id}`, { replace: true });
      } else {
        const updated = await updateClient(idNum, viewDataToUpdatePayload(clientData));
        const view = clientOutToViewData(updated);
        setClientData(view);
        savedClientSnapshotRef.current = serializeClientFormSnapshot(view);
        toast.success("Cliente salvo com sucesso");
      }
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!canDelete || isNew) return;
    setDeleting(true);
    setMsg(null);
    try {
      await deleteClient(idNum);
      navigate("/app/clients", { replace: true });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao excluir." });
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  const history = useMemo(() => mapAuditToHistory(auditEntries), [auditEntries]);

  const equipmentCountBySiteId = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of catalogEquipments) {
      if (item.clientSiteId == null) continue;
      map.set(item.clientSiteId, (map.get(item.clientSiteId) ?? 0) + 1);
    }
    return map;
  }, [catalogEquipments]);

  const matrizSite = useMemo(() => clientSites.find((s) => s.site_type === "matriz"), [clientSites]);
  const activeBranchesCount = useMemo(
    () => clientSites.filter((s) => s.site_type !== "matriz" && s.is_active).length,
    [clientSites],
  );

  const registrationSummary: RegistrationSummary = useMemo(
    () => ({
      addresses: addressesCount,
      contacts: contactsCount,
      equipments: catalogEquipments.length,
      pmocLabel: !isPj ? "Não aplicável" : pmocData && pmocData.status !== "sem_contrato" ? "Ativo" : "Sem contrato ativo",
      contracts: contractsCount,
      ordersCount: orders.length,
      financeLabel: orders.length ? `${orders.length} lançamento(s)` : "Sem lançamentos",
      historyLabel: auditEntries.length ? `${auditEntries.length} evento(s)` : "Sem eventos",
      unitsCount: clientSites.length,
      activeBranches: activeBranchesCount,
      matrizName: matrizSite?.name,
    }),
    [
      clientSites.length,
      addressesCount,
      contactsCount,
      catalogEquipments.length,
      isPj,
      pmocData,
      contractsCount,
      orders.length,
      auditEntries.length,
      activeBranchesCount,
      matrizSite,
    ],
  );

  if (!ctx) {
    return <Navigate to="/login" replace />;
  }

  if (ctx.user.role === "technician") {
    return <Navigate to="/app/service-orders" replace />;
  }

  if (isNew && !canEdit) {
    return <Navigate to="/app/clients" replace />;
  }

  if (!isNew && (!clientId || !Number.isFinite(idNum) || idNum < 1)) {
    return <Navigate to="/app/clients" replace />;
  }

  if (!isNew && isLoading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Carregando cliente…</p>
      </div>
    );
  }

  if (!isNew && error) {
    return (
      <div className={styles.page}>
        <Link className={`${styles.btn} ${styles.btnSecondary}`} to="/app/clients">
          ← Voltar à lista
        </Link>
        <p className={styles.loading}>Não foi possível carregar este cliente.</p>
      </div>
    );
  }

  const displayName = clientData.nomeFantasia?.trim() || clientData.razaoSocial?.trim() || "Editar cliente";

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Navegação">
        <Link className={styles.breadcrumbLink} to="/app/clients">
          Clientes
        </Link>
        <span className={styles.breadcrumbSep} aria-hidden>
          /
        </span>
        <span className={styles.breadcrumbCurrent}>{isNew ? "Novo cliente" : displayName}</span>
      </nav>

      <header className={styles.headerRow}>
        <div className={styles.headerMain}>
          <span className={styles.headerIcon} aria-hidden>
            {clientData.type === "pj" ? <IconBuilding /> : <IconUser />}
          </span>
          <div>
            <h1 className={styles.headerTitle}>{isNew ? "Novo cliente" : "Editar cliente"}</h1>
            <p className={styles.headerSubtitle}>Gerencie cadastro, contatos, endereços e configurações do cliente.</p>
          </div>
        </div>
      </header>

      {relatedLoading && !isNew ? <p className={styles.loading}>Carregando equipamentos, OS e orçamentos…</p> : null}

      <DeactivateEquipmentConfirmModal
        equipment={deactivateEquipmentTarget}
        open={deactivateEquipmentTarget !== null}
        busy={catalogSaving}
        onOpenChange={(open) => {
          if (!open && !catalogSaving) setDeactivateEquipmentTarget(null);
        }}
        onConfirm={() => void onConfirmDeactivateCatalogEquipment()}
      />

      <DeleteEquipmentConfirmModal
        equipment={deleteEquipmentTarget}
        open={deleteEquipmentTarget !== null}
        busy={catalogSaving}
        onOpenChange={(open) => {
          if (!open && !catalogSaving) setDeleteEquipmentTarget(null);
        }}
        onConfirm={() => void onConfirmDeleteCatalogEquipment()}
      />

      <div className={styles.tabsScroll} role="tablist" aria-label="Seções do cadastro do cliente">
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.Icon /> {tab.label}
          </button>
        ))}
      </div>

      <form id="client-form-main" onSubmit={onSubmit}>
        {activeTab === "cadastro" ? (
          <ClientRegistrationTab
            client={clientData}
            onClientChange={handleClientChange}
            onDocumentoBlur={() => void onDocumentoBlur()}
            onWhatsappBlur={() => void onWhatsappBlur()}
            documentoDuplicateMessage={duplicateErrors.documento}
            whatsappDuplicateMessage={duplicateErrors.whatsapp}
            onConsultCNPJ={onConsultCNPJ}
            onConsultCNPJCommercial={canConsultCnpjCommercial ? onConsultCNPJCommercial : undefined}
            onRefreshCnpjCommercial={
              !isNew && fiscalFieldsLocked && canConsultCnpjCommercial ? () => void onRefreshCnpjCommercial() : undefined
            }
            loadingCNPJ={cnpjLookupLoading}
            loadingCNPJCommercial={cnpjCommercialLoading}
            loadingCnpjCommercialRefresh={cnpjCommercialRefreshLoading}
            cnpjCommercialCooldownDays={cnpjCommercialCooldownDays}
            fiscalFieldsLocked={fiscalFieldsLocked}
            readOnly={readOnly}
            isNew={isNew}
            summary={registrationSummary}
            onNavigateTab={setActiveTab}
            sites={clientSites}
            onAddUnit={() => {
              setActiveTab("unidades");
              setUnitDrawerRequest("new");
            }}
            onEditUnit={(site) => {
              setActiveTab("unidades");
              setUnitDrawerRequest({ site });
            }}
          />
        ) : null}

        {activeTab === "unidades" ? (
          <ClientUnitsTab
            clientId={idNum}
            isNew={isNew}
            readOnly={readOnly}
            loading={catalogEquipmentsLoading}
            sites={clientSites}
            equipmentCountBySiteId={equipmentCountBySiteId}
            mainClientDocument={clientData.documento}
            nearCity={clientData.endereco?.cidade}
            nearState={clientData.endereco?.estado}
            onSitesChanged={() => void reloadCatalogEquipments()}
            onOpenEquipmentsForSite={() => setActiveTab("equipamentos")}
            onOpenPmocForSite={(siteId) => {
              setPmocSiteFilter(siteId);
              setActiveTab("pmoc");
            }}
            openRequest={unitDrawerRequest}
            onOpenRequestHandled={() => setUnitDrawerRequest(null)}
          />
        ) : null}

        {activeTab === "enderecos" ? (
          <ClientAddressesTab
            clientId={idNum}
            isNew={isNew}
            readOnly={readOnly}
            sites={clientSites}
            onAddressesChanged={setAddressesCount}
          />
        ) : null}

        {activeTab === "contatos" ? (
          <ClientContactsTab
            clientId={idNum}
            isNew={isNew}
            readOnly={readOnly}
            sites={clientSites}
            onContactsChanged={setContactsCount}
          />
        ) : null}

        {activeTab === "equipamentos" ? (
          <ClientEquipmentTab
            isNew={isNew}
            readOnly={readOnly}
            clientId={idNum}
            clientSites={clientSites}
            equipments={catalogEquipments}
            catalog={equipmentCatalog}
            categoryOptions={equipmentCategoryOptions}
            isLoading={catalogEquipmentsLoading || catalogSaving}
            pmocPlans={pmocPlansRaw}
            modalOpenRequest={equipmentModalRequest}
            onModalOpenRequestHandled={() => setEquipmentModalRequest(null)}
            onAddEquipment={readOnly ? undefined : onAddCatalogEquipment}
            onDeactivate={readOnly ? undefined : onDeactivateCatalogEquipment}
            onDelete={readOnly ? undefined : onDeleteCatalogEquipment}
            onEquipmentsChanged={() => void reloadCatalogEquipments()}
            onGoToPmoc={(siteId) => {
              setPmocSiteFilter(siteId);
              setActiveTab("pmoc");
            }}
          />
        ) : null}

        {activeTab === "pmoc" ? (
          <ClientPMOCTab
            pmocData={pmocData}
            plans={pmocPlansRaw}
            isNew={isNew}
            isPj={isPj}
            loading={pmocLoading}
            clientSites={clientSites}
            initialSiteFilter={pmocSiteFilter}
            onGenerateNew={!isNew ? () => navigate(`/app/pmoc/new?from_client=${idNum}`) : undefined}
            onOpenPlan={(plan) => navigate(`/app/pmoc/${plan.id}`)}
          />
        ) : null}

        {activeTab === "contratos" ? (
          isNew ? (
            <div className={styles.tabPanel}>
              <section className={styles.card}>
                <p className={styles.cardHint}>Salve o cliente para cadastrar contratos.</p>
              </section>
            </div>
          ) : (
            <ClientContractsTab
              clientId={idNum}
              readOnly={readOnly}
              sites={clientSites}
              onContractsChanged={setContractsCount}
            />
          )
        ) : null}

        {activeTab === "ordens" ? (
          <ClientOrdersTab
            orders={orders}
            budgets={budgets}
            isNew={isNew}
            loading={relatedLoading}
            onNewOrder={() => navigate(`/app/service-orders/new?client_id=${idNum}`)}
            onNewBudget={() => navigate(`/app/budgets/new?client_id=${idNum}`)}
            onOrderAction={onOrderAction}
            onBudgetAction={onBudgetAction}
          />
        ) : null}

        {activeTab === "financeiro" ? <ClientFinanceTab orders={orders} budgets={budgets} isNew={isNew} /> : null}

        {activeTab === "historico" ? <ClientHistoryTab history={history} loading={auditLoading} isNew={isNew} /> : null}
      </form>

      <footer className={styles.footerBar} role="toolbar" aria-label="Ações do cadastro">
        <div className={styles.footerBarInner}>
          <div className={styles.footerBarLeft}>
            <Link className={`${styles.btn} ${styles.btnSecondary}`} to="/app/clients">
              Cancelar
            </Link>
          </div>
          <div className={styles.footerBarRight}>
            {canDelete && !isNew ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDangerSolid}`}
                onClick={() => setShowDeleteModal(true)}
                disabled={saving || deleting}
              >
                Excluir cliente
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="submit"
                form="client-form-main"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={saving || deleting || (!isNew && !isDirty)}
              >
                {saving ? "Salvando…" : isNew ? "Cadastrar cliente" : "Salvar alterações"}
              </button>
            ) : (
              <p className={styles.cardHint} style={{ margin: 0 }}>
                Visualização somente leitura.
              </p>
            )}
          </div>
        </div>
      </footer>

      {showDeleteModal ? (
        <div className={styles.modalRoot} role="presentation">
          <button type="button" className={styles.modalBackdrop} aria-label="Fechar" onClick={() => setShowDeleteModal(false)} />
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="delete-client-title">
            <h3 id="delete-client-title" className={styles.modalTitle}>
              Excluir cliente
            </h3>
            <p className={styles.cardHint}>
              Prefira desativar o &quot;Status do cadastro&quot; para inativar. A exclusão permanente só deve ser usada quando
              não houver ordens, orçamentos ou NFS-e vinculados.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={`${styles.btn} ${styles.btnDangerSolid}`} onClick={() => void onDelete()} disabled={deleting}>
                {deleting ? "Excluindo…" : "Confirmar exclusão"}
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
