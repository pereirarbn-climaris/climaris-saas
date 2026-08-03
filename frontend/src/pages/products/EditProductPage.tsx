import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  createProductCategory,
  createProductLocation,
  createProductType,
  createProductUnit,
  listProductCategories,
  listProductLocations,
  listProductTypes,
  listProductUnits,
  type ProductCategory,
  type ProductLocation,
  type ProductType,
  type ProductUnit,
} from "../../api/productCatalogs";
import { deleteProductImage, uploadProductImage } from "../../api/productImages";
import { getProduct, updateProduct, type ProductDetailOut } from "../../api/products";
import { formatBrlInputFromDigits, numberToBrlInput, parseBrlInputToNumber } from "../../lib/currencyBrInput";
import { isInventoryActive } from "../../lib/planProducts";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./EditProductPage.module.css";

type AuxFormState = {
  category: string;
  type: string;
  description: string;
  brand: string;
  model: string;
  barcode: string;
  minStock: string;
  unit: string;
  location: string;
  commission: string;
  applications: {
    serviceOrder: boolean;
    pmoc: boolean;
    budget: boolean;
    directSale: boolean;
  };
};

type MainState = {
  name: string;
  sku: string;
  stockQuantity: string;
  purchasePrice: string;
  salePrice: string;
  margin: string;
  autoPrice: boolean;
  controlStock: boolean;
};

type ProductExtraUi = Omit<AuxFormState, "applications"> & {
  controlStock?: boolean;
  applications: Array<keyof AuxFormState["applications"]>;
};

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

