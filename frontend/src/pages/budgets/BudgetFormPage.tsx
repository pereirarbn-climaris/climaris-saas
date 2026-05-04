import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useMatch, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { createBudget, fetchBudgetPdfBlob, getBudget, type BudgetOut } from "../../api/budgets";
import { listClients, type ClientOut } from "../../api/clients";
import { listProducts, type ProductOut } from "../../api/products";
import { listServices, type ServiceOut } from "../../api/services";
import { sortByNameAsc } from "../../lib/localeSort";
import type { DashboardOutletContext } from "../dashboardContext";
import loginStyles from "../LoginPage.module.css";
import styles from "./BudgetFormPage.module.css";

type SelectedService = { service_id: number; quantity: number };
type SelectedProduct = { product_id: number; quantity: number };

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function BudgetFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = useMatch({ path: "/app/budgets/new", end: true }) != null;
  const { budgetId } = useParams<{ budgetId: string }>();
  const idNum = budgetId ? Number(budgetId) : NaN;
  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  const [clients, setClients] = useState<ClientOut[]>([]);
  const [services, setServices] = useState<ServiceOut[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [budget, setBudget] = useState<BudgetOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [clientId, setClientId] = useState("");
  const [observation, setObservation] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [validityDays, setValidityDays] = useState(7);
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [servicePicker, setServicePicker] = useState("");
  const [productPicker, setProductPicker] = useState("");

  const readOnly = !isNew || !canEdit;
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const clientsSorted = useMemo(() => sortByNameAsc(clients), [clients]);
  const servicesSorted = useMemo(() => sortByNameAsc(services), [services]);
  const productsSorted = useMemo(() => sortByNameAsc(products), [products]);

  const totalServices = useMemo(
    () =>
      selectedServices.reduce((sum, item) => {
        const service = serviceMap.get(item.service_id);
        return sum + Math.max(item.quantity, 1) * Number(service?.price ?? 0);
      }, 0),
    [selectedServices, serviceMap],
  );
  const totalProducts = useMemo(
    () =>
      selectedProducts.reduce((sum, item) => {
        const product = productMap.get(item.product_id);
        return sum + Math.max(item.quantity, 1) * Number(product?.unit_price ?? 0);
      }, 0),
    [selectedProducts, productMap],
  );
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === Number(clientId)),
    [clients, clientId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [nextClients, nextServices, nextProducts] = await Promise.all([
          listClients({ limit: 100 }),
          listServices({ limit: 100 }),
          listProducts({ limit: 100 }),
        ]);
        if (cancelled) return;
        setClients(nextClients);
        setServices(nextServices.filter((s) => s.is_active || !isNew));
        setProducts(nextProducts.filter((p) => p.is_active || !isNew));

        if (!isNew && Number.isFinite(idNum) && idNum > 0) {
          const loaded = await getBudget(idNum);
          if (cancelled) return;
          setBudget(loaded);
          setClientId(String(loaded.client_id));
          setObservation(loaded.observation ?? "");
          setPaymentMethod(loaded.payment_method ?? "");
          setPaymentTerms(loaded.payment_terms ?? "");
          setWarrantyTerms(loaded.warranty_terms ?? "");
          setValidityDays(loaded.validity_days);
          setSelectedServices(loaded.service_items.map((i) => ({ service_id: i.service_id, quantity: i.quantity })));
          setSelectedProducts(loaded.product_items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })));
        }
      } catch (e) {
        if (!cancelled) setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar." });
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (readOnly) return;
    if (!clientId) return setMsg({ kind: "err", text: "Selecione o cliente." });
    if (selectedServices.length === 0) return setMsg({ kind: "err", text: "Adicione pelo menos um serviço." });

    setSaving(true);
    try {
      const created = await createBudget({
        client_id: Number(clientId),
        observation: observation.trim() || null,
        payment_method: paymentMethod.trim() || null,
        payment_terms: paymentTerms.trim() || null,
        warranty_terms: warrantyTerms.trim() || null,
        validity_days: Math.max(validityDays, 1),
        services: selectedServices.map((s) => ({ service_id: s.service_id, quantity: Math.max(s.quantity, 1) })),
        products: selectedProducts.map((p) => ({ product_id: p.product_id, quantity: Math.max(p.quantity, 1) })),
      });
      navigate(`/app/budgets/${created.id}`, { replace: true });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao criar orcamento." });
    } finally {
      setSaving(false);
    }
  }

  async function openPdfPreview() {
    if (!budget) return;
    setPreviewLoading(true);
    setMsg(null);
    try {
      const blob = await fetchBudgetPdfBlob(budget.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao gerar PDF." });
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
    if (w) {
      w.onload = () => w.print();
    }
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
    const email = selectedClient?.email ?? "";
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
  }

  function sendByWhatsApp() {
    if (!budget) return;
    const digits = (selectedClient?.whatsapp || selectedClient?.phone || "").replace(/\D/g, "");
    const text = encodeURIComponent(
      `Olá! Segue o orçamento #${budget.id} para aprovação. Vou te enviar o PDF em anexo.`,
    );
    const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
    window.open(`${base}?text=${text}`, "_blank");
  }

  return (
    <div className={styles.wrap}>
      <Link className={styles.back} to="/app/budgets">
        ← Voltar para orcamentos
      </Link>
      <h1 className={styles.title}>{isNew ? "Novo orcamento" : `Orcamento #${budget?.id ?? ""}`}</h1>
      {loading ? <p className={styles.loading}>Carregando...</p> : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Dados gerais</h2>
          <label className={loginStyles.label} htmlFor="budget-client">
            Cliente
          </label>
          <select
            id="budget-client"
            className={loginStyles.input}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={readOnly}
          >
            <option value="">Selecione...</option>
            {clientsSorted.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.document}
              </option>
            ))}
          </select>

          <label className={loginStyles.label} htmlFor="budget-observation">
            Observação
          </label>
          <textarea
            id="budget-observation"
            className={loginStyles.input}
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            rows={3}
            disabled={readOnly}
            placeholder="Informações importantes para aprovação do cliente."
          />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Financeiro e garantia</h2>
          <label className={loginStyles.label} htmlFor="budget-payment-method">
            Forma de pagamento
          </label>
          <input
            id="budget-payment-method"
            className={loginStyles.input}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            disabled={readOnly}
            placeholder="PIX, boleto, cartao..."
          />
          <label className={loginStyles.label} htmlFor="budget-payment-terms">
            Condicoes de pagamento
          </label>
          <textarea
            id="budget-payment-terms"
            className={loginStyles.input}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            rows={3}
            disabled={readOnly}
          />
          <label className={loginStyles.label} htmlFor="budget-warranty">
            Garantia
          </label>
          <textarea
            id="budget-warranty"
            className={loginStyles.input}
            value={warrantyTerms}
            onChange={(e) => setWarrantyTerms(e.target.value)}
            rows={3}
            disabled={readOnly}
          />
          <label className={loginStyles.label} htmlFor="budget-validity">
            Validade (dias)
          </label>
          <input
            id="budget-validity"
            type="number"
            min={1}
            className={loginStyles.input}
            value={validityDays}
            onChange={(e) => setValidityDays(Math.max(1, Number(e.target.value) || 1))}
            disabled={readOnly}
          />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Serviços</h2>
          {!readOnly ? (
            <div className={styles.rowInline}>
              <select className={loginStyles.input} value={servicePicker} onChange={(e) => setServicePicker(e.target.value)}>
                <option value="">Selecione um serviço</option>
                {servicesSorted.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" className={styles.btnGhost} onClick={addService}>
                Adicionar
              </button>
            </div>
          ) : null}
          {selectedServices.map((item) => (
            <div key={item.service_id} className={styles.rowInline}>
              <span>{serviceMap.get(item.service_id)?.name ?? `Serviço #${item.service_id}`}</span>
              <input
                type="number"
                min={1}
                className={styles.qtyInput}
                value={item.quantity}
                onChange={(e) =>
                  setSelectedServices((prev) =>
                    prev.map((s) => (s.service_id === item.service_id ? { ...s, quantity: Math.max(Number(e.target.value), 1) } : s)),
                  )
                }
                disabled={readOnly}
              />
            </div>
          ))}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Produtos</h2>
          {!readOnly ? (
            <div className={styles.rowInline}>
              <select className={loginStyles.input} value={productPicker} onChange={(e) => setProductPicker(e.target.value)}>
                <option value="">Selecione um produto</option>
                {productsSorted.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" className={styles.btnGhost} onClick={addProduct}>
                Adicionar
              </button>
            </div>
          ) : null}
          {selectedProducts.map((item) => (
            <div key={item.product_id} className={styles.rowInline}>
              <span>{productMap.get(item.product_id)?.name ?? `Produto #${item.product_id}`}</span>
              <input
                type="number"
                min={1}
                className={styles.qtyInput}
                value={item.quantity}
                onChange={(e) =>
                  setSelectedProducts((prev) =>
                    prev.map((p) => (p.product_id === item.product_id ? { ...p, quantity: Math.max(Number(e.target.value), 1) } : p)),
                  )
                }
                disabled={readOnly}
              />
            </div>
          ))}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Resumo</h2>
          <p>Total serviços: {formatCurrency(totalServices)}</p>
          <p>Total produtos: {formatCurrency(totalProducts)}</p>
          <p>
            <strong>Total geral: {formatCurrency(totalServices + totalProducts)}</strong>
          </p>
          {!isNew && budget?.generated_service_order_id ? (
            <p>
              OS gerada: <Link to={`/app/service-orders/${budget.generated_service_order_id}`}>#{budget.generated_service_order_id}</Link>
            </p>
          ) : null}
        </div>

        {isNew ? (
          <div className={styles.actions}>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? "Salvando..." : "Criar orcamento"}
            </button>
          </div>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={() => void openPdfPreview()} disabled={previewLoading}>
              {previewLoading ? "Gerando PDF..." : "Enviar / Visualizar PDF"}
            </button>
          </div>
        )}
      </form>
      {msg?.kind === "ok" ? <p className={styles.msgOk}>{msg.text}</p> : null}
      {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}

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
                  Enviar por email
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
