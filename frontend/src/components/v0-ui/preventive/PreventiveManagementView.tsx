/**
 * PreventiveManagementView.tsx
 * Tela de Gestão Preventiva - Layout SaaS Corporativo Premium
 * 
 * Componente de listagem e gerenciamento de manutenções preventivas
 * com cards de métricas, filtros avançados e tabela premium.
 */

import { useState, useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type PreventiveStatus = 'em_dia' | 'vence_este_mes' | 'atrasada';

export interface PreventiveContract {
  id: string;
  clientName: string;
  clientId: string;
  equipmentName: string;
  sector: string;
  lastMaintenanceDate: string | null;
  nextMaintenanceDate: string;
  status: PreventiveStatus;
  contractId: string;
}

export interface PreventiveMetrics {
  activeContracts: number;
  onTime: number;
  overdue: number;
}

export interface PreventiveManagementViewProps {
  /** Lista de contratos preventivos */
  contracts: PreventiveContract[];
  /** Métricas do dashboard */
  metrics: PreventiveMetrics;
  /** Estado de carregamento */
  isLoading?: boolean;
  /** Callback ao clicar em Nova Preventiva */
  onNewPreventive?: () => void;
  /** Callback ao gerar OS */
  onGenerateOS?: (contract: PreventiveContract) => void;
  /** Callback ao ver histórico */
  onViewHistory?: (contract: PreventiveContract) => void;
  /** Callback ao clicar em um contrato */
  onContractClick?: (contract: PreventiveContract) => void;
}

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const FileTextIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </svg>
);

const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);

const AlertTriangleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

const MoreHorizontalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const ClipboardListIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4" />
    <path d="M12 16h4" />
    <path d="M8 11h.01" />
    <path d="M8 16h.01" />
  </svg>
);

const HistoryIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M3 10h18" />
  </svg>
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const getStatusConfig = (status: PreventiveStatus) => {
  const configs = {
    em_dia: {
      label: 'Em Dia',
      bgClass: 'bg-[var(--color-success)]/10',
      textClass: 'text-[var(--color-success)]',
      borderClass: 'border-[var(--color-success)]/20',
    },
    vence_este_mes: {
      label: 'Vence este Mês',
      bgClass: 'bg-[var(--color-warning)]/10',
      textClass: 'text-[var(--color-warning)]',
      borderClass: 'border-[var(--color-warning)]/20',
    },
    atrasada: {
      label: 'Atrasada',
      bgClass: 'bg-[var(--color-error)]/10',
      textClass: 'text-[var(--color-error)]',
      borderClass: 'border-[var(--color-error)]/20',
    },
  };
  return configs[status];
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface MetricCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'error';
}

const MetricCard = ({ title, value, icon, variant = 'default' }: MetricCardProps) => {
  const variantStyles = {
    default: {
      valueClass: 'text-[var(--color-text)]',
      iconBgClass: 'bg-[var(--color-primary)]/10',
      iconClass: 'text-[var(--color-primary)]',
    },
    success: {
      valueClass: 'text-[var(--color-success)]',
      iconBgClass: 'bg-[var(--color-success)]/10',
      iconClass: 'text-[var(--color-success)]',
    },
    error: {
      valueClass: 'text-[var(--color-error)]',
      iconBgClass: 'bg-[var(--color-error)]/10',
      iconClass: 'text-[var(--color-error)]',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-lg ${styles.iconBgClass} flex items-center justify-center flex-shrink-0`}>
        <span className={styles.iconClass}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)] font-medium truncate">
          {title}
        </p>
        <p className={`text-[var(--font-size-3xl)] font-bold ${styles.valueClass} leading-tight`}>
          {value}
        </p>
      </div>
    </div>
  );
};

interface StatusBadgeProps {
  status: PreventiveStatus;
}

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const config = getStatusConfig(status);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[var(--font-size-xs)] font-medium border ${config.bgClass} ${config.textClass} ${config.borderClass}`}
    >
      {config.label}
    </span>
  );
};

interface DropdownMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateOS: () => void;
  onViewHistory: () => void;
}

