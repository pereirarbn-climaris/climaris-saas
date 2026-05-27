import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import styles from './AdminEquipmentCatalogView.module.css';
import { isSplitCategoryName } from '../../../lib/equipmentCategoryForm';
import type { EquipmentCategoryCreatePayload } from '../../../api/equipmentCatalog';
import { CategoryFieldDefinitionsEditor } from '../../admin/CategoryFieldDefinitionsEditor';
import { DynamicTechnicalFields } from '../../admin/DynamicTechnicalFields';
import {
  draftsToPayload,
  emptyDraft,
  validateTechnicalDataForm,
  type CategoryFieldDefinition,
} from '../../../lib/categoryFieldDefinitions';
import { getCategoryVisual, type CategoryIconKey } from '../../../lib/equipmentCategoryIcons';
import { EquipmentCategoryIconPicker } from './EquipmentCategoryIconPicker';
import {
  isAirConditioningCategory,
  mapAiExtractionToFormFields,
  mapAiExtractionToTechnicalData,
  mergeAcFieldDefinitions,
} from '../../../lib/acEquipmentFields';
import {
  isClimatizadorCategory,
  mapClimatizadorAiToFormFields,
  mapClimatizadorAiToTechnicalData,
  mergeClimatizadorFieldDefinitions,
} from '../../../lib/climatizadorEquipmentFields';
import type { EquipmentLabelExtractionOut } from '../../../api/equipmentCatalogAi';
import { checkEquipmentCatalogDuplicate } from '../../../api/equipmentCatalog';
import {
  findDuplicateCatalogEntry,
  formatDuplicateCatalogMessage,
} from '../../../lib/catalogDuplicateCheck';
import { EquipmentLabelPhotoButtons } from '../../equipment/EquipmentLabelPhotoButtons';
import {
  emptyGlobalEquipmentManualsValue,
  GlobalEquipmentManualsPanel,
  type GlobalEquipmentManualsValue,
} from '../../equipment/GlobalEquipmentManualsPanel';

const iconSize = (token: 'xs' | 'sm' | 'md' | 'lg' | 'xl'): React.CSSProperties => ({
  width: `var(--icon-size-${token})`,
  height: `var(--icon-size-${token})`,
  flexShrink: 0,
});

// ============================================================
// TYPES
// ============================================================

export type CategoryVisualKey = CategoryIconKey;

export interface CategoryOption {
  id: string;
  name: string;
  iconKey: CategoryIconKey;
  sortOrder: number;
  hasFluidType: boolean;
  hasCapacity: boolean;
  hasVoltage: boolean;
  fieldDefinitions: CategoryFieldDefinition[];
}

export interface CatalogEquipment {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIconKey?: CategoryIconKey;
  marca: string;
  modelo: string;
  modelEvaporator: string;
  modelCondenser: string;
  technicalData: Record<string, string>;
  technicalSummary: string;
  manualUrl: string | null;
  manualId: string | null;
  manualTitle: string | null;
  hasExtraManuals?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ManualOption = { id: string; title: string };

export interface CatalogMetrics {
  totalModelos: number;
  totalArCondicionado: number;
  totalGeladeiraBebedouro: number;
  totalComManual: number;
}

export type ManualFormMode = 'none' | 'upload' | 'existing';

export interface NewCatalogEquipmentData {
  categoryId: string;
  marca: string;
  modelo: string;
  modelEvaporator: string;
  modelCondenser: string;
  technicalData: Record<string, string>;
  fieldDefinitions: CategoryFieldDefinition[];
  manualMode: ManualFormMode;
  manualTitle: string;
  manualId: string;
  manualPdf?: File | null;
  removeManual?: boolean;
  manualCombinadoUsuarioInstalacao?: boolean;
  /** Manuais estruturados (Ar-Condicionado): usuário, instalação, serviço + vínculo existente. */
  acManuals?: GlobalEquipmentManualsValue;
}

export interface CatalogFiltersState {
  category: string;
  brand: string;
  search: string;
}

export interface AdminEquipmentCatalogViewProps {
  equipments: CatalogEquipment[];
  metrics: CatalogMetrics;
  isLoading?: boolean;
  existingManuals?: ManualOption[];
  categoryOptions?: CategoryOption[];
  categoriesLoading?: boolean;
  onRefreshCategories?: () => void;
  onCreateCategory?: (payload: EquipmentCategoryCreatePayload) => Promise<CategoryOption>;
  onSave: (data: NewCatalogEquipmentData, id?: string) => void | Promise<void>;
  onDelete: (id: string) => void;
  /** Dispara quando filtros mudam (debounce no container para chamadas à API). */
  onFiltersChange?: (filters: CatalogFiltersState) => void;
}

// ============================================================
// ICONS
// ============================================================

const IconSnowflake = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M20 16l-4-4 4-4" />
    <path d="M4 8l4 4-4 4" />
    <path d="M16 4l-4 4-4-4" />
    <path d="M8 20l4-4 4 4" />
  </svg>
);

const IconFridge = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
    <path d="M3 10h18" />
    <path d="M8 6v2" />
    <path d="M8 14v4" />
  </svg>
);

const IconDatabase = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

