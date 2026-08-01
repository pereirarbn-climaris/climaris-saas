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

import React, { useState, useEffect } from "react";
import { listClientSites, type ClientSiteOut } from "../../../api/clients";
import { useKnowledgeChatContextOptional } from "../../../context/KnowledgeChatContext";
import {
  updateClientCatalogEquipmentSite,
  fetchPendingIdentificationCatalog,
} from "../../../api/equipmentCatalog";
import type { CategoryFieldDefinition, TechnicalSpecRow } from "../../../lib/categoryFieldDefinitions";
import { generateQrCodes, validateQrCode } from "../../../api/qrcodes";
import { parseScannedQrCode } from "../../../lib/qrcodeScan";
import { buildQrLabelPreviewItems, buildQrLabelsPdfBlob } from "../../../lib/qrcodeLabelsPdf";
import { QrCodeScannerModal } from "../../qrcodes/QrCodeScannerModal";
import { EquipmentQrCodeCard } from "../../equipment/EquipmentQrCodeCard";
import { EquipmentSheetModal } from "../../equipment/EquipmentSheetModal";
import { EquipmentTechnicalSpecsGrid } from "../../equipment/EquipmentTechnicalSpecsGrid";
import { ClientAddEquipmentModeChoose } from "../../clients/ClientAddEquipmentModeChoose";
import {
  ClientAddEquipmentAiPanel,
  type ClientAddEquipmentAiForm,
} from "../../clients/ClientAddEquipmentAiPanel";
import { InstallationSiteField } from "../../clients/ClientAddEquipmentInstallationSiteField";
import type { EquipmentLabelResolveOut } from "../../../api/equipmentCatalogAi";
import { categoryFromLabelResolve } from "../../../lib/equipmentLabelResolveCategory";

// ============================================================
// TIPOS
// ============================================================

import {
  getCategoryVisual,
  isAcLikeIconKey,
  supportsMultiSplitCategory,
  type CategoryIconKey,
} from "../../../lib/equipmentCategoryIcons";
import { matchesCatalogSearch } from "../../../lib/catalogSearch";

export type EquipmentCategory = CategoryIconKey;

/**
 * Categorias habilitadas para NOVO cadastro de equipamento na ficha do cliente.
 * Por decisão de produto (jul/2026), o cadastro fica restrito a Ar-condicionado
 * e Climatizador — as demais (geladeira, bebedouro, outros) ficam ocultas por
 * enquanto, sem remover o suporte já existente no catálogo/backend.
 */
const ENABLED_EQUIPMENT_CATEGORY_ICON_KEYS: CategoryIconKey[] = ["ar_condicionado", "climatizador"];

export type EquipmentCategoryPickerOption = {
  id: string;
  name: string;
  iconKey: CategoryIconKey;
};
export type EquipmentStatus = "ativo" | "inativo";

export interface CatalogBrand {
  id: string;
  name: string;
  categories: EquipmentCategory[];
}

export type CatalogComponentType = "UNICO" | "EVAPORADORA" | "CONDENSADORA";

export interface CatalogModel {
  id: string;
  brandId: string;
  categoryId?: string;
  name: string;
  category: EquipmentCategory;
  componentType?: CatalogComponentType;
  specs: {
    gasType?: string;
    capacityBTU?: number;
    voltage?: string;
    power?: string;
  };
  fieldDefinitions?: CategoryFieldDefinition[];
  technicalData?: Record<string, string>;
  technicalSpecs?: TechnicalSpecRow[];
  hasManual: boolean;
}

export interface InstalledComponentView {
  id: string;
  componentType: string;
  brand: string;
  model: string;
  capacity: string | null;
  manualUrl: string | null;
  serialNumber: string;
  fieldDefinitions?: CategoryFieldDefinition[];
  technicalData?: Record<string, string>;
  technicalSpecs?: TechnicalSpecRow[];
}

export interface EquipmentItem {
  id: string;
  category: EquipmentCategory;
  categoryName?: string;
  brandId: string;
  brandName: string;
  modelId: string;
  modelName: string;
  serialNumber: string;
  tag: string;
  installationReference?: string;
  location: string;
  installationDate: string;
  manufactureYear?: number | null;
  gasChargeKg?: number | null;
  notes?: string | null;
  status: EquipmentStatus;
  specs: {
    gasType?: string;
    capacityBTU?: number;
    voltage?: string;
    power?: string;
  };
  fieldDefinitions?: CategoryFieldDefinition[];
  technicalData?: Record<string, string>;
  technicalSpecs?: TechnicalSpecRow[];
  legacyEquipmentId?: number | null;
  publicToken?: string | null;
  /** Cartela QR vinculada (ex.: QR0000012). */
  qrcodeCodeId?: string | null;
  /** true quando o equipamento foi cadastrado sem marca/modelo conhecidos
   * ("a identificar") — precisa ser identificado em campo. */
  pendingIdentification?: boolean;
  hasManual: boolean;
  /** Pode excluir permanentemente (sem vínculos em OS, PMOC, etc.). */
  canDelete?: boolean;
  deleteBlockReason?: string | null;
  /** Peças da instalação (multi-split). */
  components?: InstalledComponentView[];
  /** Filial/obra vinculada (null = matriz). */
  clientSiteId?: number | null;
  siteName?: string;
}

export interface EquipmentCatalog {
  brands: CatalogBrand[];
  models: CatalogModel[];
}

export interface NewEquipmentComponentData {
  catalogId: string;
  serialNumber: string;
  label: string;
  componentType: CatalogComponentType;
}

export interface NewEquipmentData {
  category: EquipmentCategory;
  isMultiSplit: boolean;
  /** Cartela QR pré-impressa (code_id, ex.: QR0000035 ou QRA0000001). */
  qrcodeCodeId?: string | null;
  /** Unidade simples (legado). */
  brandId?: string;
  modelId?: string;
  serialNumber?: string;
  /** Multi-split: condensadora + evaporadoras. */
  components?: NewEquipmentComponentData[];
  tag: string;
  installationReference?: string;
  installationDate: string;
  manufactureYear?: number | null;
  gasChargeKg?: number | null;
  notes?: string | null;
  /** Filial/obra; omitir ou null = endereço principal / matriz. */
  clientSiteId?: number | null;
}

export interface ClientEquipmentManagerProps {
  clientId?: number;
  /** Unidades do cliente (filiais/obras) para vínculo no cadastro de equipamento. */
  clientSites?: ClientSiteOut[];
  equipments: EquipmentItem[];
  catalog: EquipmentCatalog;
  /** Categorias da API (Operação). Se omitido, usa lista padrão de ícones. */
  categoryOptions?: EquipmentCategoryPickerOption[];
  isLoading?: boolean;
  /** Pode retornar Promise; o modal só fecha após sucesso. */
  onAddEquipment?: (data: NewEquipmentData) => void | Promise<void>;
  onDeactivate?: (equipmentId: string) => void;
  onDelete?: (equipmentId: string) => void;
  /** `manualUrl` opcional: manual de um componente específico do conjunto. */
  onDownloadManual?: (equipmentId: string, manualUrl?: string | null) => void;
  /** Abre o modal de cadastro com obra pré-selecionada (disparado pela aba Filiais). */
  modalOpenRequest?: { clientSiteId: number | null } | null;
  onModalOpenRequestHandled?: () => void;
  /** Recarrega listagem após transferência de obra. */
  onEquipmentsChanged?: () => void;
  readOnly?: boolean;
}

function componentTypeLabel(type: string): string {
  if (type === "CONDENSADORA") return "Condensadora";
  if (type === "EVAPORADORA") return "Evaporadora";
  return "Unidade";
}

function isMultiSplitInstallation(equipment: EquipmentItem): boolean {
  const parts = equipment.components ?? [];
  if (parts.length <= 1) return false;
  return parts.some((c) => c.componentType === "CONDENSADORA" || c.componentType === "EVAPORADORA");
}

function sortInstallationComponents(parts: InstalledComponentView[]): InstalledComponentView[] {
  const rank = (t: string) => (t === "CONDENSADORA" ? 0 : t === "EVAPORADORA" ? 1 : 2);
  return [...parts].sort((a, b) => rank(a.componentType) - rank(b.componentType));
}

function multiSplitSizeLabel(parts: InstalledComponentView[]): string {
  const evapCount = parts.filter((p) => p.componentType === "EVAPORADORA").length;
  if (evapCount <= 0) return `${parts.length} componentes`;
  if (evapCount === 1) return "Bi-Split";
  if (evapCount === 2) return "Tri-Split";
  if (evapCount === 3) return "Quadri-Split";
  return `Multi-Split (${evapCount} evaporadoras)`;
}