const DropdownMenu = ({ isOpen, onClose, onGenerateOS, onViewHistory }: DropdownMenuProps) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      
      {/* Menu */}
      <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)] shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
        <button
          onClick={() => {
            onGenerateOS();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-[var(--font-size-sm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
        >
          <ClipboardListIcon className="w-4 h-4" />
          Gerar OS
        </button>
        <button
          onClick={() => {
            onViewHistory();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-[var(--font-size-sm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
        >
          <HistoryIcon className="w-4 h-4" />
          Ver Histórico
        </button>
      </div>
    </>
  );
};

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

const Select = ({ value, onChange, options, placeholder }: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 h-[var(--btn-height-base)] px-3 min-w-[180px] bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--font-size-base)] text-[var(--color-text)] hover:border-[var(--color-primary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] transition-colors"
      >
        <span className={selectedOption ? '' : 'text-[var(--color-text-muted)]'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 w-full bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)] shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-[var(--font-size-sm)] hover:bg-[var(--color-surface)] transition-colors ${
                  option.value === value ? 'bg-[var(--color-primary)]/5 text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Skeleton Components
const MetricCardSkeleton = () => (
  <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-5 flex items-center gap-4">
    <div className="w-12 h-12 rounded-lg bg-[var(--color-border)] animate-pulse" />
    <div className="space-y-2">
      <div className="h-3 w-24 bg-[var(--color-border)] rounded animate-pulse" />
      <div className="h-8 w-12 bg-[var(--color-border)] rounded animate-pulse" />
    </div>
  </div>
);

const TableRowSkeleton = () => (
  <tr className="border-b border-[var(--color-border)]">
    {[...Array(6)].map((_, i) => (
      <td key={i} className="px-4 py-4">
        <div className="h-4 bg-[var(--color-border)] rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
      </td>
    ))}
  </tr>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PreventiveManagementView({
  contracts,
  metrics,
  isLoading = false,
  onNewPreventive,
  onGenerateOS,
  onViewHistory,
  onContractClick,
}: PreventiveManagementViewProps) {
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Filter options
  const statusOptions = [
    { value: 'all', label: 'Todos os Status' },
    { value: 'em_dia', label: 'Em Dia' },
    { value: 'vence_este_mes', label: 'Vence este Mês' },
    { value: 'atrasada', label: 'Atrasada' },
  ];

  // Filtered contracts
  const filteredContracts = useMemo(() => {
    return contracts.filter((contract) => {
      const matchesSearch =
        contract.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contract.equipmentName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || contract.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contracts, searchQuery, statusFilter]);

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface)] p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[var(--font-size-2xl)] font-semibold text-[var(--color-text)]">
              Gestão Preventiva
            </h1>
            <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)] mt-1">
              Gerencie os contratos e cronogramas de manutenção preventiva
            </p>
          </div>
          <button
            onClick={onNewPreventive}
            className="inline-flex items-center justify-center gap-2 h-[var(--btn-height-base)] px-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium text-[var(--font-size-base)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-2"
          >
            <PlusIcon className="w-5 h-5" />
            Nova Preventiva
          </button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isLoading ? (
            <>
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
            </>
          ) : (
            <>
              <MetricCard
                title="Contratos Ativos"
                value={metrics.activeContracts}
                icon={<FileTextIcon className="w-6 h-6" />}
                variant="default"
              />
              <MetricCard
                title="Preventivas no Prazo"
                value={metrics.onTime}
                icon={<CheckCircleIcon className="w-6 h-6" />}
                variant="success"
              />
              <MetricCard
                title="Atrasadas"
                value={metrics.overdue}
                icon={<AlertTriangleIcon className="w-6 h-6" />}
                variant="error"
              />
            </>
          )}
        </div>

        {/* Filters Card */}
        <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar cliente ou equipamento..."
                className="w-full h-[var(--btn-height-base)] pl-10 pr-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--font-size-base)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:border-[var(--color-primary)] transition-colors"
              />
            </div>

            {/* Status Filter */}
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              placeholder="Filtrar por status"
            />

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center justify-center gap-2 h-[var(--btn-height-base)] px-4 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--font-size-base)] transition-colors"
              >
                <XIcon className="w-4 h-4" />
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-[var(--color-surface-elevated)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Equipamento / Setor
                  </th>
                  <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Última Manutenção
                  </th>
                  <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Próxima Manutenção
                  </th>
                  <th className="px-4 py-3 text-left text-[var(--font-size-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-[var(--font-size-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <>
                    <TableRowSkeleton />
                    <TableRowSkeleton />
                    <TableRowSkeleton />
                    <TableRowSkeleton />
                    <TableRowSkeleton />
                  </>
                ) : filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--color-surface)] flex items-center justify-center">
                          <CalendarIcon className="w-6 h-6 text-[var(--color-text-muted)]" />
                        </div>
                        <div>
                          <p className="text-[var(--font-size-base)] font-medium text-[var(--color-text)]">
                            Nenhuma preventiva encontrada
                          </p>
                          <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)] mt-1">
                            {hasActiveFilters
                              ? 'Tente ajustar os filtros de busca'
                              : 'Cadastre uma nova preventiva para começar'}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((contract) => (
                    <tr
                      key={contract.id}
                      className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]/50 transition-colors cursor-pointer"
                      onClick={() => onContractClick?.(contract)}
                    >
                      <td className="px-4 py-4">
                        <span className="text-[var(--font-size-base)] font-medium text-[var(--color-text)]">
                          {contract.clientName}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <span className="text-[var(--font-size-base)] text-[var(--color-text)]">
                            {contract.equipmentName}
                          </span>
                          {contract.sector && (
                            <span className="block text-[var(--font-size-sm)] text-[var(--color-text-muted)]">
                              {contract.sector}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[var(--font-size-base)] text-[var(--color-text-muted)]">
                          {formatDate(contract.lastMaintenanceDate)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[var(--font-size-base)] text-[var(--color-text)]">
                          {formatDate(contract.nextMaintenanceDate)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={contract.status} />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdownId(openDropdownId === contract.id ? null : contract.id);
                            }}
                            className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
                          >
                            <MoreHorizontalIcon className="w-5 h-5" />
                          </button>
                          <DropdownMenu
                            isOpen={openDropdownId === contract.id}
                            onClose={() => setOpenDropdownId(null)}
                            onGenerateOS={() => onGenerateOS?.(contract)}
                            onViewHistory={() => onViewHistory?.(contract)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Results count */}
        {!isLoading && filteredContracts.length > 0 && (
          <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)] text-center">
            Exibindo {filteredContracts.length} de {contracts.length} preventivas
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MOCK DATA
// ============================================================================

export const mockPreventiveContracts: PreventiveContract[] = [
  {
    id: '1',
    clientName: 'Ar Ideal Climatizadora',
    clientId: 'c1',
    equipmentName: 'Split Inverter 24000 BTUs',
    sector: 'Sala de Reuniões',
    lastMaintenanceDate: '2026-04-15',
    nextMaintenanceDate: '2026-07-15',
    status: 'em_dia',
    contractId: 'ct1',
  },
  {
    id: '2',
    clientName: 'Supermercado Bom Preço',
    clientId: 'c2',
    equipmentName: 'Câmara Fria 50m³',
    sector: 'Depósito',
    lastMaintenanceDate: '2026-03-20',
    nextMaintenanceDate: '2026-05-20',
    status: 'vence_este_mes',
    contractId: 'ct2',
  },
  {
    id: '3',
    clientName: 'Clínica Saúde Total',
    clientId: 'c3',
    equipmentName: 'VRF Multi Split',
    sector: 'Recepção',
    lastMaintenanceDate: '2026-01-10',
    nextMaintenanceDate: '2026-04-10',
    status: 'atrasada',
    contractId: 'ct3',
  },
  {
    id: '4',
    clientName: 'Escritório Contábil Silva',
    clientId: 'c4',
    equipmentName: 'Split Hi-Wall 12000 BTUs',
    sector: 'Escritório Principal',
    lastMaintenanceDate: '2026-05-01',
    nextMaintenanceDate: '2026-08-01',
    status: 'em_dia',
    contractId: 'ct4',
  },
  {
    id: '5',
    clientName: 'Restaurante Sabor & Arte',
    clientId: 'c5',
    equipmentName: 'Coifa Industrial',
    sector: 'Cozinha',
    lastMaintenanceDate: '2026-02-28',
    nextMaintenanceDate: '2026-05-28',
    status: 'vence_este_mes',
    contractId: 'ct5',
  },
];

export const mockPreventiveMetrics: PreventiveMetrics = {
  activeContracts: 47,
  onTime: 38,
  overdue: 9,
};

export default PreventiveManagementView;
