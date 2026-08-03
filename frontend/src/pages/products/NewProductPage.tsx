import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useOutletContext } from "react-router-dom";
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
import { createProduct } from "../../api/products";
import { uploadProductImage } from "../../api/productImages";
import { formatBrlInputFromDigits, numberToBrlInput, parseBrlInputToNumber } from "../../lib/currencyBrInput";
import { isInventoryActive } from "../../lib/planProducts";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./NewProductPage.module.css";

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

function CardSection({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
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

function UploadImageBox({
  filePreview,
  onFile,
  onRemove,
}: {
  filePreview: string | null;
  onFile: (file: File | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className={styles.uploadBox}>
      <input
        id="new-product-image"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className={styles.uploadInput}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      {!filePreview ? (
        <label htmlFor="new-product-image" className={styles.uploadPlaceholder}>
          <span className={styles.uploadIcon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 16V8m0 0l-3 3m3-3l3 3M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <strong>Clique para enviar</strong>
          <span>ou arraste e solte aqui</span>
          <small>PNG, JPG até 5MB</small>
        </label>
      ) : (
        <div className={styles.uploadPreviewWrap}>
          <img src={filePreview} alt="Pré-visualização da imagem do produto" className={styles.uploadPreview} />
          <button type="button" className={styles.removeImageBtn} onClick={onRemove}>
            Remover imagem
          </button>
        </div>
      )}
    </div>
  );
}

export function NewProductPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const inventoryEnabledByPlan = isInventoryActive(ctx?.tenant);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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
    minStock: "0",
    unit: "",
    location: "",
    commission: "0,00",
    applications: {
      serviceOrder: true,
      pmoc: true,
      budget: true,
      directSale: true,
    },
  });

  const parsedPurchase = useMemo(() => parseBrlInputToNumber(main.purchasePrice), [main.purchasePrice]);

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

  function setMainField<K extends keyof MainState>(field: K, value: MainState[K]) {
    setMain((prev) => ({ ...prev, [field]: value }));
  }

  function setAuxField<K extends keyof AuxFormState>(field: K, value: AuxFormState[K]) {
    setAux((prev) => ({ ...prev, [field]: value }));
  }

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
    const reader = new FileReader();
    reader.onload = () => setImagePreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setSelectedImage(null);
    setImagePreview(null);
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
    if (!validate()) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }

    setSaving(true);
    try {
      const created = await createProduct({
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
        try {
          await uploadProductImage(created.id, selectedImage);
        } catch (uploadErr) {
          toast.error(uploadErr instanceof Error ? uploadErr.message : "Produto salvo, mas falhou o upload da imagem.");
        }
      }
      toast.success("Produto cadastrado com sucesso!");
      navigate(`/app/products/${created.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar produto.");
    } finally {
      setSaving(false);
    }
  }

  if (!ctx) return <Navigate to="/login" replace />;
  if (!canEdit) return <Navigate to="/app/products" replace />;

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
          <span className={styles.breadcrumbCurrent}>Novo produto</span>
        </nav>

        <header className={styles.pageHeader}>
          <div className={styles.headerMain}>
            <span className={styles.headerIcon} aria-hidden>
              <PackageIcon />
            </span>
            <div>
              <h1 className={styles.pageTitle}>Novo produto</h1>
              <p className={styles.pageSubtitle}>Cadastre um novo produto no sistema</p>
            </div>
          </div>
        </header>

        <form id="new-product-form" onSubmit={onSubmit} className={styles.formStack}>
          <CardSection title="Dados principais">
            <div className={styles.mainGrid}>
              <div className={styles.fieldsColumn}>
                <div className={styles.grid3}>
                  <div className={styles.field}>
                    <FieldLabel label="Nome do produto" required htmlFor="np-name" />
                    <TextInput
                      id="np-name"
                      placeholder="Ex: Acabamento terminal 60mm"
                      value={main.name}
                      onChange={(event) => setMainField("name", event.target.value)}
                    />
                    {errors.name ? <span className={styles.errorText}>{errors.name}</span> : null}
                  </div>
                  <div className={styles.field}>
                    <FieldLabel label="Categoria" required htmlFor="np-category" />
                    <SelectInput
                      id="np-category"
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
                    <FieldLabel label="Tipo" required htmlFor="np-type" />
                    <SelectInput id="np-type" value={aux.type} onChange={(event) => setAuxField("type", event.target.value)}>
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
                    <FieldLabel label="Descrição" htmlFor="np-description" />
                    <textarea
                      id="np-description"
                      className={styles.textarea}
                      placeholder="Descreva o produto, especificações, aplicações..."
                      value={aux.description}
                      onChange={(event) => setAuxField("description", event.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <FieldLabel label="Marca" htmlFor="np-brand" />
                    <SelectInput id="np-brand" value={aux.brand} onChange={(event) => setAuxField("brand", event.target.value)}>
                      <option value="">Selecione a marca</option>
                      <option value="elgin">Elgin</option>
                      <option value="springer">Springer</option>
                      <option value="generica">Genérica</option>
                    </SelectInput>
                  </div>
                  <div className={styles.field}>
                    <FieldLabel label="Modelo" htmlFor="np-model" />
                    <TextInput
                      id="np-model"
                      placeholder="Modelo do produto"
                      value={aux.model}
                      onChange={(event) => setAuxField("model", event.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <FieldLabel label="SKU (código interno)" required htmlFor="np-sku" />
                    <div className={styles.iconInputWrap}>
                      <TextInput
                        id="np-sku"
                        placeholder="Ex: ACA-00001"
                        value={main.sku}
                        onChange={(event) => setMainField("sku", event.target.value)}
                      />
                      <button type="button" className={styles.iconBtn} onClick={generateSku} title="Gerar SKU automático">
                        <RefreshIcon />
                      </button>
                    </div>
                    {errors.sku ? <span className={styles.errorText}>{errors.sku}</span> : null}
                  </div>

                  <div className={styles.field}>
                    <FieldLabel label="Código de barras" htmlFor="np-barcode" />
                    <div className={styles.iconInputWrap}>
                      <TextInput
                        id="np-barcode"
                        placeholder="7891234567890"
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
                <FieldLabel label="Foto do produto" htmlFor="new-product-image" />
                <UploadImageBox filePreview={imagePreview} onFile={onImageSelect} onRemove={clearImage} />
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
                <FieldLabel label="Estoque atual" required htmlFor="np-stock" />
                <div className={styles.suffixInputWrap}>
                  <TextInput
                    id="np-stock"
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
                <FieldLabel label="Estoque mínimo" required htmlFor="np-min-stock" />
                <div className={styles.suffixInputWrap}>
                  <TextInput
                    id="np-min-stock"
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
                <FieldLabel label="Unidade" required htmlFor="np-unit" />
                <SelectInput
                  id="np-unit"
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
                <FieldLabel label="Localização (opcional)" htmlFor="np-location" />
                <SelectInput
                  id="np-location"
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
                <FieldLabel label="Preço de custo" required htmlFor="np-purchase" />
                <TextInput
                  id="np-purchase"
                  type="text"
                  inputMode="numeric"
                  value={main.purchasePrice}
                  onChange={onPurchasePriceChange}
                  placeholder="R$ 0,00"
                />
                {errors.purchasePrice ? <span className={styles.errorText}>{errors.purchasePrice}</span> : null}
              </div>
              <div className={styles.field}>
                <FieldLabel label="Margem de lucro (%)" required htmlFor="np-margin" />
                <TextInput
                  id="np-margin"
                  type="text"
                  inputMode="numeric"
                  value={main.margin}
                  onChange={onMarginChange}
                  placeholder="0,00"
                />
              </div>
              <div className={styles.field}>
                <FieldLabel label="Preço de venda" required htmlFor="np-sale" />
                <div className={styles.iconInputWrap}>
                  <TextInput
                    id="np-sale"
                    type="text"
                    inputMode="numeric"
                    value={main.salePrice}
                    onChange={(event) => setMainField("salePrice", formatBrlInputFromDigits(event.target.value))}
                    disabled={main.autoPrice}
                    placeholder="R$ 0,00"
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
                <FieldLabel label="Comissão do técnico (%)" htmlFor="np-commission" />
                <TextInput
                  id="np-commission"
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
                onChange={(checked) =>
                  setAuxField("applications", { ...aux.applications, serviceOrder: checked })
                }
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
                onChange={(checked) =>
                  setAuxField("applications", { ...aux.applications, directSale: checked })
                }
                label="Venda direta"
              />
            </div>
          </CardSection>

        </form>
      </div>
      <footer className={styles.actionBar}>
        <div className={styles.actionBarInner}>
          <Link to="/app/products" className={styles.secondaryBtn}>
            Cancelar
          </Link>
          <button type="submit" form="new-product-form" className={styles.primaryBtn} disabled={saving}>
            {saving ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </footer>
    </div>
  );
}