function parsePercentInput(value: string): number {
  const normalized = String(value).replace(".", "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentToInput(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function snapshot(main: MainState, aux: AuxFormState): string {
  return JSON.stringify({ main, aux });
}

function CardSection({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.cardSection}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{title}</h2>
          {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </header>
      {children}
    </section>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M15.4 7.4A6 6 0 1 0 16 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M15.5 3.5V7.6h-4.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3.5 5v10M6 5v10M8.8 5v10M11.2 5v10M14 5v10M16.5 5v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2.5 5h15M2.5 15h15" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4.5 5.5h11M7.2 5.5l.3-1.5h5l.3 1.5M6.5 7.2v7.3m3-7.3v7.3m3-7.3v7.3M5.8 16h8.4a1 1 0 0 0 1-.9l.6-9.6H4.2l.6 9.6a1 1 0 0 0 1 .9z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="4.6" y="8.7" width="10.8" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 8.7V7a2.5 2.5 0 1 1 5 0v1.7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function FieldLabel({ label, required, htmlFor }: { label: string; required?: boolean; htmlFor?: string }) {
  return (
    <label className={styles.label} htmlFor={htmlFor}>
      {label}
      {required ? <span className={styles.requiredMark}>*</span> : null}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${styles.input} ${props.className || ""}`} />;
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${styles.select} ${props.className || ""}`} />;
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className={styles.toggleWrap}>
      <span className={styles.toggleTextWrap}>
        <span className={styles.toggleLabel}>{label}</span>
        {hint ? <span className={styles.toggleHint}>{hint}</span> : null}
      </span>
      <span className={`${styles.toggleTrack} ${checked ? styles.toggleTrackActive : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className={styles.toggleInput}
        />
        <span className={styles.toggleThumb} />
      </span>
    </label>
  );
}

function CheckboxChip({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className={`${styles.checkboxChip} ${checked ? styles.checkboxChipChecked : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function extraKey(productId: number): string {
  return `product-ui-extra:${productId}`;
}

function readExtra(productId: number): ProductExtraUi | null {
  try {
    const raw = localStorage.getItem(extraKey(productId));
    if (!raw) return null;
    return JSON.parse(raw) as ProductExtraUi;
  } catch {
    return null;
  }
}

function writeExtra(productId: number, aux: AuxFormState, controlStock?: boolean) {
  const payload: ProductExtraUi = {
    category: aux.category,
    type: aux.type,
    description: aux.description,
    brand: aux.brand,
    model: aux.model,
    barcode: aux.barcode,
    minStock: aux.minStock,
    unit: aux.unit,
    location: aux.location,
    commission: aux.commission,
    controlStock,
    applications: Object.entries(aux.applications)
      .filter(([, value]) => value)
      .map(([key]) => key as keyof AuxFormState["applications"]),
  };
  localStorage.setItem(extraKey(productId), JSON.stringify(payload));
}

export function EditProductPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const idNum = Number(productId);
  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const inventoryEnabledByPlan = isInventoryActive(ctx?.tenant);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [product, setProduct] = useState<ProductDetailOut | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [replaceCurrentImage, setReplaceCurrentImage] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<ProductCategory[]>([]);
  const [typeOptions, setTypeOptions] = useState<ProductType[]>([]);
  const [unitOptions, setUnitOptions] = useState<ProductUnit[]>([]);
  const [locationOptions, setLocationOptions] = useState<ProductLocation[]>([]);

  const [main, setMain] = useState<MainState>({
    name: "",
    sku: "",
    stockQuantity: "0",
    purchasePrice: numberToBrlInput(0),
    salePrice: numberToBrlInput(0),
    margin: "0,00",
    autoPrice: true,
    controlStock: inventoryEnabledByPlan,
  });

  const [aux, setAux] = useState<AuxFormState>({
    category: "",
    type: "",
    description: "",
    brand: "",
    model: "",
    barcode: "",
    minStock: "10",
    unit: "un",
    location: "",
    commission: "0,00",
    applications: {
      serviceOrder: true,
      pmoc: true,
      budget: true,
      directSale: true,
    },
  });

  const currentImage = useMemo(() => product?.images?.[0] ?? null, [product?.images]);

  const parsedPurchase = useMemo(() => parseBrlInputToNumber(main.purchasePrice), [main.purchasePrice]);
  const isDirty = useMemo(() => snapshot(main, aux) !== savedSnapshot || Boolean(selectedImage), [main, aux, savedSnapshot, selectedImage]);

  function setMainField<K extends keyof MainState>(field: K, value: MainState[K]) {
    setMain((prev) => ({ ...prev, [field]: value }));
  }

  function setAuxField<K extends keyof AuxFormState>(field: K, value: AuxFormState[K]) {
    setAux((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [categories, types, units, locations] = await Promise.all([
          listProductCategories(),
          listProductTypes(),
          listProductUnits(),
          listProductLocations(),
        ]);
        if (cancelled) return;
        setCategoryOptions(categories.filter((item) => item.is_active));
        setTypeOptions(types.filter((item) => item.is_active));
        setUnitOptions(units.filter((item) => item.is_active));
        setLocationOptions(locations.filter((item) => item.is_active));
      } catch (error) {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Não foi possível carregar catálogos de produto.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(idNum) || idNum < 1) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadErr("");
      try {
        const loaded = await getProduct(idNum);
        if (cancelled) return;
        setProduct(loaded);
        const extra = readExtra(idNum);
        const sale = Number(loaded.sale_price || loaded.unit_price || 0);
        const purchase = Number(loaded.purchase_price || 0);
        const margin = purchase > 0 ? ((sale - purchase) / purchase) * 100 : 0;
        const nextMain: MainState = {
          name: loaded.name || "",
          sku: loaded.sku || "",
          stockQuantity: String(loaded.stock_quantity ?? 0),
          purchasePrice: numberToBrlInput(purchase),
          salePrice: numberToBrlInput(sale),
          margin: percentToInput(Math.max(0, margin)),
          autoPrice: true,
          controlStock: extra?.controlStock ?? inventoryEnabledByPlan,
        };
        const apps = {
          serviceOrder: true,
          pmoc: true,
          budget: true,
          directSale: true,
        };
        if (extra?.applications?.length) {
          Object.keys(apps).forEach((key) => {
            apps[key as keyof typeof apps] = extra.applications.includes(key as keyof typeof apps);
          });
        }
        const nextAux: AuxFormState = {
          category: extra?.category ?? (loaded.compatible_equipment_tags?.split(",")[0]?.trim() || ""),
          type: extra?.type ?? (loaded.application_scope?.trim() || ""),
          description: extra?.description ?? "",
          brand: extra?.brand ?? "",
          model: extra?.model ?? "",
          barcode: extra?.barcode ?? "",
          minStock: extra?.minStock ?? "10",
          unit: extra?.unit ?? "un",
          location: extra?.location ?? "",
          commission: extra?.commission ?? "0,00",
          applications: apps,
        };
        setMain(nextMain);
        setAux(nextAux);
        setSavedSnapshot(snapshot(nextMain, nextAux));
      } catch (error) {
        if (!cancelled) setLoadErr(error instanceof Error ? error.message : "Não foi possível carregar o produto.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idNum, inventoryEnabledByPlan]);

  function generateSku() {
    const generated = `${normalizeSkuBase(main.name)}-${randomSkuSuffix()}`;
    setMainField("sku", generated);
  }

  async function handleCreateCategory() {
    const typed = window.prompt("Digite o nome da nova categoria:");
    if (!typed) return;
    try {
      const created = await createProductCategory({ name: typed.trim(), is_active: true });
      setCategoryOptions((prev) => {
        const next = [...prev.filter((item) => item.id !== created.id), created];
        next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        return next;
      });
      setAuxField("category", created.name);
      toast.success("Categoria cadastrada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar a categoria.");
    }
  }

  async function handleCreateType() {
    const typed = window.prompt("Digite o nome do novo tipo:");
    if (!typed) return;
    try {
      const created = await createProductType({ name: typed.trim(), is_active: true });
      setTypeOptions((prev) => {
        const next = [...prev.filter((item) => item.id !== created.id), created];
        next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        return next;
      });
      setAuxField("type", created.name);
      toast.success("Tipo cadastrado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar o tipo.");
    }
  }

  async function handleCreateUnit() {
    const typed = window.prompt("Digite o nome da nova unidade:");
    if (!typed) return;
    try {
      const created = await createProductUnit({ name: typed.trim(), is_active: true });
      setUnitOptions((prev) => {
        const next = [...prev.filter((item) => item.id !== created.id), created];
        next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        return next;
      });
      setAuxField("unit", created.name);
      toast.success("Unidade cadastrada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar a unidade.");
    }
  }

  async function handleCreateLocation() {
    const typed = window.prompt("Digite o nome da nova localização:");
    if (!typed) return;
    try {
      const created = await createProductLocation({ name: typed.trim(), is_active: true });
      setLocationOptions((prev) => {
        const next = [...prev.filter((item) => item.id !== created.id), created];
        next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        return next;
      });
      setAuxField("location", created.name);
      toast.success("Localização cadastrada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar a localização.");
    }
  }

  function recalculateSaleFromMargin(nextMarginInput: string) {
    const margin = parsePercentInput(nextMarginInput);
    const sale = parsedPurchase + parsedPurchase * (margin / 100);
    setMainField("salePrice", numberToBrlInput(Math.max(0, sale)));
  }

  function onMarginChange(event: ChangeEvent<HTMLInputElement>) {
    const rawDigits = event.target.value.replace(/[^\d]/g, "");
    const normalized = rawDigits ? percentToInput(Number(rawDigits) / 100) : "0,00";
    setMainField("margin", normalized);
    if (main.autoPrice) recalculateSaleFromMargin(normalized);
  }

  function onPurchasePriceChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = formatBrlInputFromDigits(event.target.value);
    setMainField("purchasePrice", nextValue);
    if (main.autoPrice) {
      const purchase = parseBrlInputToNumber(nextValue);
      const margin = parsePercentInput(main.margin);
      const sale = purchase + purchase * (margin / 100);
      setMainField("salePrice", numberToBrlInput(Math.max(0, sale)));
    }
  }

  function onAutoPriceChange(checked: boolean) {
    setMainField("autoPrice", checked);
    if (checked) {
      const purchase = parseBrlInputToNumber(main.purchasePrice);
      const sale = parseBrlInputToNumber(main.salePrice);
      const margin = purchase > 0 ? ((sale - purchase) / purchase) * 100 : 0;
      const nextMargin = percentToInput(Math.max(0, margin));
      setMainField("margin", nextMargin);
      recalculateSaleFromMargin(nextMargin);
    }
  }

  function onImageSelect(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB.");
      return;
    }
    setSelectedImage(file);
    setReplaceCurrentImage(Boolean(currentImage));
    const reader = new FileReader();
    reader.onload = () => setImagePreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function clearImageSelection() {
    setSelectedImage(null);
    setImagePreview(null);
    setReplaceCurrentImage(false);
  }

  async function removeCurrentImage() {
    if (!currentImage || !product) return;
    const ok = window.confirm("Remover foto atual do produto?");
    if (!ok) return;
    setImageBusy(true);
    try {
      await deleteProductImage(product.id, currentImage.id);
      const refreshed = await getProduct(product.id);
      setProduct(refreshed);
      toast.success("Imagem removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover a imagem.");
    } finally {
      setImageBusy(false);
    }
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (!main.name.trim()) nextErrors.name = "Informe o nome do produto.";
    if (!main.sku.trim()) nextErrors.sku = "Informe o SKU.";
    if (!aux.category) nextErrors.category = "Selecione a categoria.";
    if (!aux.type) nextErrors.type = "Selecione o tipo.";
    if (!aux.unit) nextErrors.unit = "Selecione a unidade.";
    if (main.controlStock && Number(main.stockQuantity.replace(",", ".")) < 0) {
      nextErrors.stockQuantity = "Estoque atual inválido.";
    }
    if (main.controlStock && Number(aux.minStock.replace(",", ".")) < 0) {
      nextErrors.minStock = "Estoque mínimo inválido.";
    }
    if (parseBrlInputToNumber(main.purchasePrice) < 0) {
      nextErrors.purchasePrice = "Preço de custo inválido.";
    }
    if (parseBrlInputToNumber(main.salePrice) < 0) {
      nextErrors.salePrice = "Preço de venda inválido.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!product) return;
    if (!validate()) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }

    setSaving(true);
    try {
      await updateProduct(product.id, {
        name: main.name.trim(),
        sku: main.sku.trim(),
        purchase_price: parseBrlInputToNumber(main.purchasePrice),
        sale_price: parseBrlInputToNumber(main.salePrice),
        stock_quantity: main.controlStock ? Number(main.stockQuantity.replace(",", ".")) : 0,
        compatible_equipment_tags: aux.category.trim() || null,
        application_scope: aux.type.trim() || null,
        is_active: true,
      });

      if (selectedImage) {
        if (replaceCurrentImage && currentImage) {
          await deleteProductImage(product.id, currentImage.id);
        }
        await uploadProductImage(product.id, selectedImage);
      }

      writeExtra(product.id, aux, main.controlStock);

      const refreshed = await getProduct(product.id);
      setProduct(refreshed);
      clearImageSelection();
      setSavedSnapshot(snapshot(main, aux));
      toast.success("Produto atualizado com sucesso");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o produto");
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (isDirty) {
      const shouldLeave = window.confirm("Existem alterações não salvas. Deseja sair mesmo assim?");
      if (!shouldLeave) return;
    }
    navigate("/app/products");
  }

  if (!ctx) return <Navigate to="/login" replace />;
  if (!canEdit) return <Navigate to="/app/products" replace />;
  if (!Number.isFinite(idNum) || idNum < 1) return <Navigate to="/app/products" replace />;

  if (loading) {
    return (
      <div className={styles.pageWrap}>
        <div className={styles.pageInner}>
          <p className={styles.loading}>Carregando produto...</p>
        </div>
      </div>
    );
  }

  if (loadErr || !product) {
    return (
      <div className={styles.pageWrap}>
        <div className={styles.pageInner}>
          <Link to="/app/products" className={styles.backBtn}>
            <span aria-hidden>←</span> Voltar
          </Link>
          <p className={styles.errorText}>{loadErr || "Produto não encontrado."}</p>
        </div>
      </div>
    );
  }

  const displayName = main.name.trim() || "Editar produto";

  return (
    <div className={styles.pageWrap}>
      <div className={styles.pageInner}>
        <nav className={styles.breadcrumb} aria-label="Navegação">
          <Link className={styles.breadcrumbLink} to="/app/products">
            Produtos
          </Link>
          <span className={styles.breadcrumbSep} aria-hidden>
            /
          </span>
          <span className={styles.breadcrumbCurrent}>{displayName}</span>
        </nav>

        <header className={styles.pageHeader}>
          <div className={styles.headerMain}>
            <span className={styles.headerIcon} aria-hidden>
              <PackageIcon />
            </span>
            <div>
              <h1 className={styles.pageTitle}>Editar produto</h1>
              <p className={styles.pageSubtitle}>Atualize as informações do produto</p>
            </div>
          </div>
        </header>

        <form id="edit-product-form" onSubmit={onSubmit} className={styles.formStack}>
          <CardSection title="Dados principais">
            <div className={styles.mainGrid}>
              <div className={styles.fieldsColumn}>
                <div className={styles.grid3}>
                  <div className={styles.field}>
                    <FieldLabel label="Nome do produto" required htmlFor="ep-name" />
                    <TextInput
                      id="ep-name"
                      value={main.name}
                      onChange={(event) => setMainField("name", event.target.value)}
                    />
                    {errors.name ? <span className={styles.errorText}>{errors.name}</span> : null}
                  </div>
                  <div className={styles.field}>
                    <FieldLabel label="Categoria" required htmlFor="ep-category" />
                    <SelectInput
                      id="ep-category"
                      value={aux.category}
                      onChange={(event) => setAuxField("category", event.target.value)}
                    >
                      <option value="">Selecione a categoria</option>
                      {categoryOptions.map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </SelectInput>
                    <button type="button" className={styles.inlineActionBtn} onClick={() => void handleCreateCategory()}>
                      + Nova categoria
                    </button>
                    {errors.category ? <span className={styles.errorText}>{errors.category}</span> : null}
                  </div>
                  <div className={styles.field}>
                    <FieldLabel label="Tipo" required htmlFor="ep-type" />
                    <SelectInput id="ep-type" value={aux.type} onChange={(event) => setAuxField("type", event.target.value)}>
                      <option value="">Selecione o tipo</option>
                      {typeOptions.map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </SelectInput>
                    <button type="button" className={styles.inlineActionBtn} onClick={() => void handleCreateType()}>
                      + Novo tipo
                    </button>
                    {errors.type ? <span className={styles.errorText}>{errors.type}</span> : null}
                  </div>
                </div>

                <div className={styles.grid2}>
                  <div className={`${styles.field} ${styles.fieldSpan2}`}>
                    <FieldLabel label="Descrição" htmlFor="ep-description" />
                    <textarea
                      id="ep-description"
                      className={styles.textarea}
                      placeholder="Descreva o produto, especificações, aplicações..."
                      value={aux.description}
                      onChange={(event) => setAuxField("description", event.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <FieldLabel label="Marca" htmlFor="ep-brand" />
                    <SelectInput id="ep-brand" value={aux.brand} onChange={(event) => setAuxField("brand", event.target.value)}>
                      <option value="">Selecione a marca</option>
                      <option value="Diversos">Diversos</option>
                      <option value="Elgin">Elgin</option>
                      <option value="Springer">Springer</option>
                    </SelectInput>
                  </div>
                  <div className={styles.field}>
                    <FieldLabel label="Modelo" htmlFor="ep-model" />
                    <TextInput
                      id="ep-model"
                      placeholder="Modelo do produto"
                      value={aux.model}
                      onChange={(event) => setAuxField("model", event.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <FieldLabel label="SKU (código interno)" required htmlFor="ep-sku" />
                    <div className={styles.iconInputWrap}>
                      <TextInput id="ep-sku" value={main.sku} onChange={(event) => setMainField("sku", event.target.value)} />
                      <button type="button" className={styles.iconBtn} onClick={generateSku} title="Gerar SKU automático">
                        <RefreshIcon />
                      </button>
                    </div>
                    {errors.sku ? <span className={styles.errorText}>{errors.sku}</span> : null}
                  </div>

                  <div className={styles.field}>
                    <FieldLabel label="Código de barras" htmlFor="ep-barcode" />
                    <div className={styles.iconInputWrap}>
                      <TextInput
                        id="ep-barcode"
                        value={aux.barcode}
                        onChange={(event) => setAuxField("barcode", event.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Ler código de barras"
                        onClick={async () => {
                          const clipboard = await navigator.clipboard.readText().catch(() => "");
                          if (clipboard) setAuxField("barcode", clipboard.trim());
                        }}
                      >
                        <BarcodeIcon />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <aside className={styles.uploadColumn}>
                <FieldLabel label="Foto do produto" htmlFor="edit-product-image" />
                <div className={styles.uploadBox}>
                  {imagePreview ? (
                    <div className={styles.uploadPreviewWrap}>
                      <img src={imagePreview} alt="Nova imagem selecionada" className={styles.uploadPreview} />
                      <button type="button" className={styles.removeImageBtn} onClick={clearImageSelection}>
                        Remover nova imagem
                      </button>
                    </div>
                  ) : currentImage ? (
                    <div className={styles.uploadPreviewWrap}>
                      <img src={currentImage.public_url} alt="Imagem atual do produto" className={styles.uploadPreview} />
                      <div className={styles.photoActions}>
                        <label htmlFor="edit-product-image" className={styles.changePhotoBtn}>
                          Alterar foto
                        </label>
                        <button type="button" className={styles.deletePhotoBtn} onClick={() => void removeCurrentImage()} disabled={imageBusy}>
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor="edit-product-image" className={styles.uploadPlaceholder}>
                      <span className={styles.uploadIcon} aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="M12 16V8m0 0l-3 3m3-3l3 3M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <strong>Clique para enviar</strong>
                      <span>ou arraste e solte aqui</span>
                      <small>PNG, JPG até 5MB</small>
                    </label>
                  )}

                  <input
                    id="edit-product-image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className={styles.uploadInput}
                    onChange={(event) => onImageSelect(event.target.files?.[0] ?? null)}
                  />
                </div>
              </aside>
            </div>
          </CardSection>

          <CardSection
            title="Estoque"
            right={
              <ToggleSwitch
                checked={main.controlStock}
                onChange={(checked) => setMainField("controlStock", checked)}
                label="Controlar estoque"
              />
            }
          >
            <div className={`${styles.grid4} ${!main.controlStock ? styles.disabledGrid : ""}`}>
              <div className={styles.field}>
                <FieldLabel label="Estoque atual" required htmlFor="ep-stock" />
                <div className={styles.suffixInputWrap}>
                  <TextInput
                    id="ep-stock"
                    type="text"
                    value={main.stockQuantity}
                    onChange={(event) => setMainField("stockQuantity", event.target.value)}
                    disabled={!main.controlStock}
                  />
                  <span className={styles.inputSuffix}>un</span>
                </div>
                {errors.stockQuantity ? <span className={styles.errorText}>{errors.stockQuantity}</span> : null}
              </div>
              <div className={styles.field}>
                <FieldLabel label="Estoque mínimo" required htmlFor="ep-min-stock" />
                <div className={styles.suffixInputWrap}>
                  <TextInput
                    id="ep-min-stock"
                    type="text"
                    value={aux.minStock}
                    onChange={(event) => setAuxField("minStock", event.target.value)}
                    disabled={!main.controlStock}
                  />
                  <span className={styles.inputSuffix}>un</span>
                </div>
                {errors.minStock ? <span className={styles.errorText}>{errors.minStock}</span> : null}
              </div>
              <div className={styles.field}>
                <FieldLabel label="Unidade" required htmlFor="ep-unit" />
                <SelectInput
                  id="ep-unit"
                  value={aux.unit}
                  onChange={(event) => setAuxField("unit", event.target.value)}
                  disabled={!main.controlStock}
                >
                  <option value="">Selecione a unidade</option>
                  {unitOptions.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </SelectInput>
                <button type="button" className={styles.inlineActionBtn} onClick={() => void handleCreateUnit()}>
                  + Nova unidade
                </button>
                {errors.unit ? <span className={styles.errorText}>{errors.unit}</span> : null}
              </div>
              <div className={styles.field}>
                <FieldLabel label="Localização (opcional)" htmlFor="ep-location" />
                <SelectInput
                  id="ep-location"
                  value={aux.location}
                  onChange={(event) => setAuxField("location", event.target.value)}
                  disabled={!main.controlStock}
                >
                  <option value="">Selecione a localização no estoque</option>
                  {locationOptions.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </SelectInput>
                <button type="button" className={styles.inlineActionBtn} onClick={() => void handleCreateLocation()}>
                  + Nova localização
                </button>
              </div>
            </div>
          </CardSection>

          <CardSection title="Valores">
            <div className={styles.grid4}>
              <div className={styles.field}>
                <FieldLabel label="Preço de custo" required htmlFor="ep-purchase" />
                <TextInput
                  id="ep-purchase"
                  type="text"
                  inputMode="numeric"
                  value={main.purchasePrice}
                  onChange={onPurchasePriceChange}
                />
                {errors.purchasePrice ? <span className={styles.errorText}>{errors.purchasePrice}</span> : null}
              </div>
              <div className={styles.field}>
                <FieldLabel label="Margem de lucro (%)" required htmlFor="ep-margin" />
                <TextInput id="ep-margin" type="text" inputMode="numeric" value={main.margin} onChange={onMarginChange} />
              </div>
              <div className={styles.field}>
                <FieldLabel label="Preço de venda" required htmlFor="ep-sale" />
                <div className={styles.iconInputWrap}>
                  <TextInput
                    id="ep-sale"
                    type="text"
                    inputMode="numeric"
                    value={main.salePrice}
                    onChange={(event) => setMainField("salePrice", formatBrlInputFromDigits(event.target.value))}
                    disabled={main.autoPrice}
                  />
                  {main.autoPrice ? (
                    <span className={styles.lockIcon}>
                      <LockIcon />
                    </span>
                  ) : null}
                </div>
                {errors.salePrice ? <span className={styles.errorText}>{errors.salePrice}</span> : null}
              </div>
              <div className={styles.field}>
                <FieldLabel label="Comissão do técnico (%)" htmlFor="ep-commission" />
                <TextInput
                  id="ep-commission"
                  type="text"
                  inputMode="numeric"
                  value={aux.commission}
                  onChange={(event) => {
                    const rawDigits = event.target.value.replace(/[^\d]/g, "");
                    setAuxField("commission", rawDigits ? percentToInput(Number(rawDigits) / 100) : "0,00");
                  }}
                />
              </div>
            </div>

            <div className={styles.autoPriceRow}>
              <ToggleSwitch
                checked={main.autoPrice}
                onChange={onAutoPriceChange}
                label="Calcular preço de venda automaticamente"
                hint="O preço de venda será calculado com base na margem informada."
              />
            </div>
          </CardSection>

          <CardSection
            title="Aplicação do produto"
            subtitle="Selecione onde este produto poderá ser utilizado."
          >
            <div className={styles.checkboxGrid}>
              <CheckboxChip
                checked={aux.applications.serviceOrder}
                onChange={(checked) => setAuxField("applications", { ...aux.applications, serviceOrder: checked })}
                label="Ordem de serviço"
              />
              <CheckboxChip
                checked={aux.applications.pmoc}
                onChange={(checked) => setAuxField("applications", { ...aux.applications, pmoc: checked })}
                label="PMOC"
              />
              <CheckboxChip
                checked={aux.applications.budget}
                onChange={(checked) => setAuxField("applications", { ...aux.applications, budget: checked })}
                label="Orçamento"
              />
              <CheckboxChip
                checked={aux.applications.directSale}
                onChange={(checked) => setAuxField("applications", { ...aux.applications, directSale: checked })}
                label="Venda direta"
              />
            </div>
          </CardSection>

        </form>
      </div>
      <footer className={styles.actionBar}>
        <div className={styles.actionBarInner}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" form="edit-product-form" className={styles.primaryBtn} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </footer>
    </div>
  );
}
