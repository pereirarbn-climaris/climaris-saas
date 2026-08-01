import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, Navigate, useMatch, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { createBudget, fetchBudgetPdfBlob, getBudget, updateBudget, type BudgetOut, type BudgetStatus } from "../../api/budgets";
import { fetchBudgetTemplateSettings } from "../../api/budgetTemplates";
import { getClient, listClientSites, type ClientOut, type ClientSiteOut } from "../../api/clients";
import { listProducts, type ProductOut } from "../../api/products";
import { listServices, type ServiceOut } from "../../api/services";
import { BudgetPresetPicker } from "../../components/budget/BudgetPresetPicker";
import { ClientPicker } from "../../components/ClientPicker";
import type { BudgetTextPreset } from "../../lib/budgetTextPresets";
import {
  defaultBudgetFormTexts,
  normalizeBrandColor,
  type BudgetTemplateSettings,
} from "../../lib/budgetPdfGenerator";
import { toast } from "../../lib/toast";
import { TABLE_THEME_PROFESSIONAL } from "../../lib/budgetPdfTheme";
import { formatPhoneBr } from "../../lib/clientContactDisplay";
import { sortByNameAsc } from "../../lib/localeSort";
import {
  clientSiteIdForApi,
  clientSiteIdFromApi,
  clientSiteLabel,
  isServiceOrderMatrixSite,
  resolveServiceOrderAddressLabel,
  SERVICE_ORDER_MATRIX_SITE_VALUE,
} from "../../lib/serviceOrderClientSite";
import { getTenantDisplayName } from "../../lib/tenantDisplay";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./BudgetFormPage.module.css";

type SelectedService = { service_id: number; quantity: number };
type SelectedProduct = { product_id: number; quantity: number };

type BudgetFormSnapshot = {
  clientId: string;
  clientSiteId: string;
  scopeText: string;
  observation: string;
  paymentMethod: string;
  paymentTerms: string;
  warrantyTerms: string;
  validityDays: number;
  services: SelectedService[];
  products: SelectedProduct[];
};

function serializeBudgetFormSnapshot(state: BudgetFormSnapshot): string {
  return JSON.stringify({
    clientId: state.clientId,
    clientSiteId: state.clientSiteId,
    scopeText: state.scopeText.trim(),
    observation: state.observation.trim(),
    paymentMethod: state.paymentMethod.trim(),
    paymentTerms: state.paymentTerms.trim(),
    warrantyTerms: state.warrantyTerms.trim(),
    validityDays: state.validityDays,
    services: [...state.services]
      .map((s) => ({ service_id: s.service_id, quantity: Math.max(s.quantity, 1) }))
      .sort((a, b) => a.service_id - b.service_id),
    products: [...state.products]
      .map((p) => ({ product_id: p.product_id, quantity: Math.max(p.quantity, 1) }))
      .sort((a, b) => a.product_id - b.product_id),
  });
}

const PDF_THEME = TABLE_THEME_PROFESSIONAL;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatIssueDate(value: string | Date | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

function formatBudgetCode(id: number, createdAt?: string): string {
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `${String(id).padStart(3, "0")}-${year}`;
}

function statusLabel(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    draft: "Rascunho",
    sent: "Enviado",
    approved: "Aprovado",
    rejected: "Reprovado",
    expired: "Expirado",
  };
  return map[status] ?? status;
}

function statusClass(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    draft: styles.statusDraft,
    sent: styles.statusSent,
    approved: styles.statusApproved,
    rejected: styles.statusRejected,
    expired: styles.statusExpired,
  };
  return map[status] ?? styles.statusDraft;
}

function BudgetHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
      <path d="M8 9h2" />
    </svg>
  );
}

function formatPartyAddress(parts: Array<string | null | undefined>): string {
  const line = parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return line || "—";
}

