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
  cnpjCommercialCooldownDaysRemaining,
  createClient,
  deleteClient,
  getClient,
  listClientAudit,
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
import { fetchCepLookup } from "../../api/cep";
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
  clientHasPersistedAddressFromView,
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
import { ToastHost } from "../../components/ToastHost";
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
  const [cnpjIncludeAddress, setCnpjIncludeAddress] = useState(true);
  const [addressPersisted, setAddressPersisted] = useState(false);
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
  const [history, setHistory] = useState<ReturnType<typeof mapAuditToHistory>>([]);
  const [pmocData, setPmocData] = useState<ReturnType<typeof mapPmocPlansToView>>(undefined);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedErr, setRelatedErr] = useState("");
  const [equipmentModalRequest, setEquipmentModalRequest] = useState<{ clientSiteId: number } | null>(
    null,
  );

  const docDigits = useMemo(() => digitsOnly(clientData.documento).slice(0, 14), [clientData.documento]);
  const cepDigits = useMemo(
    () => digitsOnly(clientData.endereco?.cep ?? "").slice(0, 8),
    [clientData.endereco?.cep],
  );

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
    if (clientData.type !== "pj" && activeTab === "pmoc") {
      setActiveTab("cadastro");
    }
  }, [clientData.type, activeTab]);

  useEffect(() => {
    if (isNew) {
      setClientData(emptyViewData());
      setAddressPersisted(false);
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
          setAddressPersisted(clientHasPersistedAddressFromView(view));
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
    setCnpjIncludeAddress(!addressPersisted);
  }, [addressPersisted]);

  useEffect(() => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1 || isLoading) return;
    const tab = searchParams.get("tab");
    if (tab === "pmoc" && showPmocTab) {
      setActiveTab("pmoc");
    } else if (tab === "preventiva") {
      setActiveTab("preventiva");
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
    if (isNew || !Number.isFinite(idNum) || idNum < 1 || activeTab !== "historico") {
      setHistory([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listClientAudit(idNum);
        if (!cancelled) setHistory(mapAuditToHistory(rows));
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, idNum, isNew]);

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
    setClientData((prev) => mergeViewData(prev, patch));
  }, []);

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
        text: "Endereço preenchido pela consulta de CEP. Clique em Salvar para gravar.",
      });
    } catch (e) {
      setCepErr(e instanceof Error ? e.message : "Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }, [cepDigits, readOnly]);

  const applyCnpjLookupResult = useCallback(
    (lu: Awaited<ReturnType<typeof fetchCnpjOpen>>, source: "open" | "commercial") => {
      setClientData((prev) => {
        const cur = digitsOnly(prev.documento).slice(0, 14);
        if (cur !== docDigits) return prev;
        return mergeCnpjLookupToViewData(prev, lu, cnpjIncludeAddress);
      });
      const sourceLabel = source === "open" ? "consulta rápida (CNPJA Open)" : "validação fiscal (CNPJA Comercial)";
      setMsg({
        kind: "ok",
        text: cnpjIncludeAddress
          ? `Dados aplicados via ${sourceLabel}. CNPJ, razão social e tipo ficam protegidos após salvar.`
          : `Razão social e nome fantasia atualizados via ${sourceLabel}. Clique em Salvar para gravar.`,
      });
    },
    [cnpjIncludeAddress, docDigits],
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
        applyCnpjLookupResult(lu, "open");
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
        applyCnpjLookupResult(lu, "commercial");
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
      const result = await refreshClientCnpjCommercial(idNum, cnpjIncludeAddress);
      setClientData(
        mergeCnpjLookupToViewData(clientOutToViewData(result.client), result.lookup, cnpjIncludeAddress),
      );
      setMsg({
        kind: "ok",
        text: cnpjIncludeAddress
          ? "Cadastro atualizado via Receita (Comercial), incluindo endereço."
          : "Dados fiscais atualizados via Receita (Comercial).",
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
  }, [cnpjIncludeAddress, clientData.type, idNum, isNew, readOnly]);

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
    async (equipmentId: string) => {
      if (!canEdit || readOnly) return;
      const item = catalogEquipments.find((e) => e.id === equipmentId);
      const label = item ? `${item.brandName} ${item.modelName}` : "este equipamento";
      if (!window.confirm(`Desativar ${label}?`)) return;
      setCatalogSaving(true);
      setMsg(null);
      try {
        await updateClientCatalogEquipmentStatus(equipmentId, false);
        await reloadCatalogEquipments();
        setMsg({ kind: "ok", text: "Equipamento desativado." });
      } catch (e) {
        setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao desativar equipamento." });
      } finally {
        setCatalogSaving(false);
      }
    },
    [canEdit, catalogEquipments, readOnly, reloadCatalogEquipments],
  );

  const onDeleteCatalogEquipment = useCallback(
    async (equipmentId: string) => {
      if (!canEdit || readOnly) return;
      const item = catalogEquipments.find((e) => e.id === equipmentId);
      if (item && !item.canDelete) {
        setMsg({
          kind: "err",
          text: item.deleteBlockReason ?? "Este equipamento não pode ser excluído.",
        });
        return;
      }
      const label = item?.tag?.trim() || (item ? `${item.brandName} ${item.modelName}` : "este equipamento");
      if (
        !window.confirm(
          `Excluir permanentemente "${label}"?\n\nEsta ação não pode ser desfeita. Só é possível quando não há OS, PMOC ou documentos vinculados.`,
        )
      ) {
        return;
      }
      setCatalogSaving(true);
      setMsg(null);
      try {
        await deleteClientCatalogEquipment(equipmentId);
        await reloadCatalogEquipments();
        setMsg({ kind: "ok", text: "Equipamento excluído." });
      } catch (e) {
        setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao excluir equipamento." });
      } finally {
        setCatalogSaving(false);
      }
    },
    [canEdit, catalogEquipments, readOnly, reloadCatalogEquipments],
  );

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

    const digits = digitsOnly(clientData.documento);
    if (digits && digits.length !== 11 && digits.length !== 14) {
      setMsg({ kind: "err", text: "Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)." });
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const created = await createClient(viewDataToCreatePayload(clientData));
        navigate(`/app/clients/${created.id}`, { replace: true });
      } else {
        const updated = await updateClient(idNum, viewDataToUpdatePayload(clientData));
        const view = clientOutToViewData(updated);
        setClientData(view);
        savedClientSnapshotRef.current = serializeClientFormSnapshot(view);
        setAddressPersisted(clientHasPersistedAddressFromView(view));
        toast.success("Alterações salvas com sucesso!");
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
        <p className={styles.msgErr}>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.heroLeft}>
          <span className={styles.heroIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            </svg>
          </span>
          <div>
            <h1 className={styles.title}>{isNew ? "Novo cliente" : "Editar cliente"}</h1>
            <p className={styles.lead}>
              Cadastro completo para faturamento e operação (CPF/CNPJ, fiscal, endereço e histórico comercial).
            </p>
          </div>
        </div>
      </header>

      {relatedLoading && !isNew ? <p className={styles.loading}>Carregando equipamentos, OS e orçamentos…</p> : null}
      {relatedErr ? <p className={styles.msgErr}>{relatedErr}</p> : null}
      {cepErr ? <p className={styles.msgErr}>{cepErr}</p> : null}
      {cnpjLookupErr ? <p className={styles.msgErr}>{cnpjLookupErr}</p> : null}

      {!isNew && clientData.type === "pj" && addressPersisted && canEdit ? (
        <p className={styles.cepHint}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={cnpjIncludeAddress}
              onChange={(e) => setCnpjIncludeAddress(e.target.checked)}
            />
            Ao consultar CNPJ, atualizar também o endereço da Receita
          </label>
        </p>
      ) : null}

      <ToastHost />

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
                onDeactivate={readOnly ? undefined : (id) => void onDeactivateCatalogEquipment(id)}
                onDelete={readOnly ? undefined : (id) => void onDeleteCatalogEquipment(id)}
                onDownloadManual={(id) => onDownloadEquipmentManual(id)}
              />
            )
          }
          history={history}
          orders={isNew ? [] : orders}
          budgets={isNew ? [] : budgets}
          pmocData={showPmocTab ? pmocData : { status: "sem_contrato" }}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClientChange={handleClientChange}
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
          sitesPanel={
            !isNew && Number.isFinite(idNum) ? (
              <ClientSitesPanel
                clientId={idNum}
                readOnly={readOnly}
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
              />
            )
          }
        />

        {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}
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
