/**
 * ClientEquipmentManager
 * 
 * Componente para gerenciar equipamentos na ficha do cliente.
 * Inclui listagem em grid/tabela e modal de cadastro com fluxo inteligente.
 * 
 * @example
 * ```tsx
 * import { ClientEquipmentManager } from '@/components/v0-ui/clients';
 * 
 * const equipments = [...];
 * const catalog = { brands: [...], models: [...] };
 * 
 * <ClientEquipmentManager
 *   equipments={equipments}
 *   catalog={catalog}
 *   onAddEquipment={(data) => console.log('Novo equipamento:', data)}
 *   onDeactivate={(id) => console.log('Desativar:', id)}
 *   onDownloadManual={(id) => console.log('Download manual:', id)}
 * />
 * ```
 */

import React, { useState, useRef, useEffect } from "react";

// ============================================================
// TIPOS
// ============================================================

export type EquipmentCategory = "ar_condicionado" | "geladeira" | "bebedouro" | "outros";
export type EquipmentStatus = "ativo" | "inativo";

export interface CatalogBrand {
  id: string;
  name: string;
  categories: EquipmentCategory[];
}

export interface CatalogModel {
  id: string;
  brandId: string;
  name: string;
  category: EquipmentCategory;
  specs: {
    gasType?: string;
    capacityBTU?: number;
    voltage?: string;
    power?: string;
  };
  hasManual: boolean;
}

export interface EquipmentItem {
  id: string;
  category: EquipmentCategory;
  brandId: string;
  brandName: string;
  modelId: string;
  modelName: string;
  serialNumber: string;
  tag: string;
  location: string;
  installationDate: string;
  status: EquipmentStatus;
  specs: {
    gasType?: string;
    capacityBTU?: number;
    voltage?: string;
    power?: string;
  };
  hasManual: boolean;
}

export interface EquipmentCatalog {
  brands: CatalogBrand[];
  models: CatalogModel[];
}

export interface NewEquipmentData {
  category: EquipmentCategory;
  brandId: string;
  modelId: string;
  serialNumber: string;
  tag: string;
  installationDate: string;
}

export interface ClientEquipmentManagerProps {
  equipments: EquipmentItem[];
  catalog: EquipmentCatalog;
  isLoading?: boolean;
  onAddEquipment?: (data: NewEquipmentData) => void;
  onDeactivate?: (equipmentId: string) => void;
  onDownloadManual?: (equipmentId: string) => void;
}

// ============================================================
// CONSTANTES
// ============================================================

const CATEGORY_CONFIG: Record<EquipmentCategory, { label: string; icon: React.ReactNode; color: string }> = {
  ar_condicionado: {
    label: "Ar-Condicionado",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="10" rx="2" />
        <path d="M6 14v4" />
        <path d="M18 14v4" />
        <path d="M6 8h.01" />
        <path d="M10 8h4" />
        <path d="M8 18c2-2 6-2 8 0" />
      </svg>
    ),
    color: "var(--color-primary)",
  },
  geladeira: {
    label: "Geladeira",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M4 10h16" />
        <path d="M8 6h.01" />
        <path d="M8 14h.01" />
      </svg>
    ),
    color: "var(--color-success)",
  },
  bebedouro: {
    label: "Bebedouro",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v6" />
        <path d="M8 8h8l-1 10H9L8 8Z" />
        <path d="M10 18v4" />
        <path d="M14 18v4" />
        <path d="M8 22h8" />
        <circle cx="12" cy="5" r="1" />
      </svg>
    ),
    color: "var(--color-primary-light)",
  },
  outros: {
    label: "Outros",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </svg>
    ),
    color: "var(--color-text-muted)",
  },
};

const STATUS_CONFIG: Record<EquipmentStatus, { label: string; bgColor: string; textColor: string }> = {
  ativo: {
    label: "Ativo",
    bgColor: "rgba(34, 197, 94, 0.1)",
    textColor: "var(--color-success)",
  },
  inativo: {
    label: "Inativo",
    bgColor: "rgba(100, 116, 139, 0.1)",
    textColor: "var(--color-text-muted)",
  },
};

// ============================================================
// ICONES
// ============================================================

const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const BanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="m4.9 4.9 14.2 14.2" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const FileTextIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

const EmptyBoxIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
);

// ============================================================
// ESTILOS BASE
// ============================================================