const IconFileText = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconSearch = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('sm'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconPlus = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconEdit = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const IconTrash = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const IconX = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconChevronDown = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('sm'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconChevronLeft = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IconChevronRight = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('md'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconUpload = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={{ ...iconSize('lg'), ...style }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

// ============================================================
// HELPERS
// ============================================================

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.pdf') || file.type === 'application/pdf' || file.type === '';
}

interface ManualPdfUploadFieldProps {
  existingManualUrl?: string | null;
  selectedFile: File | null;
  removeExisting: boolean;
  error?: string;
  onSelect: (file: File | null) => void;
  onRemoveExistingChange: (remove: boolean) => void;
}

const ManualPdfUploadField: React.FC<ManualPdfUploadFieldProps> = ({
  existingManualUrl,
  selectedFile,
  removeExisting,
  error,
  onSelect,
  onRemoveExistingChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | undefined>();

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0] ?? null;
    if (!file) return;
    if (!isPdfFile(file)) {
      setLocalError('Selecione um arquivo PDF (.pdf).');
      return;
    }
    setLocalError(undefined);
    onSelect(file);
    onRemoveExistingChange(false);
  };

  const clearSelection = () => {
    onSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const displayError = error || localError;

  return (
    <div className={styles.formField}>
      <label className={styles.formFieldLabel}>Manual tecnico (PDF)</label>

      {existingManualUrl && !selectedFile && !removeExisting ? (
        <p className={styles.formHint}>
          Manual atual:{' '}
          <a href={existingManualUrl} target="_blank" rel="noopener noreferrer">
            abrir PDF no navegador
          </a>
        </p>
      ) : null}

      {existingManualUrl && !selectedFile ? (
        <label className={styles.removeManualCheck}>
          <input
            type="checkbox"
            checked={removeExisting}
            onChange={(e) => onRemoveExistingChange(e.target.checked)}
          />
          Remover manual atual
        </label>
      ) : null}

      {selectedFile ? (
        <div className={styles.pdfFileChip}>
          <span className={styles.pdfFileChipIcon}>
            <IconFileText style={iconSize('md')} />
          </span>
          <span className={styles.pdfFileChipName} title={selectedFile.name}>
            {selectedFile.name}
          </span>
          <span className={styles.pdfFileChipSize}>
            {(selectedFile.size / 1024).toFixed(0)} KB
          </span>
          <button
            type="button"
            className={styles.pdfFileChipRemove}
            onClick={clearSelection}
            aria-label="Remover arquivo selecionado"
          >
            <IconX style={iconSize('sm')} />
          </button>
        </div>
      ) : (
        !removeExisting && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className={styles.pdfFileInputHidden}
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div
              role="button"
              tabIndex={0}
              className={styles.pdfDropzone}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFiles(e.dataTransfer.files);
              }}
            >
              <span className={styles.pdfDropzoneIcon}>
                <IconUpload />
              </span>
              <span className={styles.pdfDropzoneTitle}>Anexar manual em PDF</span>
              <span className={styles.pdfDropzoneHint}>Clique para escolher ou arraste o arquivo aqui</span>
            </div>
          </>
        )
      )}

      <p className={styles.formHint}>
        O PDF sera enviado ao armazenamento (S3, pasta manuais/) para consulta futura por IA.
      </p>
      {displayError ? <p className={styles.formError}>{displayError}</p> : null}
    </div>
  );
};

// ============================================================
// HELPERS (category)
// ============================================================

const badgeClassByStyle: Record<string, string> = {
  sky: styles.badgeSky,
  indigo: styles.badgeIndigo,
  cyan: styles.badgeCyan,
  violet: styles.badgeViolet,
  slate: styles.badgeSlate,
};

// ============================================================
// SUBCOMPONENTS
// ============================================================

// Metric Card
interface MetricCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon, variant = 'default' }) => {
  const iconWrapClass =
    variant === 'primary'
      ? styles.statIconPrimary
      : variant === 'success'
        ? styles.statIconSuccess
        : styles.statIconDefault;

  return (
    <div className={styles.statCard}>
      <div className={`${styles.statIconWrap} ${iconWrapClass}`}>{icon}</div>
      <div className={styles.statContent}>
        <p className={styles.statLabel}>{label}</p>
        <p className={styles.statValue}>{value.toLocaleString('pt-BR')}</p>
      </div>
    </div>
  );
};

const CategoryBadge: React.FC<{ categoryName: string; iconKey?: CategoryIconKey }> = ({
  categoryName,
  iconKey,
}) => {
  const visual = getCategoryVisual(iconKey, categoryName);
  const Icon = visual.Icon;
  const badgeClass = badgeClassByStyle[visual.style] ?? styles.badgeSlate;

  return (
    <span className={`${styles.badge} ${badgeClass}`}>
      <Icon size={14} />
      {categoryName}
    </span>
  );
};

