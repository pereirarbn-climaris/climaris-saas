import React, { useState, useMemo } from 'react';

// ============================================================
// TYPES
// ============================================================

export type EquipmentCategory = 'ar_condicionado' | 'geladeira' | 'bebedouro' | 'outros';

export interface CatalogEquipment {
  id: string;
  categoria: EquipmentCategory;
  marca: string;
  modelo: string;
  capacidade: string;
  tipoFluido: string;
  manualUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogMetrics {
  totalModelos: number;
  totalArCondicionado: number;
  totalGeladeiraBebedouro: number;
  totalComManual: number;
}

export interface NewCatalogEquipmentData {
  categoria: EquipmentCategory;
  marca: string;
  modelo: string;
  capacidade: string;
  tipoFluido: string;
  manualUrl: string;
}

export interface AdminEquipmentCatalogViewProps {
  equipments: CatalogEquipment[];
  metrics: CatalogMetrics;
  isLoading?: boolean;
  onSave: (data: NewCatalogEquipmentData, id?: string) => void;
  onDelete: (id: string) => void;
}

// ============================================================
// ICONS
// ============================================================

const IconSnowflake = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M20 16l-4-4 4-4" />
    <path d="M4 8l4 4-4 4" />
    <path d="M16 4l-4 4-4-4" />
    <path d="M8 20l4-4 4 4" />
  </svg>
);

const IconFridge = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
    <path d="M3 10h18" />
    <path d="M8 6v2" />
    <path d="M8 14v4" />
  </svg>
);

const IconDroplet = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" />
  </svg>
);

const IconBox = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const IconDatabase = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

const IconFileText = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconSearch = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconPlus = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconEdit = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const IconTrash = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const IconX = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconChevronDown = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconLink = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const IconChevronLeft = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IconChevronRight = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ============================================================
// HELPERS
// ============================================================

const categoryConfig: Record<EquipmentCategory, { label: string; icon: React.FC<{ className?: string }>; color: string }> = {
  ar_condicionado: {
    label: 'Ar-Condicionado',
    icon: IconSnowflake,
    color: 'bg-sky-100 text-sky-700',
  },
  geladeira: {
    label: 'Geladeira',
    icon: IconFridge,
    color: 'bg-indigo-100 text-indigo-700',
  },
  bebedouro: {
    label: 'Bebedouro',
    icon: IconDroplet,
    color: 'bg-cyan-100 text-cyan-700',
  },
  outros: {
    label: 'Outros',
    icon: IconBox,
    color: 'bg-slate-100 text-slate-600',
  },
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
  const variantStyles = {
    default: 'bg-[var(--color-surface-elevated)]',
    primary: 'bg-[var(--color-surface-elevated)]',
    success: 'bg-[var(--color-surface-elevated)]',
    warning: 'bg-[var(--color-surface-elevated)]',
  };

  const iconContainerStyles = {
    default: 'bg-slate-100 text-slate-600',
    primary: 'bg-sky-100 text-[var(--color-primary)]',
    success: 'bg-emerald-100 text-[var(--color-success)]',
    warning: 'bg-amber-100 text-[var(--color-warning)]',
  };

  return (
    <div
      className={`
        ${variantStyles[variant]}
        rounded-[var(--card-radius)] p-[var(--card-padding)]
        border border-[var(--color-border)]
        shadow-[var(--card-shadow)]
        transition-shadow duration-200 hover:shadow-[var(--card-shadow-hover)]
      `}
    >
      <div className="flex items-center gap-3">
        <div
          className={`
            ${iconContainerStyles[variant]}
            w-[var(--stat-card-icon-size)] h-[var(--stat-card-icon-size)]
            rounded-[var(--stat-card-icon-radius)]
            flex items-center justify-center flex-shrink-0
          `}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)] truncate">
            {label}
          </p>
          <p className="text-[var(--font-size-2xl)] font-[var(--font-weight-bold)] text-[var(--color-text)] leading-tight">
            {value.toLocaleString('pt-BR')}
          </p>
        </div>
      </div>
    </div>
  );
};