const baseStyles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.5rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    flexWrap: "wrap" as const,
  },
  title: {
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-semibold)" as const,
    color: "var(--color-text)",
    margin: 0,
  },
  subtitle: {
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-muted)",
    marginTop: "0.25rem",
  },
  addButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    height: "var(--btn-height-base)",
    padding: "0 var(--btn-padding-base)",
    backgroundColor: "var(--color-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "var(--btn-radius)",
    fontSize: "var(--font-size-base)",
    fontWeight: "var(--font-weight-medium)" as const,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "1rem",
  },
  card: {
    backgroundColor: "var(--color-surface-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--card-radius)",
    padding: "var(--card-padding)",
    transition: "box-shadow 0.2s ease, border-color 0.2s ease",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.25rem 0.625rem",
    borderRadius: "9999px",
    fontSize: "var(--font-size-xs)",
    fontWeight: "var(--font-weight-medium)" as const,
    whiteSpace: "nowrap" as const,
  },
};

// ============================================================
// SUBCOMPONENTES
// ============================================================

// Badge de categoria
const CategoryBadge: React.FC<{ category: EquipmentCategory }> = ({ category }) => {
  const config = CATEGORY_CONFIG[category];
  return (
    <span
      style={{
        ...baseStyles.badge,
        backgroundColor: `${config.color}15`,
        color: config.color,
      }}
    >
      <span style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {React.cloneElement(config.icon as React.ReactElement, { width: 14, height: 14 })}
      </span>
      {config.label}
    </span>
  );
};

// Badge de status
const StatusBadge: React.FC<{ status: EquipmentStatus }> = ({ status }) => {
  const config = STATUS_CONFIG[status];
  return (
    <span
      style={{
        ...baseStyles.badge,
        backgroundColor: config.bgColor,
        color: config.textColor,
      }}
    >
      {config.label}
    </span>
  );
};

// Card de equipamento
const EquipmentCard: React.FC<{
  equipment: EquipmentItem;
  onDeactivate?: (id: string) => void;
  onDownloadManual?: (id: string) => void;
}> = ({ equipment, onDeactivate, onDownloadManual }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        ...baseStyles.card,
        boxShadow: isHovered ? "var(--card-shadow-hover)" : "var(--card-shadow)",
        borderColor: isHovered ? "var(--color-primary)" : "var(--color-border)",
        opacity: equipment.status === "inativo" ? 0.7 : 1,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header do card */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <CategoryBadge category={equipment.category} />
            <StatusBadge status={equipment.status} />
          </div>
          <h4 style={{ margin: 0, fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
            {equipment.tag || equipment.location}
          </h4>
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--stat-card-icon-radius)",
            backgroundColor: `${CATEGORY_CONFIG[equipment.category].color}10`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: CATEGORY_CONFIG[equipment.category].color,
            flexShrink: 0,
          }}
        >
          {CATEGORY_CONFIG[equipment.category].icon}
        </div>
      </div>

      {/* Informações do equipamento */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Marca/Modelo</span>
          <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-medium)" }}>
            {equipment.brandName} {equipment.modelName}
          </span>
        </div>
        {equipment.specs.capacityBTU && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)" }}>
            <span style={{ color: "var(--color-text-muted)" }}>Capacidade</span>
            <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-medium)" }}>
              {equipment.specs.capacityBTU.toLocaleString("pt-BR")} BTUs
            </span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)" }}>
          <span style={{ color: "var(--color-text-muted)" }}>N° de Série</span>
          <span style={{ color: "var(--color-text)", fontFamily: "monospace", fontSize: "var(--font-size-xs)" }}>
            {equipment.serialNumber}
          </span>
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: "flex", gap: "0.5rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border)" }}>
        {equipment.hasManual && (
          <button
            onClick={() => onDownloadManual?.(equipment.id)}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              height: "var(--btn-height-sm)",
              padding: "0 var(--btn-padding-sm)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-primary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--btn-radius)",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <DownloadIcon />
            Manual PDF
          </button>
        )}
        {equipment.status === "ativo" && (
          <button
            onClick={() => onDeactivate?.(equipment.id)}
            style={{
              flex: equipment.hasManual ? 0 : 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              height: "var(--btn-height-sm)",
              padding: "0 var(--btn-padding-sm)",
              backgroundColor: "transparent",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--btn-radius)",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <BanIcon />
            Desativar
          </button>
        )}
      </div>
    </div>
  );
};