export function BudgetFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = useMatch({ path: "/app/budgets/new", end: true }) != null;
  const { budgetId } = useParams<{ budgetId: string }>();
  const idNum = budgetId ? Number(budgetId) : NaN;
  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  const [services, setServices] = useState<ServiceOut[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [budget, setBudget] = useState<BudgetOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [baseline, setBaseline] = useState("");

  const [brandColor, setBrandColor] = useState("#0B7FAF");
  const [templateDefaults, setTemplateDefaults] = useState<
    | (Pick<
        BudgetTemplateSettings,
        | "default_warranty_terms"
        | "default_payment_terms"
        | "default_payment_method"
        | "default_scope_text"
        | "default_technical_notes"
        | "default_validity_days"
      > & {
        warranty_presets: BudgetTextPreset[];
        payment_presets: BudgetTextPreset[];
        payment_method_presets: BudgetTextPreset[];
        scope_presets: BudgetTextPreset[];
        technical_presets: BudgetTextPreset[];
      })
    | null
  >(null);

  const [selectedClient, setSelectedClient] = useState<ClientOut | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSites, setClientSites] = useState<ClientSiteOut[]>([]);
  const [clientSiteId, setClientSiteId] = useState(SERVICE_ORDER_MATRIX_SITE_VALUE);
  const [loadingClientSites, setLoadingClientSites] = useState(false);
  const [scopeText, setScopeText] = useState("");
  const [observation, setObservation] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [servicePicker, setServicePicker] = useState("");
  const [productPicker, setProductPicker] = useState("");

  const readOnly = !canEdit || budget?.status === "approved";
  const companyName = ctx ? getTenantDisplayName(ctx.tenant) : "Sua empresa";
  const tenant = ctx?.tenant;

  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const servicesSorted = useMemo(() => sortByNameAsc(services), [services]);
  const productsSorted = useMemo(() => sortByNameAsc(products), [products]);

  const serviceUnitPrice = (serviceId: number, fromBudget?: number) => {
    if (fromBudget != null) return fromBudget;
    return Number(serviceMap.get(serviceId)?.price ?? 0);
  };

  const productUnitPrice = (productId: number, fromBudget?: number) => {
    if (fromBudget != null) return fromBudget;
    const product = productMap.get(productId);
    return Number(product?.unit_price ?? product?.sale_price ?? 0);
  };

  const totalServices = useMemo(
    () =>
      selectedServices.reduce((sum, item) => {
        const budgetItem = budget?.service_items.find((i) => i.service_id === item.service_id);
        const unit = serviceUnitPrice(item.service_id, budgetItem?.unit_price);
        return sum + Math.max(item.quantity, 1) * unit;
      }, 0),
    [selectedServices, budget, serviceMap],
  );

  const totalProducts = useMemo(
    () =>
      selectedProducts.reduce((sum, item) => {
        const budgetItem = budget?.product_items.find((i) => i.product_id === item.product_id);
        const unit = productUnitPrice(item.product_id, budgetItem?.unit_price);
        return sum + Math.max(item.quantity, 1) * unit;
      }, 0),
    [selectedProducts, budget, productMap],
  );

  const grandTotal = totalServices + totalProducts;

  const currentSnapshot = useMemo(
    (): BudgetFormSnapshot => ({
      clientId,
      clientSiteId,
      scopeText,
      observation,
      paymentMethod,
      paymentTerms,
      warrantyTerms,
      validityDays,
      services: selectedServices,
      products: selectedProducts,
    }),
    [
      clientId,
      clientSiteId,
      scopeText,
      observation,
      paymentMethod,
      paymentTerms,
      warrantyTerms,
      validityDays,
      selectedServices,
      selectedProducts,
    ],
  );

  const isDirty = useMemo(() => {
    if (isNew || readOnly || !baseline) return false;
    return serializeBudgetFormSnapshot(currentSnapshot) !== baseline;
  }, [isNew, readOnly, baseline, currentSnapshot]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [nextServices, nextProducts, settings] = await Promise.all([
          listServices({ limit: 100 }),
          listProducts({ limit: 100 }),
          fetchBudgetTemplateSettings().catch(() => null),
        ]);
        if (cancelled) return;
        setServices(nextServices.filter((s) => s.is_active || !isNew));
        setProducts(nextProducts.filter((p) => p.is_active || !isNew));
        if (settings) {
          setBrandColor(normalizeBrandColor(settings.brand_color));
          setTemplateDefaults({
            default_warranty_terms: settings.default_warranty_terms,
            default_payment_terms: settings.default_payment_terms,
            default_payment_method: settings.default_payment_method,
            default_scope_text: settings.default_scope_text,
            default_technical_notes: settings.default_technical_notes,
            default_validity_days: settings.default_validity_days,
            warranty_presets: settings.warranty_presets ?? [],
            payment_presets: settings.payment_presets ?? [],
            payment_method_presets: settings.payment_method_presets ?? [],
            scope_presets: settings.scope_presets ?? [],
            technical_presets: settings.technical_presets ?? [],
          });
        }

        if (!isNew && Number.isFinite(idNum) && idNum > 0) {
          const loaded = await getBudget(idNum);
          if (cancelled) return;
          setBudget(loaded);
          setClientId(String(loaded.client_id));
          setClientSiteId(clientSiteIdFromApi(loaded.client_site_id));
          setScopeText(loaded.scope_text ?? "");
          setObservation(loaded.observation ?? "");
          setPaymentMethod(loaded.payment_method ?? "");
          setPaymentTerms(loaded.payment_terms ?? "");
          setWarrantyTerms(loaded.warranty_terms ?? "");
          setValidityDays(loaded.validity_days);
          const loadedServices = loaded.service_items.map((i) => ({ service_id: i.service_id, quantity: i.quantity }));
          const loadedProducts = loaded.product_items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
          setSelectedServices(loadedServices);
          setSelectedProducts(loadedProducts);
          setBaseline(
            serializeBudgetFormSnapshot({
              clientId: String(loaded.client_id),
              clientSiteId: clientSiteIdFromApi(loaded.client_site_id),
              scopeText: loaded.scope_text ?? "",
              observation: loaded.observation ?? "",
              paymentMethod: loaded.payment_method ?? "",
              paymentTerms: loaded.payment_terms ?? "",
              warrantyTerms: loaded.warranty_terms ?? "",
              validityDays: loaded.validity_days,
              services: loadedServices,
              products: loadedProducts,
            }),
          );
        } else if (settings) {
          const defaults = defaultBudgetFormTexts(settings);
          setPaymentTerms(defaults.paymentTerms);
          setPaymentMethod(defaults.paymentMethod);
          setWarrantyTerms(defaults.warrantyTerms);
          setScopeText(defaults.scopeText);
          setObservation(defaults.observation);
          setValidityDays(defaults.validityDays);
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idNum, isNew]);

  useEffect(() => {
    if (!isNew) return;
    const q = searchParams.get("client_id");
    if (!q) return;
    const cid = Number(q);
    if (!Number.isFinite(cid) || cid < 1) return;
    setClientId(String(cid));
  }, [isNew, searchParams]);

  useEffect(() => {
    const cid = Number(clientId);
    if (!Number.isFinite(cid) || cid < 1) {
      setSelectedClient(null);
      setClientSites([]);
      setClientSiteId(SERVICE_ORDER_MATRIX_SITE_VALUE);
      return;
    }
    let cancelled = false;
    setLoadingClientSites(true);
    void Promise.all([getClient(cid), listClientSites(cid)])
      .then(([client, sites]) => {
        if (cancelled) return;
        setSelectedClient(client);
        setClientSites(sites);
        setClientSiteId((prev) => {
          if (!isServiceOrderMatrixSite(prev) && sites.some((site) => String(site.id) === prev)) {
            return prev;
          }
          return SERVICE_ORDER_MATRIX_SITE_VALUE;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedClient(null);
        setClientSites([]);
        setClientSiteId(SERVICE_ORDER_MATRIX_SITE_VALUE);
      })
      .finally(() => {
        if (!cancelled) setLoadingClientSites(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!ctx) return <Navigate to="/login" replace />;
  if (!isNew && (!budgetId || !Number.isFinite(idNum) || idNum < 1)) return <Navigate to="/app/budgets" replace />;
  if (isNew && !canEdit) return <Navigate to="/app/budgets" replace />;

  function addService() {
    const id = Number(servicePicker);
    if (!id) return;
    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.service_id === id);
      if (existing) return prev.map((s) => (s.service_id === id ? { ...s, quantity: s.quantity + 1 } : s));
      return [...prev, { service_id: id, quantity: 1 }];
    });
    setServicePicker("");
  }

  function addProduct() {
    const id = Number(productPicker);
    if (!id) return;
    setSelectedProducts((prev) => {
      const existing = prev.find((p) => p.product_id === id);
      if (existing) return prev.map((p) => (p.product_id === id ? { ...p, quantity: p.quantity + 1 } : p));
      return [...prev, { product_id: id, quantity: 1 }];
    });
    setProductPicker("");
  }

  function removeService(serviceId: number) {
    setSelectedServices((prev) => prev.filter((s) => s.service_id !== serviceId));
  }

  function removeProduct(productId: number) {
    setSelectedProducts((prev) => prev.filter((p) => p.product_id !== productId));
  }

  function restoreDefaultWarranty() {
    setWarrantyTerms(templateDefaults?.default_warranty_terms ?? "");
  }

  function restoreDefaultPayment() {
    setPaymentTerms(templateDefaults?.default_payment_terms ?? "");
  }

  function restoreDefaultScope() {
    setScopeText(templateDefaults?.default_scope_text ?? "");
  }

  function restoreDefaultObservation() {
    setObservation(templateDefaults?.default_technical_notes ?? "");
  }

  function restoreDefaultPaymentMethod() {
    setPaymentMethod(templateDefaults?.default_payment_method ?? "");
  }

  function buildBudgetPayload() {
    return {
      client_id: Number(clientId),
      client_site_id: clientSiteIdForApi(clientSiteId) ?? null,
      scope_text: scopeText.trim() || null,
      observation: observation.trim() || null,
      payment_method: paymentMethod.trim() || null,
      payment_terms: paymentTerms.trim() || null,
      warranty_terms: warrantyTerms.trim() || null,
      validity_days: Math.max(validityDays, 1),
      services: selectedServices.map((s) => ({ service_id: s.service_id, quantity: Math.max(s.quantity, 1) })),
      products: selectedProducts.map((p) => ({ product_id: p.product_id, quantity: Math.max(p.quantity, 1) })),
    };
  }

  async function saveBudget(): Promise<{ id: number } | null> {
    if (readOnly) return budget ? { id: budget.id } : null;
    if (!clientId) {
      toast.error("Selecione o cliente.");
      return null;
    }
    if (selectedServices.length === 0) {
      toast.error("Adicione pelo menos um serviço.");
      return null;
    }

    const payload = buildBudgetPayload();
    setSaving(true);
    try {
      if (isNew) {
        return await createBudget(payload);
      }
      const updated = await updateBudget(idNum, payload);
      setBudget(updated);
      setBaseline(serializeBudgetFormSnapshot(currentSnapshot));
      return updated;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isNew ? "Erro ao criar orçamento." : "Erro ao salvar orçamento.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const saved = await saveBudget();
    if (!saved) return;
    if (isNew) {
      toast.success("Orçamento criado com sucesso!");
      navigate(`/app/budgets/${saved.id}`, { replace: true });
      return;
    }
    toast.success("Alterações salvas com sucesso!");
  }

  async function openPdfPreview() {
    let budgetId = budget?.id ?? idNum;
    if (!Number.isFinite(budgetId) || budgetId < 1) return;

    setPreviewLoading(true);
    try {
      if (!readOnly && isDirty) {
        const saved = await saveBudget();
        if (!saved) return;
        budgetId = saved.id;
      }

      const blob = await fetchBudgetPdfBlob(budgetId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF.");
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePdfPreview() {
    setPreviewOpen(false);
  }

  function printPreview() {
    if (!previewUrl) return;
    const w = window.open(previewUrl, "_blank", "noopener,noreferrer");
    if (w) w.onload = () => w.print();
  }

  function downloadPreview() {
    if (!previewUrl || !budget) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `orcamento-${budget.id}.pdf`;
    a.click();
  }

  function sendByEmail() {
    if (!budget) return;
    const subject = encodeURIComponent(`Orçamento #${budget.id}`);
    const body = encodeURIComponent(
      `Olá,\n\nSegue orçamento #${budget.id} para sua aprovação.\n\nAnexe o PDF baixado no sistema.\n`,
    );
    window.open(`mailto:${selectedClient?.email ?? ""}?subject=${subject}&body=${body}`, "_blank");
  }

  function sendByWhatsApp() {
    if (!budget) return;
    const digits = (selectedClient?.whatsapp || selectedClient?.phone || "").replace(/\D/g, "");
    const text = encodeURIComponent(`Olá! Segue o orçamento #${budget.id} para aprovação. Vou te enviar o PDF em anexo.`);
    window.open(`${digits ? `https://wa.me/${digits}` : "https://wa.me/"}?text=${text}`, "_blank");
  }

  const selectedClientSite = useMemo(
    () => clientSites.find((site) => String(site.id) === clientSiteId) ?? null,
    [clientSites, clientSiteId],
  );
  const showClientSiteField = Boolean(clientId) && clientSites.length > 0;

  const providerAddress = tenant
    ? formatPartyAddress([
        tenant.address_street,
        tenant.address_number,
        tenant.address_district,
        [tenant.address_city, tenant.address_state].filter(Boolean).join("-"),
      ])
    : "—";

  const clientAddress =
    resolveServiceOrderAddressLabel(selectedClient, selectedClientSite, clientSiteId) ?? "—";

  const tableStyle = { "--budget-brand": normalizeBrandColor(brandColor) } as CSSProperties;

  const budgetCode = formatBudgetCode(budget?.id ?? idNum, budget?.created_at);
  const headerTitle = isNew ? "Novo orçamento" : `Orçamento nº ${budgetCode}`;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <nav className={styles.breadcrumb} aria-label="Navegação">
          <Link className={styles.breadcrumbLink} to="/app/budgets">
            Orçamentos
          </Link>
          <span className={styles.breadcrumbSep} aria-hidden>
            /
          </span>
          <span className={styles.breadcrumbCurrent}>{headerTitle}</span>
        </nav>
        <div className={styles.pageHeaderRow}>
          <div className={styles.pageHeaderMain}>
            <span className={styles.pageHeaderIcon} aria-hidden>
              <BudgetHeaderIcon />
            </span>
            <div className={styles.pageHeaderText}>
              <h1 className={styles.title}>{headerTitle}</h1>
              <p className={styles.lead}>
                Formulário alinhado ao modelo profissional do PDF — escopo, materiais, mão de obra e condições comerciais.
              </p>
            </div>
          </div>
          {!isNew && budget ? (
            <span className={`${styles.statusBadge} ${statusClass(budget.status)}`}>{statusLabel(budget.status)}</span>
          ) : null}
        </div>
      </header>

      {loading ? <p className={styles.loading}>Carregando…</p> : null}
      {readOnly && budget?.status === "approved" ? (
        <p className={styles.readOnlyNotice}>Orçamento aprovado — edição bloqueada. Use o PDF para consulta ou envio.</p>
      ) : null}

      <form id="budget-form-main" className={styles.formColumn} onSubmit={onSubmit} style={tableStyle}>
          <section className={styles.docHeader} aria-label="Cabeçalho do documento">
            <div className={styles.docHeaderTop}>
              <div>
                <p className={styles.partyName}>{companyName}</p>
                <p className={styles.partyMeta}>{tenant?.website?.replace(/^https?:\/\//, "") || "Prestador de serviços"}</p>
              </div>
              <div className={styles.docMeta}>
                <strong>ORÇAMENTO nº {isNew ? "—" : formatBudgetCode(budget?.id ?? idNum, budget?.created_at)}</strong>
                <span>Data de emissão: {formatIssueDate(budget?.created_at)}</span>
              </div>
            </div>
            <hr className={styles.docDivider} />
          </section>

          <section className={styles.section} aria-labelledby="budget-parties">
            <h2 id="budget-parties" className={styles.sectionTitle}>
              {PDF_THEME.partyLabels.client} · {PDF_THEME.partyLabels.provider}
            </h2>
            <div className={styles.partiesGrid}>
              <div className={styles.partyCard}>
                <p className={styles.partyLabel}>{PDF_THEME.partyLabels.client}</p>
                {readOnly ? (
                  <>
                    <p className={styles.partyName}>{selectedClient?.name ?? (clientId ? `Cliente #${clientId}` : "—")}</p>
                    <p className={styles.partyMeta}>CNPJ: {selectedClient?.document || "—"}</p>
                    {showClientSiteField || selectedClientSite ? (
                      <p className={styles.partyMeta}>
                        Filial:{" "}
                        {!isServiceOrderMatrixSite(clientSiteId) && selectedClientSite
                          ? clientSiteLabel(selectedClientSite)
                          : "Matriz (cadastro principal)"}
                      </p>
                    ) : null}
                    <p className={styles.partyMeta}>{clientAddress}</p>
                    <p className={styles.partyMeta}>
                      Email: {selectedClient?.email || "—"}
                      {selectedClient?.phone || selectedClient?.whatsapp
                        ? ` · Tel: ${formatPhoneBr(selectedClient.whatsapp || selectedClient.phone)}`
                        : ""}
                    </p>
                  </>
                ) : clientId && selectedClient ? (
                  <div className={styles.clientChosen}>
                    <div>
                      <p className={styles.partyName}>{selectedClient.name}</p>
                      <p className={styles.partyMeta}>CNPJ: {selectedClient.document || "—"}</p>
                      <p className={styles.partyMeta}>{clientAddress}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => {
                        setClientId("");
                        setClientSiteId(SERVICE_ORDER_MATRIX_SITE_VALUE);
                      }}
                    >
                      Trocar
                    </button>
                  </div>
                ) : clientId ? (
                  <p className={styles.partyMeta}>Carregando cliente…</p>
                ) : (
                  <ClientPicker inputId="budget-client" value={clientId} onChange={setClientId} pinned={selectedClient ?? undefined} />
                )}
                {showClientSiteField ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="budget-client-site">
                      Filial / local
                    </label>
                    <select
                      id="budget-client-site"
                      className={styles.select}
                      value={clientSiteId || SERVICE_ORDER_MATRIX_SITE_VALUE}
                      onChange={(e) => setClientSiteId(e.target.value)}
                      disabled={readOnly || loadingClientSites}
                    >
                      <option value={SERVICE_ORDER_MATRIX_SITE_VALUE}>Matriz (cadastro principal)</option>
                      {clientSites.map((site) => (
                        <option key={site.id} value={String(site.id)}>
                          {clientSiteLabel(site)}
                        </option>
                      ))}
                    </select>
                    {!isServiceOrderMatrixSite(clientSiteId) && selectedClientSite ? (
                      <p className={styles.fieldHint}>
                        Endereço da filial: {clientAddress}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className={styles.partyCard}>
                <p className={styles.partyLabel}>{PDF_THEME.partyLabels.provider}</p>
                <p className={styles.partyName}>{companyName}</p>
                <p className={styles.partyMeta}>CNPJ: {tenant?.cnpj || "—"}</p>
                <p className={styles.partyMeta}>{providerAddress}</p>
                <p className={styles.partyMeta}>
                  Email: {tenant?.email || "—"}
                  {tenant?.phone ? ` · Tel: ${formatPhoneBr(tenant.phone)}` : ""}
                </p>
              </div>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="budget-scope">
            <h2 id="budget-scope" className={styles.sectionTitle}>
              {PDF_THEME.sections.scope}
            </h2>
            <p className={styles.sectionHint}>
              Um item por linha — cada linha vira um marcador na seção 1 do PDF. Se deixar em branco, o escopo é
              montado automaticamente a partir dos serviços adicionados.
            </p>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="budget-scope-text">
                Escopo técnico
              </label>
              {!readOnly ? (
                <BudgetPresetPicker
                  id="budget-scope-preset"
                  label="Modelos salvos"
                  presets={templateDefaults?.scope_presets ?? []}
                  onApply={setScopeText}
                />
              ) : null}
              <textarea
                id="budget-scope-text"
                className={styles.textarea}
                value={scopeText}
                onChange={(e) => setScopeText(e.target.value)}
                rows={6}
                disabled={readOnly}
                placeholder={
                  templateDefaults?.default_scope_text?.trim() ||
                  "Desmontagem e higienização do equipamento;\nTeste de estanqueidade e vazão;"
                }
              />
              {!scopeText.trim() && templateDefaults?.default_scope_text?.trim() ? (
                <p className={styles.fieldHint}>Padrão no PDF: {templateDefaults.default_scope_text.trim()}</p>
              ) : null}
              {!readOnly && templateDefaults?.default_scope_text ? (
                <div className={styles.fieldActions}>
                  <button type="button" className={styles.defaultLink} onClick={restoreDefaultScope}>
                    Usar texto padrão
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="budget-products">
            <h2 id="budget-products" className={styles.sectionTitle}>
              {PDF_THEME.sections.products}
            </h2>
            {!readOnly ? (
              <div className={styles.addRow}>
                <select className={styles.select} value={productPicker} onChange={(e) => setProductPicker(e.target.value)}>
                  <option value="">Selecione um produto / insumo</option>
                  {productsSorted.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatCurrency(Number(p.unit_price ?? p.sale_price ?? 0))}
                    </option>
                  ))}
                </select>
                <button type="button" className={styles.btnGhost} onClick={addProduct}>
                  Adicionar
                </button>
              </div>
            ) : null}
            {selectedProducts.length === 0 ? (
              <p className={styles.emptyTable}>Nenhum produto adicionado (opcional).</p>
            ) : (
              <div className={styles.itemsTableWrap}>
                <table className={styles.itemsTable}>
                  <thead>
                    <tr>
                      <th>{PDF_THEME.sections.productsHeader}</th>
                      <th>Qtd.</th>
                      <th>Unidade</th>
                      <th>Preço unit.</th>
                      <th>Subtotal</th>
                      {!readOnly ? <th aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProducts.map((item) => {
                      const budgetItem = budget?.product_items.find((i) => i.product_id === item.product_id);
                      const unit = productUnitPrice(item.product_id, budgetItem?.unit_price);
                      const qty = Math.max(item.quantity, 1);
                      return (
                        <tr key={item.product_id}>
                          <td>{productMap.get(item.product_id)?.name ?? `Produto #${item.product_id}`}</td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              className={styles.qtyInput}
                              value={item.quantity}
                              onChange={(e) =>
                                setSelectedProducts((prev) =>
                                  prev.map((p) =>
                                    p.product_id === item.product_id
                                      ? { ...p, quantity: Math.max(Number(e.target.value), 1) }
                                      : p,
                                  ),
                                )
                              }
                              disabled={readOnly}
                            />
                          </td>
                          <td>un.</td>
                          <td>{formatCurrency(unit)}</td>
                          <td>{formatCurrency(unit * qty)}</td>
                          {!readOnly ? (
                            <td>
                              <button type="button" className={styles.btnGhost} onClick={() => removeProduct(item.product_id)}>
                                Remover
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section} aria-labelledby="budget-services">
            <h2 id="budget-services" className={styles.sectionTitle}>
              {PDF_THEME.sections.services}
            </h2>
            {!readOnly ? (
              <div className={styles.addRow}>
                <select className={styles.select} value={servicePicker} onChange={(e) => setServicePicker(e.target.value)}>
                  <option value="">Selecione um serviço técnico</option>
                  {servicesSorted.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {formatCurrency(Number(s.price ?? 0))}
                    </option>
                  ))}
                </select>
                <button type="button" className={styles.btnGhost} onClick={addService}>
                  Adicionar
                </button>
              </div>
            ) : null}
            {selectedServices.length === 0 ? (
              <p className={styles.emptyTable}>Adicione pelo menos um serviço de mão de obra.</p>
            ) : (
              <div className={styles.itemsTableWrap}>
                <table className={styles.itemsTable}>
                  <thead>
                    <tr>
                      <th>{PDF_THEME.sections.servicesHeader}</th>
                      <th>Qtd.</th>
                      <th>Unidade</th>
                      <th>Preço unit.</th>
                      <th>Subtotal</th>
                      {!readOnly ? <th aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedServices.map((item) => {
                      const budgetItem = budget?.service_items.find((i) => i.service_id === item.service_id);
                      const unit = serviceUnitPrice(item.service_id, budgetItem?.unit_price);
                      const qty = Math.max(item.quantity, 1);
                      return (
                        <tr key={item.service_id}>
                          <td>{serviceMap.get(item.service_id)?.name ?? `Serviço #${item.service_id}`}</td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              className={styles.qtyInput}
                              value={item.quantity}
                              onChange={(e) =>
                                setSelectedServices((prev) =>
                                  prev.map((s) =>
                                    s.service_id === item.service_id
                                      ? { ...s, quantity: Math.max(Number(e.target.value), 1) }
                                      : s,
                                  ),
                                )
                              }
                              disabled={readOnly}
                            />
                          </td>
                          <td>un.</td>
                          <td>{formatCurrency(unit)}</td>
                          <td>{formatCurrency(unit * qty)}</td>
                          {!readOnly ? (
                            <td>
                              <button type="button" className={styles.btnGhost} onClick={() => removeService(item.service_id)}>
                                Remover
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section} aria-label="Totais">
            <div className={styles.totalsBlock}>
              {selectedProducts.length > 0 ? (
                <p>
                  {PDF_THEME.subtotalLabels.products}: <strong>{formatCurrency(totalProducts)}</strong>
                </p>
              ) : null}
              {selectedServices.length > 0 ? (
                <p>
                  {PDF_THEME.subtotalLabels.services}: <strong>{formatCurrency(totalServices)}</strong>
                </p>
              ) : null}
              <p className={styles.totalGrand}>
                {PDF_THEME.subtotalLabels.total}: {formatCurrency(grandTotal)}
              </p>
            </div>
            {!isNew && budget?.generated_service_order_id ? (
              <p className={styles.partyMeta}>
                OS gerada:{" "}
                <Link to={`/app/service-orders/${budget.generated_service_order_id}`}>#{budget.generated_service_order_id}</Link>
              </p>
            ) : null}
          </section>

          <section className={styles.section} aria-labelledby="budget-conditions">
            <h2 id="budget-conditions" className={styles.sectionTitle}>
              {PDF_THEME.sections.conditions}
            </h2>
            <p className={styles.sectionHint}>
              Campos em branco usam os padrões salvos em Administração → Modelos de orçamento.
            </p>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="budget-validity">
                Validade da proposta (dias)
              </label>
              <input
                id="budget-validity"
                type="number"
                min={1}
                className={styles.input}
                value={validityDays}
                onChange={(e) => setValidityDays(Math.max(1, Number(e.target.value) || 1))}
                disabled={readOnly}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="budget-warranty">
                Garantia técnica
              </label>
              {!readOnly ? (
                <BudgetPresetPicker
                  id="budget-warranty-preset"
                  label="Modelos salvos"
                  presets={templateDefaults?.warranty_presets ?? []}
                  onApply={setWarrantyTerms}
                />
              ) : null}
              <textarea
                id="budget-warranty"
                className={styles.textarea}
                value={warrantyTerms}
                onChange={(e) => setWarrantyTerms(e.target.value)}
                rows={3}
                disabled={readOnly}
                placeholder={
                  templateDefaults?.default_warranty_terms?.trim() ||
                  "Ex.: 90 dias sobre a eficácia da higienização e peças aplicadas."
                }
              />
              {!warrantyTerms.trim() && templateDefaults?.default_warranty_terms?.trim() ? (
                <p className={styles.fieldHint}>Padrão no PDF: {templateDefaults.default_warranty_terms.trim()}</p>
              ) : null}
              {!readOnly && templateDefaults?.default_warranty_terms ? (
                <div className={styles.fieldActions}>
                  <button type="button" className={styles.defaultLink} onClick={restoreDefaultWarranty}>
                    Usar texto padrão
                  </button>
                </div>
              ) : null}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="budget-payment-method">
                Forma de pagamento
              </label>
              {!readOnly ? (
                <BudgetPresetPicker
                  id="budget-payment-method-preset"
                  label="Modelos salvos"
                  presets={templateDefaults?.payment_method_presets ?? []}
                  onApply={setPaymentMethod}
                />
              ) : null}
              <input
                id="budget-payment-method"
                className={styles.input}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                disabled={readOnly}
                placeholder={templateDefaults?.default_payment_method?.trim() || "PIX, boleto, cartão, NFSe…"}
              />
              {!paymentMethod.trim() && templateDefaults?.default_payment_method?.trim() ? (
                <p className={styles.fieldHint}>Padrão no PDF: {templateDefaults.default_payment_method.trim()}</p>
              ) : null}
              {!readOnly && templateDefaults?.default_payment_method ? (
                <div className={styles.fieldActions}>
                  <button type="button" className={styles.defaultLink} onClick={restoreDefaultPaymentMethod}>
                    Usar texto padrão
                  </button>
                </div>
              ) : null}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="budget-payment-terms">
                Condições de pagamento
              </label>
              {!readOnly ? (
                <BudgetPresetPicker
                  id="budget-payment-preset"
                  label="Modelos salvos"
                  presets={templateDefaults?.payment_presets ?? []}
                  onApply={setPaymentTerms}
                />
              ) : null}
              <textarea
                id="budget-payment-terms"
                className={styles.textarea}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                rows={3}
                disabled={readOnly}
                placeholder={
                  templateDefaults?.default_payment_terms?.trim() || "Ex.: 50% na aprovação e 50% na conclusão."
                }
              />
              {!paymentTerms.trim() && templateDefaults?.default_payment_terms?.trim() ? (
                <p className={styles.fieldHint}>Padrão no PDF: {templateDefaults.default_payment_terms.trim()}</p>
              ) : null}
              {!readOnly && templateDefaults?.default_payment_terms ? (
                <div className={styles.fieldActions}>
                  <button type="button" className={styles.defaultLink} onClick={restoreDefaultPayment}>
                    Usar texto padrão
                  </button>
                </div>
              ) : null}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="budget-observations">
                Observações
              </label>
              {!readOnly ? (
                <BudgetPresetPicker
                  id="budget-observations-preset"
                  label="Modelos salvos"
                  presets={templateDefaults?.technical_presets ?? []}
                  onApply={setObservation}
                />
              ) : null}
              <textarea
                id="budget-observations"
                className={styles.textarea}
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                rows={3}
                disabled={readOnly}
                placeholder={
                  templateDefaults?.default_technical_notes?.trim() ||
                  "Ex.: Prazo de execução sujeito à disponibilidade de peças."
                }
              />
              {!observation.trim() && templateDefaults?.default_technical_notes?.trim() ? (
                <p className={styles.fieldHint}>Padrão no PDF: {templateDefaults.default_technical_notes.trim()}</p>
              ) : null}
              {!readOnly && templateDefaults?.default_technical_notes ? (
                <div className={styles.fieldActions}>
                  <button type="button" className={styles.defaultLink} onClick={restoreDefaultObservation}>
                    Usar texto padrão
                  </button>
                </div>
              ) : null}
            </div>
          </section>

        </form>

      <div className={styles.actionBar} role="toolbar" aria-label="Ações do orçamento">
        <div className={styles.actionBarInner}>
          <Link className={styles.btnBackLink} to="/app/budgets">
            Voltar
          </Link>
          {!isNew ? (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => void openPdfPreview()}
              disabled={previewLoading || saving}
            >
              {previewLoading ? (saving ? "Salvando e gerando PDF…" : "Gerando PDF…") : "Visualizar / baixar PDF"}
            </button>
          ) : null}
          {!readOnly && (isNew || isDirty) ? (
            <button
              type="submit"
              form="budget-form-main"
              className={styles.btnPrimary}
              disabled={saving || previewLoading}
            >
              {saving ? "Salvando…" : isNew ? "Criar orçamento" : "Salvar alterações"}
            </button>
          ) : null}
          {readOnly ? <p className={styles.readOnlyHint}>Visualização somente leitura.</p> : null}
        </div>
      </div>

      {previewOpen ? (
        <div className={styles.previewBackdrop} role="dialog" aria-modal="true" aria-label="Visualizador de orçamento em PDF">
          <div className={styles.previewModal}>
            <div className={styles.previewToolbar}>
              <strong>Orçamento em PDF</strong>
              <div className={styles.previewActions}>
                <button type="button" className={styles.btnGhost} onClick={printPreview}>
                  Imprimir
                </button>
                <button type="button" className={styles.btnGhost} onClick={downloadPreview}>
                  Salvar PDF
                </button>
                <button type="button" className={styles.btnGhost} onClick={sendByEmail}>
                  Enviar por e-mail
                </button>
                <button type="button" className={styles.btnGhost} onClick={sendByWhatsApp}>
                  Enviar por WhatsApp
                </button>
                <button type="button" className={styles.btnGhost} onClick={closePdfPreview}>
                  Fechar
                </button>
              </div>
            </div>
            {previewUrl ? <iframe title="Pré-visualização do PDF" src={previewUrl} className={styles.previewFrame} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
