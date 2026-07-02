import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  listClientSites,
  refreshClientCnpjCommercial,
  updateClient,
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
import { cepLookupHasUsefulData, cepLookupSuccessMessage, fetchCepLookup } from "../../api/cep";
import { fetchCnpjCommercial, fetchCnpjOpen } from "../../api/cnpj";
import { listBudgets } from "../../api/budgets";
import { listPmocPlans } from "../../api/pmoc";
import { listServiceOrders } from "../../api/serviceOrders";
import { ClientPreventiveTab } from "../../components/clients/ClientPreventiveTab";
import { ClientSitesPanel } from "../../components/v0-ui/clients/ClientSitesPanel";
import {
  ClientEquipmentManager,
  ClientFormView,
  type Budget,
  type ClientData,
  type EquipmentCatalog,
  type EquipmentCategoryPickerOption,
  type EquipmentItem,
  type NewEquipmentData,
  type ServiceOrder,
  type TabId,
} from "../../components/v0-ui/clients";
import {
  buildEquipmentCatalogView,
  firstManualUrlFromInstallation,
  mapClientEquipmentToView,
  newEquipmentDataToCreatePayload,
} from "../../lib/clientEquipmentAdapter";
import { mapApiCategoryToOption } from "../../lib/equipmentCatalogAdminAdapter";
import { digitsOnly, formatCepInput } from "../../lib/brMask";
import {
  clientOutToViewData,
  emptyViewData,
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
import styles from "./ClientFormPage.module.css";

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
  const [cepLoading, setCepLoading] = useState(false);
  const [cepErr, setCepErr] = useState("");
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjCommercialLoading, setCnpjCommercialLoading] = useState(false);
  const [cnpjCommercialRefreshLoading, setCnpjCommercialRefreshLoading] = useState(false);
  const [cnpjLookupErr, setCnpjLookupErr] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("cadastro");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [clientSites, setClientSites] = useState<ClientSiteOut[]>([]);
  const [catalogEquipments, setCatalogEquipments] = useState<EquipmentItem[]>([]);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentCatalog>({ brands: [], models: [] });
  const [equipmentCategoryOptions, setEquipmentCategoryOptions] = useState<EquipmentCategoryPickerOption[]>(
    [],
  );
  const [catalogEquipmentsLoading, setCatalogEquipmentsLoading] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [manualUrlByEquipmentId, setManualUrlByEquipmentId] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [pmocData, setPmocData] = useState<ReturnType<typeof mapPmocPlansToView>>(undefined);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedErr, setRelatedErr] = useState("");
  const [equipmentModalRequest, setEquipmentModalRequest] = useState<{ clientSiteId: number } | null>(
    null,
  );
  const [deactivateEquipmentTarget, setDeactivateEquipmentTarget] = useState<EquipmentItem | null>(null);
  const [deleteEquipmentTarget, setDeleteEquipmentTarget] = useState<EquipmentItem | null>(null);
  const [duplicateErrors, setDuplicateErrors] = useState<{ documento?: string; whatsapp?: string }>({});

  const docDigits = useMemo(() => digitsOnly(clientData.documento).slice(0, 14), [clientData.documento]);
  const whatsappDigits = useMemo(() => digitsOnly(clientData.whatsapp ?? "").slice(0, 11), [clientData.whatsapp]);
  const cepDigits = useMemo(
    () => digitsOnly(clientData.endereco?.cep ?? "").slice(0, 8),
    [clientData.endereco?.cep],
  );
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

  const showPmocTab = !isNew && clientData.type === "pj";
  const canConsultCnpjCommercial = ctx?.user.role === "admin";
  const fiscalFieldsLocked =
    !readOnly && clientData.type === "pj" && Boolean(clientData.isVerifiedCnpj);
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
    if (cepErr) toast.error(cepErr);
  }, [cepErr]);

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
    if (clientData.type !== "pj" && activeTab === "pmoc") {
      setActiveTab("cadastro");
    }
  }, [clientData.type, activeTab]);

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
    if (tab === "pmoc" && showPmocTab) {
      setActiveTab("pmoc");
    } else if (tab === "preventiva") {
      setActiveTab("preventiva");
    } else if (tab === "historico") {
      setActiveTab("cadastro");
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("tab");
        return next;
      },
      { replace: true },
    );
  }, [isNew, idNum, isLoading, searchParams, showPmocTab, setSearchParams]);

  useEffect(() => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1) return;

    let cancelled = false;
    void (async () => {
      setRelatedLoading(true);
      setRelatedErr("");
      try {
        const [budgetRows, orderRows] = await Promise.all([
          listBudgets({ limit: 100 }),
          listServiceOrders({ limit: 100 }),
        ]);
        if (cancelled) return;
        const budgets = Array.isArray(budgetRows) ? budgetRows : [];
        const orders = Array.isArray(orderRows) ? orderRows : [];
        setBudgets(mapBudgetsToView(budgets.filter((b) => b.client_id === idNum)));
        setOrders(mapOrdersToView(orders.filter((o) => o.client_id === idNum)));
      } catch (e) {
        if (!cancelled) {
          setRelatedErr(e instanceof Error ? e.message : "Não foi possível carregar dados relacionados.");
        }
      } finally {
        if (!cancelled) setRelatedLoading(false);
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
      const manuals: Record<string, string> = {};
      const items = rows.map((row) => {
        const manualUrl = firstManualUrlFromInstallation(row);
        if (manualUrl) {
          manuals[row.id] = manualUrl;
        }
        return mapClientEquipmentToView(row, sites);
      });
      setCatalogEquipments(items);
      setManualUrlByEquipmentId(manuals);
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
    if (
      isNew ||
      !Number.isFinite(idNum) ||
      idNum < 1 ||
      activeTab !== "pmoc" ||
      clientData.type !== "pj"
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const plans = await listPmocPlans({ client_id: idNum, limit: 100 });
        if (!cancelled) setPmocData(mapPmocPlansToView(plans));
      } catch {
        if (!cancelled) setPmocData({ status: "sem_contrato" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, idNum, isNew, clientData.type]);

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

  const onBuscarCep = useCallback(async () => {
    if (readOnly) return;
    if (cepDigits.length !== 8) {
      setCepErr("Informe um CEP com 8 dígitos.");
      return;
    }
    setCepLoading(true);
    setCepErr("");
    setMsg(null);
    try {
      const data = await fetchCepLookup(cepDigits);
      if (!cepLookupHasUsefulData(data)) {
        setCepErr("CEP não encontrado ou sem dados de endereço.");
        return;
      }
      setClientData((prev) => {
        const cur = digitsOnly(prev.endereco?.cep ?? "").slice(0, 8);
        if (cur !== cepDigits) return prev;
        const uf = (data.address_state ?? "").trim();
        const ibgeFromCep = digitsOnly(data.address_ibge_code ?? "").slice(0, 7);
        return mergeViewData(prev, {
          endereco: {
            logradouro: (data.address_street ?? "").trim(),
            complemento: (data.address_complement ?? "").trim(),
            bairro: (data.address_district ?? "").trim(),
            cidade: (data.address_city ?? "").trim(),
            estado: uf ? uf.toUpperCase().slice(0, 2) : "",
            cep: data.address_postal_code
              ? formatCepInput(data.address_postal_code)
              : formatCepInput(cepDigits),
          },
          addressIbgeCode: ibgeFromCep.length === 7 ? ibgeFromCep : prev.addressIbgeCode,
        });
      });
      setMsg({
        kind: "ok",
        text: cepLookupSuccessMessage(data),
      });
    } catch (e) {
      setCepErr(e instanceof Error ? e.message : "Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }, [cepDigits, readOnly]);

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
        const created = await createClientCatalogEquipment(idNum, newEquipmentDataToCreatePayload(data));
        const manualUrl = firstManualUrlFromInstallation(created);
        if (manualUrl) {
          setManualUrlByEquipmentId((prev) => ({ ...prev, [created.id]: manualUrl }));
        }
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

  const onDownloadEquipmentManual = useCallback(
    (equipmentId: string, directUrl?: string | null) => {
      const url = directUrl ?? manualUrlByEquipmentId[equipmentId];
      if (!url) {
        setMsg({ kind: "err", text: "Manual não disponível para este equipamento." });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [manualUrlByEquipmentId],
  );

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
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando cliente…</p>
      </div>
    );
  }

  if (!isNew && error) {
    return (
      <div className={styles.wrap}>
        <Link className={styles.btnBackLink} to="/app/clients">
          ← Voltar à lista
        </Link>
        <p className={styles.loading}>Não foi possível carregar este cliente.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHeader}>
        <nav className={styles.breadcrumb} aria-label="Navegação">
          <Link className={styles.breadcrumbLink} to="/app/clients">
            Clientes
          </Link>
          <span className={styles.breadcrumbSep} aria-hidden>
            /
          </span>
          <span className={styles.breadcrumbCurrent}>
            {isNew ? "Novo cadastro" : clientData.nomeFantasia?.trim() || clientData.razaoSocial?.trim() || "Editar cliente"}
          </span>
        </nav>
        <div className={styles.pageHeaderMain}>
          <span className={styles.pageHeaderIcon} aria-hidden>
            {clientData.type === "pj" ? (
              <svg viewBox="0 0 24 24">
                <path d="M3 21h18" />
                <path d="M5 21V7l8-4v18" />
                <path d="M19 21V11l-6-4" />
                <path d="M9 9h1" />
                <path d="M9 13h1" />
                <path d="M9 17h1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </span>
          <div className={styles.pageHeaderText}>
            <h1 className={styles.title}>{isNew ? "Novo cliente" : "Editar cliente"}</h1>
            <p className={styles.lead}>
              {isNew
                ? "Cadastre pessoa física ou jurídica com dados fiscais, endereço e vínculos operacionais."
                : "Atualize cadastro, fiscal, endereço, equipamentos e configurações preventivas."}
            </p>
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

      <form id="client-form-main" className={styles.form} onSubmit={onSubmit}>
        <ClientFormView
          client={clientData}
          equipments={[]}
          equipamentosCount={isNew ? 0 : catalogEquipments.filter((e) => e.status === "ativo").length}
          equipamentosPanel={
            isNew ? (
              <p className={styles.readOnlyHint}>Salve o cliente para cadastrar equipamentos.</p>
            ) : (
              <ClientEquipmentManager
                clientId={idNum}
                clientSites={clientSites}
                equipments={catalogEquipments}
                catalog={equipmentCatalog}
                categoryOptions={equipmentCategoryOptions}
                isLoading={catalogEquipmentsLoading || catalogSaving}
                readOnly={readOnly}
                modalOpenRequest={equipmentModalRequest}
                onModalOpenRequestHandled={() => setEquipmentModalRequest(null)}
                onEquipmentsChanged={() => void reloadCatalogEquipments()}
                onAddEquipment={readOnly ? undefined : onAddCatalogEquipment}
                onDeactivate={readOnly ? undefined : onDeactivateCatalogEquipment}
                onDelete={readOnly ? undefined : onDeleteCatalogEquipment}
                onDownloadManual={(id) => onDownloadEquipmentManual(id)}
              />
            )
          }
          orders={isNew ? [] : orders}
          budgets={isNew ? [] : budgets}
          pmocData={showPmocTab ? pmocData : { status: "sem_contrato" }}
          activeTab={activeTab}
          onTabChange={setActiveTab}
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
          onBuscarCep={() => void onBuscarCep()}
          loadingCNPJ={cnpjLookupLoading}
          loadingCNPJCommercial={cnpjCommercialLoading}
          loadingCnpjCommercialRefresh={cnpjCommercialRefreshLoading}
          cnpjCommercialCooldownDays={cnpjCommercialCooldownDays}
          fiscalFieldsLocked={fiscalFieldsLocked}
          showPmocTab={showPmocTab}
          sitesPanel={
            !isNew && Number.isFinite(idNum) ? (
              <ClientSitesPanel
                clientId={idNum}
                readOnly={readOnly}
                nearCity={clientData.endereco?.cidade}
                nearState={clientData.endereco?.estado}
                onSitesChanged={() => void reloadCatalogEquipments()}
                onAddEquipmentForSite={
                  readOnly
                    ? undefined
                    : (siteId) => {
                        setActiveTab("equipamentos");
                        setEquipmentModalRequest({ clientSiteId: siteId });
                      }
                }
              />
            ) : undefined
          }
          cepLoading={cepLoading}
          readOnly={readOnly}
          onOrderAction={onOrderAction}
          onBudgetAction={onBudgetAction}
          preventivaPanel={
            isNew ? undefined : (
              <ClientPreventiveTab
                clientId={idNum}
                equipments={catalogEquipments}
                readOnly={readOnly}
                preventiveCampaignOptOut={Boolean(clientData.preventiveCampaignOptOut)}
                onPreventiveCampaignOptOutChange={(value) =>
                  handleClientChange({ preventiveCampaignOptOut: value })
                }
              />
            )
          }
        />

      </form>

      <div className={styles.actionBar} role="toolbar" aria-label="Ações do cadastro">
        <div className={styles.actionBarInner}>
          <Link className={styles.btnBackLink} to="/app/clients">
            Voltar
          </Link>
          {canDelete && !isNew ? (
            <button
              type="button"
              className={styles.btnDanger}
              onClick={() => setShowDeleteModal(true)}
              disabled={saving || deleting}
            >
              {deleting ? "Excluindo…" : "Excluir cliente"}
            </button>
          ) : null}
          {canEdit && isDirty ? (
            <button
              type="submit"
              form="client-form-main"
              className={styles.btnPrimary}
              disabled={saving || deleting}
            >
              {saving ? "Salvando…" : isNew ? "Cadastrar cliente" : "Salvar alterações"}
            </button>
          ) : null}
          {!canEdit ? <p className={styles.readOnlyHint}>Visualização somente leitura.</p> : null}
        </div>
      </div>

      {showDeleteModal ? (
        <div className={styles.modalRoot} role="presentation">
          <button type="button" className={styles.modalBackdrop} aria-label="Fechar" onClick={() => setShowDeleteModal(false)} />
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="delete-client-title">
            <h3 id="delete-client-title" className={styles.modalTitle}>
              Excluir cliente
            </h3>
            <p className={styles.modalText}>
              Prefira desmarcar &quot;Cadastro ativo&quot; para inativar. A exclusão permanente só deve ser usada quando não
              houver ordens, orçamentos ou NFS-e vinculados.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnDanger} onClick={() => void onDelete()} disabled={deleting}>
                {deleting ? "Excluindo…" : "Confirmar exclusão"}
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
