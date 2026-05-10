import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useMatch, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  createService,
  deleteService,
  getService,
  updateService,
  type ServiceCreatePayload,
  type ServiceUpdatePayload,
} from "../../api/services";
import { listProducts, type ProductOut } from "../../api/products";
import { getAiSettings } from "../../api/ai";
import { formatBrlDisplay, formatBrlInputFromDigits, numberToBrlInput, parseBrlInputToNumber } from "../../lib/currencyBrInput";
import type { DashboardOutletContext } from "../dashboardContext";
import loginStyles from "../LoginPage.module.css";
import styles from "./ServiceFormPage.module.css";

type ServiceFormTab = "descricao" | "produtos" | "ia" | "fiscal";

type FormState = {
  name: string;
  description: string;
  price: string;
  duration_minutes: string;
  equipment_type_tags: string;
  btu_min: string;
  btu_max: string;
  service_category: string;
  applies_residential: boolean;
  applies_commercial: boolean;
  is_active: boolean;
  nfse_codigo_tributacao_nacional: string;
  nfse_codigo_nbs: string;
  /** "" | "6" | "12" — enviado como periodicidade_meses ou null */
  periodicidade_meses: string;
  product_inputs: Array<{ product_id: string; quantity: string }>;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    price: numberToBrlInput(0),
    duration_minutes: "30",
    equipment_type_tags: "",
    btu_min: "",
    btu_max: "",
    service_category: "",
    applies_residential: true,
    applies_commercial: true,
    is_active: true,
    nfse_codigo_tributacao_nacional: "",
    nfse_codigo_nbs: "",
    periodicidade_meses: "",
    product_inputs: [],
  };
}