// Estado vazio
const EmptyState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "3rem 1.5rem",
      backgroundColor: "var(--color-surface)",
      border: "2px dashed var(--color-border)",
      borderRadius: "var(--card-radius)",
      textAlign: "center",
    }}
  >
    <div style={{ color: "var(--color-text-subtle)", marginBottom: "1rem" }}>
      <EmptyBoxIcon />
    </div>
    <h3 style={{ margin: "0 0 0.5rem", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
      Nenhum equipamento cadastrado
    </h3>
    <p style={{ margin: "0 0 1.5rem", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", maxWidth: 320 }}>
      Adicione o primeiro equipamento deste cliente para começar a gerenciar manutenções e histórico.
    </p>
    <button
      onClick={onAdd}
      style={{
        ...baseStyles.addButton,
      }}
    >
      <PlusIcon />
      Adicionar Equipamento
    </button>
  </div>
);

// Skeleton de loading
const EquipmentCardSkeleton: React.FC = () => (
  <div style={{ ...baseStyles.card, animation: "pulse 2s ease-in-out infinite" }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <div style={{ width: 100, height: 24, backgroundColor: "var(--color-border)", borderRadius: 9999 }} />
          <div style={{ width: 60, height: 24, backgroundColor: "var(--color-border)", borderRadius: 9999 }} />
        </div>
        <div style={{ width: 140, height: 20, backgroundColor: "var(--color-border)", borderRadius: 6 }} />
      </div>
      <div style={{ width: 44, height: 44, backgroundColor: "var(--color-border)", borderRadius: "var(--stat-card-icon-radius)" }} />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ width: 80, height: 16, backgroundColor: "var(--color-border)", borderRadius: 4 }} />
        <div style={{ width: 120, height: 16, backgroundColor: "var(--color-border)", borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ width: 70, height: 16, backgroundColor: "var(--color-border)", borderRadius: 4 }} />
        <div style={{ width: 90, height: 16, backgroundColor: "var(--color-border)", borderRadius: 4 }} />
      </div>
    </div>
    <div style={{ display: "flex", gap: "0.5rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border)" }}>
      <div style={{ flex: 1, height: 32, backgroundColor: "var(--color-border)", borderRadius: "var(--btn-radius)" }} />
      <div style={{ flex: 1, height: 32, backgroundColor: "var(--color-border)", borderRadius: "var(--btn-radius)" }} />
    </div>
  </div>
);

// ============================================================
// MODAL DE CADASTRO
// ============================================================

interface AddEquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: EquipmentCatalog;
  onSubmit: (data: NewEquipmentData) => void;
}

const AddEquipmentModal: React.FC<AddEquipmentModalProps> = ({ isOpen, onClose, catalog, onSubmit }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedCategory, setSelectedCategory] = useState<EquipmentCategory | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<CatalogBrand | null>(null);
  const [selectedModel, setSelectedModel] = useState<CatalogModel | null>(null);
  const [brandSearch, setBrandSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [formData, setFormData] = useState({
    serialNumber: "",
    tag: "",
    installationDate: "",
  });

  const brandInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  // Reset ao fechar
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setSelectedCategory(null);
      setSelectedBrand(null);
      setSelectedModel(null);
      setBrandSearch("");
      setModelSearch("");
      setShowBrandDropdown(false);
      setShowModelDropdown(false);
      setFormData({ serialNumber: "", tag: "", installationDate: "" });
    }
  }, [isOpen]);

  // Filtrar marcas por categoria e busca
  const filteredBrands = catalog.brands.filter(
    (brand) =>
      (!selectedCategory || brand.categories.includes(selectedCategory)) &&
      brand.name.toLowerCase().includes(brandSearch.toLowerCase())
  );

  // Filtrar modelos por marca, categoria e busca
  const filteredModels = catalog.models.filter(
    (model) =>
      model.brandId === selectedBrand?.id &&
      model.category === selectedCategory &&
      model.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleCategorySelect = (category: EquipmentCategory) => {
    setSelectedCategory(category);
    setSelectedBrand(null);
    setSelectedModel(null);
    setBrandSearch("");
    setModelSearch("");
    setStep(2);
  };

  const handleBrandSelect = (brand: CatalogBrand) => {
    setSelectedBrand(brand);
    setBrandSearch(brand.name);
    setShowBrandDropdown(false);
    setSelectedModel(null);
    setModelSearch("");
    modelInputRef.current?.focus();
  };

  const handleModelSelect = (model: CatalogModel) => {
    setSelectedModel(model);
    setModelSearch(model.name);
    setShowModelDropdown(false);
    setStep(3);
  };

  const handleSubmit = () => {
    if (!selectedCategory || !selectedBrand || !selectedModel) return;

    onSubmit({
      category: selectedCategory,
      brandId: selectedBrand.id,
      modelId: selectedModel.id,
      serialNumber: formData.serialNumber,
      tag: formData.tag,
      installationDate: formData.installationDate,
    });
    onClose();
  };

  const canProceedToStep4 = selectedModel !== null;
  const canSubmit = formData.serialNumber.trim() && formData.tag.trim();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
          animation: "fadeIn 0.2s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 2rem))",
          maxHeight: "calc(100vh - 2rem)",
          backgroundColor: "var(--color-surface-elevated)",
          borderRadius: "var(--card-radius)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          animation: "scaleIn 0.2s ease",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
              Adicionar Equipamento
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
              Passo {step} de 4
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "var(--btn-radius)",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, backgroundColor: "var(--color-border)" }}>
          <div
            style={{
              height: "100%",
              width: `${(step / 4) * 100}%`,
              backgroundColor: "var(--color-primary)",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {/* Step 1: Seleção de categoria */}
          {step === 1 && (
            <div>
              <h3 style={{ margin: "0 0 1rem", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                Selecione a categoria do equipamento
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
                {(Object.keys(CATEGORY_CONFIG) as EquipmentCategory[]).map((category) => {
                  const config = CATEGORY_CONFIG[category];
                  const isSelected = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      onClick={() => handleCategorySelect(category)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.75rem",
                        padding: "1.25rem",
                        backgroundColor: isSelected ? `${config.color}10` : "var(--color-surface)",
                        border: `2px solid ${isSelected ? config.color : "var(--color-border)"}`,
                        borderRadius: "var(--card-radius)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          backgroundColor: `${config.color}15`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: config.color,
                        }}
                      >
                        {config.icon}
                      </div>
                      <span style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                        {config.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Busca de marca e modelo */}
          {step === 2 && (
            <div>
              <h3 style={{ margin: "0 0 1rem", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                Busque no catálogo
              </h3>

              {/* Campo de marca */}
              <div style={{ marginBottom: "1rem", position: "relative" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                  Marca
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-subtle)" }}>
                    <SearchIcon />
                  </span>
                  <input
                    ref={brandInputRef}
                    type="text"
                    value={brandSearch}
                    onChange={(e) => {
                      setBrandSearch(e.target.value);
                      setShowBrandDropdown(true);
                      setSelectedBrand(null);
                    }}
                    onFocus={() => setShowBrandDropdown(true)}
                    placeholder="Digite para buscar..."
                    style={{
                      width: "100%",
                      height: "var(--input-height)",
                      padding: "0 var(--input-padding-x) 0 2.5rem",
                      backgroundColor: "var(--color-surface)",
                      border: `1px solid ${selectedBrand ? "var(--color-success)" : "var(--color-border)"}`,
                      borderRadius: "var(--input-radius)",
                      fontSize: "var(--font-size-base)",
                      color: "var(--color-text)",
                      outline: "none",
                      transition: "border-color 0.15s ease",
                      boxSizing: "border-box",
                    }}
                  />
                  {selectedBrand && (
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-success)" }}>
                      <CheckIcon />
                    </span>
                  )}
                </div>

                {/* Dropdown de marcas */}
                {showBrandDropdown && filteredBrands.length > 0 && !selectedBrand && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--input-radius)",
                      boxShadow: "var(--card-shadow)",
                      maxHeight: 200,
                      overflowY: "auto",
                      zIndex: 10,
                    }}
                  >
                    {filteredBrands.map((brand) => (
                      <button
                        key={brand.id}
                        onClick={() => handleBrandSelect(brand)}
                        style={{
                          width: "100%",
                          padding: "0.75rem 1rem",
                          backgroundColor: "transparent",
                          border: "none",
                          borderBottom: "1px solid var(--color-border)",
                          textAlign: "left",
                          fontSize: "var(--font-size-base)",
                          color: "var(--color-text)",
                          cursor: "pointer",
                          transition: "background-color 0.15s ease",
                        }}
                      >
                        {brand.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Campo de modelo */}
              <div style={{ position: "relative" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                  Modelo
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-subtle)" }}>
                    <SearchIcon />
                  </span>
                  <input
                    ref={modelInputRef}
                    type="text"
                    value={modelSearch}
                    onChange={(e) => {
                      setModelSearch(e.target.value);
                      setShowModelDropdown(true);
                      setSelectedModel(null);
                    }}
                    onFocus={() => setShowModelDropdown(true)}
                    placeholder={selectedBrand ? "Digite para buscar..." : "Selecione a marca primeiro"}
                    disabled={!selectedBrand}
                    style={{
                      width: "100%",
                      height: "var(--input-height)",
                      padding: "0 var(--input-padding-x) 0 2.5rem",
                      backgroundColor: selectedBrand ? "var(--color-surface)" : "var(--color-border)",
                      border: `1px solid ${selectedModel ? "var(--color-success)" : "var(--color-border)"}`,
                      borderRadius: "var(--input-radius)",
                      fontSize: "var(--font-size-base)",
                      color: "var(--color-text)",
                      outline: "none",
                      transition: "border-color 0.15s ease",
                      boxSizing: "border-box",
                      opacity: selectedBrand ? 1 : 0.6,
                    }}
                  />
                  {selectedModel && (
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-success)" }}>
                      <CheckIcon />
                    </span>
                  )}
                </div>

                {/* Dropdown de modelos */}
                {showModelDropdown && filteredModels.length > 0 && !selectedModel && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--input-radius)",
                      boxShadow: "var(--card-shadow)",
                      maxHeight: 200,
                      overflowY: "auto",
                      zIndex: 10,
                    }}
                  >
                    {filteredModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleModelSelect(model)}
                        style={{
                          width: "100%",
                          padding: "0.75rem 1rem",
                          backgroundColor: "transparent",
                          border: "none",
                          borderBottom: "1px solid var(--color-border)",
                          textAlign: "left",
                          fontSize: "var(--font-size-base)",
                          color: "var(--color-text)",
                          cursor: "pointer",
                          transition: "background-color 0.15s ease",
                        }}
                      >
                        <div style={{ fontWeight: "var(--font-weight-medium)" }}>{model.name}</div>
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 2 }}>
                          {model.specs.capacityBTU ? `${model.specs.capacityBTU.toLocaleString("pt-BR")} BTUs` : ""} 
                          {model.specs.gasType ? ` • ${model.specs.gasType}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Ficha técnica autopreenchida */}
          {step === 3 && selectedModel && (
            <div>
              <h3 style={{ margin: "0 0 1rem", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                Ficha técnica do catálogo
              </h3>

              <div
                style={{
                  padding: "1.25rem",
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--card-radius)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: `${CATEGORY_CONFIG[selectedCategory!].color}15`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: CATEGORY_CONFIG[selectedCategory!].color,
                    }}
                  >
                    {CATEGORY_CONFIG[selectedCategory!].icon}
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                      {selectedBrand?.name} {selectedModel.name}
                    </div>
                    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                      {CATEGORY_CONFIG[selectedCategory!].label}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
                  {selectedModel.specs.capacityBTU && (
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>Capacidade</div>
                      <div style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                        {selectedModel.specs.capacityBTU.toLocaleString("pt-BR")} BTUs
                      </div>
                    </div>
                  )}
                  {selectedModel.specs.gasType && (
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>Tipo de Gás</div>
                      <div style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                        {selectedModel.specs.gasType}
                      </div>
                    </div>
                  )}
                  {selectedModel.specs.voltage && (
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>Voltagem</div>
                      <div style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                        {selectedModel.specs.voltage}
                      </div>
                    </div>
                  )}
                  {selectedModel.specs.power && (
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>Potência</div>
                      <div style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                        {selectedModel.specs.power}
                      </div>
                    </div>
                  )}
                </div>

                {/* Indicador de manual disponível */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginTop: "1rem",
                    padding: "0.75rem",
                    backgroundColor: selectedModel.hasManual ? "rgba(34, 197, 94, 0.1)" : "rgba(100, 116, 139, 0.1)",
                    borderRadius: "var(--btn-radius)",
                  }}
                >
                  <FileTextIcon />
                  <span style={{ fontSize: "var(--font-size-sm)", color: selectedModel.hasManual ? "var(--color-success)" : "var(--color-text-muted)" }}>
                    {selectedModel.hasManual ? "Manual técnico disponível" : "Manual não disponível"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Dados da instalação */}
          {step === 4 && (
            <div>
              <h3 style={{ margin: "0 0 1rem", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                Dados da instalação
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                    Número de Série *
                  </label>
                  <input
                    type="text"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData((prev) => ({ ...prev, serialNumber: e.target.value }))}
                    placeholder="Ex: SN123456789"
                    style={{
                      width: "100%",
                      height: "var(--input-height)",
                      padding: "0 var(--input-padding-x)",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--input-radius)",
                      fontSize: "var(--font-size-base)",
                      color: "var(--color-text)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                    Tag / Localização do Aparelho *
                  </label>
                  <input
                    type="text"
                    value={formData.tag}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tag: e.target.value }))}
                    placeholder="Ex: Sala da Diretoria, Recepção..."
                    style={{
                      width: "100%",
                      height: "var(--input-height)",
                      padding: "0 var(--input-padding-x)",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--input-radius)",
                      fontSize: "var(--font-size-base)",
                      color: "var(--color-text)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                    Data de Instalação
                  </label>
                  <input
                    type="date"
                    value={formData.installationDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, installationDate: e.target.value }))}
                    style={{
                      width: "100%",
                      height: "var(--input-height)",
                      padding: "0 var(--input-padding-x)",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--input-radius)",
                      fontSize: "var(--font-size-base)",
                      color: "var(--color-text)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <button
            onClick={() => {
              if (step === 1) {
                onClose();
              } else {
                setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
              }
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              height: "var(--btn-height-base)",
              padding: "0 var(--btn-padding-base)",
              backgroundColor: "transparent",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--btn-radius)",
              fontSize: "var(--font-size-base)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <ChevronLeftIcon />
            {step === 1 ? "Cancelar" : "Voltar"}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep((prev) => (prev + 1) as 1 | 2 | 3 | 4)}
              disabled={step === 2 && !canProceedToStep4}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                height: "var(--btn-height-base)",
                padding: "0 var(--btn-padding-base)",
                backgroundColor: step === 2 && !canProceedToStep4 ? "var(--color-border)" : "var(--color-primary)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--btn-radius)",
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-medium)",
                cursor: step === 2 && !canProceedToStep4 ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                opacity: step === 2 && !canProceedToStep4 ? 0.6 : 1,
              }}
            >
              Continuar
              <ChevronRightIcon />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                height: "var(--btn-height-base)",
                padding: "0 var(--btn-padding-base)",
                backgroundColor: canSubmit ? "var(--color-success)" : "var(--color-border)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--btn-radius)",
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-medium)",
                cursor: canSubmit ? "pointer" : "not-allowed",
                transition: "all 0.15s ease",
                opacity: canSubmit ? 1 : 0.6,
              }}
            >
              <CheckIcon />
              Salvar Equipamento
            </button>
          )}
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export const ClientEquipmentManager: React.FC<ClientEquipmentManagerProps> = ({
  equipments,
  catalog,
  isLoading = false,
  onAddEquipment,
  onDeactivate,
  onDownloadManual,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleSubmit = (data: NewEquipmentData) => {
    onAddEquipment?.(data);
    handleCloseModal();
  };

  return (
    <div style={baseStyles.container}>
      {/* Header */}
      <div style={baseStyles.header}>
        <div>
          <h3 style={baseStyles.title}>Equipamentos</h3>
          <p style={baseStyles.subtitle}>
            {equipments.length === 0
              ? "Nenhum equipamento cadastrado"
              : `${equipments.length} equipamento${equipments.length > 1 ? "s" : ""} cadastrado${equipments.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {equipments.length > 0 && (
          <button onClick={handleOpenModal} style={baseStyles.addButton}>
            <PlusIcon />
            Adicionar Equipamento
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={baseStyles.grid}>
          {[1, 2, 3].map((i) => (
            <EquipmentCardSkeleton key={i} />
          ))}
        </div>
      ) : equipments.length === 0 ? (
        <EmptyState onAdd={handleOpenModal} />
      ) : (
        <div style={baseStyles.grid}>
          {equipments.map((equipment) => (
            <EquipmentCard
              key={equipment.id}
              equipment={equipment}
              onDeactivate={onDeactivate}
              onDownloadManual={onDownloadManual}
            />
          ))}
        </div>
      )}

      {/* Modal de cadastro */}
      <AddEquipmentModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        catalog={catalog}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

// ============================================================
// DADOS MOCK PARA EXEMPLO
// ============================================================

export const mockCatalog: EquipmentCatalog = {
  brands: [
    { id: "1", name: "Carrier", categories: ["ar_condicionado"] },
    { id: "2", name: "LG", categories: ["ar_condicionado", "geladeira"] },
    { id: "3", name: "Samsung", categories: ["ar_condicionado", "geladeira"] },
    { id: "4", name: "Consul", categories: ["geladeira", "bebedouro"] },
    { id: "5", name: "Electrolux", categories: ["geladeira", "bebedouro"] },
    { id: "6", name: "IBBL", categories: ["bebedouro"] },
    { id: "7", name: "Midea", categories: ["ar_condicionado"] },
  ],
  models: [
    { id: "m1", brandId: "1", name: "Hi Wall Inverter 9000", category: "ar_condicionado", specs: { gasType: "R-410A", capacityBTU: 9000, voltage: "220V" }, hasManual: true },
    { id: "m2", brandId: "1", name: "Hi Wall Inverter 12000", category: "ar_condicionado", specs: { gasType: "R-410A", capacityBTU: 12000, voltage: "220V" }, hasManual: true },
    { id: "m3", brandId: "1", name: "Hi Wall Inverter 18000", category: "ar_condicionado", specs: { gasType: "R-410A", capacityBTU: 18000, voltage: "220V" }, hasManual: true },
    { id: "m4", brandId: "2", name: "Dual Inverter Voice 12000", category: "ar_condicionado", specs: { gasType: "R-32", capacityBTU: 12000, voltage: "220V" }, hasManual: true },
    { id: "m5", brandId: "2", name: "Dual Inverter Voice 18000", category: "ar_condicionado", specs: { gasType: "R-32", capacityBTU: 18000, voltage: "220V" }, hasManual: true },
    { id: "m6", brandId: "3", name: "WindFree 9000", category: "ar_condicionado", specs: { gasType: "R-32", capacityBTU: 9000, voltage: "220V" }, hasManual: true },
    { id: "m7", brandId: "7", name: "Springer Midea 12000", category: "ar_condicionado", specs: { gasType: "R-410A", capacityBTU: 12000, voltage: "220V" }, hasManual: false },
    { id: "m8", brandId: "2", name: "Bottom Freezer 423L", category: "geladeira", specs: { voltage: "220V", power: "120W" }, hasManual: true },
    { id: "m9", brandId: "4", name: "Frost Free 340L", category: "geladeira", specs: { voltage: "127V", power: "90W" }, hasManual: true },
    { id: "m10", brandId: "6", name: "PDF 300", category: "bebedouro", specs: { voltage: "220V", power: "80W" }, hasManual: true },
    { id: "m11", brandId: "6", name: "Compact FN2000", category: "bebedouro", specs: { voltage: "127V", power: "65W" }, hasManual: false },
  ],
};

export const mockEquipments: EquipmentItem[] = [
  {
    id: "eq1",
    category: "ar_condicionado",
    brandId: "1",
    brandName: "Carrier",
    modelId: "m2",
    modelName: "Hi Wall Inverter 12000",
    serialNumber: "CRR2024001234",
    tag: "Diretoria",
    location: "Sala da Diretoria - 2° Andar",
    installationDate: "2024-03-15",
    status: "ativo",
    specs: { gasType: "R-410A", capacityBTU: 12000, voltage: "220V" },
    hasManual: true,
  },
  {
    id: "eq2",
    category: "ar_condicionado",
    brandId: "2",
    brandName: "LG",
    modelId: "m4",
    modelName: "Dual Inverter Voice 12000",
    serialNumber: "LG2024005678",
    tag: "Recepção",
    location: "Recepção Principal",
    installationDate: "2024-01-20",
    status: "ativo",
    specs: { gasType: "R-32", capacityBTU: 12000, voltage: "220V" },
    hasManual: true,
  },
  {
    id: "eq3",
    category: "bebedouro",
    brandId: "6",
    brandName: "IBBL",
    modelId: "m10",
    modelName: "PDF 300",
    serialNumber: "IBBL2023009999",
    tag: "Copa",
    location: "Copa - Térreo",
    installationDate: "2023-08-10",
    status: "inativo",
    specs: { voltage: "220V", power: "80W" },
    hasManual: true,
  },
];

export default ClientEquipmentManager;
