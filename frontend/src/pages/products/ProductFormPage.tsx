import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useMatch, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  getMercadoLivreProductLink,
  getMercadoLivreStatus,
  publishMercadoLivreProduct,
  upsertMercadoLivreLink,
} from "../../api/mercadoLivre";
import { deleteProductImage, reorderProductImages, uploadProductImage } from "../../api/productImages";
import {
  createProduct,
  deleteProduct,
  getProduct,
  updateProduct,
  type ProductCreatePayload,
  type ProductImageOut,
  type ProductOut,
  type ProductUpdatePayload,
} from "../../api/products";
import { formatBrlInputFromDigits, numberToBrlInput, parseBrlInputToNumber } from "../../lib/currencyBrInput";
import { toast } from "../../lib/toast";
import { ToastHost } from "../../components/ToastHost";
import type { DashboardOutletContext } from "../dashboardContext";
import formLayout from "../formLayout.module.css";
import loginStyles from "../LoginPage.module.css";
import styles from "./ProductFormPage.module.css";

type FormState = {
  name: string;
  sku: string;
  purchase_price: string;
  sale_price: string;
  stock_quantity: string;
  compatible_equipment_tags: string;
  btu_min: string;
  btu_max: string;
  application_scope: string;
  is_active: boolean;
};

function emptyForm(): FormState {
  return {
    name: "",
    sku: "",
    purchase_price: numberToBrlInput(0),
    sale_price: numberToBrlInput(0),
    stock_quantity: "0",
    compatible_equipment_tags: "",
    btu_min: "",
    btu_max: "",
    application_scope: "",
    is_active: true,
  };
}

function serializeProductFormSnapshot(f: FormState): string {
  const stockRaw = String(f.stock_quantity).trim().replace(",", ".");
  const stock = Number(stockRaw);
  const btuMinRaw = f.btu_min.trim();
  const btuMaxRaw = f.btu_max.trim();
  return JSON.stringify({
    name: f.name.trim(),
    sku: f.sku.trim(),
    purchase_price: parseBrlInputToNumber(f.purchase_price),
    sale_price: parseBrlInputToNumber(f.sale_price),
    stock_quantity: Number.isFinite(stock) ? stock : 0,
    compatible_equipment_tags: f.compatible_equipment_tags.trim(),
    btu_min: btuMinRaw ? Number(btuMinRaw) : null,
    btu_max: btuMaxRaw ? Number(btuMaxRaw) : null,
    application_scope: f.application_scope.trim(),
    is_active: f.is_active,
  });
}

function productToFormState(p: ProductOut): FormState {
  return {
    name: p.name,
    sku: p.sku,
    purchase_price: numberToBrlInput(Number(p.purchase_price || 0)),
    sale_price: numberToBrlInput(Number(p.sale_price || p.unit_price || 0)),
    stock_quantity: String(p.stock_quantity ?? 0),
    compatible_equipment_tags: p.compatible_equipment_tags ?? "",
    btu_min: p.btu_min != null ? String(p.btu_min) : "",
    btu_max: p.btu_max != null ? String(p.btu_max) : "",
    application_scope: p.application_scope ?? "",
    is_active: p.is_active,
  };
}

function normalizeSkuBase(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  return base || "PROD";
}