// Category Badge
const CategoryBadge: React.FC<{ category: EquipmentCategory }> = ({ category }) => {
  const config = categoryConfig[category];
  const Icon = config.icon;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1
        text-[var(--font-size-xs)] font-[var(--font-weight-medium)]
        rounded-full ${config.color}
      `}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};

// Manual Badge
const ManualBadge: React.FC<{ url: string | null }> = ({ url }) => {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="
          inline-flex items-center gap-1.5 px-2.5 py-1
          text-[var(--font-size-xs)] font-[var(--font-weight-medium)]
          rounded-full bg-emerald-100 text-emerald-700
          hover:bg-emerald-200 transition-colors cursor-pointer
        "
        title="Abrir manual em PDF"
      >
        <IconFileText className="w-3.5 h-3.5" />
        PDF
      </a>
    );
  }

  return (
    <span
      className="
        inline-flex items-center gap-1.5 px-2.5 py-1
        text-[var(--font-size-xs)] font-[var(--font-weight-medium)]
        rounded-full bg-slate-100 text-slate-400
      "
    >
      <IconFileText className="w-3.5 h-3.5" />
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
  <div className={`relative ${className}`}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="
        w-full h-[var(--input-height)] pl-[var(--input-padding-x)] pr-10
        bg-[var(--color-surface-elevated)] border border-[var(--color-border)]
        rounded-[var(--input-radius)] text-[var(--font-size-base)] text-[var(--color-text)]
        appearance-none cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:border-[var(--color-primary)]
        transition-colors
      "
    >
      {placeholder && (
        <option value="">{placeholder}</option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <IconChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
  </div>
);

// Text Input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const Input: React.FC<InputProps> = ({ icon, className = '', ...props }) => (
  <div className={`relative ${className}`}>
    {icon && (
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
        {icon}
      </div>
    )}
    <input
      {...props}
      className={`
        w-full h-[var(--input-height)] ${icon ? 'pl-10' : 'pl-[var(--input-padding-x)]'} pr-[var(--input-padding-x)]
        bg-[var(--color-surface-elevated)] border border-[var(--color-border)]
        rounded-[var(--input-radius)] text-[var(--font-size-base)] text-[var(--color-text)]
        placeholder:text-[var(--color-text-subtle)]
        focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:border-[var(--color-primary)]
        transition-colors
      `}
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
  const variantStyles = {
    primary: 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-sm',
    secondary: 'bg-[var(--color-surface-elevated)] hover:bg-slate-50 text-[var(--color-text)] border border-[var(--color-border)]',
    ghost: 'bg-transparent hover:bg-slate-100 text-[var(--color-text-muted)]',
    danger: 'bg-[var(--color-error)] hover:bg-red-700 text-white shadow-sm',
  };

  const sizeStyles = {
    sm: 'h-[var(--btn-height-sm)] px-[var(--btn-padding-sm)] text-[var(--font-size-sm)]',
    base: 'h-[var(--btn-height-base)] px-[var(--btn-padding-base)] text-[var(--font-size-base)]',
    lg: 'h-[var(--btn-height-lg)] px-[var(--btn-padding-lg)] text-[var(--font-size-md)]',
  };

  return (
    <button
      {...props}
      className={`
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        inline-flex items-center justify-center gap-2
        rounded-[var(--btn-radius)] font-[var(--font-weight-medium)]
        transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
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
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div
          className="
            relative w-screen max-w-lg
            bg-[var(--color-surface-elevated)] shadow-xl
            flex flex-col
          "
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h2 className="text-[var(--font-size-xl)] font-[var(--font-weight-semibold)] text-[var(--color-text)]">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="
                w-9 h-9 rounded-lg flex items-center justify-center
                text-[var(--color-text-muted)] hover:bg-slate-100
                transition-colors
              "
            >
              <IconX className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {children}
          </div>
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
  <div className="py-16 text-center">
    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
      <IconDatabase className="w-8 h-8 text-[var(--color-text-muted)]" />
    </div>
    <h3 className="text-[var(--font-size-lg)] font-[var(--font-weight-semibold)] text-[var(--color-text)] mb-2">
      Nenhum modelo cadastrado
    </h3>
    <p className="text-[var(--font-size-base)] text-[var(--color-text-muted)] mb-6 max-w-md mx-auto">
      Comece adicionando modelos de equipamentos ao catalogo global para que as empresas possam utiliza-los.
    </p>
    <Button variant="primary" icon={<IconPlus className="w-4 h-4" />} onClick={onAdd}>
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
          <IconChevronLeft className="w-4 h-4" />
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
          <IconChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ============================================================
// FORM COMPONENT
// ============================================================

interface EquipmentFormProps {
  initialData?: CatalogEquipment | null;
  onSave: (data: NewCatalogEquipmentData) => void;
  onCancel: () => void;
}

const EquipmentForm: React.FC<EquipmentFormProps> = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = useState<NewCatalogEquipmentData>({
    categoria: initialData?.categoria || 'ar_condicionado',
    marca: initialData?.marca || '',
    modelo: initialData?.modelo || '',
    capacidade: initialData?.capacidade || '',
    tipoFluido: initialData?.tipoFluido || '',
    manualUrl: initialData?.manualUrl || '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof NewCatalogEquipmentData, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof NewCatalogEquipmentData, string>> = {};

    if (!formData.marca.trim()) {
      newErrors.marca = 'Marca e obrigatoria';
    }
    if (!formData.modelo.trim()) {
      newErrors.modelo = 'Modelo e obrigatorio';
    }
    if (!formData.capacidade.trim()) {
      newErrors.capacidade = 'Capacidade e obrigatoria';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave(formData);
    }
  };

  const handleChange = (field: keyof NewCatalogEquipmentData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const categoryOptions = [
    { value: 'ar_condicionado', label: 'Ar-Condicionado' },
    { value: 'geladeira', label: 'Geladeira' },
    { value: 'bebedouro', label: 'Bebedouro' },
    { value: 'outros', label: 'Outros' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Categoria */}
      <div>
        <label className="block text-[var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-text)] mb-2">
          Categoria *
        </label>
        <Select
          value={formData.categoria}
          onChange={(value) => handleChange('categoria', value as EquipmentCategory)}
          options={categoryOptions}
        />
      </div>

      {/* Marca */}
      <div>
        <label className="block text-[var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-text)] mb-2">
          Marca *
        </label>
        <Input
          type="text"
          value={formData.marca}
          onChange={(e) => handleChange('marca', e.target.value)}
          placeholder="Ex: LG, Samsung, Carrier..."
        />
        {errors.marca && (
          <p className="mt-1 text-[var(--font-size-sm)] text-[var(--color-error)]">{errors.marca}</p>
        )}
      </div>

      {/* Modelo */}
      <div>
        <label className="block text-[var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-text)] mb-2">
          Modelo *
        </label>
        <Input
          type="text"
          value={formData.modelo}
          onChange={(e) => handleChange('modelo', e.target.value)}
          placeholder="Ex: S4-Q12WA51A, AR12MVFX..."
        />
        {errors.modelo && (
          <p className="mt-1 text-[var(--font-size-sm)] text-[var(--color-error)]">{errors.modelo}</p>
        )}
      </div>

      {/* Capacidade */}
      <div>
        <label className="block text-[var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-text)] mb-2">
          Capacidade *
        </label>
        <Input
          type="text"
          value={formData.capacidade}
          onChange={(e) => handleChange('capacidade', e.target.value)}
          placeholder="Ex: 12000 BTUs, 350 Litros..."
        />
        {errors.capacidade && (
          <p className="mt-1 text-[var(--font-size-sm)] text-[var(--color-error)]">{errors.capacidade}</p>
        )}
      </div>

      {/* Tipo de Fluido */}
      <div>
        <label className="block text-[var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-text)] mb-2">
          Tipo de Fluido/Gas Refrigerante
        </label>
        <Input
          type="text"
          value={formData.tipoFluido}
          onChange={(e) => handleChange('tipoFluido', e.target.value)}
          placeholder="Ex: R-410A, R-134a, R-32..."
        />
      </div>

      {/* URL do Manual */}
      <div>
        <label className="block text-[var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-text)] mb-2">
          URL do Manual Tecnico (PDF)
        </label>
        <Input
          type="url"
          icon={<IconLink className="w-4 h-4" />}
          value={formData.manualUrl}
          onChange={(e) => handleChange('manualUrl', e.target.value)}
          placeholder="https://exemplo.com/manual.pdf"
        />
        <p className="mt-1 text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
          Cole o link do PDF armazenado no seu servidor ou servico de arquivos
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary">
          {initialData ? 'Salvar Alteracoes' : 'Cadastrar Modelo'}
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
  onSave,
  onDelete,
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

  // Get unique brands for filter
  const uniqueBrands = useMemo(() => {
    const brands = [...new Set(equipments.map((e) => e.marca))].sort();
    return brands.map((b) => ({ value: b, label: b }));
  }, [equipments]);

  // Filter and search
  const filteredEquipments = useMemo(() => {
    return equipments.filter((equipment) => {
      const matchesSearch =
        !searchTerm ||
        equipment.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        equipment.marca.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = !categoryFilter || equipment.categoria === categoryFilter;
      const matchesBrand = !brandFilter || equipment.marca === brandFilter;

      return matchesSearch && matchesCategory && matchesBrand;
    });
  }, [equipments, searchTerm, categoryFilter, brandFilter]);

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
    setEditingEquipment(equipment || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEquipment(null);
  };

  const handleSave = (data: NewCatalogEquipmentData) => {
    onSave(data, editingEquipment?.id);
    handleCloseModal();
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

  const categoryOptions = [
    { value: '', label: 'Todas Categorias' },
    { value: 'ar_condicionado', label: 'Ar-Condicionado' },
    { value: 'geladeira', label: 'Geladeira' },
    { value: 'bebedouro', label: 'Bebedouro' },
    { value: 'outros', label: 'Outros' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-[var(--font-size-2xl)] font-[var(--font-weight-bold)] text-[var(--color-text)]">
            Catalogo de Equipamentos
          </h1>
          <p className="text-[var(--font-size-base)] text-[var(--color-text-muted)] mt-1">
            Gerencie o catalogo global de modelos de equipamentos do SaaS
          </p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total de Modelos"
            value={metrics.totalModelos}
            icon={<IconDatabase className="w-[var(--icon-size-lg)] h-[var(--icon-size-lg)]" />}
            variant="primary"
          />
          <MetricCard
            label="Ar-Condicionados"
            value={metrics.totalArCondicionado}
            icon={<IconSnowflake className="w-[var(--icon-size-lg)] h-[var(--icon-size-lg)]" />}
            variant="default"
          />
          <MetricCard
            label="Geladeiras/Bebedouros"
            value={metrics.totalGeladeiraBebedouro}
            icon={<IconFridge className="w-[var(--icon-size-lg)] h-[var(--icon-size-lg)]" />}
            variant="default"
          />
          <MetricCard
            label="Com Manual PDF"
            value={metrics.totalComManual}
            icon={<IconFileText className="w-[var(--icon-size-lg)] h-[var(--icon-size-lg)]" />}
            variant="success"
          />
        </div>

        {/* Filters and Actions */}
        <div
          className="
            bg-[var(--color-surface-elevated)] rounded-[var(--card-radius)]
            border border-[var(--color-border)] shadow-[var(--card-shadow)]
            p-4
          "
        >
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row flex-1 gap-3">
              <Select
                value={categoryFilter}
                onChange={handleFilterChange(setCategoryFilter)}
                options={categoryOptions}
                className="sm:w-48"
              />
              <Select
                value={brandFilter}
                onChange={handleFilterChange(setBrandFilter)}
                options={[{ value: '', label: 'Todas Marcas' }, ...uniqueBrands]}
                className="sm:w-44"
              />
              <Input
                type="text"
                icon={<IconSearch className="w-4 h-4" />}
                placeholder="Buscar por modelo..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="flex-1 min-w-0"
              />
            </div>

            {/* Add Button */}
            <Button
              variant="primary"
              icon={<IconPlus className="w-4 h-4" />}
              onClick={() => handleOpenModal()}
              className="whitespace-nowrap"
            >
              Novo Modelo
            </Button>
          </div>
        </div>

        {/* Table */}
        <div
          className="
            bg-[var(--color-surface-elevated)] rounded-[var(--card-radius)]
            border border-[var(--color-border)] shadow-[var(--card-shadow)]
            overflow-hidden
          "
        >
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
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
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
                        Capacidade
                      </th>
                      <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-[var(--font-weight-semibold)] text-[var(--color-text-muted)] uppercase tracking-wider">
                        Fluido
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
                          <CategoryBadge category={equipment.categoria} />
                        </td>
                        <td className="px-4 py-3 text-[var(--font-size-base)] font-[var(--font-weight-medium)] text-[var(--color-text)]">
                          {equipment.marca}
                        </td>
                        <td className="px-4 py-3 text-[var(--font-size-base)] text-[var(--color-text)]">
                          {equipment.modelo}
                        </td>
                        <td className="px-4 py-3 text-[var(--font-size-base)] text-[var(--color-text-muted)]">
                          {equipment.capacidade}
                        </td>
                        <td className="px-4 py-3 text-[var(--font-size-base)] text-[var(--color-text-muted)]">
                          {equipment.tipoFluido || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <ManualBadge url={equipment.manualUrl} />
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
                              <IconEdit className="w-4 h-4" />
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
                              <IconTrash className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden divide-y divide-[var(--color-border)]">
                {paginatedEquipments.map((equipment) => (
                  <div key={equipment.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CategoryBadge category={equipment.categoria} />
                        <p className="mt-2 text-[var(--font-size-base)] font-[var(--font-weight-semibold)] text-[var(--color-text)]">
                          {equipment.marca} {equipment.modelo}
                        </p>
                      </div>
                      <ManualBadge url={equipment.manualUrl} />
                    </div>
                    <div className="flex items-center gap-4 text-[var(--font-size-sm)] text-[var(--color-text-muted)]">
                      <span>{equipment.capacidade}</span>
                      {equipment.tipoFluido && (
                        <>
                          <span className="text-[var(--color-border)]">|</span>
                          <span>{equipment.tipoFluido}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<IconEdit className="w-4 h-4" />}
                        onClick={() => handleOpenModal(equipment)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<IconTrash className="w-4 h-4" />}
                        onClick={() => handleDeleteClick(equipment.id)}
                        className="text-[var(--color-error)] hover:bg-red-50"
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                ))}
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
    categoria: 'ar_condicionado',
    marca: 'LG',
    modelo: 'S4-Q12WA51A',
    capacidade: '12000 BTUs',
    tipoFluido: 'R-410A',
    manualUrl: 'https://example.com/manuals/lg-s4-q12wa51a.pdf',
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  {
    id: '2',
    categoria: 'ar_condicionado',
    marca: 'Samsung',
    modelo: 'AR12MVFXAWK',
    capacidade: '12000 BTUs',
    tipoFluido: 'R-32',
    manualUrl: 'https://example.com/manuals/samsung-ar12.pdf',
    createdAt: '2024-01-16',
    updatedAt: '2024-01-16',
  },
  {
    id: '3',
    categoria: 'ar_condicionado',
    marca: 'Carrier',
    modelo: 'X-Power 18K',
    capacidade: '18000 BTUs',
    tipoFluido: 'R-410A',
    manualUrl: null,
    createdAt: '2024-01-17',
    updatedAt: '2024-01-17',
  },
  {
    id: '4',
    categoria: 'ar_condicionado',
    marca: 'Midea',
    modelo: 'Springer Inverter 9K',
    capacidade: '9000 BTUs',
    tipoFluido: 'R-32',
    manualUrl: 'https://example.com/manuals/midea-springer-9k.pdf',
    createdAt: '2024-01-18',
    updatedAt: '2024-01-18',
  },
  {
    id: '5',
    categoria: 'geladeira',
    marca: 'Brastemp',
    modelo: 'BRM56AK',
    capacidade: '462 Litros',
    tipoFluido: 'R-600a',
    manualUrl: 'https://example.com/manuals/brastemp-brm56ak.pdf',
    createdAt: '2024-01-19',
    updatedAt: '2024-01-19',
  },
  {
    id: '6',
    categoria: 'geladeira',
    marca: 'Electrolux',
    modelo: 'IF55B',
    capacidade: '431 Litros',
    tipoFluido: 'R-600a',
    manualUrl: null,
    createdAt: '2024-01-20',
    updatedAt: '2024-01-20',
  },
  {
    id: '7',
    categoria: 'bebedouro',
    marca: 'IBBL',
    modelo: 'PDF300',
    capacidade: '2.8 Litros/hora',
    tipoFluido: 'R-134a',
    manualUrl: 'https://example.com/manuals/ibbl-pdf300.pdf',
    createdAt: '2024-01-21',
    updatedAt: '2024-01-21',
  },
  {
    id: '8',
    categoria: 'bebedouro',
    marca: 'Libell',
    modelo: 'Acquaflex Press',
    capacidade: '2.2 Litros/hora',
    tipoFluido: 'R-134a',
    manualUrl: null,
    createdAt: '2024-01-22',
    updatedAt: '2024-01-22',
  },
  {
    id: '9',
    categoria: 'ar_condicionado',
    marca: 'Daikin',
    modelo: 'FTX35J3',
    capacidade: '12000 BTUs',
    tipoFluido: 'R-32',
    manualUrl: 'https://example.com/manuals/daikin-ftx35.pdf',
    createdAt: '2024-01-23',
    updatedAt: '2024-01-23',
  },
  {
    id: '10',
    categoria: 'outros',
    marca: 'Consul',
    modelo: 'Freezer CVU20GB',
    capacidade: '200 Litros',
    tipoFluido: 'R-600a',
    manualUrl: null,
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
