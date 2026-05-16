/**
 * Recent Orders Table Component
 * 
 * Tabela elegante para exibir as últimas Ordens de Serviço.
 * Suporta ordenação, seleção e estados de loading.
 * 
 * @example
 * ```tsx
 * import { RecentOrdersTable, RecentOrdersCard } from './recent-orders';
 * 
 * const orders = [
 *   {
 *     id: 'OS-001',
 *     client: { name: 'João Silva', avatar: '/avatars/joao.jpg' },
 *     technician: { name: 'Carlos Santos' },
 *     status: 'in_progress',
 *     value: 1500,
 *     createdAt: new Date(),
 *   },
 * ];
 * 
 * // Uso simples
 * <RecentOrdersTable orders={orders} />
 * 
 * // Com card wrapper
 * <RecentOrdersCard 
 *   title="Ordens Recentes" 
 *   orders={orders}
 *   onViewAll={() => navigate('/ordens')}
 * />
 * ```
 */

import React, { useState, useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type OrderStatus = 
  | 'pending' 
  | 'scheduled' 
  | 'in_progress' 
  | 'completed' 
  | 'cancelled' 
  | 'on_hold';

export interface OrderClient {
  name: string;
  avatar?: string;
  email?: string;
}

export interface OrderTechnician {
  name: string;
  avatar?: string;
}

export interface ServiceOrder {
  /** ID único da ordem */
  id: string;
  /** Dados do cliente */
  client: OrderClient;
  /** Técnico responsável */
  technician?: OrderTechnician;
  /** Status atual */
  status: OrderStatus;
  /** Valor do serviço */
  value: number;
  /** Data de criação */
  createdAt: Date | string;
  /** Descrição breve do serviço */
  description?: string;
  /** Prioridade */
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface RecentOrdersTableProps {
  /** Lista de ordens de serviço */
  orders: ServiceOrder[];
  /** Número máximo de itens a exibir */
  maxItems?: number;
  /** Mostrar coluna de seleção */
  selectable?: boolean;
  /** IDs selecionados */
  selectedIds?: string[];
  /** Callback de seleção */
  onSelectionChange?: (ids: string[]) => void;
  /** Callback ao clicar em uma ordem */
  onOrderClick?: (order: ServiceOrder) => void;
  /** Estado de loading */
  loading?: boolean;
  /** Formato de moeda */
  currency?: string;
  /** Locale para formatação */
  locale?: string;
  /** Colunas visíveis */
  visibleColumns?: ('id' | 'client' | 'technician' | 'status' | 'value' | 'date')[];
  /** Ordenação */
  sortBy?: 'date' | 'value' | 'status';
  sortDirection?: 'asc' | 'desc';
  onSortChange?: (column: string, direction: 'asc' | 'desc') => void;
}

export interface RecentOrdersCardProps extends RecentOrdersTableProps {
  /** Título do card */
  title?: string;
  /** Subtítulo */
  subtitle?: string;
  /** Callback para ver todas */
  onViewAll?: () => void;
  /** Texto do botão ver todas */
  viewAllText?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(value: number, currency = 'BRL', locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: Date | string, locale = 'pt-BR'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatRelativeDate(date: Date | string, locale = 'pt-BR'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;
  
  return formatDate(d, locale);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ============================================================================
// STATUS CONFIG
// ============================================================================

const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending: {
    label: 'Pendente',
    color: 'var(--color-warning)',
    bg: 'rgba(217, 119, 6, 0.1)',
  },
  scheduled: {
    label: 'Agendada',
    color: 'var(--color-primary)',
    bg: 'rgba(2, 132, 199, 0.1)',
  },
  in_progress: {
    label: 'Em Andamento',
    color: 'var(--color-primary-light)',
    bg: 'rgba(14, 165, 233, 0.1)',
  },
  completed: {
    label: 'Concluída',
    color: 'var(--color-success)',
    bg: 'rgba(21, 128, 61, 0.1)',
  },
  cancelled: {
    label: 'Cancelada',
    color: 'var(--color-error)',
    bg: 'rgba(185, 28, 28, 0.1)',
  },
  on_hold: {
    label: 'Em Espera',
    color: 'var(--color-text-muted)',
    bg: 'rgba(100, 116, 139, 0.1)',
  },
};

const priorityConfig: Record<string, { color: string }> = {
  low: { color: 'var(--color-text-subtle)' },
  medium: { color: 'var(--color-warning)' },
  high: { color: 'var(--color-error-light)' },
  urgent: { color: 'var(--color-error)' },
};

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  card: {
    background: 'var(--color-surface-elevated)',
    borderRadius: 'var(--card-radius)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--card-shadow)',
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--card-padding-lg)',
    borderBottom: '1px solid var(--color-border)',
    gap: 'var(--space-4)',
    flexWrap: 'wrap' as const,
  },
  cardTitleGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-1)',
  },
  cardTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-semibold)' as unknown as number,
    color: 'var(--color-text)',
    margin: 0,
    lineHeight: 'var(--line-height-tight)',
  },
  cardSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
  viewAllButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '0.5rem 0.875rem',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-primary)',
    background: 'transparent',
    border: '1px solid var(--color-primary)',
    borderRadius: 'var(--btn-radius)',
    cursor: 'pointer',
    transition: 'all var(--motion-duration) var(--motion-easing)',
  },
  tableContainer: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 'var(--font-size-base)',
  },
  thead: {
    background: 'var(--table-header-bg)',
  },
  th: {
    padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)',
    textAlign: 'left' as const,
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)',
    whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
  },
  thSortable: {
    cursor: 'pointer',
    transition: 'color var(--motion-duration) var(--motion-easing)',
  },
  tr: {
    transition: 'background var(--motion-duration) var(--motion-easing)',
  },
  trClickable: {
    cursor: 'pointer',
  },
  td: {
    padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)',
    borderBottom: '1px solid var(--color-border)',
    verticalAlign: 'middle' as const,
  },
  orderId: {
    fontFamily: 'monospace',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-primary)',
  },
  clientCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  avatar: {
    width: 'var(--avatar-size-sm)',
    height: 'var(--avatar-size-sm)',
    borderRadius: '50%',
    objectFit: 'cover' as const,
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: 'var(--avatar-size-sm)',
    height: 'var(--avatar-size-sm)',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)' as unknown as number,
    flexShrink: 0,
  },
  clientInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    minWidth: 0,
  },
  clientName: {
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  clientEmail: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  technicianCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  technicianName: {
    color: 'var(--color-text)',
    whiteSpace: 'nowrap' as const,
  },
  unassigned: {
    color: 'var(--color-text-subtle)',
    fontStyle: 'italic' as const,
    fontSize: 'var(--font-size-sm)',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: '0.25rem 0.625rem',
    borderRadius: 'var(--badge-radius)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    whiteSpace: 'nowrap' as const,
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  value: {
    fontWeight: 'var(--font-weight-semibold)' as unknown as number,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap' as const,
  },
  date: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap' as const,
  },
  priorityDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  checkbox: {
    width: '1rem',
    height: '1rem',
    accentColor: 'var(--color-primary)',
    cursor: 'pointer',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-12) var(--space-6)',
    gap: 'var(--space-3)',
    color: 'var(--color-text-muted)',
  },
  emptyIcon: {
    width: '3rem',
    height: '3rem',
    color: 'var(--color-border)',
  },
  emptyText: {
    fontSize: 'var(--font-size-base)',
    textAlign: 'center' as const,
  },
  skeleton: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  skeletonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)',
    borderBottom: '1px solid var(--color-border)',
  },
  skeletonCell: {
    height: '1rem',
    background: 'var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonAvatar: {
    width: 'var(--avatar-size-sm)',
    height: 'var(--avatar-size-sm)',
    borderRadius: '50%',
    background: 'var(--color-border)',
    flexShrink: 0,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
};