export function ServiceFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const isNew = useMatch({ path: "/app/services/new", end: true }) != null;
  const { serviceId } = useParams<{ serviceId: string }>();
  const idNum = serviceId ? Number(serviceId) : NaN;

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const canDelete = ctx?.user.role === "admin";
  const readOnly = !canEdit;

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [productsLoadErr, setProductsLoadErr] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<ServiceFormTab>("descricao");

  const parsedPrice = useMemo(() => parseBrlInputToNumber(form.price), [form.price]);
  const parsedDuration = useMemo(() => Number(form.duration_minutes), [form.duration_minutes]);
  const estimatedMaterialCost = useMemo(
    () =>
      form.product_inputs.reduce((acc, input) => {
        const pid = Number(input.product_id);
        const qty = Number(input.quantity);
        if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(qty) || qty <= 0) return acc;
        const product = products.find((p) => p.id === pid);
        if (!product) return acc;
        return acc + Number(product.purchase_price || 0) * qty;
      }, 0),
    [form.product_inputs, products],
  );
  const estimatedProfit = useMemo(() => parsedPrice - estimatedMaterialCost, [parsedPrice, estimatedMaterialCost]);

  const periodicidadeApi = useMemo((): 6 | 12 | null => {
    if (form.periodicidade_meses === "6") return 6;
    if (form.periodicidade_meses === "12") return 12;
    return null;
  }, [form.periodicidade_meses]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listProducts({ limit: 100 });
        if (!cancelled) {
          setProducts(list);
          setProductsLoadErr("");
        }
      } catch (e) {
        if (!cancelled) {
          setProducts([]);
          setProductsLoadErr(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar produtos. Verifique se as migrações recentes foram aplicadas na API.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await getAiSettings();
        if (!cancelled) setAiEnabled(Boolean(settings?.is_enabled));
      } catch {
        if (!cancelled) setAiEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!aiEnabled && activeTab === "ia") {
      setActiveTab("descricao");
    }
  }, [aiEnabled, activeTab]);

  useEffect(() => {
    if (isNew || !serviceId || !Number.isFinite(idNum) || idNum < 1) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadErr("");
      try {
        const s = await getService(idNum);
        if (!cancelled) {
          setForm({
            name: s.name,
            description: s.description ?? "",
            price: numberToBrlInput(Number(s.price || 0)),
            duration_minutes: String(Number(s.duration_minutes || 30)),
            equipment_type_tags: s.equipment_type_tags ?? "",
            btu_min: s.btu_min != null ? String(s.btu_min) : "",
            btu_max: s.btu_max != null ? String(s.btu_max) : "",
            service_category: s.service_category ?? "",
            applies_residential: s.applies_residential ?? true,
            applies_commercial: s.applies_commercial ?? true,
            is_active: s.is_active,
            nfse_codigo_tributacao_nacional: s.nfse_codigo_tributacao_nacional ?? "",
            nfse_codigo_nbs: s.nfse_codigo_nbs ?? "",
            periodicidade_meses:
              s.periodicidade_meses === 6 || s.periodicidade_meses === 12 ? String(s.periodicidade_meses) : "",
            product_inputs: (s.product_inputs ?? []).map((i) => ({
              product_id: String(i.product_id),
              quantity: String(i.quantity),
            })),
          });
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, serviceId, idNum]);

  if (!ctx) return <Navigate to="/login" replace />;
  if (isNew && !canEdit) return <Navigate to="/app/services" replace />;
  if (!isNew && (!serviceId || !Number.isFinite(idNum) || idNum < 1)) return <Navigate to="/app/services" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (readOnly) return;

    if (!form.name.trim()) {
      setActiveTab("descricao");
      setMsg({ kind: "err", text: "Informe o nome do serviço." });
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setActiveTab("descricao");
      setMsg({ kind: "err", text: "Informe um preco valido (maior ou igual a zero)." });
      return;
    }
    if (!Number.isFinite(parsedDuration) || parsedDuration < 1) {
      setActiveTab("descricao");
      setMsg({ kind: "err", text: "Informe o tempo de execucao em minutos (minimo 1)." });
      return;
    }
    const parsedBtuMin = form.btu_min.trim() ? Number(form.btu_min) : null;
    const parsedBtuMax = form.btu_max.trim() ? Number(form.btu_max) : null;
    if (parsedBtuMin != null && (!Number.isFinite(parsedBtuMin) || parsedBtuMin < 0)) {
      if (aiEnabled) setActiveTab("ia");
      setMsg({ kind: "err", text: "BTU mínimo inválido." });
      return;
    }
    if (parsedBtuMax != null && (!Number.isFinite(parsedBtuMax) || parsedBtuMax < 0)) {
      if (aiEnabled) setActiveTab("ia");
      setMsg({ kind: "err", text: "BTU máximo inválido." });
      return;
    }
    if (parsedBtuMin != null && parsedBtuMax != null && parsedBtuMin > parsedBtuMax) {
      if (aiEnabled) setActiveTab("ia");
      setMsg({ kind: "err", text: "BTU mínimo não pode ser maior que BTU máximo." });
      return;
    }

    setSaving(true);
    try {
      const productInputs = form.product_inputs
        .map((row) => ({
          product_id: Number(row.product_id),
          quantity: Number(row.quantity),
        }))
        .filter((row) => Number.isFinite(row.product_id) && row.product_id > 0 && Number.isFinite(row.quantity) && row.quantity > 0);
      if (isNew) {
        const payload: ServiceCreatePayload = {
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: parsedPrice,
          duration_minutes: parsedDuration,
          equipment_type_tags: form.equipment_type_tags.trim() || null,
          btu_min: parsedBtuMin,
          btu_max: parsedBtuMax,
          service_category: form.service_category.trim() || null,
          applies_residential: form.applies_residential,
          applies_commercial: form.applies_commercial,
          is_active: form.is_active,
          nfse_codigo_tributacao_nacional: form.nfse_codigo_tributacao_nacional.trim() || null,
          nfse_codigo_nbs: form.nfse_codigo_nbs.trim() || null,
          periodicidade_meses: periodicidadeApi,
          product_inputs: productInputs,
        };
        const created = await createService(payload);
        navigate(`/app/services/${created.id}`, { replace: true });
      } else {
        const payload: ServiceUpdatePayload = {
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: parsedPrice,
          duration_minutes: parsedDuration,
          equipment_type_tags: form.equipment_type_tags.trim() || null,
          btu_min: parsedBtuMin,
          btu_max: parsedBtuMax,
          service_category: form.service_category.trim() || null,
          applies_residential: form.applies_residential,
          applies_commercial: form.applies_commercial,
          is_active: form.is_active,
          nfse_codigo_tributacao_nacional: form.nfse_codigo_tributacao_nacional.trim() || null,
          nfse_codigo_nbs: form.nfse_codigo_nbs.trim() || null,
          periodicidade_meses: periodicidadeApi,
          product_inputs: productInputs,
        };
        await updateService(idNum, payload);
        setMsg({ kind: "ok", text: "Serviço atualizado." });
      }
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function onDuplicate() {
    setMsg(null);
    if (readOnly || isNew) return;

    if (!form.name.trim()) {
      setMsg({ kind: "err", text: "Informe o nome do serviço para duplicar." });
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setMsg({ kind: "err", text: "Informe um preco valido (maior ou igual a zero)." });
      return;
    }
    if (!Number.isFinite(parsedDuration) || parsedDuration < 1) {
      setMsg({ kind: "err", text: "Informe o tempo de execucao em minutos (minimo 1)." });
      return;
    }
    const parsedBtuMin = form.btu_min.trim() ? Number(form.btu_min) : null;
    const parsedBtuMax = form.btu_max.trim() ? Number(form.btu_max) : null;

    const productInputs = form.product_inputs
      .map((row) => ({
        product_id: Number(row.product_id),
        quantity: Number(row.quantity),
      }))
      .filter((row) => Number.isFinite(row.product_id) && row.product_id > 0 && Number.isFinite(row.quantity) && row.quantity > 0);

    setDuplicating(true);
    try {
      let name = `${form.name.trim()} (cópia)`;
      try {
        const created = await createService({
          name,
          description: form.description.trim() || null,
          price: parsedPrice,
          duration_minutes: parsedDuration,
          equipment_type_tags: form.equipment_type_tags.trim() || null,
          btu_min: parsedBtuMin,
          btu_max: parsedBtuMax,
          service_category: form.service_category.trim() || null,
          applies_residential: form.applies_residential,
          applies_commercial: form.applies_commercial,
          is_active: form.is_active,
          nfse_codigo_tributacao_nacional: form.nfse_codigo_tributacao_nacional.trim() || null,
          nfse_codigo_nbs: form.nfse_codigo_nbs.trim() || null,
          periodicidade_meses: periodicidadeApi,
          product_inputs: productInputs,
        });
        navigate(`/app/services/${created.id}`);
      } catch (e1) {
        const msg = e1 instanceof Error ? e1.message : "";
        if (msg.toLowerCase().includes("already") || msg.includes("Já existe") || msg.includes("409")) {
          name = `${form.name.trim()} (cópia ${Date.now().toString(36)})`;
          const created = await createService({
            name,
            description: form.description.trim() || null,
            price: parsedPrice,
            duration_minutes: parsedDuration,
            equipment_type_tags: form.equipment_type_tags.trim() || null,
            btu_min: parsedBtuMin,
            btu_max: parsedBtuMax,
            service_category: form.service_category.trim() || null,
            applies_residential: form.applies_residential,
            applies_commercial: form.applies_commercial,
            is_active: form.is_active,
            nfse_codigo_tributacao_nacional: form.nfse_codigo_tributacao_nacional.trim() || null,
            nfse_codigo_nbs: form.nfse_codigo_nbs.trim() || null,
            periodicidade_meses: periodicidadeApi,
            product_inputs: productInputs,
          });
          navigate(`/app/services/${created.id}`);
        } else {
          throw e1;
        }
      }
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao duplicar." });
    } finally {
      setDuplicating(false);
    }
  }

  async function onDelete() {
    if (!canDelete || isNew || !window.confirm("Excluir este serviço permanentemente? Esta ação não pode ser desfeita.")) {
      return;
    }
    setDeleting(true);
    setMsg(null);
    try {
      await deleteService(idNum);
      navigate("/app/services", { replace: true });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao excluir." });
    } finally {
      setDeleting(false);
    }
  }

  if (!isNew && loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando servico...</p>
      </div>
    );
  }

  if (!isNew && loadErr) {
    return (
      <div className={styles.wrap}>
        <header className={styles.hero}>
          <div className={styles.heroLeft}>
            <span className={styles.heroIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </span>
            <div>
              <h1 className={styles.title}>Erro ao carregar</h1>
              <p className={styles.lead}>{loadErr}</p>
            </div>
          </div>
        </header>
        <Link className={styles.btnBackLink} to="/app/services">
          ← Voltar a lista
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.heroLeft}>
          <span className={styles.heroIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </span>
          <div>
            <h1 className={styles.title}>{isNew ? "Novo servico" : "Editar servico"}</h1>
            <p className={styles.lead}>
              O tempo de execucao em minutos sera usado no agendamento. Voce tambem pode cadastrar produtos consumidos para estimar o lucro real.
            </p>
          </div>
        </div>
      </header>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.tabs} role="tablist" aria-label="Seções do serviço">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "descricao"}
            className={`${styles.tabBtn} ${activeTab === "descricao" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("descricao")}
          >
            Descrição do serviço
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "produtos"}
            className={`${styles.tabBtn} ${activeTab === "produtos" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("produtos")}
          >
            Produtos utilizados
          </button>
          {aiEnabled ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "ia"}
              className={`${styles.tabBtn} ${activeTab === "ia" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("ia")}
            >
              IA
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "fiscal"}
            className={`${styles.tabBtn} ${activeTab === "fiscal" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("fiscal")}
          >
            Fiscal
          </button>
        </div>

        {activeTab === "descricao" ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Dados do servico</h2>
            <label className={loginStyles.label} htmlFor="s-name">
              Nome
            </label>
            <input
              id="s-name"
              className={loginStyles.input}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              disabled={readOnly}
            />

            <label className={loginStyles.label} htmlFor="s-desc">
              Descricao (opcional)
            </label>
            <textarea
              id="s-desc"
              className={loginStyles.input}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={4}
              disabled={readOnly}
            />

            <div className={styles.grid2}>
              <div>
                <label className={loginStyles.label} htmlFor="s-duration">
                  Tempo de execucao (min)
                </label>
                <input
                  id="s-duration"
                  className={loginStyles.input}
                  value={form.duration_minutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                  inputMode="numeric"
                  required
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="s-price">
                  Preco (R$)
                </label>
                <input
                  id="s-price"
                  className={loginStyles.input}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.price}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      price: formatBrlInputFromDigits(e.target.value),
                    }))
                  }
                  placeholder="R$ 0,00"
                  required
                  disabled={readOnly}
                />
              </div>
            </div>

            <h2 className={styles.sectionTitle}>Manutenção preventiva</h2>
            <p className={styles.sectionHint}>
              Define a cada quantos meses este tipo de serviço deve ser refeito para alertas na Gestão preventiva (com histórico de realização por
              cliente).
            </p>
            <label className={loginStyles.label} htmlFor="s-periodicidade">
              Periodicidade de revisão
            </label>
            <select
              id="s-periodicidade"
              className={loginStyles.input}
              value={form.periodicidade_meses}
              onChange={(e) => setForm((prev) => ({ ...prev, periodicidade_meses: e.target.value }))}
              disabled={readOnly}
            >
              <option value="">Não rastrear</option>
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
            </select>
          </div>
        ) : null}

        {activeTab === "produtos" ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Produtos utilizados (opcional)</h2>
            {productsLoadErr ? <p className={styles.msgErr}>{productsLoadErr}</p> : null}
            <div className={styles.productInputsCard}>
              <div className={styles.productInputsToolbar}>
                <span className={styles.productInputsToolbarLabel}>Materiais do serviço</span>
                {canEdit ? (
                  <button
                    type="button"
                    className={styles.iconAddBtn}
                    title="Adicionar produto"
                    aria-label="Adicionar produto"
                    disabled={readOnly}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        product_inputs: [...prev.product_inputs, { product_id: "", quantity: "1" }],
                      }))
                    }
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : null}
              </div>
              {form.product_inputs.length === 0 ? (
                <p className={styles.productInputsEmpty}>Nenhum produto vinculado. Use o botão + para incluir.</p>
              ) : (
                <>
                  <div
                    className={`${styles.productInputsHead} ${canEdit ? styles.productInputsHeadWithActions : styles.productInputsHeadNoActions}`}
                  >
                    <span>Produto</span>
                    <span className={styles.productInputsHeadQty}>Quantidade</span>
                    {canEdit ? <span className={styles.productInputsHeadAct} aria-hidden /> : null}
                  </div>
                  <ul className={styles.productInputsList}>
                    {form.product_inputs.map((row, idx) => (
                      <li
                        key={`${idx}-${row.product_id}`}
                        className={`${styles.productInputsRow} ${canEdit ? styles.productInputsRowWithActions : styles.productInputsRowNoActions}`}
                      >
                        <select
                          className={`${loginStyles.input} ${styles.productSelectCompact}`}
                          value={row.product_id}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              product_inputs: prev.product_inputs.map((it, i) =>
                                i === idx ? { ...it, product_id: e.target.value } : it,
                              ),
                            }))
                          }
                          disabled={readOnly}
                        >
                          <option value="">Selecione</option>
                          {products.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <input
                          className={`${loginStyles.input} ${styles.qtyInputCompact}`}
                          value={row.quantity}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              product_inputs: prev.product_inputs.map((it, i) =>
                                i === idx ? { ...it, quantity: e.target.value } : it,
                              ),
                            }))
                          }
                          inputMode="decimal"
                          placeholder="1"
                          disabled={readOnly}
                        />
                        {canEdit ? (
                          <button
                            type="button"
                            className={styles.iconTrashBtn}
                            title="Remover produto"
                            aria-label="Remover produto da lista"
                            disabled={readOnly}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                product_inputs: prev.product_inputs.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M9 3h6M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className={styles.profitSummary}>
              <div>
                <span>Custo estimado de materiais</span>
                <strong>{formatBrlDisplay(estimatedMaterialCost)}</strong>
              </div>
              <div>
                <span>Lucro estimado</span>
                <strong>{formatBrlDisplay(Number.isFinite(estimatedProfit) ? estimatedProfit : 0)}</strong>
              </div>
            </div>
          </div>
        ) : null}

        {aiEnabled && activeTab === "ia" ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Compatibilidade técnica</h2>
            <label className={loginStyles.label} htmlFor="s-eq-tags">
              Tipos de equipamento (tags)
            </label>
            <input
              id="s-eq-tags"
              className={loginStyles.input}
              value={form.equipment_type_tags}
              onChange={(e) => setForm((prev) => ({ ...prev, equipment_type_tags: e.target.value }))}
              placeholder="split, cassete, piso teto, climatizador..."
              disabled={readOnly}
            />
            <div className={styles.grid2}>
              <div>
                <label className={loginStyles.label} htmlFor="s-btu-min">
                  BTU mínimo (opcional)
                </label>
                <input
                  id="s-btu-min"
                  className={loginStyles.input}
                  value={form.btu_min}
                  onChange={(e) => setForm((prev) => ({ ...prev, btu_min: e.target.value }))}
                  inputMode="numeric"
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="s-btu-max">
                  BTU máximo (opcional)
                </label>
                <input
                  id="s-btu-max"
                  className={loginStyles.input}
                  value={form.btu_max}
                  onChange={(e) => setForm((prev) => ({ ...prev, btu_max: e.target.value }))}
                  inputMode="numeric"
                  disabled={readOnly}
                />
              </div>
            </div>
            <label className={loginStyles.label} htmlFor="s-category">
              Categoria do serviço
            </label>
            <input
              id="s-category"
              className={loginStyles.input}
              value={form.service_category}
              onChange={(e) => setForm((prev) => ({ ...prev, service_category: e.target.value }))}
              placeholder="instalacao, limpeza, manutencao, reparo..."
              disabled={readOnly}
            />
            <div className={styles.grid2}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.applies_residential}
                  onChange={(e) => setForm((prev) => ({ ...prev, applies_residential: e.target.checked }))}
                  disabled={readOnly}
                />
                Atende residencial
              </label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.applies_commercial}
                  onChange={(e) => setForm((prev) => ({ ...prev, applies_commercial: e.target.checked }))}
                  disabled={readOnly}
                />
                Atende comercial
              </label>
            </div>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                disabled={readOnly}
              />
              Servico ativo
            </label>
          </div>
        ) : null}

        {activeTab === "fiscal" ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Fiscal — NFS-e nacional</h2>
            <p className={styles.sectionHint}>
              Este é o lugar principal para <strong>cTribNac</strong> e <strong>NBS</strong>: um par por tipo de serviço, conforme tabelas da Receita.
              Ao montar uma OS, estes valores entram nos itens e têm prioridade sobre o padrão em Administração → Fiscal (que só completa se aqui
              estiver vazio). Obrigatórios na NFS-e nacional quando este serviço for usado na emissão.
            </p>
            <div className={styles.grid2}>
              <div>
                <label className={loginStyles.label} htmlFor="s-nfse-trib">
                  Código tributação nacional (cTribNac)
                </label>
                <input
                  id="s-nfse-trib"
                  className={loginStyles.input}
                  value={form.nfse_codigo_tributacao_nacional}
                  onChange={(e) => setForm((prev) => ({ ...prev, nfse_codigo_tributacao_nacional: e.target.value }))}
                  placeholder="Ex.: conforme tabela nacional"
                  maxLength={32}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className={loginStyles.label} htmlFor="s-nfse-nbs">
                  Código NBS
                </label>
                <input
                  id="s-nfse-nbs"
                  className={loginStyles.input}
                  value={form.nfse_codigo_nbs}
                  onChange={(e) => setForm((prev) => ({ ...prev, nfse_codigo_nbs: e.target.value }))}
                  placeholder="Nomenclatura brasileira de serviços"
                  maxLength={32}
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>
        ) : null}

        {msg?.kind === "ok" ? <p className={styles.msgOk}>{msg.text}</p> : null}
        {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}

        {canEdit ? (
          <div className={styles.actions}>
        <Link className={styles.btnBackLink} to="/app/services">
          ← Voltar a lista
        </Link>
            <button type="submit" className={styles.btnPrimary} disabled={saving || deleting || duplicating}>
              {saving ? "Salvando..." : isNew ? "Cadastrar" : "Salvar alteracoes"}
            </button>
            {!isNew ? (
              <button type="button" className={styles.btnSecondary} onClick={() => void onDuplicate()} disabled={saving || deleting || duplicating}>
                {duplicating ? "Duplicando..." : "Duplicar servico"}
              </button>
            ) : null}
            {canDelete && !isNew ? (
              <button type="button" className={styles.btnDanger} onClick={() => void onDelete()} disabled={saving || deleting || duplicating}>
                {deleting ? "Excluindo..." : "Excluir servico"}
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.actions}>
        <Link className={styles.btnBackLink} to="/app/services">
          ← Voltar a lista
        </Link>
            <p className={styles.readOnlyHint}>
              Você pode visualizar os dados. Para alterar, use um perfil de recepção ou administrador.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