function randomSkuSuffix(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function makeDuplicateSku(baseSku: string): string {
  const suffix = `-${Date.now().toString(36).slice(-8)}`;
  const max = 50;
  const room = max - suffix.length;
  const trimmed = baseSku.trim().slice(0, Math.max(1, room));
  return (trimmed + suffix).slice(0, max);
}

export function ProductFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const isNew = useMatch({ path: "/app/products/new", end: true }) != null;
  const { productId } = useParams<{ productId: string }>();
  const idNum = productId ? Number(productId) : NaN;

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const canDelete = ctx?.user.role === "admin";
  const readOnly = !canEdit;

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [imageToRemove, setImageToRemove] = useState<ProductImageOut | null>(null);
  const [productImages, setProductImages] = useState<ProductImageOut[]>([]);
  const [imgBusy, setImgBusy] = useState(false);
  const [mlAddon, setMlAddon] = useState(false);
  const [mlCategoryId, setMlCategoryId] = useState("");
  const [mlListingType, setMlListingType] = useState("gold_special");
  const [mlBusy, setMlBusy] = useState(false);
  const [formReady, setFormReady] = useState(isNew);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const parsedPurchasePrice = useMemo(() => parseBrlInputToNumber(form.purchase_price), [form.purchase_price]);
  const parsedSalePrice = useMemo(() => parseBrlInputToNumber(form.sale_price), [form.sale_price]);
  const parsedStockQty = useMemo(() => Number(String(form.stock_quantity).replace(",", ".")), [form.stock_quantity]);

  const isDirty = useMemo(() => {
    if (isNew || !formReady) return false;
    return serializeProductFormSnapshot(form) !== savedSnapshot;
  }, [form, formReady, isNew, savedSnapshot]);

  useEffect(() => {
    if (isNew || !productId || !Number.isFinite(idNum) || idNum < 1) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setFormReady(false);
      setLoadErr("");
      try {
        const p = await getProduct(idNum);
        if (!cancelled) {
          const loadedForm = productToFormState(p);
          setForm(loadedForm);
          setSavedSnapshot(serializeProductFormSnapshot(loadedForm));
          setProductImages(p.images ?? []);
          setFormReady(true);
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
  }, [isNew, productId, idNum]);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    void getMercadoLivreStatus()
      .then((s) => {
        if (!cancelled) setMlAddon(s.entitlement_active);
      })
      .catch(() => {
        if (!cancelled) setMlAddon(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew]);

  useEffect(() => {
    if (isNew || !mlAddon || !Number.isFinite(idNum)) return;
    let cancelled = false;
    void getMercadoLivreProductLink(idNum)
      .then((link) => {
        if (cancelled || !link) return;
        setMlCategoryId(link.ml_category_id ?? "");
        setMlListingType(link.listing_type_id ?? "gold_special");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isNew, mlAddon, idNum]);

  if (!ctx) return <Navigate to="/login" replace />;
  if (isNew && !canEdit) return <Navigate to="/app/products" replace />;
  if (!isNew && (!productId || !Number.isFinite(idNum) || idNum < 1)) return <Navigate to="/app/products" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;

    if (!form.name.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    if (!form.sku.trim()) {
      toast.error("Informe o SKU do produto.");
      return;
    }
    if (!Number.isFinite(parsedPurchasePrice) || parsedPurchasePrice < 0) {
      toast.error("Informe um valor de compra válido (maior ou igual a zero).");
      return;
    }
    if (!Number.isFinite(parsedSalePrice) || parsedSalePrice < 0) {
      toast.error("Informe um valor de venda válido (maior ou igual a zero).");
      return;
    }
    if (!Number.isFinite(parsedStockQty) || parsedStockQty < 0) {
      toast.error("Informe uma quantidade em estoque válida (maior ou igual a zero).");
      return;
    }
    const parsedBtuMin = form.btu_min.trim() ? Number(form.btu_min) : null;
    const parsedBtuMax = form.btu_max.trim() ? Number(form.btu_max) : null;
    if (parsedBtuMin != null && (!Number.isFinite(parsedBtuMin) || parsedBtuMin < 0)) {
      toast.error("BTU mínimo inválido.");
      return;
    }
    if (parsedBtuMax != null && (!Number.isFinite(parsedBtuMax) || parsedBtuMax < 0)) {
      toast.error("BTU máximo inválido.");
      return;
    }
    if (parsedBtuMin != null && parsedBtuMax != null && parsedBtuMin > parsedBtuMax) {
      toast.error("BTU mínimo não pode ser maior que BTU máximo.");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const payload: ProductCreatePayload = {
          name: form.name.trim(),
          sku: form.sku.trim(),
          purchase_price: parsedPurchasePrice,
          sale_price: parsedSalePrice,
          stock_quantity: parsedStockQty,
          compatible_equipment_tags: form.compatible_equipment_tags.trim() || null,
          btu_min: parsedBtuMin,
          btu_max: parsedBtuMax,
          application_scope: form.application_scope.trim() || null,
          is_active: form.is_active,
        };
        const created = await createProduct(payload);
        toast.success("Produto cadastrado com sucesso!");
        navigate(`/app/products/${created.id}`, { replace: true });
      } else {
        const payload: ProductUpdatePayload = {
          name: form.name.trim(),
          sku: form.sku.trim(),
          purchase_price: parsedPurchasePrice,
          sale_price: parsedSalePrice,
          stock_quantity: parsedStockQty,
          compatible_equipment_tags: form.compatible_equipment_tags.trim() || null,
          btu_min: parsedBtuMin,
          btu_max: parsedBtuMax,
          application_scope: form.application_scope.trim() || null,
          is_active: form.is_active,
        };
        await updateProduct(idNum, payload);
        setSavedSnapshot(serializeProductFormSnapshot(form));
        toast.success("Alterações salvas com sucesso!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onDuplicate() {
    if (readOnly || isNew) return;

    if (!form.name.trim()) {
      toast.error("Informe o nome do produto para duplicar.");
      return;
    }
    if (!Number.isFinite(parsedPurchasePrice) || parsedPurchasePrice < 0) {
      toast.error("Informe um valor de compra válido (maior ou igual a zero).");
      return;
    }
    if (!Number.isFinite(parsedSalePrice) || parsedSalePrice < 0) {
      toast.error("Informe um valor de venda válido (maior ou igual a zero).");
      return;
    }
    const parsedBtuMin = form.btu_min.trim() ? Number(form.btu_min) : null;
    const parsedBtuMax = form.btu_max.trim() ? Number(form.btu_max) : null;

    setDuplicating(true);
    try {
      const created = await createProduct({
        name: `${form.name.trim()} (cópia)`,
        sku: makeDuplicateSku(form.sku.trim() || "SKU"),
        purchase_price: parsedPurchasePrice,
        sale_price: parsedSalePrice,
        stock_quantity: 0,
        compatible_equipment_tags: form.compatible_equipment_tags.trim() || null,
        btu_min: parsedBtuMin,
        btu_max: parsedBtuMax,
        application_scope: form.application_scope.trim() || null,
        is_active: form.is_active,
      });
      navigate(`/app/products/${created.id}`);
      toast.success("Produto duplicado com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao duplicar.");
    } finally {
      setDuplicating(false);
    }
  }

  async function onDelete() {
    if (!canDelete || isNew) return;
    setDeleting(true);
    try {
      await deleteProduct(idNum);
      toast.success("Produto excluído.");
      navigate("/app/products", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  async function refreshImages() {
    if (isNew || !Number.isFinite(idNum)) return;
    try {
      const p = await getProduct(idNum);
      setProductImages(p.images ?? []);
    } catch {
      /* ignore */
    }
  }

  async function onPickImages(files: FileList | null) {
    if (!files?.length || readOnly || isNew || !canEdit) return;
    setImgBusy(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        await uploadProductImage(idNum, f);
      }
      await refreshImages();
      toast.success("Imagens enviadas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setImgBusy(false);
    }
  }

  async function onRemoveImage() {
    if (!canEdit || isNew || !imageToRemove) return;
    setImgBusy(true);
    try {
      await deleteProductImage(idNum, imageToRemove.id);
      await refreshImages();
      toast.success("Imagem removida.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setImgBusy(false);
      setImageToRemove(null);
    }
  }

  async function onSaveMlLink() {
    if (!canEdit || isNew || !mlAddon) return;
    setMlBusy(true);
    try {
      await upsertMercadoLivreLink(idNum, {
        ml_category_id: mlCategoryId.trim() || null,
        listing_type_id: mlListingType.trim() || null,
      });
      toast.success("Vinculação Mercado Livre salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar vínculo.");
    } finally {
      setMlBusy(false);
    }
  }

  async function onPublishMl() {
    if (!canEdit || isNew || !mlAddon) return;
    setMlBusy(true);
    try {
      await publishMercadoLivreProduct(idNum, {
        ml_category_id: mlCategoryId.trim() || undefined,
        listing_type_id: mlListingType.trim() || undefined,
      });
      toast.success("Publicação enviada ao Mercado Livre.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao publicar.");
    } finally {
      setMlBusy(false);
    }
  }

  async function moveImage(imageId: number, dir: -1 | 1) {
    if (!canEdit || isNew || productImages.length < 2) return;
    const idx = productImages.findIndex((x) => x.id === imageId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= productImages.length) return;
    const next = [...productImages];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setImgBusy(true);
    try {
      const ordered = await reorderProductImages(
        idNum,
        next.map((x) => x.id),
      );
      setProductImages(ordered);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reordenar.");
    } finally {
      setImgBusy(false);
    }
  }

  function handleGenerateSku() {
    const base = normalizeSkuBase(form.name);
    const generated = `${base}-${randomSkuSuffix()}`;
    setForm((prev) => ({ ...prev, sku: generated }));
  }

  if (!isNew && loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando produto…</p>
      </div>
    );
  }

  if (!isNew && loadErr) {
    return (
      <div className={styles.wrap}>
        <Link className={styles.btnBackLink} to="/app/products">
          ← Voltar à lista
        </Link>
        <p className={styles.msgErr}>{loadErr}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <ToastHost />
      <h1 className={styles.title}>{isNew ? "Novo produto" : "Editar produto"}</h1>
      <p className={styles.lead}>Cadastre os produtos com valor de compra e valor de venda para cálculo de margem.</p>

      <form id="product-form-main" className={styles.form} onSubmit={onSubmit}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Dados do produto</h2>
          <div className={formLayout.stack}>
            <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="p-name">
                Nome
              </label>
              <input
                id="p-name"
                className={loginStyles.input}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
                disabled={readOnly}
              />
            </div>

          <div className={styles.grid2}>
            <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="p-sku">
                SKU
              </label>
              <div className={styles.grid2}>
                <input
                  id="p-sku"
                  className={loginStyles.input}
                  value={form.sku}
                  onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
                  required
                  disabled={readOnly}
                />
                {canEdit ? (
                  <button type="button" className={styles.btnPrimary} onClick={handleGenerateSku} disabled={readOnly}>
                    Gerar SKU
                  </button>
                ) : null}
              </div>
            </div>
            <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="p-purchase-price">
                Valor de compra (R$)
              </label>
              <input
                id="p-purchase-price"
                className={loginStyles.input}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={form.purchase_price}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    purchase_price: formatBrlInputFromDigits(e.target.value),
                  }))
                }
                placeholder="R$ 0,00"
                required
                disabled={readOnly}
              />
            </div>
            <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="p-sale-price">
                Valor de venda (R$)
              </label>
              <input
                id="p-sale-price"
                className={loginStyles.input}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={form.sale_price}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    sale_price: formatBrlInputFromDigits(e.target.value),
                  }))
                }
                placeholder="R$ 0,00"
                required
                disabled={readOnly}
              />
            </div>
            <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="p-stock">
                Estoque físico
              </label>
              <input
                id="p-stock"
                className={loginStyles.input}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={form.stock_quantity}
                onChange={(e) => setForm((prev) => ({ ...prev, stock_quantity: e.target.value }))}
                title="Estoque físico no almoxarifado"
                placeholder="0"
                disabled={readOnly}
              />
              <p className={styles.fieldHint}>
                O saldo físico também aparece na listagem de Produtos (Físico, Reservado e Disponível).
              </p>
            </div>
          </div>
          </div>

          <h2 className={styles.sectionTitle}>Compatibilidade técnica</h2>
          <div className={formLayout.stack}>
            <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="p-eq-tags">
                Tipos de equipamento (tags)
              </label>
              <input
                id="p-eq-tags"
                className={loginStyles.input}
                value={form.compatible_equipment_tags}
                onChange={(e) => setForm((prev) => ({ ...prev, compatible_equipment_tags: e.target.value }))}
                placeholder="split, cassete, climatizador..."
                disabled={readOnly}
              />
            </div>
          <div className={styles.grid2}>
            <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="p-btu-min">
                BTU mínimo (opcional)
              </label>
              <input
                id="p-btu-min"
                className={loginStyles.input}
                value={form.btu_min}
                onChange={(e) => setForm((prev) => ({ ...prev, btu_min: e.target.value }))}
                inputMode="numeric"
                disabled={readOnly}
              />
            </div>
            <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="p-btu-max">
                BTU máximo (opcional)
              </label>
              <input
                id="p-btu-max"
                className={loginStyles.input}
                value={form.btu_max}
                onChange={(e) => setForm((prev) => ({ ...prev, btu_max: e.target.value }))}
                inputMode="numeric"
                disabled={readOnly}
              />
            </div>
          </div>
            <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="p-app-scope">
                Escopo (opcional)
              </label>
              <input
                id="p-app-scope"
                className={loginStyles.input}
                value={form.application_scope}
                onChange={(e) => setForm((prev) => ({ ...prev, application_scope: e.target.value }))}
                placeholder="residential, commercial ou vazio para ambos"
                disabled={readOnly}
              />
              <p className={styles.fieldHint}>Esses dados ajudam a IA a sugerir o item certo (ex.: split vs climatizador).</p>
            </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              disabled={readOnly}
            />
            Produto ativo
          </label>
          </div>
        </div>

        {!isNew ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Imagens</h2>
            <p className={styles.fieldHint}>
              Fotos em formato público (armazenadas na nuvem) para vitrine e para publicação no Mercado Livre — até 12 imagens por anúncio.
            </p>
            {canEdit ? (
              <label className={styles.filePick}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={imgBusy}
                  onChange={(e) => void onPickImages(e.target.files)}
                />
                <span>{imgBusy ? "Processando…" : "Enviar imagens"}</span>
              </label>
            ) : null}
            {productImages.length > 0 ? (
              <ul className={styles.imageGrid}>
                {productImages.map((im) => (
                  <li key={im.id} className={styles.imageTile}>
                    <img src={im.public_url} alt="" className={styles.imageThumb} loading="lazy" />
                    {canEdit ? (
                      <div className={styles.imageActions}>
                        <button type="button" className={styles.imageBtn} disabled={imgBusy} onClick={() => void moveImage(im.id, -1)}>
                          ↑
                        </button>
                        <button type="button" className={styles.imageBtn} disabled={imgBusy} onClick={() => void moveImage(im.id, 1)}>
                          ↓
                        </button>
                        <button
                          type="button"
                          className={styles.imageBtnDanger}
                          disabled={imgBusy}
                          onClick={() => setImageToRemove(im)}
                        >
                          Remover
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.fieldHint}>Nenhuma imagem ainda.</p>
            )}
          </div>
        ) : null}

        {!isNew ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Mercado Livre</h2>
            <p className={styles.fieldHint}>
              Publique este produto como anúncio com as fotos acima. Use a{" "}
              <Link className={styles.inlineLink} to="/app/integrations/mercado-livre">
                central da integração
              </Link>{" "}
              para conectar sua conta e buscar o <strong>category_id</strong>.
            </p>
            {!mlAddon ? (
              <p className={styles.fieldHint}>Add-on Mercado Livre não ativo para este workspace — contrate na Loja de integrações.</p>
            ) : (
              <>
                <div className={formLayout.stack}>
                <div className={styles.grid2}>
                  <div className={formLayout.field}>
                    <label className={loginStyles.label} htmlFor="ml-cat">
                      Category ID (MLB…)
                    </label>
                    <input
                      id="ml-cat"
                      className={loginStyles.input}
                      value={mlCategoryId}
                      onChange={(e) => setMlCategoryId(e.target.value)}
                      placeholder="Ex.: MLB123456"
                      disabled={readOnly || mlBusy}
                    />
                  </div>
                  <div className={formLayout.field}>
                    <label className={loginStyles.label} htmlFor="ml-listing">
                      Tipo de listagem
                    </label>
                    <select
                      id="ml-listing"
                      className={loginStyles.input}
                      value={mlListingType}
                      onChange={(e) => setMlListingType(e.target.value)}
                      disabled={readOnly || mlBusy}
                    >
                      <option value="gold_special">gold_special</option>
                      <option value="gold_pro">gold_pro</option>
                      <option value="bronze">bronze</option>
                    </select>
                  </div>
                </div>
                {canEdit ? (
                  <div className={styles.mlActions}>
                    <button type="button" className={styles.btnSecondary} disabled={mlBusy} onClick={() => void onSaveMlLink()}>
                      Salvar vínculo
                    </button>
                    <button type="button" className={styles.btnPrimary} disabled={mlBusy} onClick={() => void onPublishMl()}>
                      {mlBusy ? "Aguarde…" : "Publicar / atualizar anúncio"}
                    </button>
                  </div>
                ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}

      </form>

      <div className={styles.actionBar} role="toolbar" aria-label="Ações do cadastro">
        <div className={styles.actionBarInner}>
          <Link className={styles.btnBackLink} to="/app/products">
            Voltar
          </Link>
          {canEdit && !isNew ? (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => void onDuplicate()}
              disabled={saving || deleting || duplicating}
            >
              {duplicating ? "Duplicando…" : "Duplicar produto"}
            </button>
          ) : null}
          {canDelete && !isNew ? (
            <button
              type="button"
              className={styles.btnDanger}
              onClick={() => setShowDeleteModal(true)}
              disabled={saving || deleting || duplicating}
            >
              {deleting ? "Excluindo…" : "Excluir produto"}
            </button>
          ) : null}
          {canEdit && (isNew || isDirty) ? (
            <button
              type="submit"
              form="product-form-main"
              className={styles.btnPrimary}
              disabled={saving || deleting || duplicating}
            >
              {saving ? "Salvando…" : isNew ? "Cadastrar" : "Salvar alterações"}
            </button>
          ) : null}
          {!canEdit ? <p className={styles.readOnlyHint}>Visualização somente leitura.</p> : null}
        </div>
      </div>

      {showDeleteModal ? (
        <div className={styles.modalRoot} role="presentation">
          <button
            type="button"
            className={styles.modalBackdrop}
            aria-label="Fechar"
            onClick={() => setShowDeleteModal(false)}
          />
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="delete-product-title">
            <h3 id="delete-product-title" className={styles.modalTitle}>
              Excluir produto
            </h3>
            <p className={styles.modalText}>
              Excluir <strong>{form.name.trim() || "este produto"}</strong> permanentemente? Esta ação não pode ser
              desfeita. Se o item estiver em ordens de serviço ou orçamentos, prefira desmarcar &quot;Produto
              ativo&quot;.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnDanger} onClick={() => void onDelete()} disabled={deleting}>
                {deleting ? "Excluindo…" : "Confirmar exclusão"}
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {imageToRemove ? (
        <div className={styles.modalRoot} role="presentation">
          <button
            type="button"
            className={styles.modalBackdrop}
            aria-label="Fechar"
            onClick={() => setImageToRemove(null)}
          />
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="remove-image-title">
            <h3 id="remove-image-title" className={styles.modalTitle}>
              Remover imagem
            </h3>
            <p className={styles.modalText}>
              Remover esta foto do produto <strong>{form.name.trim() || "sem nome"}</strong>? Ela deixa de aparecer na
              vitrine e no Mercado Livre.
            </p>
            <img src={imageToRemove.public_url} alt="" className={styles.modalImagePreview} />
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnDanger} onClick={() => void onRemoveImage()} disabled={imgBusy}>
                {imgBusy ? "Removendo…" : "Confirmar remoção"}
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setImageToRemove(null)}
                disabled={imgBusy}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
