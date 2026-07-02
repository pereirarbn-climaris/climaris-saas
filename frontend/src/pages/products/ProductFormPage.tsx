import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
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
import { isHiddenAppModule } from "../../lib/hiddenAppModules";
import { isInventoryActive, productsMaxImages } from "../../lib/planProducts";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import formLayout from "../formLayout.module.css";
import loginStyles from "../LoginPage.module.css";
import styles from "./ProductFormPage.module.css";

type ProductFormTab = "geral" | "imagens" | "mercado-livre" | "configuracoes";

type FormState = {
  name: string;
  sku: string;
  purchase_price: string;
  sale_price: string;
  stock_quantity: string;
  is_active: boolean;
};

function emptyForm(): FormState {
  return {
    name: "",
    sku: "",
    purchase_price: numberToBrlInput(0),
    sale_price: numberToBrlInput(0),
    stock_quantity: "0",
    is_active: true,
  };
}

function serializeProductFormSnapshot(f: FormState): string {
  const stockRaw = String(f.stock_quantity).trim().replace(",", ".");
  const stock = Number(stockRaw);
  return JSON.stringify({
    name: f.name.trim(),
    sku: f.sku.trim(),
    purchase_price: parseBrlInputToNumber(f.purchase_price),
    sale_price: parseBrlInputToNumber(f.sale_price),
    stock_quantity: Number.isFinite(stock) ? stock : 0,
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const ACCEPTED_PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function filterAcceptedProductImages(files: FileList | File[] | null | undefined): File[] {
  if (!files?.length) return [];
  const list = Array.isArray(files) ? files : Array.from(files);
  return list.filter(
    (f) => ACCEPTED_PRODUCT_IMAGE_TYPES.has(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name),
  );
}

function PackageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
  const inventoryEnabled = isInventoryActive(ctx?.tenant);
  const maxProductImages = productsMaxImages(ctx?.tenant);

  const [activeTab, setActiveTab] = useState<ProductFormTab>("geral");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [imageToRemove, setImageToRemove] = useState<ProductImageOut | null>(null);
  const [productImages, setProductImages] = useState<ProductImageOut[]>([]);
  const imagesAtLimit = maxProductImages != null && productImages.length >= maxProductImages;
  const imagesBlocked = maxProductImages != null && maxProductImages <= 0;
  const [imgBusy, setImgBusy] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const imageDragDepthRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [mlAddon, setMlAddon] = useState(false);
  const [mlCategoryId, setMlCategoryId] = useState("");
  const [mlListingType, setMlListingType] = useState("gold_special");
  const [mlBusy, setMlBusy] = useState(false);
  const [formReady, setFormReady] = useState(isNew);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const parsedPurchasePrice = useMemo(() => parseBrlInputToNumber(form.purchase_price), [form.purchase_price]);
  const parsedSalePrice = useMemo(() => parseBrlInputToNumber(form.sale_price), [form.sale_price]);
  const parsedStockQty = useMemo(() => Number(String(form.stock_quantity).replace(",", ".")), [form.stock_quantity]);
  const marginValue = useMemo(() => parsedSalePrice - parsedPurchasePrice, [parsedPurchasePrice, parsedSalePrice]);

  const isDirty = useMemo(() => {
    if (isNew || !formReady) return false;
    return serializeProductFormSnapshot(form) !== savedSnapshot;
  }, [form, formReady, isNew, savedSnapshot]);

  const productSaved = !isNew && Number.isFinite(idNum);
  const mercadoLivreHidden = isHiddenAppModule("mercadoLivre");

  useEffect(() => {
    if (mercadoLivreHidden && activeTab === "mercado-livre") {
      setActiveTab("geral");
    }
  }, [activeTab, mercadoLivreHidden]);

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
    if (mercadoLivreHidden) return;
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
  }, [mercadoLivreHidden]);

  useEffect(() => {
    if (!productSaved || !mlAddon) return;
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
  }, [productSaved, mlAddon, idNum]);

  if (!ctx) return <Navigate to="/login" replace />;
  if (!canEdit) return <Navigate to="/app/products" replace />;
  if (!isNew && (!productId || !Number.isFinite(idNum) || idNum < 1)) return <Navigate to="/app/products" replace />;

  function buildPayload(): ProductCreatePayload {
    return {
      name: form.name.trim(),
      sku: form.sku.trim(),
      purchase_price: parsedPurchasePrice,
      sale_price: parsedSalePrice,
      stock_quantity: inventoryEnabled ? parsedStockQty : 0,
      is_active: form.is_active,
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;

    if (!form.name.trim()) {
      toast.error("Informe o nome do produto.");
      setActiveTab("geral");
      return;
    }
    if (!form.sku.trim()) {
      toast.error("Informe o SKU do produto.");
      setActiveTab("geral");
      return;
    }
    if (!Number.isFinite(parsedPurchasePrice) || parsedPurchasePrice < 0) {
      toast.error("Informe um valor de compra válido (maior ou igual a zero).");
      setActiveTab("geral");
      return;
    }
    if (!Number.isFinite(parsedSalePrice) || parsedSalePrice < 0) {
      toast.error("Informe um valor de venda válido (maior ou igual a zero).");
      setActiveTab("geral");
      return;
    }
    if (inventoryEnabled && (!Number.isFinite(parsedStockQty) || parsedStockQty < 0)) {
      toast.error("Informe uma quantidade em estoque válida (maior ou igual a zero).");
      setActiveTab("geral");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const created = await createProduct(buildPayload());
        toast.success("Produto cadastrado com sucesso!");
        navigate(`/app/products/${created.id}`, { replace: true });
      } else {
        await updateProduct(idNum, buildPayload() as ProductUpdatePayload);
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
    setDuplicating(true);
    try {
      const created = await createProduct({
        ...buildPayload(),
        name: `${form.name.trim()} (cópia)`,
        sku: makeDuplicateSku(form.sku.trim() || "SKU"),
        stock_quantity: 0,
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
    if (!productSaved) return;
    try {
      const p = await getProduct(idNum);
      setProductImages(p.images ?? []);
    } catch {
      /* ignore */
    }
  }

  async function onPickImages(files: FileList | File[] | null | undefined) {
    const accepted = filterAcceptedProductImages(files);
    if (!accepted.length || readOnly || !productSaved || !canEdit) return;
    setImgBusy(true);
    try {
      for (const file of accepted) {
        await uploadProductImage(idNum, file);
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
    if (!canEdit || !productSaved || !imageToRemove) return;
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
    if (!canEdit || !productSaved || !mlAddon) return;
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
    if (!canEdit || !productSaved || !mlAddon) return;
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
    if (!canEdit || !productSaved || productImages.length < 2) return;
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
    const generated = `${normalizeSkuBase(form.name)}-${randomSkuSuffix()}`;
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
      <header className={styles.pageHeader}>
        <nav className={styles.breadcrumb} aria-label="Navegação">
          <Link className={styles.breadcrumbLink} to="/app/products">
            Produtos
          </Link>
          <span className={styles.breadcrumbSep} aria-hidden>
            /
          </span>
          <span className={styles.breadcrumbCurrent}>
            {isNew ? "Novo cadastro" : form.name.trim() || "Editar produto"}
          </span>
        </nav>
        <div className={styles.pageHeaderMain}>
          <span className={styles.pageHeaderIcon} aria-hidden>
            <PackageIcon />
          </span>
          <div className={styles.pageHeaderText}>
            <h1 className={styles.title}>{isNew ? "Novo produto" : "Editar produto"}</h1>
            <p className={styles.lead}>
              {isNew
                ? "Cadastre preços, fotos e integrações em abas. O SKU identifica o item no catálogo, orçamentos e ordens de serviço."
                : "Organize preços, fotos e integrações em abas. O SKU identifica o item no catálogo, orçamentos e ordens de serviço."}
            </p>
          </div>
        </div>
      </header>

      <form id="product-form-main" className={styles.form} onSubmit={onSubmit}>
        <div className={formLayout.formCard}>
          <div className={formLayout.formCardTabs} role="tablist" aria-label="Seções do produto">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "geral"}
              className={`${formLayout.formCardTab} ${activeTab === "geral" ? formLayout.formCardTabActive : ""}`}
              onClick={() => setActiveTab("geral")}
            >
              Geral
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "imagens"}
              className={`${formLayout.formCardTab} ${activeTab === "imagens" ? formLayout.formCardTabActive : ""}`}
              onClick={() => setActiveTab("imagens")}
            >
              Imagens
              {productImages.length > 0 ? <span className={styles.tabBadge}>{productImages.length}</span> : null}
            </button>
            {!mercadoLivreHidden ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "mercado-livre"}
                className={`${formLayout.formCardTab} ${activeTab === "mercado-livre" ? formLayout.formCardTabActive : ""}`}
                onClick={() => setActiveTab("mercado-livre")}
              >
                Mercado Livre
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "configuracoes"}
              className={`${formLayout.formCardTab} ${activeTab === "configuracoes" ? formLayout.formCardTabActive : ""}`}
              onClick={() => setActiveTab("configuracoes")}
            >
              Configurações
            </button>
          </div>

          <div className={`${formLayout.formCardContent} ${styles.formCardContent}`}>
            {activeTab === "geral" ? (
              <div className={formLayout.stack}>
                <h2 className={styles.sectionTitle}>Informações principais</h2>
                <div className={formLayout.field}>
                  <label className={loginStyles.label} htmlFor="p-name">
                    Nome do produto
                  </label>
                  <input
                    id="p-name"
                    className={loginStyles.input}
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex.: Tubo de cobre 1/4"
                    required
                    disabled={readOnly}
                  />
                </div>

                <div className={formLayout.field}>
                  <label className={loginStyles.label} htmlFor="p-sku">
                    SKU (código interno)
                  </label>
                  <div className={styles.skuRow}>
                    <input
                      id="p-sku"
                      className={loginStyles.input}
                      value={form.sku}
                      onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
                      placeholder="AUTO-produto-XXXX"
                      required
                      disabled={readOnly}
                    />
                    {canEdit ? (
                      <button
                        type="button"
                        className={styles.btnGenerateSku}
                        onClick={handleGenerateSku}
                        disabled={readOnly}
                      >
                        Gerar SKU
                      </button>
                    ) : null}
                  </div>
                  <p className={styles.fieldHint}>Use um código único por item. O botão gera um SKU a partir do nome.</p>
                </div>

                <div className={styles.grid2}>
                  <div className={formLayout.field}>
                    <label className={loginStyles.label} htmlFor="p-purchase-price">
                      Valor de compra
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
                      Valor de venda
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
                </div>

                {Number.isFinite(parsedPurchasePrice) && Number.isFinite(parsedSalePrice) ? (
                  <p className={styles.marginPreview} role="status">
                    Margem estimada: <strong>{formatCurrency(marginValue)}</strong>
                    {parsedSalePrice > 0 ? (
                      <>
                        {" "}
                        (
                        {((marginValue / parsedSalePrice) * 100).toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })}
                        % sobre a venda)
                      </>
                    ) : null}
                  </p>
                ) : null}

                {inventoryEnabled ? (
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
                      placeholder="0"
                      disabled={readOnly}
                    />
                    <p className={styles.fieldHint}>
                      Saldo no almoxarifado. Na listagem aparecem também reservado e disponível.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "imagens" ? (
              <div>
                <h2 className={styles.sectionTitle}>Galeria de imagens</h2>
                <p className={styles.fieldHint}>
                  Fotos públicas para vitrine, orçamentos e marketplaces. Formatos: JPEG, PNG ou WebP.
                  {maxProductImages != null ? (
                    <>
                      {" "}
                      Seu plano permite até <strong>{maxProductImages}</strong> imagem(ns) por produto
                      {productSaved ? ` (${productImages.length}/${maxProductImages})` : ""}.
                    </>
                  ) : (
                    " Sem limite de imagens no plano."
                  )}
                </p>
                {imagesBlocked ? (
                  <p className={styles.tabNotice}>Seu plano não permite imagens em produtos.</p>
                ) : null}

                {!productSaved ? (
                  <p className={styles.tabNotice}>
                    <strong>Salve o produto na aba Geral</strong> para liberar o envio de imagens. Após o cadastro você
                    volta automaticamente para editar e pode adicionar fotos aqui.
                  </p>
                ) : null}

                {canEdit && productSaved && !imagesBlocked && !imagesAtLimit ? (
                  <div
                    className={`${styles.imageDropzone} ${imageDragOver ? styles.imageDropzoneActive : ""} ${imgBusy ? styles.imageDropzoneBusy : ""}`}
                    role="button"
                    tabIndex={imgBusy ? -1 : 0}
                    onClick={() => {
                      if (!imgBusy) imageInputRef.current?.click();
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !imgBusy) {
                        e.preventDefault();
                        imageInputRef.current?.click();
                      }
                    }}
                    onDragEnter={(e: DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (imgBusy) return;
                      imageDragDepthRef.current += 1;
                      setImageDragOver(true);
                    }}
                    onDragLeave={(e: DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (imgBusy) return;
                      imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1);
                      if (imageDragDepthRef.current === 0) setImageDragOver(false);
                    }}
                    onDragOver={(e: DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!imgBusy) setImageDragOver(true);
                    }}
                    onDrop={(e: DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      e.stopPropagation();
                      imageDragDepthRef.current = 0;
                      setImageDragOver(false);
                      if (imgBusy) return;
                      void onPickImages(e.dataTransfer.files);
                    }}
                  >
                    <span className={styles.imageDropzoneIcon} aria-hidden>
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                        <path
                          d="M12 16V8m0 0l-3 3m3-3l3 3M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className={styles.imageDropzoneTitle}>
                      {imgBusy ? "Processando…" : imageDragOver ? "Solte as imagens aqui" : "Enviar imagens"}
                    </span>
                    <span className={styles.imageDropzoneHint}>
                      Arraste e solte JPEG, PNG ou WebP aqui, ou clique para selecionar.
                    </span>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={imgBusy}
                      className={styles.imageDropzoneInput}
                      onChange={(e) => {
                        void onPickImages(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                ) : null}
                {canEdit && productSaved && imagesAtLimit && !imagesBlocked ? (
                  <p className={styles.tabNotice}>Limite de imagens do plano atingido. Remova uma foto para enviar outra.</p>
                ) : null}

                {productSaved && productImages.length > 0 ? (
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
                ) : productSaved ? (
                  <p className={styles.fieldHint}>Nenhuma imagem cadastrada. Envie fotos para destacar o produto.</p>
                ) : null}
              </div>
            ) : null}

            {!mercadoLivreHidden && activeTab === "mercado-livre" ? (
              <div>
                <h2 className={styles.sectionTitle}>Mercado Livre</h2>
                <p className={styles.fieldHint}>
                  Publique este produto como anúncio usando as fotos da aba Imagens. Conecte sua conta na{" "}
                  <Link className={styles.inlineLink} to="/app/integrations/mercado-livre">
                    central da integração
                  </Link>{" "}
                  e informe o <strong>category_id</strong> (MLB…).
                </p>

                {!productSaved ? (
                  <p className={styles.tabNotice}>
                    <strong>Salve o produto na aba Geral</strong> antes de configurar a publicação no Mercado Livre.
                  </p>
                ) : !mlAddon ? (
                  <p className={styles.mlAddonBanner}>
                    O add-on Mercado Livre não está ativo neste workspace. Contrate na Loja de integrações para publicar
                    anúncios a partir do catálogo.
                  </p>
                ) : (
                  <div className={formLayout.stack}>
                    <div className={styles.grid2}>
                      <div className={formLayout.field}>
                        <label className={loginStyles.label} htmlFor="ml-cat">
                          Category ID
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
                )}
              </div>
            ) : null}

            {activeTab === "configuracoes" ? (
              <div>
                <h2 className={styles.sectionTitle}>Configurações adicionais</h2>
                <p className={styles.fieldHint}>Preferências de visibilidade e uso do produto no sistema.</p>

                <div className={styles.configCard}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                      disabled={readOnly}
                    />
                    <span>
                      <span className={styles.checkboxTitle}>Produto ativo no catálogo</span>
                      <span className={styles.checkboxHint}>
                        Itens inativos continuam no histórico, mas deixam de aparecer nas buscas ao montar orçamentos e
                        ordens de serviço. Prefira inativar em vez de excluir quando já houver movimentação.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        </div>
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
              {saving ? "Salvando…" : isNew ? "Cadastrar produto" : "Salvar alterações"}
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
              desfeita. Se o item estiver em ordens de serviço ou orçamentos, prefira desativar em Configurações.
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