// Manual Badge
const ManualBadge: React.FC<{ url: string | null; hasManual?: boolean }> = ({ url, hasManual }) => {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.badge} ${styles.badgeSuccess}`}
        title="Abrir manual em PDF"
      >
        <IconFileText style={iconSize('xs')} />
        PDF
      </a>
    );
  }

  if (hasManual) {
    return (
      <span className={`${styles.badge} ${styles.badgeSuccess}`} title="Manual anexado">
        <IconFileText style={iconSize('xs')} />
        PDF
      </span>
    );
  }

  return (
    <span className={`${styles.badge} ${styles.badgeMuted}`}>
      <IconFileText style={iconSize('xs')} />
      N/A
    </span>
  );
};

// Select Dropdown
interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}

const Select: React.FC<SelectProps> = ({ value, onChange, options, placeholder, className = '' }) => (
  <div className={`${styles.fieldWrap} ${className}`}>
    <select value={value} onChange={(e) => onChange(e.target.value)} className={styles.select}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <span className={styles.selectChevron}>
      <IconChevronDown />
    </span>
  </div>
);

// Text Input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const Input: React.FC<InputProps> = ({ icon, className = '', ...props }) => (
  <div className={`${styles.fieldWrap} ${className}`}>
    {icon ? <span className={styles.inputIcon}>{icon}</span> : null}
    <input
      {...props}
      className={`${styles.input} ${icon ? styles.inputWithIcon : ''}`}
    />
  </div>
);

// Button
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'base' | 'lg';
  icon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'base',
  icon,
  children,
  className = '',
  ...props
}) => {
  const variantClass = {
    primary: styles.btnPrimary,
    secondary: styles.btnSecondary,
    ghost: styles.btnGhost,
    danger: styles.btnDanger,
  }[variant];

  const sizeClass = size === 'sm' ? styles.btnSm : styles.btnBase;

  return (
    <button {...props} className={`${styles.btn} ${variantClass} ${sizeClass} ${className}`}>
      {icon}
      {children}
    </button>
  );
};

// Modal/Slide-over
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalBackdrop} onClick={onClose} aria-hidden />
      <div className={styles.modalPanelWrap}>
        <div className={styles.modalPanel}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>{title}</h2>
            <button type="button" onClick={onClose} className={styles.modalCloseBtn} aria-label="Fechar">
              <IconX />
            </button>
          </div>
          <div className={styles.modalBody}>{children}</div>
        </div>
      </div>
    </div>
  );
};

// Table Skeleton
const TableSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-3">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex items-center gap-4 p-4">
        <div className="w-28 h-6 bg-slate-200 rounded-full" />
        <div className="w-24 h-5 bg-slate-200 rounded" />
        <div className="w-32 h-5 bg-slate-200 rounded" />
        <div className="w-20 h-5 bg-slate-200 rounded" />
        <div className="w-20 h-5 bg-slate-200 rounded" />
        <div className="w-16 h-6 bg-slate-200 rounded-full" />
        <div className="flex-1" />
        <div className="w-20 h-8 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
);

// Empty State
const EmptyState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div className={styles.emptyState}>
    <div className={styles.emptyIconWrap}>
      <IconDatabase style={iconSize('xl')} />
    </div>
    <h3 className={styles.emptyTitle}>Nenhum modelo cadastrado</h3>
    <p className={styles.emptyText}>
      Comece adicionando modelos de equipamentos ao catalogo global para que as empresas possam utiliza-los.
    </p>
    <Button variant="primary" icon={<IconPlus />} onClick={onAdd}>
      Adicionar Primeiro Modelo
    </Button>
  </div>
);

// Pagination
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
      <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)]">
        Pagina {currentPage} de {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="
            w-8 h-8 rounded-lg flex items-center justify-center
            text-[var(--color-text-muted)] hover:bg-slate-100
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          <IconChevronLeft />
        </button>
        {[...Array(totalPages)].map((_, i) => (
          <button
            key={i}
            onClick={() => onPageChange(i + 1)}
            className={`
              w-8 h-8 rounded-lg flex items-center justify-center
              text-[var(--font-size-sm)] font-[var(--font-weight-medium)]
              transition-colors
              ${currentPage === i + 1
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-muted)] hover:bg-slate-100'
              }
            `}
          >
            {i + 1}
          </button>
        ))}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="
            w-8 h-8 rounded-lg flex items-center justify-center
            text-[var(--color-text-muted)] hover:bg-slate-100
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          <IconChevronRight />
        </button>
      </div>
    </div>
  );
};

// ============================================================
// CATEGORY CREATE MODAL
// ============================================================

interface CreateCategoryModalProps {
  isOpen: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (payload: EquipmentCategoryCreatePayload) => void;
}

const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  saving,
  error,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [iconKey, setIconKey] = useState<CategoryIconKey>('outros');
  const [fieldDrafts, setFieldDrafts] = useState(() => [emptyDraft()]);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setIconKey('outros');
    setFieldDrafts([emptyDraft()]);
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      icon_key: iconKey,
      field_definitions: draftsToPayload(fieldDrafts),
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nova categoria de equipamento">
      <form onSubmit={handleSubmit} className={styles.form}>
        <div>
          <label className={styles.fieldLabel}>Nome da categoria *</label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Climatizador, Câmara fria..."
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>Ícone</label>
          <EquipmentCategoryIconPicker value={iconKey} onChange={setIconKey} disabled={saving} />
        </div>
        <p className={styles.formHint}>
          Defina os campos técnicos exibidos ao cadastrar modelos. Para editar categorias existentes, use
          Operação → Categorias equipamentos.
        </p>
        <CategoryFieldDefinitionsEditor
          fields={fieldDrafts}
          onChange={setFieldDrafts}
          disabled={saving}
        />
        {error ? <p className={styles.formError}>{error}</p> : null}
        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {saving ? 'Salvando...' : 'Criar categoria'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ============================================================
// FORM COMPONENT
// ============================================================

interface EquipmentFormProps {
  initialData?: CatalogEquipment | null;
  catalogItems: CatalogEquipment[];
  existingManuals: ManualOption[];
  categoryOptions: CategoryOption[];
  onCreateCategory?: (payload: EquipmentCategoryCreatePayload) => Promise<CategoryOption>;
  onSave: (data: NewCatalogEquipmentData) => void | Promise<void>;
  onCancel: () => void;
}

const EquipmentForm: React.FC<EquipmentFormProps> = ({
  initialData,
  catalogItems,
  existingManuals,
  categoryOptions,
  onCreateCategory,
  onSave,
  onCancel,
}) => {
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [formCategoryOptions, setFormCategoryOptions] = useState<CategoryOption[]>(categoryOptions);

  useEffect(() => {
    setFormCategoryOptions(categoryOptions);
  }, [categoryOptions]);

  const [formData, setFormData] = useState<NewCatalogEquipmentData>({
    categoryId: initialData?.categoryId || categoryOptions[0]?.id || '',
    marca: initialData?.marca || '',
    modelo: initialData?.modelo || '',
    modelEvaporator: initialData?.modelEvaporator || '',
    modelCondenser: initialData?.modelCondenser || '',
    technicalData: initialData?.technicalData ? { ...initialData.technicalData } : {},
    fieldDefinitions: [],
    manualMode: initialData?.manualId
      ? 'existing'
      : initialData?.manualUrl
        ? 'upload'
        : 'none',
    manualTitle: initialData?.manualTitle || '',
    manualId: initialData?.manualId || '',
    manualPdf: null,
    removeManual: false,
    acManuals: emptyGlobalEquipmentManualsValue(),
  });

  const [errors, setErrors] = useState<Partial<Record<keyof NewCatalogEquipmentData, string>>>({});
  const [technicalErrors, setTechnicalErrors] = useState<Record<string, string>>({});
  const [formValidationError, setFormValidationError] = useState('');
  const [duplicateHint, setDuplicateHint] = useState('');
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  useEffect(() => {
    if (initialData?.categoryId) return;
    if (!formData.categoryId && formCategoryOptions.length > 0) {
      setFormData((prev) => ({ ...prev, categoryId: formCategoryOptions[0].id }));
    }
  }, [formCategoryOptions, formData.categoryId, initialData?.categoryId]);

  const selectedCategory = formCategoryOptions.find((c) => c.id === formData.categoryId) ?? null;
  const isAcCategory = isAirConditioningCategory(selectedCategory?.name);
  const isClimaCategory = isClimatizadorCategory(selectedCategory?.name);
  const isProductizedCategory = isAcCategory || isClimaCategory;
  const productizedFieldDefinitions = isAcCategory
    ? mergeAcFieldDefinitions(selectedCategory?.fieldDefinitions ?? [])
    : isClimaCategory
      ? mergeClimatizadorFieldDefinitions(selectedCategory?.fieldDefinitions ?? [])
      : selectedCategory?.fieldDefinitions ?? [];

  const warnIfDuplicate = useCallback(
    (draft: NewCatalogEquipmentData) => {
      if (initialData?.id) {
        setDuplicateHint('');
        return;
      }
      const local = findDuplicateCatalogEntry(draft, catalogItems);
      if (local) {
        setDuplicateHint(formatDuplicateCatalogMessage(local, selectedCategory?.name));
        return;
      }
      setDuplicateHint('');
    },
    [catalogItems, initialData?.id, selectedCategory?.name],
  );

  const handleAiExtracted = useCallback(
    (extraction: EquipmentLabelExtractionOut) => {
      if (isClimaCategory) {
        const mapped = mapClimatizadorAiToFormFields(extraction);
        setFormData((prev) => {
          const next = {
            ...prev,
            marca: mapped.marca || prev.marca,
            modelEvaporator: mapped.modelEvaporator || prev.modelEvaporator,
            technicalData: mapClimatizadorAiToTechnicalData(extraction, prev.technicalData),
          };
          warnIfDuplicate(next);
          return next;
        });
      } else {
        const mapped = mapAiExtractionToFormFields(extraction);
        setFormData((prev) => {
          const next = {
            ...prev,
            marca: mapped.marca || prev.marca,
            modelEvaporator: mapped.modelEvaporator || prev.modelEvaporator,
            modelCondenser: mapped.modelCondenser || prev.modelCondenser,
            technicalData: mapAiExtractionToTechnicalData(extraction, prev.technicalData),
          };
          warnIfDuplicate(next);
          return next;
        });
      }
      setErrors({});
      setTechnicalErrors({});
    },
    [isClimaCategory, warnIfDuplicate],
  );

  useEffect(() => {
    if (initialData?.id) {
      setDuplicateHint('');
      return;
    }
    warnIfDuplicate(formData);
  }, [
    formData.marca,
    formData.modelEvaporator,
    formData.modelCondenser,
    formData.modelo,
    formData.categoryId,
    initialData?.id,
    warnIfDuplicate,
  ]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof NewCatalogEquipmentData, string>> = {};

    if (!formData.marca.trim()) {
      newErrors.marca = 'Marca e obrigatoria';
    }
    if (isAcCategory) {
      const hasSplit =
        Boolean(formData.modelEvaporator.trim()) || Boolean(formData.modelCondenser.trim());
      if (!hasSplit) {
        newErrors.modelEvaporator = 'Informe ao menos o modelo da evaporadora ou da condensadora';
      }
    } else if (isClimaCategory) {
      if (!formData.modelEvaporator.trim()) {
        newErrors.modelEvaporator = 'Informe o modelo do climatizador';
      }
    }
    if (
      !isProductizedCategory &&
      formData.manualMode === 'existing' &&
      !formData.manualPdf &&
      !formData.manualId &&
      !initialData?.manualId
    ) {
      newErrors.manualId = 'Selecione um manual da lista, envie um PDF ou escolha "Sem manual"';
    }
    if (
      !isProductizedCategory &&
      formData.manualMode === 'upload' &&
      !formData.manualPdf &&
      !initialData?.manualUrl
    ) {
      newErrors.manualTitle = 'Selecione um arquivo PDF para o manual';
    }
    if (!formData.categoryId) {
      newErrors.categoryId = 'Selecione uma categoria';
    }

    const techErrors = validateTechnicalDataForm(
      isProductizedCategory
        ? productizedFieldDefinitions
        : selectedCategory?.fieldDefinitions ?? [],
      formData.technicalData,
    );

    setErrors(newErrors);
    setTechnicalErrors(techErrors);
    return Object.keys(newErrors).length === 0 && Object.keys(techErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError('');
    setDuplicateHint('');
    if (!validate()) {
      setFormValidationError('Revise os campos destacados antes de salvar.');
      return;
    }

    if (!initialData?.id) {
      const localDup = findDuplicateCatalogEntry(formData, catalogItems);
      if (localDup) {
        setFormValidationError(formatDuplicateCatalogMessage(localDup, selectedCategory?.name));
        return;
      }
      setCheckingDuplicate(true);
      try {
        const remote = await checkEquipmentCatalogDuplicate({
          category_id: formData.categoryId,
          brand: formData.marca,
          model_evaporator: formData.modelEvaporator,
          model_condenser: formData.modelCondenser,
          model: formData.modelo,
        });
        if (remote.exists) {
          const label = [remote.brand, remote.model].filter(Boolean).join(' ');
          const cat = remote.category_name ? ` (${remote.category_name})` : '';
          setFormValidationError(
            `Este equipamento já está cadastrado no catálogo: ${label}${cat}. Não cadastre novamente — edite o registro existente se precisar atualizar.`,
          );
          return;
        }
      } catch (err) {
        setFormValidationError(
          err instanceof Error ? err.message : 'Não foi possível verificar se o modelo já existe.',
        );
        return;
      } finally {
        setCheckingDuplicate(false);
      }
    }

    const defs = isProductizedCategory
      ? productizedFieldDefinitions
      : selectedCategory?.fieldDefinitions ?? [];
    let payload: NewCatalogEquipmentData = {
      ...formData,
      fieldDefinitions: defs,
    };
    if (isProductizedCategory && formData.acManuals) {
      const manuals = formData.acManuals;
      if (manuals.existingManualId) {
        payload = {
          ...payload,
          manualMode: "existing",
          manualId: manuals.existingManualId,
        };
      } else if (manuals.combinedUsuarioInstalacao && manuals.combined.pdf) {
        payload = {
          ...payload,
          manualMode: "upload",
          manualPdf: manuals.combined.pdf,
          manualTitle:
            manuals.combined.title ||
            manuals.combined.pdf.name.replace(/\.pdf$/i, ""),
          manualCombinadoUsuarioInstalacao: true,
        };
      } else {
        const primarySlot = manuals.instalacao.pdf
          ? manuals.instalacao
          : manuals.usuario.pdf
            ? manuals.usuario
            : manuals.servico.pdf
              ? manuals.servico
              : null;
        if (primarySlot?.pdf) {
          payload = {
            ...payload,
            manualMode: "upload",
            manualPdf: primarySlot.pdf,
            manualTitle:
              primarySlot.title || primarySlot.pdf.name.replace(/\.pdf$/i, ""),
          };
        } else {
          payload = { ...payload, manualMode: "none" };
        }
      }
    }
    onSave(payload);
  };

  const handleChange = (field: keyof NewCatalogEquipmentData, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (!initialData?.id && (field === 'marca' || field === 'modelo')) {
        warnIfDuplicate(next);
      }
      return next;
    });
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const prevCategoryIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedCategory || !formData.categoryId) return;
    const prevId = prevCategoryIdRef.current;
    prevCategoryIdRef.current = formData.categoryId;
    if (prevId === null || prevId === formData.categoryId) return;

    const allowed = new Set(selectedCategory.fieldDefinitions.map((d) => d.key));
    setFormData((prev) => {
      const technicalData: Record<string, string> = {};
      for (const key of allowed) {
        if (prev.technicalData[key] !== undefined) technicalData[key] = prev.technicalData[key];
      }
      return { ...prev, technicalData };
    });
    setTechnicalErrors({});
  }, [formData.categoryId, selectedCategory]);

  const handleCreateCategory = useCallback(
    async (payload: EquipmentCategoryCreatePayload) => {
      if (!onCreateCategory) return;
      setCategorySaving(true);
      setCategoryError('');
      try {
        const created = await onCreateCategory(payload);
        setFormCategoryOptions((prev) => {
          if (prev.some((c) => c.id === created.id)) return prev;
          return [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        });
        setFormData((prev) => ({ ...prev, categoryId: created.id }));
        setCategoryModalOpen(false);
      } catch (e) {
        setCategoryError(e instanceof Error ? e.message : 'Não foi possível criar a categoria.');
      } finally {
        setCategorySaving(false);
      }
    },
    [onCreateCategory],
  );

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {formValidationError ? <p className={styles.formError}>{formValidationError}</p> : null}
      {!formValidationError && duplicateHint ? (
        <p className={styles.formWarning} role="status">
          {duplicateHint}
        </p>
      ) : null}
      {/* Categoria */}
      <div>
        <label className={styles.fieldLabel}>Categoria *</label>
        <div className={styles.categoryRow}>
          <Select
            value={formData.categoryId}
            onChange={(value) => setFormData((prev) => ({ ...prev, categoryId: value }))}
            options={[
              {
                value: '',
                label: formCategoryOptions.length ? 'Selecione a categoria...' : 'Nenhuma categoria cadastrada',
              },
              ...formCategoryOptions.map((c) => ({ value: c.id, label: c.name })),
            ]}
            className={styles.categorySelect}
          />
          {onCreateCategory ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<IconPlus />}
              className={styles.newCategoryBtn}
              onClick={() => {
                setCategoryError('');
                setCategoryModalOpen(true);
              }}
            >
              Nova categoria
            </Button>
          ) : null}
        </div>
        {errors.categoryId ? <p className={styles.formError}>{errors.categoryId}</p> : null}
      </div>

      <CreateCategoryModal
        isOpen={categoryModalOpen}
        saving={categorySaving}
        error={categoryError}
        onClose={() => setCategoryModalOpen(false)}
        onSubmit={(payload) => void handleCreateCategory(payload)}
      />

      {isAcCategory ? (
        <EquipmentLabelPhotoButtons variant="split_ac" onExtracted={handleAiExtracted} />
      ) : null}
      {isClimaCategory ? (
        <EquipmentLabelPhotoButtons variant="climatizador" onExtracted={handleAiExtracted} />
      ) : null}

      {isProductizedCategory ? (
        <div className={styles.formSection}>
          <h3 className={styles.formSectionTitle}>Identificação Básica</h3>
          <div>
            <label className={styles.fieldLabel}>Marca *</label>
            <Input
              type="text"
              value={formData.marca}
              onChange={(e) => handleChange("marca", e.target.value)}
              placeholder="Ex: LG, Daikin, Carrier..."
            />
            {errors.marca ? <p className={styles.formError}>{errors.marca}</p> : null}
          </div>
          {isAcCategory ? (
            <div className={styles.modelSplitRow}>
              <div className={styles.modelSplitField}>
                <label className={styles.fieldLabel}>Modelo (Evaporadora)</label>
                <Input
                  type="text"
                  value={formData.modelEvaporator}
                  onChange={(e) => setFormData((prev) => ({ ...prev, modelEvaporator: e.target.value }))}
                  placeholder="Ex: ASYG09LFCA"
                />
              </div>
              <div className={styles.modelSplitField}>
                <label className={styles.fieldLabel}>Modelo (Condensadora)</label>
                <Input
                  type="text"
                  value={formData.modelCondenser}
                  onChange={(e) => setFormData((prev) => ({ ...prev, modelCondenser: e.target.value }))}
                  placeholder="Ex: AOYG09LFCA"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className={styles.fieldLabel}>Modelo *</label>
              <Input
                type="text"
                value={formData.modelEvaporator}
                onChange={(e) => setFormData((prev) => ({ ...prev, modelEvaporator: e.target.value }))}
                placeholder="Ex: MV80, CL80, EcoBreeze 12000..."
              />
            </div>
          )}
          {errors.modelEvaporator ? <p className={styles.formError}>{errors.modelEvaporator}</p> : null}
        </div>
      ) : (
        <>
          <div>
            <label className="block text-[var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-text)] mb-2">
              Marca *
            </label>
            <Input
              type="text"
              value={formData.marca}
              onChange={(e) => handleChange("marca", e.target.value)}
              placeholder="Ex: LG, Samsung, Carrier..."
            />
            {errors.marca && (
              <p className="mt-1 text-[var(--font-size-sm)] text-[var(--color-error)]">{errors.marca}</p>
            )}
          </div>

          <div className={styles.modelSplitBlock}>
            <div className={styles.modelSplitRow}>
              <div className={styles.modelSplitField}>
                <label className={styles.fieldLabel}>Modelo (Evaporadora)</label>
                <Input
                  type="text"
                  value={formData.modelEvaporator}
                  onChange={(e) => setFormData((prev) => ({ ...prev, modelEvaporator: e.target.value }))}
                  placeholder="Ex: GWC09QB"
                />
              </div>
              <div className={styles.modelSplitField}>
                <label className={styles.fieldLabel}>Modelo (Condensadora)</label>
                <Input
                  type="text"
                  value={formData.modelCondenser}
                  onChange={(e) => setFormData((prev) => ({ ...prev, modelCondenser: e.target.value }))}
                  placeholder="Ex: D3NNB4B"
                />
              </div>
            </div>
            {selectedCategory && !isSplitCategoryName(selectedCategory.name) ? (
              <p className={styles.formHint}>
                Para equipamentos unitarios, preencha apenas o campo da evaporadora (modelo do aparelho).
              </p>
            ) : null}
            {errors.modelEvaporator ? <p className={styles.formError}>{errors.modelEvaporator}</p> : null}
          </div>
        </>
      )}

      {selectedCategory ? (
        isProductizedCategory ? (
          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>Especificações Técnicas</h3>
            <DynamicTechnicalFields
              definitions={productizedFieldDefinitions}
              values={formData.technicalData}
              errors={technicalErrors}
              categoryName={selectedCategory.name}
              onChange={(key, value) => {
                setFormData((prev) => ({
                  ...prev,
                  technicalData: { ...prev.technicalData, [key]: value },
                }));
                if (technicalErrors[key]) {
                  setTechnicalErrors((prev) => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  });
                }
              }}
            />
          </div>
        ) : (
          <DynamicTechnicalFields
            definitions={selectedCategory.fieldDefinitions}
            values={formData.technicalData}
            errors={technicalErrors}
            categoryName={selectedCategory.name}
            onChange={(key, value) => {
              setFormData((prev) => ({
                ...prev,
                technicalData: { ...prev.technicalData, [key]: value },
              }));
              if (technicalErrors[key]) {
                setTechnicalErrors((prev) => {
                  const next = { ...prev };
                  delete next[key];
                  return next;
                });
              }
            }}
          />
        )
      ) : null}

      {isProductizedCategory ? (
        <GlobalEquipmentManualsPanel
          value={formData.acManuals ?? emptyGlobalEquipmentManualsValue()}
          existingManuals={existingManuals}
          onChange={(acManuals) => setFormData((prev) => ({ ...prev, acManuals }))}
        />
      ) : (
      <div className={styles.manualSection}>
        <label className={styles.fieldLabel}>Manual tecnico (opcional)</label>
        <div className={styles.manualModeRow} role="radiogroup" aria-label="Origem do manual tecnico">
          <label className={styles.manualModeOption}>
            <input
              type="radio"
              name="manualMode"
              checked={formData.manualMode === 'none'}
              onChange={() =>
                setFormData((prev) => ({
                  ...prev,
                  manualMode: 'none',
                  manualId: '',
                  manualPdf: null,
                  removeManual: false,
                }))
              }
            />
            Sem manual (adicionar depois)
          </label>
          <label className={styles.manualModeOption}>
            <input
              type="radio"
              name="manualMode"
              checked={formData.manualMode === 'upload'}
              onChange={() =>
                setFormData((prev) => ({
                  ...prev,
                  manualMode: 'upload',
                  manualId: '',
                  removeManual: false,
                }))
              }
            />
            Fazer upload de um novo manual
          </label>
          <label className={styles.manualModeOption}>
            <input
              type="radio"
              name="manualMode"
              checked={formData.manualMode === 'existing'}
              onChange={() =>
                setFormData((prev) => ({
                  ...prev,
                  manualMode: 'existing',
                  manualPdf: null,
                  removeManual: false,
                }))
              }
            />
            Vincular a um manual existente
          </label>
        </div>

        {formData.manualMode === 'none' ? (
          <p className={styles.formHint}>
            O modelo sera cadastrado sem manual. Voce pode anexar o PDF depois na edicao.
          </p>
        ) : formData.manualMode === 'existing' ? (
          <div className={styles.manualPanel}>
            <label className={styles.fieldLabelMuted}>Manual cadastrado no sistema</label>
            <Select
              value={formData.manualId}
              onChange={(value) => setFormData((prev) => ({ ...prev, manualId: value }))}
              options={[
                {
                  value: '',
                  label: existingManuals.length ? 'Selecione um manual...' : 'Nenhum manual cadastrado ainda',
                },
                ...existingManuals.map((m) => ({ value: m.id, label: m.title })),
              ]}
            />
            {errors.manualId ? <p className={styles.formError}>{errors.manualId}</p> : null}
            {existingManuals.length === 0 ? (
              <p className={styles.formHint}>
                Cadastre primeiro um modelo com upload de PDF ou escolha &quot;Sem manual&quot;.
              </p>
            ) : null}
          </div>
        ) : formData.manualMode === 'upload' ? (
          <div className={styles.manualPanel}>
            <div className={styles.manualTitleWrap}>
              <label className={styles.fieldLabelMuted}>Titulo descritivo do manual (opcional)</label>
              <Input
                type="text"
                value={formData.manualTitle}
                onChange={(e) => setFormData((prev) => ({ ...prev, manualTitle: e.target.value }))}
                placeholder="Ex: Gree — manual de instalacao split inverter"
              />
              {errors.manualTitle ? <p className={styles.formError}>{errors.manualTitle}</p> : null}
            </div>
            <ManualPdfUploadField
              existingManualUrl={initialData?.manualUrl}
              selectedFile={formData.manualPdf ?? null}
              removeExisting={Boolean(formData.removeManual)}
              onSelect={(file) => setFormData((prev) => ({ ...prev, manualPdf: file }))}
              onRemoveExistingChange={(remove) =>
                setFormData((prev) => ({
                  ...prev,
                  removeManual: remove,
                  manualPdf: remove ? null : prev.manualPdf,
                }))
              }
            />
          </div>
        ) : null}
      </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={checkingDuplicate || Boolean(!initialData && duplicateHint)}
        >
          {checkingDuplicate
            ? 'Verificando...'
            : initialData
              ? 'Salvar Alteracoes'
              : 'Cadastrar Modelo'}
        </Button>
      </div>
    </form>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export const AdminEquipmentCatalogView: React.FC<AdminEquipmentCatalogViewProps> = ({
  equipments,
  metrics,
  isLoading = false,
  existingManuals = [],
  categoryOptions = [],
  categoriesLoading = false,
  onRefreshCategories,
  onCreateCategory,
  onSave,
  onDelete,
  onFiltersChange,
}) => {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<CatalogEquipment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const itemsPerPage = 10;

  useEffect(() => {
    onFiltersChange?.({
      category: categoryFilter,
      brand: brandFilter,
      search: searchTerm,
    });
  }, [categoryFilter, brandFilter, searchTerm, onFiltersChange]);

  // Get unique brands for filter
  const uniqueBrands = useMemo(() => {
    const brands = [...new Set(equipments.map((e) => e.marca))].sort();
    return brands.map((b) => ({ value: b, label: b }));
  }, [equipments]);

  const apiFiltersActive = Boolean(onFiltersChange);

  // Filtro local: busca/marca quando a API já filtrou categoria (category_id).
  const filteredEquipments = useMemo(() => {
    return equipments.filter((equipment) => {
      const matchesSearch =
        !searchTerm ||
        equipment.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        equipment.marca.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        apiFiltersActive || !categoryFilter || equipment.categoryId === categoryFilter;
      const matchesBrand = !brandFilter || equipment.marca === brandFilter;

      return matchesSearch && matchesCategory && matchesBrand;
    });
  }, [equipments, searchTerm, categoryFilter, brandFilter, apiFiltersActive]);

  // Pagination
  const totalPages = Math.ceil(filteredEquipments.length / itemsPerPage);
  const paginatedEquipments = filteredEquipments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filters change
  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  // Handlers
  const handleOpenModal = (equipment?: CatalogEquipment) => {
    onRefreshCategories?.();
    setEditingEquipment(equipment || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEquipment(null);
  };

  const handleSave = async (data: NewCatalogEquipmentData) => {
    try {
      await Promise.resolve(onSave(data, editingEquipment?.id));
      handleCloseModal();
    } catch {
      // Erro exibido pelo container (banner no topo da página).
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirm(id);
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      onDelete(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  const filterCategoryOptions = useMemo(
    () => [{ value: '', label: 'Todas Categorias' }, ...categoryOptions.map((c) => ({ value: c.id, label: c.name }))],
    [categoryOptions],
  );

  return (
    <div className={styles.root}>
      <div className={styles.inner}>
        <header className={styles.pageHeader}>
          <div className={styles.pageHeaderIcon}>
            <IconDatabase style={iconSize('xl')} />
          </div>
          <div>
            <h1 className={styles.pageTitle}>Catalogo de Equipamentos</h1>
            <p className={styles.pageSubtitle}>
              Gerencie o catalogo global de modelos de equipamentos do SaaS
            </p>
          </div>
        </header>

        <div className={styles.statsGrid}>
          <MetricCard label="Total de Modelos" value={metrics.totalModelos} icon={<IconDatabase />} variant="primary" />
          <MetricCard label="Ar-Condicionados" value={metrics.totalArCondicionado} icon={<IconSnowflake />} />
          <MetricCard label="Geladeiras/Bebedouros" value={metrics.totalGeladeiraBebedouro} icon={<IconFridge />} />
          <MetricCard label="Com Manual PDF" value={metrics.totalComManual} icon={<IconFileText />} variant="success" />
        </div>

        <div className={styles.toolbar}>
          <div className={styles.filtersRow}>
            {categoryOptions.length > 0 ? (
              <div className={styles.categoryQuickFilters} role="group" aria-label="Filtrar por categoria">
                <button
                  type="button"
                  className={`${styles.categoryQuickChip} ${!categoryFilter ? styles.categoryQuickChipActive : ''}`}
                  onClick={() => handleFilterChange(setCategoryFilter)('')}
                >
                  Todas
                </button>
                {categoryOptions.map((cat) => {
                  const visual = getCategoryVisual(cat.iconKey, cat.name);
                  const ChipIcon = visual.Icon;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`${styles.categoryQuickChip} ${
                        categoryFilter === cat.id ? styles.categoryQuickChipActive : ''
                      }`}
                      onClick={() => handleFilterChange(setCategoryFilter)(cat.id)}
                    >
                      <ChipIcon size={14} />
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            ) : categoriesLoading ? (
              <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)]">Carregando categorias...</p>
            ) : null}
            <Select
              value={categoryFilter}
              onChange={handleFilterChange(setCategoryFilter)}
              options={filterCategoryOptions}
              className={styles.selectNarrow}
            />
            <Select
              value={brandFilter}
              onChange={handleFilterChange(setBrandFilter)}
              options={[{ value: '', label: 'Todas Marcas' }, ...uniqueBrands]}
              className={styles.selectNarrow}
            />
            <Input
              type="text"
              icon={<IconSearch />}
              placeholder="Buscar por modelo..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className={styles.searchFlex}
            />
          </div>
          <Button variant="primary" icon={<IconPlus />} onClick={() => handleOpenModal()}>
            Novo Modelo
          </Button>
        </div>

        <div className={styles.tablePanel}>
          {isLoading ? (
            <TableSkeleton />
          ) : paginatedEquipments.length === 0 ? (
            filteredEquipments.length === 0 && equipments.length === 0 ? (
              <EmptyState onAdd={() => handleOpenModal()} />
            ) : (
              <div className="py-12 text-center">
                <p className="text-[var(--font-size-base)] text-[var(--color-text-muted)]">
                  Nenhum resultado encontrado para os filtros selecionados
                </p>
              </div>
            )
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-slate-50/50">
                      <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-[var(--font-weight-semibold)] text-[var(--color-text-muted)] uppercase tracking-wider">
                        Categoria
                      </th>
                      <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-[var(--font-weight-semibold)] text-[var(--color-text-muted)] uppercase tracking-wider">
                        Marca
                      </th>
                      <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-[var(--font-weight-semibold)] text-[var(--color-text-muted)] uppercase tracking-wider">
                        Modelo
                      </th>
                      <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-[var(--font-weight-semibold)] text-[var(--color-text-muted)] uppercase tracking-wider">
                        Dados técnicos
                      </th>
                      <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-[var(--font-weight-semibold)] text-[var(--color-text-muted)] uppercase tracking-wider">
                        Manual
                      </th>
                      <th className="px-4 py-3 text-right text-[var(--font-size-xs)] font-[var(--font-weight-semibold)] text-[var(--color-text-muted)] uppercase tracking-wider">
                        Acoes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {paginatedEquipments.map((equipment) => (
                      <tr
                        key={equipment.id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <CategoryBadge
                            categoryName={equipment.categoryName}
                            iconKey={equipment.categoryIconKey}
                          />
                        </td>
                        <td className="px-4 py-3 text-[var(--font-size-base)] font-[var(--font-weight-medium)] text-[var(--color-text)]">
                          {equipment.marca}
                        </td>
                        <td className="px-4 py-3 text-[var(--font-size-base)] text-[var(--color-text)]">
                          {equipment.modelo}
                        </td>
                        <td className="px-4 py-3 text-[var(--font-size-base)] text-[var(--color-text-muted)] max-w-xs">
                          {equipment.technicalSummary}
                        </td>
                        <td className="px-4 py-3">
                          <ManualBadge url={equipment.manualUrl} hasManual={equipment.hasExtraManuals} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenModal(equipment)}
                              className="
                                w-8 h-8 rounded-lg flex items-center justify-center
                                text-[var(--color-text-muted)] hover:bg-slate-100 hover:text-[var(--color-primary)]
                                transition-colors
                              "
                              title="Editar"
                            >
                              <IconEdit />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(equipment.id)}
                              className="
                                w-8 h-8 rounded-lg flex items-center justify-center
                                text-[var(--color-text-muted)] hover:bg-red-50 hover:text-[var(--color-error)]
                                transition-colors
                              "
                              title="Excluir"
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>


              {/* Pagination */}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingEquipment ? 'Editar Modelo' : 'Novo Modelo no Catalogo'}
      >
        <EquipmentForm
          initialData={editingEquipment}
          catalogItems={equipments}
          existingManuals={existingManuals}
          categoryOptions={categoryOptions}
          onCreateCategory={onCreateCategory}
          onSave={handleSave}
          onCancel={handleCloseModal}
        />
      </Modal>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          />
          <div
            className="
              relative bg-[var(--color-surface-elevated)] rounded-[var(--card-radius)]
              shadow-xl p-6 max-w-sm w-full
            "
          >
            <h3 className="text-[var(--font-size-lg)] font-[var(--font-weight-semibold)] text-[var(--color-text)] mb-2">
              Confirmar exclusao
            </h3>
            <p className="text-[var(--font-size-base)] text-[var(--color-text-muted)] mb-6">
              Tem certeza que deseja excluir este modelo do catalogo? Esta acao nao pode ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={handleDeleteConfirm}>
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// MOCK DATA
// ============================================================

export const mockCatalogEquipments: CatalogEquipment[] = [
  {
    id: '1',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'LG',
    modelo: 'S4-Q12WA51A',
    technicalData: { capacity: '12000 BTUs' },
    technicalSummary: 'Capacidade: 12000 BTUs',
    manualUrl: 'https://example.com/manuals/lg-s4-q12wa51a.pdf',
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  {
    id: '2',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'Samsung',
    modelo: 'AR12MVFXAWK',
    technicalData: { capacity: '12000 BTUs' },
    technicalSummary: 'Capacidade: 12000 BTUs',
    manualUrl: 'https://example.com/manuals/samsung-ar12.pdf',
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-16',
    updatedAt: '2024-01-16',
  },
  {
    id: '3',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'Carrier',
    modelo: 'X-Power 18K',
    technicalData: { capacity: '18000 BTUs' },
    technicalSummary: 'Capacidade: 18000 BTUs',
    manualUrl: null,
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-17',
    updatedAt: '2024-01-17',
  },
  {
    id: '4',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'Midea',
    modelo: 'Springer Inverter 9K',
    technicalData: { capacity: '9000 BTUs' },
    technicalSummary: 'Capacidade: 9000 BTUs',
    manualUrl: 'https://example.com/manuals/midea-springer-9k.pdf',
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-18',
    updatedAt: '2024-01-18',
  },
  {
    id: '5',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'Brastemp',
    modelo: 'BRM56AK',
    technicalData: { capacity: '462 Litros' },
    technicalSummary: 'Capacidade: 462 Litros',
    manualUrl: 'https://example.com/manuals/brastemp-brm56ak.pdf',
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-19',
    updatedAt: '2024-01-19',
  },
  {
    id: '6',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'Electrolux',
    modelo: 'IF55B',
    technicalData: { capacity: '431 Litros' },
    technicalSummary: 'Capacidade: 431 Litros',
    manualUrl: null,
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-20',
    updatedAt: '2024-01-20',
  },
  {
    id: '7',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'IBBL',
    modelo: 'PDF300',
    technicalData: { capacity: '2.8 Litros/hora' },
    technicalSummary: 'Capacidade: 2.8 Litros/hora',
    manualUrl: 'https://example.com/manuals/ibbl-pdf300.pdf',
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-21',
    updatedAt: '2024-01-21',
  },
  {
    id: '8',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'Libell',
    modelo: 'Acquaflex Press',
    technicalData: { capacity: '2.2 Litros/hora' },
    technicalSummary: 'Capacidade: 2.2 Litros/hora',
    manualUrl: null,
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-22',
    updatedAt: '2024-01-22',
  },
  {
    id: '9',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'Daikin',
    modelo: 'FTX35J3',
    technicalData: { capacity: '12000 BTUs' },
    technicalSummary: 'Capacidade: 12000 BTUs',
    manualUrl: 'https://example.com/manuals/daikin-ftx35.pdf',
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-23',
    updatedAt: '2024-01-23',
  },
  {
    id: '10',
    categoryId: 'mock-cat',
    categoryName: 'Ar-Condicionado',
    marca: 'Consul',
    modelo: 'Freezer CVU20GB',
    technicalData: { capacity: '200 Litros' },
    technicalSummary: 'Capacidade: 200 Litros',
    manualUrl: null,
    modelEvaporator: '',
    modelCondenser: '',
    manualId: null,
    manualTitle: null,
    createdAt: '2024-01-24',
    updatedAt: '2024-01-24',
  },
];

export const mockCatalogMetrics: CatalogMetrics = {
  totalModelos: 10,
  totalArCondicionado: 5,
  totalGeladeiraBebedouro: 4,
  totalComManual: 6,
};

// ============================================================
// USAGE EXAMPLE
// ============================================================

/*
import {
  AdminEquipmentCatalogView,
  mockCatalogEquipments,
  mockCatalogMetrics,
} from '@/components/v0-ui/admin/AdminEquipmentCatalogView';

export default function AdminCatalogPage() {
  const [equipments, setEquipments] = useState(mockCatalogEquipments);
  const [metrics, setMetrics] = useState(mockCatalogMetrics);

  const handleSave = (data: NewCatalogEquipmentData, id?: string) => {
    if (id) {
      // Edit existing
      setEquipments((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, ...data, updatedAt: new Date().toISOString() }
            : e
        )
      );
    } else {
      // Add new
      const newEquipment = {
        ...data,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setEquipments((prev) => [...prev, newEquipment]);
    }
  };

  const handleDelete = (id: string) => {
    setEquipments((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <AdminEquipmentCatalogView
      equipments={equipments}
      metrics={metrics}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  );
}
*/

export default AdminEquipmentCatalogView;