function componentAccentColor(type: string): string {
  if (type === "CONDENSADORA") return "var(--color-primary)";
  if (type === "EVAPORADORA") return "var(--color-success)";
  return "var(--color-text-muted)";
}

const InstallationComponentRow: React.FC<{
  part: InstalledComponentView;
  label: string;
  equipmentId: string;
  onDownloadManual?: (equipmentId: string, manualUrl?: string | null) => void;
}> = ({ part, label, equipmentId, onDownloadManual }) => (
  <div
    style={{
      display: "flex",
      gap: "0.75rem",
      padding: "0.75rem",
      backgroundColor: "var(--color-surface)",
      borderRadius: "var(--btn-radius)",
      border: "1px solid var(--color-border)",
      borderLeft: `3px solid ${componentAccentColor(part.componentType)}`,
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: "var(--font-size-xs)",
          fontWeight: "var(--font-weight-semibold)",
          color: componentAccentColor(part.componentType),
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
        {part.brand} · {part.model}
      </div>
      {part.technicalSpecs && part.technicalSpecs.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <EquipmentTechnicalSpecsGrid specs={part.technicalSpecs.slice(0, 3)} compact />
        </div>
      ) : null}
      <div
        style={{
          fontSize: "var(--font-size-xs)",
          color: "var(--color-text-muted)",
          marginTop: 6,
          fontFamily: "monospace",
        }}
      >
        Série: {part.serialNumber || "—"}
      </div>
    </div>
    {part.manualUrl ? (
      <button
        type="button"
        title="Abrir manual deste componente"
        onClick={() => onDownloadManual?.(equipmentId, part.manualUrl)}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          flexShrink: 0,
          backgroundColor: "var(--color-surface-elevated)",
          color: "var(--color-primary)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--btn-radius)",
          cursor: "pointer",
        }}
      >
        <FileTextIcon />
      </button>
    ) : null}
  </div>
);

const InstallationComponentsList: React.FC<{
  equipment: EquipmentItem;
  onDownloadManual?: (equipmentId: string, manualUrl?: string | null) => void;
}> = ({ equipment, onDownloadManual }) => {
  const parts = sortInstallationComponents(equipment.components ?? []);
  let evapIndex = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {parts.map((part) => {
        let label = componentTypeLabel(part.componentType);
        if (part.componentType === "EVAPORADORA") {
          evapIndex += 1;
          const evapTotal = parts.filter((p) => p.componentType === "EVAPORADORA").length;
          if (evapTotal > 1) label = `Evaporadora ${evapIndex}`;
        }
        return (
          <InstallationComponentRow
            key={part.id}
            part={part}
            label={label}
            equipmentId={equipment.id}
            onDownloadManual={onDownloadManual}
          />
        );
      })}
    </div>
  );
};

// ============================================================
// CONSTANTES
// ============================================================

function categoryUi(category: EquipmentCategory) {
  const visual = getCategoryVisual(category);
  const Icon = visual.Icon;
  return {
    label: visual.label,
    icon: <Icon size={24} />,
    color: visual.accentColor,
  };
}

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

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
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

const IconInfoOutline = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <line x1="12" y1="8" x2="12" y2="8.01" />
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
  const config = categoryUi(category);
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