// ============================================================================
// ICONS
// ============================================================================

function ChevronIcon({ direction = 'down', size = 14 }: { direction?: 'up' | 'down'; size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      style={{ transform: direction === 'up' ? 'rotate(180deg)' : undefined }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ArrowRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function ClipboardIcon({ size = 48 }: { size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

// ============================================================================
// TABLE SKELETON
// ============================================================================

export function RecentOrdersTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={styles.skeleton}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ ...styles.skeletonRow, animationDelay: `${i * 0.1}s` }}>
          <div style={{ ...styles.skeletonCell, width: '60px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1 }}>
            <div style={styles.skeletonAvatar} />
            <div style={{ ...styles.skeletonCell, width: '120px' }} />
          </div>
          <div style={{ ...styles.skeletonCell, width: '100px' }} />
          <div style={{ ...styles.skeletonCell, width: '80px' }} />
          <div style={{ ...styles.skeletonCell, width: '70px' }} />
          <div style={{ ...styles.skeletonCell, width: '80px' }} />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState() {
  return (
    <div style={styles.emptyState}>
      <ClipboardIcon />
      <p style={styles.emptyText}>
        Nenhuma ordem de serviço encontrada
      </p>
    </div>
  );
}

// ============================================================================
// AVATAR COMPONENT
// ============================================================================

function Avatar({ src, name, size = 'sm' }: { src?: string; name: string; size?: 'sm' | 'base' | 'lg' }) {
  const sizeVar = size === 'sm' ? 'var(--avatar-size-sm)' : size === 'lg' ? 'var(--avatar-size-lg)' : 'var(--avatar-size-base)';
  
  if (src) {
    return (
      <img 
        src={src} 
        alt={name} 
        style={{ ...styles.avatar, width: sizeVar, height: sizeVar }} 
      />
    );
  }

  return (
    <div style={{ ...styles.avatarPlaceholder, width: sizeVar, height: sizeVar }}>
      {getInitials(name)}
    </div>
  );
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ status }: { status: OrderStatus }) {
  const config = statusConfig[status];
  
  return (
    <span style={{ ...styles.statusBadge, background: config.bg, color: config.color }}>
      <span style={{ ...styles.statusDot, background: config.color }} />
      {config.label}
    </span>
  );
}

// ============================================================================
// MAIN TABLE COMPONENT
// ============================================================================

export function RecentOrdersTable({
  orders,
  maxItems = 10,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  onOrderClick,
  loading = false,
  currency = 'BRL',
  locale = 'pt-BR',
  visibleColumns = ['id', 'client', 'technician', 'status', 'value', 'date'],
  sortBy,
  sortDirection = 'desc',
  onSortChange,
}: RecentOrdersTableProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const displayedOrders = useMemo(() => {
    let result = [...orders];
    
    if (sortBy) {
      result.sort((a, b) => {
        let comparison = 0;
        
        if (sortBy === 'date') {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          comparison = dateA - dateB;
        } else if (sortBy === 'value') {
          comparison = a.value - b.value;
        } else if (sortBy === 'status') {
          comparison = a.status.localeCompare(b.status);
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }
    
    return result.slice(0, maxItems);
  }, [orders, maxItems, sortBy, sortDirection]);

  const allSelected = displayedOrders.length > 0 && displayedOrders.every(o => selectedIds.includes(o.id));
  const someSelected = displayedOrders.some(o => selectedIds.includes(o.id));

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange?.([]);
    } else {
      onSelectionChange?.(displayedOrders.map(o => o.id));
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange?.(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange?.([...selectedIds, id]);
    }
  };

  const handleSort = (column: 'date' | 'value' | 'status') => {
    if (!onSortChange) return;
    
    if (sortBy === column) {
      onSortChange(column, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(column, 'desc');
    }
  };

  if (loading) {
    return <RecentOrdersTableSkeleton rows={maxItems} />;
  }

  if (!orders.length) {
    return <EmptyState />;
  }

  const showColumn = (col: string) => visibleColumns.includes(col as typeof visibleColumns[number]);

  return (
    <div style={styles.tableContainer}>
      <table style={styles.table}>
        <thead style={styles.thead}>
          <tr>
            {selectable && (
              <th style={{ ...styles.th, width: '40px' }}>
                <input
                  type="checkbox"
                  style={styles.checkbox}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={handleSelectAll}
                  aria-label="Selecionar todas"
                />
              </th>
            )}
            {showColumn('id') && <th style={styles.th}>ID</th>}
            {showColumn('client') && <th style={styles.th}>Cliente</th>}
            {showColumn('technician') && <th style={styles.th}>Técnico</th>}
            {showColumn('status') && (
              <th 
                style={{ 
                  ...styles.th, 
                  ...(onSortChange ? styles.thSortable : {}),
                  color: sortBy === 'status' ? 'var(--color-primary)' : undefined,
                }}
                onClick={() => handleSort('status')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Status
                  {sortBy === 'status' && <ChevronIcon direction={sortDirection === 'asc' ? 'up' : 'down'} />}
                </span>
              </th>
            )}
            {showColumn('value') && (
              <th 
                style={{ 
                  ...styles.th, 
                  ...(onSortChange ? styles.thSortable : {}),
                  color: sortBy === 'value' ? 'var(--color-primary)' : undefined,
                  textAlign: 'right',
                }}
                onClick={() => handleSort('value')}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                  Valor
                  {sortBy === 'value' && <ChevronIcon direction={sortDirection === 'asc' ? 'up' : 'down'} />}
                </span>
              </th>
            )}
            {showColumn('date') && (
              <th 
                style={{ 
                  ...styles.th, 
                  ...(onSortChange ? styles.thSortable : {}),
                  color: sortBy === 'date' ? 'var(--color-primary)' : undefined,
                }}
                onClick={() => handleSort('date')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Data
                  {sortBy === 'date' && <ChevronIcon direction={sortDirection === 'asc' ? 'up' : 'down'} />}
                </span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {displayedOrders.map((order) => (
            <tr
              key={order.id}
              style={{
                ...styles.tr,
                ...(onOrderClick ? styles.trClickable : {}),
                background: hoveredRow === order.id ? 'var(--color-surface)' : undefined,
              }}
              onMouseEnter={() => setHoveredRow(order.id)}
              onMouseLeave={() => setHoveredRow(null)}
              onClick={() => onOrderClick?.(order)}
            >
              {selectable && (
                <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    style={styles.checkbox}
                    checked={selectedIds.includes(order.id)}
                    onChange={() => handleSelectOne(order.id)}
                    aria-label={`Selecionar ordem ${order.id}`}
                  />
                </td>
              )}
              {showColumn('id') && (
                <td style={styles.td}>
                  <span style={styles.orderId}>
                    {order.priority && (
                      <span 
                        style={{ 
                          ...styles.priorityDot, 
                          background: priorityConfig[order.priority]?.color,
                          display: 'inline-block',
                          marginRight: '6px',
                          verticalAlign: 'middle',
                        }} 
                        title={`Prioridade: ${order.priority}`}
                      />
                    )}
                    {order.id}
                  </span>
                </td>
              )}
              {showColumn('client') && (
                <td style={styles.td}>
                  <div style={styles.clientCell}>
                    <Avatar src={order.client.avatar} name={order.client.name} />
                    <div style={styles.clientInfo}>
                      <span style={styles.clientName}>{order.client.name}</span>
                      {order.client.email && (
                        <span style={styles.clientEmail}>{order.client.email}</span>
                      )}
                    </div>
                  </div>
                </td>
              )}
              {showColumn('technician') && (
                <td style={styles.td}>
                  {order.technician ? (
                    <div style={styles.technicianCell}>
                      <Avatar src={order.technician.avatar} name={order.technician.name} size="sm" />
                      <span style={styles.technicianName}>{order.technician.name}</span>
                    </div>
                  ) : (
                    <span style={styles.unassigned}>Não atribuído</span>
                  )}
                </td>
              )}
              {showColumn('status') && (
                <td style={styles.td}>
                  <StatusBadge status={order.status} />
                </td>
              )}
              {showColumn('value') && (
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <span style={styles.value}>{formatCurrency(order.value, currency, locale)}</span>
                </td>
              )}
              {showColumn('date') && (
                <td style={styles.td}>
                  <span style={styles.date} title={formatDate(order.createdAt, locale)}>
                    {formatRelativeDate(order.createdAt, locale)}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// CARD WRAPPER
// ============================================================================

export function RecentOrdersCard({
  title = 'Ordens Recentes',
  subtitle,
  onViewAll,
  viewAllText = 'Ver todas',
  ...tableProps
}: RecentOrdersCardProps) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitleGroup}>
          <h3 style={styles.cardTitle}>{title}</h3>
          {subtitle && <p style={styles.cardSubtitle}>{subtitle}</p>}
        </div>
        
        {onViewAll && (
          <button 
            style={styles.viewAllButton}
            onClick={onViewAll}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-primary)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
          >
            {viewAllText}
            <ArrowRightIcon />
          </button>
        )}
      </div>

      <RecentOrdersTable {...tableProps} />
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default RecentOrdersTable;