// Badge de filial/obra
const SiteInstallationBadge: React.FC<{ siteName?: string | null }> = ({ siteName }) => {
  if (!siteName?.trim()) return null;
  return (
    <span
      style={{
        ...baseStyles.badge,
        backgroundColor: "rgba(234, 179, 8, 0.14)",
        color: "#a16207",
        maxWidth: "100%",
      }}
      title={`Instalado em: ${siteName}`}
    >
      {siteName}
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
  onOpenSheet?: (id: string) => void;
  onDeactivate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDownloadManual?: (id: string) => void;
  onChangeSite?: (equipment: EquipmentItem) => void;
}> = ({ equipment, onOpenSheet, onDeactivate, onDelete, onDownloadManual, onChangeSite }) => {
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
            {isMultiSplitInstallation(equipment) && (
              <span
                style={{
                  ...baseStyles.badge,
                  backgroundColor: "rgba(59, 130, 246, 0.12)",
                  color: "var(--color-primary)",
                }}
              >
                Multi-Split
              </span>
            )}
            <StatusBadge status={equipment.status} />
            <SiteInstallationBadge siteName={equipment.siteName} />
          </div>
          <h4 style={{ margin: 0, fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
            {equipment.tag || equipment.location}
          </h4>
          {isMultiSplitInstallation(equipment) && equipment.components && (
            <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
              {multiSplitSizeLabel(equipment.components)} · {equipment.components.length} componentes
            </p>
          )}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--stat-card-icon-radius)",
            backgroundColor: `${categoryUi(equipment.category).color}10`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: categoryUi(equipment.category).color,
            flexShrink: 0,
          }}
        >
          {categoryUi(equipment.category).icon}
        </div>
      </div>

      {/* Informações do equipamento */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
        {isMultiSplitInstallation(equipment) && equipment.components ? (
          <InstallationComponentsList equipment={equipment} onDownloadManual={onDownloadManual} />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)" }}>
              <span style={{ color: "var(--color-text-muted)" }}>Marca/Modelo</span>
              <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-medium)" }}>
                {equipment.brandName} {equipment.modelName}
              </span>
            </div>
            {equipment.technicalSpecs && equipment.technicalSpecs.length > 0 ? (
              <EquipmentTechnicalSpecsGrid specs={equipment.technicalSpecs.slice(0, 4)} compact />
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)" }}>
              <span style={{ color: "var(--color-text-muted)" }}>N° de Série</span>
              <span style={{ color: "var(--color-text)", fontFamily: "monospace", fontSize: "var(--font-size-xs)" }}>
                {equipment.serialNumber || "—"}
              </span>
            </div>
          </>
        )}
      </div>

      {equipment.installationDate && isMultiSplitInstallation(equipment) && (
        <p style={{ margin: "0 0 0.75rem", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          Instalado em: {new Date(equipment.installationDate + "T12:00:00").toLocaleDateString("pt-BR")}
        </p>
      )}

      {/* Ações */}
      <div style={{ display: "flex", gap: "0.5rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border)", flexWrap: "wrap" }}>
        {onOpenSheet ? (
          <button
            type="button"
            onClick={() => onOpenSheet(equipment.id)}
            style={{
              flex: 1,
              minWidth: "7rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "var(--btn-height-sm)",
              padding: "0 var(--btn-padding-sm)",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--btn-radius)",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
            }}
          >
            Ver ficha
          </button>
        ) : null}
        {onChangeSite ? (
          <button
            type="button"
            onClick={() => onChangeSite(equipment)}
            style={{
              flex: 1,
              minWidth: "7rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "var(--btn-height-sm)",
              padding: "0 var(--btn-padding-sm)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--btn-radius)",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
            }}
          >
            Mudar de Obra
          </button>
        ) : null}
        {equipment.hasManual && !isMultiSplitInstallation(equipment) && (
          <button
            type="button"
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
        {equipment.canDelete && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(equipment.id)}
            title="Excluir permanentemente"
            style={{
              flex: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              height: "var(--btn-height-sm)",
              padding: "0 var(--btn-padding-sm)",
              backgroundColor: "transparent",
              color: "var(--color-danger, #dc2626)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--btn-radius)",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <TrashIcon />
            Excluir
          </button>
        )}
      </div>
    </div>
  );
};

// Estado vazio
const EmptyState: React.FC<{ onAdd?: () => void }> = ({ onAdd }) => (
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
    {onAdd ? (
      <button type="button" onClick={onAdd} style={{ ...baseStyles.addButton }}>
        <PlusIcon />
        Adicionar Equipamento
      </button>
    ) : null}
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
// MODAL DE CADASTRO — helpers Multi-Split
// ============================================================

function resolveComponentType(model: CatalogModel): CatalogComponentType {
  return model.componentType ?? "UNICO";
}

type CatalogPickState = {
  brandSearch: string;
  modelSearch: string;
  selectedBrand: CatalogBrand | null;
  selectedModel: CatalogModel | null;
  showBrandDropdown: boolean;
  showModelDropdown: boolean;
  /** true quando o usuário optou por "Não sei a marca/modelo" — o equipamento
   * é vinculado ao item de catálogo placeholder e precisa ser identificado
   * em campo (ver `EquipmentQrCodeCard`-like fluxo em `identifyClientCatalogEquipment`). */
  pendingIdentification?: boolean;
};

const emptyCatalogPick = (): CatalogPickState => ({
  brandSearch: "",
  modelSearch: "",
  selectedBrand: null,
  selectedModel: null,
  showBrandDropdown: false,
  showModelDropdown: false,
  pendingIdentification: false,
});

type EvaporatorSlot = CatalogPickState & { slotId: string };

function modelMatchesCategory(
  m: CatalogModel,
  category: EquipmentCategory,
  categoryId?: string | null,
): boolean {
  if (categoryId) {
    if (m.categoryId === categoryId) return true;
    return m.category === category;
  }
  return m.category === category;
}

function modelsForCatalogPick(
  catalog: EquipmentCatalog,
  category: EquipmentCategory,
  categoryId: string | null | undefined,
  componentType?: CatalogComponentType,
  brandId?: string,
): CatalogModel[] {
  return catalog.models.filter((m) => {
    if (!modelMatchesCategory(m, category, categoryId)) return false;
    if (brandId && m.brandId !== brandId) return false;
    if (componentType) return resolveComponentType(m) === componentType;
    return true;
  });
}

/** Uma linha por item do catálogo no fluxo padrão (evita triplicar evap/cond/único). */
function dedupeStandardCatalogModels(models: CatalogModel[]): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();
  for (const m of models) {
    const existing = byId.get(m.id);
    if (!existing) {
      byId.set(m.id, m);
      continue;
    }
    const preferNew =
      resolveComponentType(m) === "UNICO" && resolveComponentType(existing) !== "UNICO";
    const preferLonger = m.name.length > existing.name.length;
    if (preferNew || (resolveComponentType(m) === resolveComponentType(existing) && preferLonger)) {
      byId.set(m.id, m);
    }
  }
  return Array.from(byId.values());
}

function filterBrandsForPick(
  catalog: EquipmentCatalog,
  category: EquipmentCategory,
  search: string,
  componentType?: CatalogComponentType,
  _standardAcUnicoOnly?: boolean,
  categoryId?: string | null,
) {
  const brandIds = new Set(
    modelsForCatalogPick(catalog, category, categoryId, componentType).map((m) => m.brandId),
  );
  return catalog.brands
    .filter((b) => brandIds.has(b.id) && matchesCatalogSearch(b.name, search))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function filterModelsForPick(
  catalog: EquipmentCatalog,
  category: EquipmentCategory,
  brandId: string | undefined,
  search: string,
  componentType?: CatalogComponentType,
  standardAcUnicoOnly?: boolean,
  categoryId?: string | null,
) {
  let models = modelsForCatalogPick(catalog, category, categoryId, componentType, brandId);
  if (standardAcUnicoOnly && isAcLikeIconKey(category) && !componentType) {
    models = dedupeStandardCatalogModels(models);
  }
  return models
    .filter((m) => matchesCatalogSearch(m.name, search))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const CatalogPickEmptyHint: React.FC<{
  category: EquipmentCategory;
  categoryId?: string | null;
  catalog: EquipmentCatalog;
  search: string;
}> = ({ category, categoryId, catalog, search }) => {
  const available = filterBrandsForPick(catalog, category, "", undefined, false, categoryId);
  const sample = available
    .slice(0, 4)
    .map((b) => b.name)
    .join(", ");
  return (
    <p style={{ margin: "0.25rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
      Nenhuma marca em {categoryUi(category).label} para &quot;{search}&quot;.
      {available.length > 0 ? (
        <>
          {" "}
          Disponíveis: {sample}
          {available.length > 4 ? "…" : ""}.
        </>
      ) : (
        <> Confira a categoria no passo 1 ou cadastre em Operação → Catálogo de equipamentos.</>
      )}
    </p>
  );
};

const inputStyle: React.CSSProperties = {
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
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.5rem",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--color-text)",
};

const fieldHintStyle: React.CSSProperties = {
  margin: "0.35rem 0 0",
  fontSize: "var(--font-size-xs)",
  color: "var(--color-text-muted)",
};

/** Card com cabeçalho (ícone + título + descrição) usado para agrupar seções do formulário
 * de forma consistente com o restante do app (ex.: ficha de edição do equipamento). */
const FormCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ icon, title, hint, children }) => (
  <div
    style={{
      border: "1px solid var(--color-border)",
      borderRadius: "var(--card-radius)",
      backgroundColor: "var(--color-surface-elevated)",
      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      padding: "1.1rem 1.25rem 1.25rem",
      display: "flex",
      flexDirection: "column",
      gap: "1rem",
    }}
  >
    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem" }}>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          flexShrink: 0,
          borderRadius: "0.6rem",
          backgroundColor: "var(--color-primary-soft, rgba(37, 99, 235, 0.1))",
          color: "var(--color-primary)",
        }}
      >
        {icon}
      </span>
      <div>
        <h3 style={{ margin: 0, fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
          {title}
        </h3>
        {hint ? (
          <p style={{ margin: "0.15rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{hint}</p>
        ) : null}
      </div>
    </div>
    {children}
  </div>
);

const InfoIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const MapPinIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const ClipboardIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="13" y2="16" />
  </svg>
);

const GaugeIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 14 15.5 10.5" />
    <path d="M12 22a10 10 0 1 1 10-10 9.9 9.9 0 0 1-2.5 6.6" />
    <path d="M4.9 4.9 6 6" />
    <path d="M2 12h2" />
    <path d="M12 2v2" />
  </svg>
);

interface CatalogSearchBlockProps {
  title: string;
  catalog: EquipmentCatalog;
  category: EquipmentCategory;
  categoryId?: string | null;
  componentType?: CatalogComponentType;
  standardAcUnicoOnly?: boolean;
  pick: CatalogPickState;
  onChange: (next: CatalogPickState) => void;
  onModelSelected?: () => void;
  /** Exibe o atalho "Não sei a marca/modelo" (só no fluxo padrão, não em Multi-Split). */
  allowUnknown?: boolean;
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  paddingLeft: "var(--input-padding-x)",
  appearance: "auto",
  cursor: "pointer",
};

const CatalogSearchBlock: React.FC<CatalogSearchBlockProps> = ({
  title,
  catalog,
  category,
  categoryId,
  componentType,
  standardAcUnicoOnly,
  pick,
  onChange,
  onModelSelected,
  allowUnknown,
}) => {
  const [unknownLoading, setUnknownLoading] = useState(false);
  const [unknownError, setUnknownError] = useState("");

  const filteredBrands = filterBrandsForPick(
    catalog,
    category,
    "",
    componentType,
    standardAcUnicoOnly,
    categoryId,
  );
  const filteredModels = filterModelsForPick(
    catalog,
    category,
    pick.selectedBrand?.id,
    "",
    componentType,
    standardAcUnicoOnly,
    categoryId,
  );

  const selectBrand = (brand: CatalogBrand | null) => {
    onChange({
      ...pick,
      selectedBrand: brand,
      brandSearch: brand?.name ?? "",
      selectedModel: null,
      modelSearch: "",
      pendingIdentification: false,
    });
  };

  const selectModel = (model: CatalogModel | null) => {
    onChange({
      ...pick,
      selectedModel: model,
      modelSearch: model?.name ?? "",
      pendingIdentification: false,
    });
    if (model) onModelSelected?.();
  };

  const handleUnknown = async () => {
    setUnknownError("");
    setUnknownLoading(true);
    try {
      const kind = category === "climatizador" ? "climatizador" : "ar_condicionado";
      const result = await fetchPendingIdentificationCatalog(kind);
      const brand: CatalogBrand = { id: `pending::${result.category_id}`, name: result.brand, categories: [category] };
      const model: CatalogModel = {
        id: result.catalog_id,
        brandId: brand.id,
        categoryId: result.category_id,
        name: result.model_display,
        category,
        componentType: componentType ?? "UNICO",
        specs: {},
        fieldDefinitions: [],
        technicalData: {},
        technicalSpecs: [],
        hasManual: false,
      };
      onChange({
        ...pick,
        selectedBrand: brand,
        selectedModel: model,
        brandSearch: brand.name,
        modelSearch: model.name,
        pendingIdentification: true,
      });
      onModelSelected?.();
    } catch (e) {
      setUnknownError(e instanceof Error ? e.message : "Não foi possível preparar o cadastro sem marca/modelo.");
    } finally {
      setUnknownLoading(false);
    }
  };

  if (pick.pendingIdentification) {
    return (
      <section style={{ marginBottom: "1.25rem" }}>
        <h4 style={{ margin: "0 0 0.75rem", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
          {title}
        </h4>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
            padding: "0.85rem 1rem",
            borderRadius: 12,
            border: "1px solid var(--color-warning-border, #fcd34d)",
            backgroundColor: "var(--color-warning-bg, #fffbeb)",
          }}
        >
          <span style={{ color: "var(--color-warning, #b45309)", marginTop: 2 }}>
            <IconInfoOutline />
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
              Equipamento será cadastrado como &quot;a identificar&quot;
            </p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
              Já é possível cadastrar serviços e OS para ele. A marca e o modelo reais deverão ser
              preenchidos pelo técnico quando chegar ao local do cliente.
            </p>
            <button
              type="button"
              onClick={() => selectBrand(null)}
              style={{
                marginTop: "0.5rem",
                background: "none",
                border: "none",
                padding: 0,
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-primary)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Escolher marca/modelo agora
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h4 style={{ margin: "0 0 0.75rem", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
        {title}
      </h4>
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
          Marca
        </label>
        <select
          value={pick.selectedBrand?.id ?? ""}
          onChange={(e) => {
            const brand = filteredBrands.find((b) => b.id === e.target.value) ?? null;
            selectBrand(brand);
          }}
          style={{
            ...selectStyle,
            border: `1px solid ${pick.selectedBrand ? "var(--color-success)" : "var(--color-border)"}`,
          }}
        >
          <option value="">Selecione a marca...</option>
          {filteredBrands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
        {filteredBrands.length === 0 && (
          <CatalogPickEmptyHint category={category} categoryId={categoryId} catalog={catalog} search="" />
        )}
      </div>
      <div>
        <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
          Modelo
        </label>
        <select
          value={pick.selectedModel?.id ?? ""}
          onChange={(e) => {
            const model = filteredModels.find((m) => m.id === e.target.value) ?? null;
            selectModel(model);
          }}
          disabled={!pick.selectedBrand}
          style={{
            ...selectStyle,
            backgroundColor: pick.selectedBrand ? "var(--color-surface)" : "var(--color-border)",
            border: `1px solid ${pick.selectedModel ? "var(--color-success)" : "var(--color-border)"}`,
            opacity: pick.selectedBrand ? 1 : 0.6,
            cursor: pick.selectedBrand ? "pointer" : "not-allowed",
          }}
        >
          <option value="">{pick.selectedBrand ? "Selecione o modelo..." : "Selecione a marca primeiro"}</option>
          {filteredModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
              {model.specs.capacityBTU ? ` · ${model.specs.capacityBTU.toLocaleString("pt-BR")} BTUs` : ""}
            </option>
          ))}
        </select>
      </div>
      {pick.selectedModel && (
        <p style={{ margin: "0.5rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--color-success)" }}>
          Selecionado: {pick.selectedBrand?.name} — {pick.selectedModel.name}
        </p>
      )}
      {allowUnknown && (
        <div style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={() => void handleUnknown()}
            disabled={unknownLoading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "none",
              border: "none",
              padding: 0,
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-text-muted)",
              cursor: unknownLoading ? "default" : "pointer",
              textDecoration: "underline",
            }}
          >
            {unknownLoading ? "Preparando..." : "Não sei a marca ou modelo — identificar depois em campo"}
          </button>
          {unknownError && (
            <p style={{ margin: "0.35rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--color-danger)" }}>
              {unknownError}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

const ChangeEquipmentSiteDialog: React.FC<{
  equipment: EquipmentItem;
  clientSites: ClientSiteOut[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ equipment, clientSites, onClose, onSaved }) => {
  const [siteId, setSiteId] = useState<number | null>(equipment.clientSiteId ?? null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setSiteId(equipment.clientSiteId ?? null);
    setErr("");
  }, [equipment]);

  const onConfirm = async () => {
    setSaving(true);
    setErr("");
    try {
      await updateClientCatalogEquipmentSite(equipment.id, siteId);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível alterar a obra.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.45)",
          zIndex: 1100,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(400px, calc(100vw - 2rem))",
          backgroundColor: "var(--color-surface-elevated)",
          borderRadius: "var(--card-radius)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          zIndex: 1101,
          padding: "1.25rem",
        }}
      >
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "var(--font-size-lg)", fontWeight: 600 }}>
          Mudar de Obra
        </h3>
        <p style={{ margin: "0 0 1rem", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
          {equipment.tag} — {equipment.brandName} {equipment.modelName}
        </p>
        <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "var(--font-size-sm)", fontWeight: 500 }}>
          Nova unidade
        </label>
        <select
          value={siteId != null ? String(siteId) : ""}
          onChange={(e) => {
            const raw = e.target.value;
            setSiteId(raw === "" ? null : Number(raw));
          }}
          style={inputStyle}
        >
          <option value="">Endereço Principal / Matriz</option>
          {clientSites.map((site) => (
            <option key={site.id} value={String(site.id)}>
              {site.name}
            </option>
          ))}
        </select>
        {err ? <p style={{ margin: "0.75rem 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-danger, #c00)" }}>{err}</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              height: "var(--btn-height-sm)",
              padding: "0 1rem",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--btn-radius)",
              fontSize: "var(--font-size-sm)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={saving}
            style={{
              height: "var(--btn-height-sm)",
              padding: "0 1rem",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--btn-radius)",
              fontSize: "var(--font-size-sm)",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Salvando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </>
  );
};

export interface AddEquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: number;
  clientSites?: ClientSiteOut[];
  initialClientSiteId?: number | null;
  catalog: EquipmentCatalog;
  categoryOptions?: EquipmentCategoryPickerOption[];
  onSubmit: (data: NewEquipmentData) => void | Promise<void>;
  isSubmitting?: boolean;
}

export const AddEquipmentModal: React.FC<AddEquipmentModalProps> = ({
  isOpen,
  onClose,
  clientId,
  clientSites: clientSitesProp,
  initialClientSiteId = null,
  catalog,
  categoryOptions,
  onSubmit,
  isSubmitting = false,
}) => {
  type RegistrationMode = "choose" | "manual" | "ai";
  const emptyAiForm = (): ClientAddEquipmentAiForm => ({
    tag: "",
    serialNumber: "",
    installationReference: "",
    installationDate: "",
    clientSiteId: null,
    qrcodeCodeId: "",
    catalogId: null,
  });

  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>("choose");
  const [aiForm, setAiForm] = useState<ClientAddEquipmentAiForm>(emptyAiForm);
  const [aiCategory, setAiCategory] = useState<EquipmentCategory | null>(null);
  const [aiCatalogMeta, setAiCatalogMeta] = useState<{
    categoryName: string;
    catalogCreated: boolean;
    equipmentKind: string;
  } | null>(null);
  const [aiLabelMsg, setAiLabelMsg] = useState<string | null>(null);
  const [aiFormError, setAiFormError] = useState("");

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCategory, setSelectedCategory] = useState<EquipmentCategory | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isMultiSplit, setIsMultiSplit] = useState(false);
  const [standardPick, setStandardPick] = useState<CatalogPickState>(emptyCatalogPick);
  const [condenserPick, setCondenserPick] = useState<CatalogPickState>(emptyCatalogPick);
  const [evaporatorSlots, setEvaporatorSlots] = useState<EvaporatorSlot[]>([]);
  const [componentSerials, setComponentSerials] = useState<Record<string, string>>({});
  const [clientSites, setClientSites] = useState<ClientSiteOut[]>(clientSitesProp ?? []);
  const [formData, setFormData] = useState({
    serialNumber: "",
    tag: "",
    installationReference: "",
    installationDate: "",
    manufactureYear: "",
    gasChargeKg: "",
    notes: "",
    clientSiteId: null as number | null,
    qrcodeCodeId: "",
  });
  const [qrcodeLocked, setQrcodeLocked] = useState(false);
  const [qrcodeMsg, setQrcodeMsg] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrcodeValidating, setQrcodeValidating] = useState(false);
  const [qrcodeGenerating, setQrcodeGenerating] = useState(false);

  const resetWizard = () => {
    setRegistrationMode("choose");
    setAiForm(emptyAiForm());
    setAiCategory(null);
    setAiCatalogMeta(null);
    setAiLabelMsg(null);
    setAiFormError("");
    setStep(1);
    setSelectedCategory(null);
    setSelectedCategoryId(null);
    setIsMultiSplit(false);
    setStandardPick(emptyCatalogPick());
    setCondenserPick(emptyCatalogPick());
    setEvaporatorSlots([]);
    setComponentSerials({});
    setFormData({
      serialNumber: "",
      tag: "",
      installationReference: "",
      installationDate: "",
      manufactureYear: "",
      gasChargeKg: "",
      notes: "",
      clientSiteId: null,
      qrcodeCodeId: "",
    });
    setQrcodeLocked(false);
    setQrcodeMsg("");
    setQrcodeGenerating(false);
  };

  const applyLabelResolve = (resolved: EquipmentLabelResolveOut) => {
    const { category } = categoryFromLabelResolve(resolved, categoryOptions);
    setAiCategory(category);
    setAiForm((prev) => ({
      ...prev,
      tag: prev.tag.trim() || resolved.suggested_identificacao?.trim() || prev.tag,
      catalogId: resolved.catalog_id,
    }));
    setAiCatalogMeta({
      categoryName: resolved.category_name,
      catalogCreated: resolved.catalog_created,
      equipmentKind: resolved.equipment_kind,
    });
    const kindLabel =
      resolved.equipment_kind === "climatizador" ? "Climatizador" : "Ar-condicionado";
    setAiLabelMsg(
      resolved.catalog_created
        ? `${kindLabel}: modelo "${resolved.brand} ${resolved.model_display}" cadastrado no catálogo.`
        : `${kindLabel}: modelo "${resolved.brand} ${resolved.model_display}" encontrado no catálogo.`,
    );
    setAiFormError("");
  };

  const handleAiSubmit = async () => {
    if (!aiForm.tag.trim()) {
      setAiFormError("Informe um nome ou local do aparelho (ex.: Sala, Quarto 1).");
      return;
    }
    if (!aiForm.serialNumber.trim()) {
      setAiFormError("Informe o número de série do aparelho.");
      return;
    }
    if (!aiForm.catalogId || !aiCategory) {
      setAiFormError(
        "Fotografe a etiqueta do aparelho para a IA identificar o modelo no catálogo antes de salvar.",
      );
      return;
    }
    if (aiForm.qrcodeCodeId.trim()) {
      const code = parseScannedQrCode(aiForm.qrcodeCodeId);
      if (!code) {
        setAiFormError("Informe ou escaneie um código QR válido.");
        return;
      }
      try {
        const result = await validateQrCode(code);
        if (!result.found || !result.available) {
          setAiFormError(result.message || "Código indisponível.");
          return;
        }
        setAiForm((prev) => ({ ...prev, qrcodeCodeId: result.code_id ?? code }));
      } catch (e) {
        setAiFormError(e instanceof Error ? e.message : "Falha ao validar código.");
        return;
      }
    }
    setAiFormError("");
    const payload: NewEquipmentData = {
      category: aiCategory,
      isMultiSplit: false,
      modelId: aiForm.catalogId,
      serialNumber: aiForm.serialNumber.trim(),
      tag: aiForm.tag.trim(),
      installationReference: aiForm.installationReference,
      installationDate: aiForm.installationDate,
      clientSiteId: aiForm.clientSiteId,
      qrcodeCodeId: aiForm.qrcodeCodeId.trim() || null,
    };
    await onSubmit(payload);
  };

  const validateAndLockQrcode = async (raw: string): Promise<boolean> => {
    const code = parseScannedQrCode(raw);
    if (!code) {
      setQrcodeMsg("Informe ou escaneie um código QR válido.");
      setQrcodeLocked(false);
      return false;
    }
    setQrcodeValidating(true);
    setQrcodeMsg("");
    try {
      const result = await validateQrCode(code);
      if (!result.found || !result.available) {
        setQrcodeMsg(result.message || "Código indisponível.");
        setQrcodeLocked(false);
        return false;
      }
      setFormData((prev) => ({ ...prev, qrcodeCodeId: result.code_id ?? code }));
      setQrcodeLocked(true);
      setQrcodeMsg("Código validado e bloqueado para este cadastro.");
      return true;
    } catch (e) {
      setQrcodeMsg(e instanceof Error ? e.message : "Falha ao validar código.");
      setQrcodeLocked(false);
      return false;
    } finally {
      setQrcodeValidating(false);
    }
  };

  /** Gera um novo código no inventário de etiquetas QR e já vincula ao cadastro atual. */
  const generateAndLockQrcode = async (): Promise<void> => {
    setQrcodeGenerating(true);
    setQrcodeMsg("");
    try {
      const result = await generateQrCodes(1);
      const newCode = result.first_code_id;
      if (!newCode) {
        setQrcodeMsg("Não foi possível gerar um novo código. Tente novamente.");
        return;
      }
      await validateAndLockQrcode(newCode);
    } catch (e) {
      setQrcodeMsg(e instanceof Error ? e.message : "Falha ao gerar novo código QR.");
    } finally {
      setQrcodeGenerating(false);
    }
  };

  /** Gera a imagem (data URL) da etiqueta para pré-visualização, sem chamar a API de PDF. */
  const previewQrLabel = async (codeId: string): Promise<string | null> => {
    const code = parseScannedQrCode(codeId);
    if (!code) return null;
    try {
      const [item] = await buildQrLabelPreviewItems([{ codeId: code }]);
      return item?.dataUrl ?? null;
    } catch {
      return null;
    }
  };

  /** Gera o PDF da etiqueta térmica (1 código) e abre em nova aba para impressão. */
  const printQrLabel = async (codeId: string): Promise<void> => {
    const code = parseScannedQrCode(codeId);
    if (!code) return;
    try {
      const blob = await buildQrLabelsPdfBlob([{ codeId: code }], "thermal_58");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setQrcodeMsg(e instanceof Error ? e.message : "Falha ao gerar etiqueta para impressão.");
    }
  };

  useEffect(() => {
    if (!isOpen) resetWizard();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const siteId = initialClientSiteId ?? null;
      setFormData((prev) => ({
        ...prev,
        clientSiteId: siteId,
      }));
      setAiForm((prev) => ({
        ...prev,
        clientSiteId: siteId,
      }));
    }
  }, [isOpen, initialClientSiteId]);

  useEffect(() => {
    if (clientSitesProp) setClientSites(clientSitesProp);
  }, [clientSitesProp]);

  const highlightedSiteName =
    initialClientSiteId != null
      ? clientSites.find((s) => s.id === initialClientSiteId)?.name ?? null
      : null;

  useEffect(() => {
    if (!isOpen || !clientId) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listClientSites(clientId);
        if (!cancelled) setClientSites(rows);
      } catch {
        if (!cancelled) setClientSites(clientSitesProp ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId, clientSitesProp]);

  const multiSplitCategory =
    selectedCategory !== null && supportsMultiSplitCategory(selectedCategory);

  // Por ora, o cadastro manual de equipamentos fica restrito a Ar-condicionado
  // e Climatizador (mesmo escopo já aplicado no fluxo de leitura por IA).
  // As demais categorias (geladeira, bebedouro, outros) voltam a aparecer aqui
  // quando forem suportadas na ficha do cliente.
  const enabledCategoriesOptions = (categoryOptions ?? []).filter((c) => isAcLikeIconKey(c.iconKey));
  const categoryPickerItems =
    enabledCategoriesOptions.length > 0
      ? enabledCategoriesOptions.map((c) => ({
          key: c.id,
          categoryId: c.id,
          iconKey: c.iconKey,
          label: c.name,
        }))
      : ENABLED_EQUIPMENT_CATEGORY_ICON_KEYS.map((iconKey) => ({
          key: iconKey,
          categoryId: null as string | null,
          iconKey,
          label: categoryUi(iconKey).label,
        }));
  const multiSplitActive = multiSplitCategory && isMultiSplit;

  const addEvaporatorSlot = () => {
    setEvaporatorSlots((prev) => [
      ...prev,
      { slotId: `evap-${Date.now()}-${prev.length}`, ...emptyCatalogPick() },
    ]);
  };

  const updateEvaporatorSlot = (slotId: string, next: CatalogPickState) => {
    setEvaporatorSlots((prev) =>
      prev.map((s) => (s.slotId === slotId ? { ...s, ...next } : s))
    );
  };

  const removeEvaporatorSlot = (slotId: string) => {
    setEvaporatorSlots((prev) => prev.filter((s) => s.slotId !== slotId));
    setComponentSerials((prev) => {
      const copy = { ...prev };
      delete copy[slotId];
      return copy;
    });
  };

  const selectedModelsForReview = (): { label: string; model: CatalogModel; brandName: string }[] => {
    if (!selectedCategory) return [];
    if (multiSplitActive) {
      const items: { label: string; model: CatalogModel; brandName: string }[] = [];
      if (condenserPick.selectedModel) {
        items.push({
          label: "Condensadora (unidade externa)",
          model: condenserPick.selectedModel,
          brandName: condenserPick.selectedBrand?.name ?? "",
        });
      }
      evaporatorSlots.forEach((slot, index) => {
        if (slot.selectedModel) {
          items.push({
            label: `Evaporadora ${index + 1} (unidade interna)`,
            model: slot.selectedModel,
            brandName: slot.selectedBrand?.name ?? "",
          });
        }
      });
      return items;
    }
    if (standardPick.selectedModel) {
      return [
        {
          label: "Equipamento",
          model: standardPick.selectedModel,
          brandName: standardPick.selectedBrand?.name ?? "",
        },
      ];
    }
    return [];
  };

  // Fluxo simplificado em 2 passos: 1) categoria + marca/modelo, 2) instalação.
  const canProceedStep1 =
    selectedCategory !== null &&
    (multiSplitActive
      ? Boolean(condenserPick.selectedModel) &&
        evaporatorSlots.length > 0 &&
        evaporatorSlots.every((s) => s.selectedModel)
      : Boolean(standardPick.selectedModel));

  const multiSplitSerialKeys = (): string[] => {
    const keys = ["condenser"];
    evaporatorSlots.forEach((s) => keys.push(s.slotId));
    return keys;
  };

  // Equipamento "a identificar" (marca/modelo desconhecidos): a série também
  // ainda não é conhecida, então não é exigida — o técnico preenche tudo
  // junto na identificação em campo.
  const canSubmit = multiSplitActive
    ? formData.tag.trim() &&
      multiSplitSerialKeys().every((k) => (componentSerials[k] ?? "").trim())
    : (standardPick.pendingIdentification || formData.serialNumber.trim()) && formData.tag.trim();

  const handleSubmit = async () => {
    if (!selectedCategory || !canSubmit || isSubmitting) return;

    if (formData.qrcodeCodeId.trim() && !qrcodeLocked) {
      const ok = await validateAndLockQrcode(formData.qrcodeCodeId);
      if (!ok) return;
    }

    let payload: NewEquipmentData;
    if (multiSplitActive) {
      const components: NewEquipmentComponentData[] = [];
      if (condenserPick.selectedModel) {
        components.push({
          catalogId: condenserPick.selectedModel.id,
          serialNumber: componentSerials.condenser ?? "",
          label: `${condenserPick.selectedBrand?.name ?? ""} ${condenserPick.selectedModel.name}`.trim(),
          componentType: "CONDENSADORA",
        });
      }
      evaporatorSlots.forEach((slot, index) => {
        if (slot.selectedModel) {
          components.push({
            catalogId: slot.selectedModel.id,
            serialNumber: componentSerials[slot.slotId] ?? "",
            label: `Evaporadora ${index + 1}: ${slot.selectedBrand?.name ?? ""} ${slot.selectedModel.name}`.trim(),
            componentType: "EVAPORADORA",
          });
        }
      });
      payload = {
        category: selectedCategory,
        isMultiSplit: true,
        components,
        tag: formData.tag,
        installationReference: formData.installationReference,
        installationDate: formData.installationDate,
        manufactureYear: formData.manufactureYear.trim() ? Number(formData.manufactureYear) : null,
        gasChargeKg: formData.gasChargeKg.trim() ? Number(formData.gasChargeKg.replace(",", ".")) : null,
        notes: formData.notes,
        clientSiteId: formData.clientSiteId,
        qrcodeCodeId: formData.qrcodeCodeId.trim() || null,
      };
    } else {
      payload = {
        category: selectedCategory,
        isMultiSplit: false,
        brandId: standardPick.selectedBrand?.id,
        modelId: standardPick.selectedModel?.id,
        serialNumber: formData.serialNumber,
        tag: formData.tag,
        installationReference: formData.installationReference,
        installationDate: formData.installationDate,
        manufactureYear: formData.manufactureYear.trim() ? Number(formData.manufactureYear) : null,
        gasChargeKg: formData.gasChargeKg.trim() ? Number(formData.gasChargeKg.replace(",", ".")) : null,
        notes: formData.notes,
        clientSiteId: formData.clientSiteId,
        qrcodeCodeId: formData.qrcodeCodeId.trim() || null,
      };
    }
    await onSubmit(payload);
  };

  const handleContinue = () => {
    if (step === 1 && canProceedStep1) setStep(2);
  };

  const handleBack = () => {
    if (registrationMode === "choose") {
      onClose();
      return;
    }
    if (registrationMode === "ai") {
      setRegistrationMode("choose");
      setAiFormError("");
      setAiLabelMsg(null);
      return;
    }
    if (step === 1) {
      setRegistrationMode("choose");
      return;
    }
    setStep(1);
  };

  const canSubmitAi =
    Boolean(aiForm.tag.trim()) &&
    Boolean(aiForm.serialNumber.trim()) &&
    Boolean(aiForm.catalogId) &&
    Boolean(aiCategory);

  const continueDisabled = step === 1 && !canProceedStep1;

  if (!isOpen) return null;

  return (
    <>
      <QrCodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => void validateAndLockQrcode(code)}
      />
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
              {registrationMode === "choose"
                ? "Escolha como cadastrar"
                : registrationMode === "ai"
                  ? "Leitura da etiqueta com IA"
                  : step === 1
                    ? "Passo 1 de 2 · Categoria, marca e modelo"
                    : "Passo 2 de 2 · Instalação e QR Code"}
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

        {/* Progress bar (manual only) */}
        {registrationMode === "manual" ? (
          <div style={{ height: 3, backgroundColor: "var(--color-border)" }}>
            <div
              style={{
                height: "100%",
                width: `${(step / 2) * 100}%`,
                backgroundColor: "var(--color-primary)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        ) : null}

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {registrationMode === "choose" ? (
            <ClientAddEquipmentModeChoose
              onChooseAi={() => {
                setRegistrationMode("ai");
                setAiFormError("");
              }}
              onChooseManual={() => {
                setRegistrationMode("manual");
                setStep(1);
              }}
            />
          ) : null}

          {registrationMode === "ai" ? (
            <ClientAddEquipmentAiPanel
              clientSites={clientSites}
              highlightedSiteName={highlightedSiteName}
              form={aiForm}
              onFormChange={(patch) => setAiForm((prev) => ({ ...prev, ...patch }))}
              catalogMeta={aiCatalogMeta}
              labelMsg={aiLabelMsg}
              formError={aiFormError}
              disabled={isSubmitting}
              onResolved={applyLabelResolve}
              onLabelError={(message) => {
                setAiLabelMsg(null);
                setAiFormError(message);
              }}
            />
          ) : null}

          {/* Step 1: Seleção de categoria */}
          {registrationMode === "manual" && step === 1 && (
            <div>
              <InstallationSiteField
                clientSites={clientSites}
                value={formData.clientSiteId}
                onChange={(siteId) => setFormData((prev) => ({ ...prev, clientSiteId: siteId }))}
                highlightedSiteName={highlightedSiteName}
              />
              <h3 style={{ margin: "0 0 0.25rem", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                Categoria do equipamento
              </h3>
              <p style={{ margin: "0 0 1rem", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                Por enquanto, cadastramos apenas Ar-condicionado e Climatizador.
              </p>
              {categoryPickerItems.length === 0 ? (
                <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                  Nenhuma categoria disponível. Verifique o catálogo em Operação ou recarregue a página.
                </p>
              ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(9.5rem, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {categoryPickerItems.map((item) => {
                  const config = categoryUi(item.iconKey);
                  const isSelected =
                    categoryOptions && categoryOptions.length > 0
                      ? selectedCategoryId === item.categoryId
                      : selectedCategory === item.iconKey;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(item.iconKey);
                        setSelectedCategoryId(item.categoryId);
                        if (!supportsMultiSplitCategory(item.iconKey)) setIsMultiSplit(false);
                        setStandardPick(emptyCatalogPick());
                        setCondenserPick(emptyCatalogPick());
                        setEvaporatorSlots([]);
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.75rem",
                        padding: "1.5rem 1.25rem",
                        backgroundColor: isSelected ? `${config.color}10` : "#fff",
                        border: `2px solid ${isSelected ? config.color : "var(--color-border)"}`,
                        borderRadius: "var(--card-radius)",
                        boxShadow: isSelected ? `0 6px 16px -8px ${config.color}66` : "0 1px 2px rgba(15, 23, 42, 0.04)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 14,
                          backgroundColor: `${config.color}15`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: config.color,
                        }}
                      >
                        {config.icon}
                      </div>
                      <span style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              )}

              {multiSplitCategory && (
                <div
                  style={{
                    marginTop: "1.25rem",
                    padding: "1rem",
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--card-radius)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                      Este aparelho é um Multi-Split?
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>
                      Condensadora externa + uma ou mais evaporadoras internas
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isMultiSplit}
                    onClick={() => {
                      const next = !isMultiSplit;
                      setIsMultiSplit(next);
                      setStandardPick(emptyCatalogPick());
                      setCondenserPick(emptyCatalogPick());
                      setEvaporatorSlots(
                        next ? [{ slotId: `evap-${Date.now()}`, ...emptyCatalogPick() }] : []
                      );
                      setComponentSerials({});
                    }}
                    style={{
                      width: 48,
                      height: 28,
                      borderRadius: 9999,
                      border: "none",
                      backgroundColor: isMultiSplit ? "var(--color-primary)" : "var(--color-border)",
                      position: "relative",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 3,
                        left: isMultiSplit ? 23 : 3,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        backgroundColor: "#fff",
                        transition: "left 0.15s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Busca no catálogo (multi-split ou unidade única) — mesma tela do passo 1 */}
          {registrationMode === "manual" && step === 1 && selectedCategory && (
            <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border)" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                {multiSplitActive ? "Monte o conjunto Multi-Split" : "Busque marca e modelo no catálogo"}
              </h3>

              {multiSplitActive ? (
                <>
                  <CatalogSearchBlock
                    title="Buscar Condensadora (Unidade Externa)"
                    catalog={catalog}
                    category={selectedCategory}
                    categoryId={selectedCategoryId}
                    componentType="CONDENSADORA"
                    pick={condenserPick}
                    onChange={setCondenserPick}
                  />
                  {evaporatorSlots.map((slot, index) => (
                    <div
                      key={slot.slotId}
                      style={{
                        marginBottom: "1rem",
                        padding: "1rem",
                        border: "1px dashed var(--color-border)",
                        borderRadius: "var(--card-radius)",
                        backgroundColor: "var(--color-surface)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                        <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)" }}>
                          EVAPORADORA {index + 1}
                        </span>
                        {evaporatorSlots.length > 1 && (
                          <button type="button" onClick={() => removeEvaporatorSlot(slot.slotId)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: "var(--font-size-xs)", cursor: "pointer" }}>
                            Remover
                          </button>
                        )}
                      </div>
                      <CatalogSearchBlock
                        title={`Buscar Evaporadora ${index + 1} (Unidade Interna)`}
                        catalog={catalog}
                        category={selectedCategory}
                        categoryId={selectedCategoryId}
                        componentType="EVAPORADORA"
                        pick={slot}
                        onChange={(next) => updateEvaporatorSlot(slot.slotId, next)}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addEvaporatorSlot}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      width: "100%",
                      justifyContent: "center",
                      padding: "0.75rem",
                      backgroundColor: "transparent",
                      border: "1px dashed var(--color-primary)",
                      borderRadius: "var(--btn-radius)",
                      color: "var(--color-primary)",
                      fontSize: "var(--font-size-sm)",
                      fontWeight: "var(--font-weight-medium)",
                      cursor: "pointer",
                    }}
                  >
                    <PlusIcon />
                    Adicionar Evaporadora (Unidade Interna)
                  </button>
                </>
              ) : (
                <CatalogSearchBlock
                  title="Equipamento"
                  catalog={catalog}
                  category={selectedCategory}
                  categoryId={selectedCategoryId}
                  standardAcUnicoOnly={selectedCategory === "ar_condicionado"}
                  pick={standardPick}
                  onChange={setStandardPick}
                  allowUnknown
                />
              )}
            </div>
          )}

          {/* Ficha técnica autopreenchida — mesma tela do passo 1, aparece após escolher o modelo */}
          {registrationMode === "manual" && step === 1 && selectedCategory && selectedModelsForReview().length > 0 && (
            <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border)" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                {multiSplitActive ? "Resumo do conjunto Multi-Split" : "Ficha técnica do catálogo"}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {selectedModelsForReview().map((item) => (
                  <div
                    key={`${item.label}-${item.model.id}`}
                    style={{
                      padding: "1.25rem",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--card-radius)",
                    }}
                  >
                    <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", marginBottom: "0.5rem", textTransform: "uppercase" }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", marginBottom: "0.75rem" }}>
                      {item.brandName} {item.model.name}
                    </div>
                    {item.model.technicalSpecs && item.model.technicalSpecs.length > 0 ? (
                      <EquipmentTechnicalSpecsGrid specs={item.model.technicalSpecs} compact />
                    ) : null}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", fontSize: "var(--font-size-xs)", color: item.model.hasManual ? "var(--color-success)" : "var(--color-text-muted)" }}>
                      <FileTextIcon />
                      {item.model.hasManual ? "Manual disponível" : "Sem manual"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Passo 2: Dados da instalação */}
          {registrationMode === "manual" && step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              <FormCard icon={<ClipboardIcon />} title="Identificação" hint="Número de série, TAG e data de instalação do aparelho.">
                {multiSplitActive ? (
                  <>
                    <div>
                      <label style={fieldLabelStyle}>Número de Série — Condensadora *</label>
                      <input
                        type="text"
                        value={componentSerials.condenser ?? ""}
                        onChange={(e) => setComponentSerials((prev) => ({ ...prev, condenser: e.target.value }))}
                        placeholder="Série da unidade externa"
                        style={inputStyle}
                      />
                      {condenserPick.selectedModel && (
                        <p style={fieldHintStyle}>
                          {condenserPick.selectedBrand?.name} {condenserPick.selectedModel.name}
                        </p>
                      )}
                    </div>
                    {evaporatorSlots.map((slot, index) =>
                      slot.selectedModel ? (
                        <div key={slot.slotId}>
                          <label style={fieldLabelStyle}>Número de Série — Evaporadora {index + 1} *</label>
                          <input
                            type="text"
                            value={componentSerials[slot.slotId] ?? ""}
                            onChange={(e) => setComponentSerials((prev) => ({ ...prev, [slot.slotId]: e.target.value }))}
                            placeholder={`Série da evaporadora ${index + 1}`}
                            style={inputStyle}
                          />
                          <p style={fieldHintStyle}>
                            {slot.selectedBrand?.name} {slot.selectedModel.name}
                          </p>
                        </div>
                      ) : null
                    )}
                  </>
                ) : (
                  <div>
                    <label style={fieldLabelStyle}>Número de Série{standardPick.pendingIdentification ? "" : " *"}</label>
                    <input
                      type="text"
                      value={formData.serialNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, serialNumber: e.target.value }))}
                      placeholder={
                        standardPick.pendingIdentification
                          ? "Ainda não identificado — deixe em branco"
                          : "Ex: SN123456789"
                      }
                      style={inputStyle}
                    />
                    {standardPick.pendingIdentification && (
                      <p style={fieldHintStyle}>
                        Equipamento a identificar em campo — a série será preenchida junto com a marca/modelo.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label style={fieldLabelStyle}>Tag / Localização do Aparelho *</label>
                  <input
                    type="text"
                    value={formData.tag}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tag: e.target.value }))}
                    placeholder="Ex: Sala da Diretoria, Recepção..."
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={fieldLabelStyle}>Data de Instalação</label>
                  <input
                    type="date"
                    value={formData.installationDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, installationDate: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </FormCard>

              <FormCard icon={<MapPinIcon />} title="Localização" hint="Onde o técnico encontra o aparelho no cliente.">
                <div>
                  <label style={fieldLabelStyle}>Referência de localização</label>
                  <textarea
                    value={formData.installationReference}
                    onChange={(e) => setFormData((prev) => ({ ...prev, installationReference: e.target.value }))}
                    placeholder='Ex: Teto falso - Sala de reunião - Ao lado da janela'
                    rows={3}
                    style={{
                      ...inputStyle,
                      height: "auto",
                      minHeight: "4.5rem",
                      paddingTop: "0.65rem",
                      paddingBottom: "0.65rem",
                      resize: "vertical",
                    }}
                  />
                  <p style={fieldHintStyle}>Detalhe onde o técnico encontra o aparelho em campo (aparece na O.S. e no PMOC).</p>
                </div>
              </FormCard>

              <FormCard
                icon={<GaugeIcon />}
                title="Detalhes técnicos adicionais"
                hint="Opcional — ajuda o técnico e entra nos relatórios de PMOC."
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))", gap: "1rem" }}>
                  <div>
                    <label style={fieldLabelStyle}>Ano de fabricação</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={formData.manufactureYear}
                      onChange={(e) => setFormData((prev) => ({ ...prev, manufactureYear: e.target.value }))}
                      placeholder="Ex: 2024"
                      min={1970}
                      max={2100}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={fieldLabelStyle}>Carga de gás (kg)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={formData.gasChargeKg}
                      onChange={(e) => setFormData((prev) => ({ ...prev, gasChargeKg: e.target.value }))}
                      placeholder="Ex: 1,05"
                      min={0}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <label style={fieldLabelStyle}>Observações</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Ex: Acesso difícil, cliente pediu atenção especial, equipamento antigo..."
                    rows={3}
                    style={{
                      ...inputStyle,
                      height: "auto",
                      minHeight: "4rem",
                      paddingTop: "0.65rem",
                      paddingBottom: "0.65rem",
                      resize: "vertical",
                    }}
                  />
                </div>
              </FormCard>

              <FormCard icon={<InfoIcon />} title="QR Code do equipamento" hint="Vincule uma cartela pré-impressa para acesso rápido em campo.">
                <EquipmentQrCodeCard
                  codeId={formData.qrcodeCodeId}
                  locked={qrcodeLocked}
                  message={qrcodeMsg}
                  validating={qrcodeValidating}
                  generating={qrcodeGenerating}
                  disabled={isSubmitting}
                  onCodeChange={(next) => {
                    setFormData((prev) => ({ ...prev, qrcodeCodeId: next }));
                    if (qrcodeMsg) setQrcodeMsg("");
                    if (qrcodeLocked) setQrcodeLocked(false);
                  }}
                  onValidate={() => void validateAndLockQrcode(formData.qrcodeCodeId)}
                  onOpenScanner={() => setScannerOpen(true)}
                  onGenerate={() => void generateAndLockQrcode()}
                  onClear={() => {
                    setQrcodeLocked(false);
                    setFormData((prev) => ({ ...prev, qrcodeCodeId: "" }));
                    setQrcodeMsg("");
                  }}
                  onPreview={() => previewQrLabel(formData.qrcodeCodeId)}
                  onPrintLabel={() => printQrLabel(formData.qrcodeCodeId)}
                />
              </FormCard>
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
            type="button"
            onClick={handleBack}
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
            {registrationMode === "choose" || (registrationMode === "manual" && step === 1)
              ? "Cancelar"
              : "Voltar"}
          </button>

          {registrationMode === "ai" ? (
            <button
              type="button"
              onClick={() => void handleAiSubmit()}
              disabled={!canSubmitAi || isSubmitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                height: "var(--btn-height-base)",
                padding: "0 var(--btn-padding-base)",
                backgroundColor: canSubmitAi && !isSubmitting ? "var(--color-success)" : "var(--color-border)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--btn-radius)",
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-medium)",
                cursor: canSubmitAi && !isSubmitting ? "pointer" : "not-allowed",
                transition: "all 0.15s ease",
                opacity: canSubmitAi && !isSubmitting ? 1 : 0.6,
              }}
            >
              <CheckIcon />
              {isSubmitting ? "Salvando…" : "Salvar Equipamento"}
            </button>
          ) : registrationMode === "choose" ? null : step < 2 ? (
            <button
              type="button"
              onClick={handleContinue}
              disabled={continueDisabled}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                height: "var(--btn-height-base)",
                padding: "0 var(--btn-padding-base)",
                backgroundColor: continueDisabled ? "var(--color-border)" : "var(--color-primary)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--btn-radius)",
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-medium)",
                cursor: continueDisabled ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                opacity: continueDisabled ? 0.6 : 1,
              }}
            >
              Continuar
              <ChevronRightIcon />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                height: "var(--btn-height-base)",
                padding: "0 var(--btn-padding-base)",
                backgroundColor: canSubmit && !isSubmitting ? "var(--color-success)" : "var(--color-border)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--btn-radius)",
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-medium)",
                cursor: canSubmit && !isSubmitting ? "pointer" : "not-allowed",
                transition: "all 0.15s ease",
                opacity: canSubmit && !isSubmitting ? 1 : 0.6,
              }}
            >
              <CheckIcon />
              {isSubmitting ? "Salvando…" : multiSplitActive ? "Salvar conjunto Multi-Split" : "Salvar Equipamento"}
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
  clientId,
  clientSites = [],
  equipments,
  catalog,
  categoryOptions,
  isLoading = false,
  onAddEquipment,
  onDeactivate,
  onDelete,
  onDownloadManual,
  modalOpenRequest,
  onModalOpenRequestHandled,
  onEquipmentsChanged,
  readOnly = false,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialClientSiteId, setInitialClientSiteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sheetEquipmentId, setSheetEquipmentId] = useState<string | null>(null);
  const [changeSiteEquipment, setChangeSiteEquipment] = useState<EquipmentItem | null>(null);
  const sheetEquipment = sheetEquipmentId
    ? equipments.find((e) => e.id === sheetEquipmentId) ?? null
    : null;
  const knowledgeChat = useKnowledgeChatContextOptional();

  useEffect(() => {
    if (!knowledgeChat) return;
    if (sheetEquipment) {
      knowledgeChat.setEquipmentDetail({
        equipmentId: sheetEquipment.id,
        brand: sheetEquipment.brandName?.trim() || null,
        model: sheetEquipment.modelName?.trim() || null,
        label: sheetEquipment.tag?.trim() || null,
      });
      return;
    }
    knowledgeChat.setEquipmentDetail(null);
  }, [sheetEquipment, knowledgeChat]);

  useEffect(() => {
    if (!knowledgeChat) return;
    return () => knowledgeChat.setEquipmentDetail(null);
  }, [knowledgeChat]);

  useEffect(() => {
    if (!modalOpenRequest) return;
    setInitialClientSiteId(modalOpenRequest.clientSiteId);
    setIsModalOpen(true);
    onModalOpenRequestHandled?.();
  }, [modalOpenRequest, onModalOpenRequestHandled]);

  const handleOpenModal = (siteId?: number | null) => {
    setInitialClientSiteId(siteId ?? null);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setInitialClientSiteId(null);
  };

  const handleSubmit = async (data: NewEquipmentData) => {
    if (!onAddEquipment) return;
    setIsSubmitting(true);
    try {
      await onAddEquipment(data);
      handleCloseModal();
    } finally {
      setIsSubmitting(false);
    }
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
        {equipments.length > 0 && onAddEquipment && !readOnly ? (
          <button type="button" onClick={() => handleOpenModal()} style={baseStyles.addButton}>
            <PlusIcon />
            Adicionar Equipamento
          </button>
        ) : null}
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={baseStyles.grid}>
          {[1, 2, 3].map((i) => (
            <EquipmentCardSkeleton key={i} />
          ))}
        </div>
      ) : equipments.length === 0 ? (
        <EmptyState onAdd={onAddEquipment && !readOnly ? () => handleOpenModal() : undefined} />
      ) : (
        <div style={baseStyles.grid}>
          {equipments.map((equipment) => (
            <EquipmentCard
              key={equipment.id}
              equipment={equipment}
              onOpenSheet={clientId ? (id) => setSheetEquipmentId(id) : undefined}
              onDeactivate={onDeactivate}
              onDelete={onDelete}
              onDownloadManual={onDownloadManual}
              onChangeSite={!readOnly && clientId ? (eq) => setChangeSiteEquipment(eq) : undefined}
            />
          ))}
        </div>
      )}

      {/* Modal de cadastro */}
      <AddEquipmentModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        clientId={clientId}
        clientSites={clientSites}
        initialClientSiteId={initialClientSiteId}
        catalog={catalog}
        categoryOptions={categoryOptions}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {changeSiteEquipment ? (
        <ChangeEquipmentSiteDialog
          equipment={changeSiteEquipment}
          clientSites={clientSites}
          onClose={() => setChangeSiteEquipment(null)}
          onSaved={() => void onEquipmentsChanged?.()}
        />
      ) : null}

      {clientId && sheetEquipment ? (
        <EquipmentSheetModal
          equipment={sheetEquipment}
          clientId={clientId}
          clientSites={clientSites}
          readOnly={readOnly}
          onClose={() => setSheetEquipmentId(null)}
          onUpdated={() => void onEquipmentsChanged?.()}
        />
      ) : null}
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
