/**
 * ClientFormView - Componente de Formulário e Gerenciamento de Cliente
 * 
 * Sistema completo de abas para gerenciar clientes do SaaS Climaris.
 * 
 * @example
 * ```tsx
 * import { ClientFormView } from './ClientFormView';
 * 
 * const client = {
 *   id: '1',
 *   type: 'pj',
 *   razaoSocial: 'Empresa XYZ Ltda',
 *   nomeFantasia: 'XYZ Climatização',
 *   documento: '12.345.678/0001-90',
 *   regime: 'regular',
 *   whatsapp: '(11) 99999-9999',
 *   telefone: '(11) 3333-3333',
 *   email: 'contato@xyz.com',
 * };
 * 
 * <ClientFormView 
 *   client={client}
 *   equipments={equipmentsList}
 *   orders={ordersList}
 *   budgets={budgetsList}
 *   history={historyList}
 *   pmocData={pmocInfo}
 *   activeTab="cadastro"
 *   onTabChange={(tab) => setActiveTab(tab)}
 *   onClientChange={(data) => handleClientUpdate(data)}
 *   onConsultCNPJ={(cnpj) => fetchReceita(cnpj)}
 * />
 * ```
 */

import React, { useState, useCallback, useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type ClientType = 'pf' | 'pj';
export type ClientRegime = 'regular' | 'mei' | 'simples' | 'lucro_presumido' | 'lucro_real';
export type TabId = 'cadastro' | 'historico' | 'equipamentos' | 'pmoc' | 'orcamentos';

export interface ClientData {
  id?: string;
  type: ClientType;
  razaoSocial: string;
  nomeFantasia?: string;
  documento: string;
  regime?: ClientRegime;
  whatsapp?: string;
  telefone?: string;
  email?: string;
  endereco?: {
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
  };
}

export interface Equipment {
  id: string;
  marca: string;
  modelo: string;
  capacidadeBtu: number;
  tipo: 'split' | 'janela' | 'cassete' | 'piso_teto' | 'multi_split' | 'vrf';
  local: string;
  ultimaManutencao?: Date | string;
  status: 'ativo' | 'inativo' | 'manutencao';
}

export interface HistoryItem {
  id: string;
  type: 'os' | 'orcamento' | 'contato' | 'pmoc' | 'nota';
  title: string;
  description?: string;
  date: Date | string;
  user?: string;
  metadata?: Record<string, unknown>;
}

export interface ServiceOrder {
  id: string;
  numero: string;
  descricao: string;
  status: 'pendente' | 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
  valor: number;
  data: Date | string;
  tecnico?: string;
}

export interface Budget {
  id: string;
  numero: string;
  descricao: string;
  status: 'rascunho' | 'enviado' | 'aprovado' | 'recusado' | 'expirado';
  valor: number;
  data: Date | string;
  validade?: Date | string;
}

export interface PMOCData {
  id?: string;
  status: 'ativo' | 'pendente' | 'vencido' | 'sem_contrato';
  contrato?: string;
  vigenciaInicio?: Date | string;
  vigenciaFim?: Date | string;
  proximaVisita?: Date | string;
  responsavelTecnico?: string;
  artNumero?: string;
  relatorios?: Array<{
    id: string;
    periodo: string;
    data: Date | string;
    status: 'pendente' | 'concluido';
  }>;
}

export interface ClientFormViewProps {
  /** Dados do cliente */
  client?: ClientData;
  /** Lista de equipamentos */
  equipments?: Equipment[];
  /** Histórico de interações */
  history?: HistoryItem[];
  /** Ordens de serviço */
  orders?: ServiceOrder[];
  /** Orçamentos */
  budgets?: Budget[];
  /** Dados do PMOC */
  pmocData?: PMOCData;
  /** Aba ativa */
  activeTab?: TabId;
  /** Callback de mudança de aba */
  onTabChange?: (tab: TabId) => void;
  /** Callback de atualização dos dados do cliente */
  onClientChange?: (data: Partial<ClientData>) => void;
  /** Callback para consultar CNPJ na Receita */
  onConsultCNPJ?: (cnpj: string) => void;
  /** Estado de loading da consulta CNPJ */
  loadingCNPJ?: boolean;
  /** Modo somente leitura */
  readOnly?: boolean;
  /** Callback para ações em equipamentos */
  onEquipmentAction?: (action: 'view' | 'edit' | 'delete', equipment: Equipment) => void;
  /** Callback para ações em OS */
  onOrderAction?: (action: 'view' | 'edit', order: ServiceOrder) => void;
  /** Callback para ações em orçamentos */
  onBudgetAction?: (action: 'view' | 'edit' | 'send', budget: Budget) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    .slice(0, 14);
}

function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
    .slice(0, 18);
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 14);
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 15);
}

function formatBTU(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}k BTUs`;
  }
  return `${value} BTUs`;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    background: 'var(--color-surface-elevated)',
    borderRadius: 'var(--card-radius)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--card-shadow)',
    overflow: 'hidden',
  },
  tabsContainer: {
    display: 'flex',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    overflowX: 'auto' as const,
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-4) var(--space-5)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-text-muted)',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'all var(--motion-duration) var(--motion-easing)',
    marginBottom: '-1px',
  },
  tabActive: {
    color: 'var(--color-primary)',
    borderBottomColor: 'var(--color-primary)',
    background: 'var(--color-surface-elevated)',
  },
  tabBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '1.25rem',
    height: '1.25rem',
    padding: '0 0.375rem',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)' as unknown as number,
    borderRadius: 'var(--badge-radius)',
    background: 'var(--color-border)',
    color: 'var(--color-text-muted)',
  },
  tabBadgeActive: {
    background: 'var(--color-primary)',
    color: 'white',
  },
  content: {
    padding: 'var(--card-padding-lg)',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 'var(--form-grid-row-gap) var(--form-grid-column-gap)',
  },
  formGridFull: {
    gridColumn: '1 / -1',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--form-label-to-control)',
  },
  label: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-text)',
  },
  input: {
    height: 'var(--input-height)',
    padding: '0 var(--input-padding-x)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-text)',
    background: 'var(--input-bg)',
    border: 'var(--input-border)',
    borderRadius: 'var(--input-radius)',
    outline: 'none',
    transition: 'border-color var(--motion-duration) var(--motion-easing), box-shadow var(--motion-duration) var(--motion-easing)',
  },
  inputFocus: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 3px var(--color-focus-ring)',
  },
  inputWithButton: {
    display: 'flex',
    gap: 'var(--space-2)',
  },
  select: {
    height: 'var(--input-height)',
    padding: '0 var(--input-padding-x)',
    paddingRight: '2.5rem',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-text)',
    background: 'var(--input-bg)',
    border: 'var(--input-border)',
    borderRadius: 'var(--input-radius)',
    outline: 'none',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.75rem center',
    cursor: 'pointer',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    height: 'var(--btn-height-base)',
    padding: '0 var(--btn-padding-base)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'white',
    background: 'var(--color-primary)',
    border: 'none',
    borderRadius: 'var(--btn-radius)',
    cursor: 'pointer',
    transition: 'background var(--motion-duration) var(--motion-easing)',
    whiteSpace: 'nowrap' as const,
  },
  buttonOutline: {
    color: 'var(--color-primary)',
    background: 'transparent',
    border: '1px solid var(--color-primary)',
  },
  buttonSmall: {
    height: 'var(--btn-height-sm)',
    padding: '0 var(--btn-padding-sm)',
    fontSize: 'var(--font-size-sm)',
  },
  buttonIcon: {
    width: 'var(--btn-height-sm)',
    height: 'var(--btn-height-sm)',
    padding: 0,
  },
  sectionTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-semibold)' as unknown as number,
    color: 'var(--color-text)',
    margin: '0 0 var(--space-4) 0',
  },
  sectionDivider: {
    height: '1px',
    background: 'var(--color-border)',
    margin: 'var(--space-6) 0',
  },
  // Timeline styles
  timeline: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
  },
  timelineItem: {
    display: 'flex',
    gap: 'var(--space-4)',
    position: 'relative' as const,
    paddingBottom: 'var(--space-6)',
  },
  timelineItemLast: {
    paddingBottom: 0,
  },
  timelineDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    flexShrink: 0,
    marginTop: '4px',
    zIndex: 1,
  },
  timelineLine: {
    position: 'absolute' as const,
    left: '5px',
    top: '16px',
    bottom: 0,
    width: '2px',
    background: 'var(--color-border)',
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
  },
  timelineHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-1)',
  },
  timelineTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-text)',
    margin: 0,
  },
  timelineDate: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap' as const,
  },
  timelineDescription: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
  timelineTypeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: '0.125rem 0.5rem',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    borderRadius: 'var(--radius-sm)',
    marginBottom: 'var(--space-2)',
  },
  // Table styles
  tableContainer: {
    overflowX: 'auto' as const,
    margin: '0 calc(-1 * var(--card-padding-lg))',
    padding: '0 var(--card-padding-lg)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 'var(--font-size-base)',
  },
  th: {
    padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)',
    textAlign: 'left' as const,
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: 'var(--table-cell-padding-y) var(--table-cell-padding-x)',
    borderBottom: '1px solid var(--color-border)',
    verticalAlign: 'middle' as const,
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
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-12) var(--space-6)',
    gap: 'var(--space-3)',
    color: 'var(--color-text-muted)',
    textAlign: 'center' as const,
  },
  emptyIcon: {
    width: '3rem',
    height: '3rem',
    color: 'var(--color-border)',
  },
  // PMOC styles
  pmocCard: {
    padding: 'var(--space-4)',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-border)',
  },
  pmocHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-4)',
  },
  pmocStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  pmocStatusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  pmocGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 'var(--space-4)',
  },
  pmocItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  pmocLabel: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
  },
  pmocValue: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-text)',
  },
  actionsCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },
};

// ============================================================================
// STATUS CONFIGS
// ============================================================================

const equipmentStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  ativo: { label: 'Ativo', color: 'var(--color-success)', bg: 'rgba(21, 128, 61, 0.1)' },
  inativo: { label: 'Inativo', color: 'var(--color-text-muted)', bg: 'rgba(100, 116, 139, 0.1)' },
  manutencao: { label: 'Manutenção', color: 'var(--color-warning)', bg: 'rgba(217, 119, 6, 0.1)' },
};

const equipmentTypeConfig: Record<string, string> = {
  split: 'Split',
  janela: 'Janela',
  cassete: 'Cassete',
  piso_teto: 'Piso Teto',
  multi_split: 'Multi Split',
  vrf: 'VRF',
};

const orderStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: 'var(--color-warning)', bg: 'rgba(217, 119, 6, 0.1)' },
  agendada: { label: 'Agendada', color: 'var(--color-primary)', bg: 'rgba(2, 132, 199, 0.1)' },
  em_andamento: { label: 'Em Andamento', color: 'var(--color-primary-light)', bg: 'rgba(14, 165, 233, 0.1)' },
  concluida: { label: 'Concluída', color: 'var(--color-success)', bg: 'rgba(21, 128, 61, 0.1)' },
  cancelada: { label: 'Cancelada', color: 'var(--color-error)', bg: 'rgba(185, 28, 28, 0.1)' },
};

const budgetStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  rascunho: { label: 'Rascunho', color: 'var(--color-text-muted)', bg: 'rgba(100, 116, 139, 0.1)' },
  enviado: { label: 'Enviado', color: 'var(--color-primary)', bg: 'rgba(2, 132, 199, 0.1)' },
  aprovado: { label: 'Aprovado', color: 'var(--color-success)', bg: 'rgba(21, 128, 61, 0.1)' },
  recusado: { label: 'Recusado', color: 'var(--color-error)', bg: 'rgba(185, 28, 28, 0.1)' },
  expirado: { label: 'Expirado', color: 'var(--color-warning)', bg: 'rgba(217, 119, 6, 0.1)' },
};

const pmocStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  ativo: { label: 'Contrato Ativo', color: 'var(--color-success)', bg: 'rgba(21, 128, 61, 0.1)' },
  pendente: { label: 'Pendente', color: 'var(--color-warning)', bg: 'rgba(217, 119, 6, 0.1)' },
  vencido: { label: 'Vencido', color: 'var(--color-error)', bg: 'rgba(185, 28, 28, 0.1)' },
  sem_contrato: { label: 'Sem Contrato', color: 'var(--color-text-muted)', bg: 'rgba(100, 116, 139, 0.1)' },
};

const historyTypeConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  os: { label: 'Ordem de Serviço', color: 'var(--color-primary)', bg: 'rgba(2, 132, 199, 0.1)', icon: '🔧' },
  orcamento: { label: 'Orçamento', color: 'var(--color-success)', bg: 'rgba(21, 128, 61, 0.1)', icon: '💰' },
  contato: { label: 'Contato', color: 'var(--color-warning)', bg: 'rgba(217, 119, 6, 0.1)', icon: '📞' },
  pmoc: { label: 'PMOC', color: 'var(--color-primary-light)', bg: 'rgba(14, 165, 233, 0.1)', icon: '📋' },
  nota: { label: 'Nota', color: 'var(--color-text-muted)', bg: 'rgba(100, 116, 139, 0.1)', icon: '📝' },
};

const regimeConfig: Record<ClientRegime, string> = {
  regular: 'Empresa Regular',
  mei: 'MEI',
  simples: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
};

// ============================================================================
// ICONS
// ============================================================================

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EditIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function SendIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function FileIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function LoaderIcon({ size = 18 }: { size?: number }) {
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
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

function StatusBadge({ config }: { config: { label: string; color: string; bg: string } }) {
  return (
    <span style={{ ...styles.statusBadge, background: config.bg, color: config.color }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: config.color }} />
      {config.label}
    </span>
  );
}

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div style={styles.emptyState}>
      <FileIcon />
      <p style={{ margin: 0, fontSize: 'var(--font-size-base)' }}>{message}</p>
    </div>
  );
}

// ============================================================================
// TAB CADASTRO
// ============================================================================

function TabCadastro({
  client,
  onChange,
  onConsultCNPJ,
  loadingCNPJ,
  readOnly,
}: {
  client?: ClientData;
  onChange?: (data: Partial<ClientData>) => void;
  onConsultCNPJ?: (cnpj: string) => void;
  loadingCNPJ?: boolean;
  readOnly?: boolean;
}) {
  const [localClient, setLocalClient] = useState<Partial<ClientData>>(client || { type: 'pj' });

  const handleChange = useCallback((field: keyof ClientData, value: unknown) => {
    const updated = { ...localClient, [field]: value };
    setLocalClient(updated);
    onChange?.(updated);
  }, [localClient, onChange]);

  const handleDocumentoChange = (value: string) => {
    const formatted = localClient.type === 'pf' ? formatCPF(value) : formatCNPJ(value);
    handleChange('documento', formatted);
  };

  const canConsultCNPJ = localClient.type === 'pj' && localClient.documento && localClient.documento.replace(/\D/g, '').length === 14;

  return (
    <div>
      <h3 style={styles.sectionTitle}>Identificacao</h3>
      <div style={styles.formGrid}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Tipo de Pessoa</label>
          <select
            style={styles.select}
            value={localClient.type || 'pj'}
            onChange={(e) => handleChange('type', e.target.value as ClientType)}
            disabled={readOnly}
          >
            <option value="pf">Pessoa Fisica (CPF)</option>
            <option value="pj">Pessoa Juridica (CNPJ)</option>
          </select>
        </div>

        {localClient.type === 'pj' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Regime</label>
            <select
              style={styles.select}
              value={localClient.regime || 'regular'}
              onChange={(e) => handleChange('regime', e.target.value as ClientRegime)}
              disabled={readOnly}
            >
              {Object.entries(regimeConfig).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ ...styles.formGroup, ...(localClient.type === 'pf' ? {} : {}) }}>
          <label style={styles.label}>{localClient.type === 'pf' ? 'CPF' : 'CNPJ'}</label>
          <div style={styles.inputWithButton}>
            <input
              type="text"
              style={{ ...styles.input, flex: 1 }}
              placeholder={localClient.type === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'}
              value={localClient.documento || ''}
              onChange={(e) => handleDocumentoChange(e.target.value)}
              disabled={readOnly}
            />
            {localClient.type === 'pj' && (
              <button
                type="button"
                style={{ 
                  ...styles.button, 
                  ...styles.buttonOutline,
                  opacity: canConsultCNPJ && !loadingCNPJ ? 1 : 0.5,
                  cursor: canConsultCNPJ && !loadingCNPJ ? 'pointer' : 'not-allowed',
                }}
                onClick={() => canConsultCNPJ && !loadingCNPJ && onConsultCNPJ?.(localClient.documento!)}
                disabled={!canConsultCNPJ || loadingCNPJ || readOnly}
              >
                {loadingCNPJ ? <LoaderIcon size={16} /> : <SearchIcon size={16} />}
                Consultar Receita
              </button>
            )}
          </div>
        </div>

        <div style={{ ...styles.formGroup, ...styles.formGridFull }}>
          <label style={styles.label}>{localClient.type === 'pf' ? 'Nome Completo' : 'Razao Social'}</label>
          <input
            type="text"
            style={styles.input}
            placeholder={localClient.type === 'pf' ? 'Nome completo' : 'Razao Social da empresa'}
            value={localClient.razaoSocial || ''}
            onChange={(e) => handleChange('razaoSocial', e.target.value)}
            disabled={readOnly}
          />
        </div>

        {localClient.type === 'pj' && (
          <div style={{ ...styles.formGroup, ...styles.formGridFull }}>
            <label style={styles.label}>Nome Fantasia</label>
            <input
              type="text"
              style={styles.input}
              placeholder="Nome fantasia"
              value={localClient.nomeFantasia || ''}
              onChange={(e) => handleChange('nomeFantasia', e.target.value)}
              disabled={readOnly}
            />
          </div>
        )}
      </div>

      <div style={styles.sectionDivider} />

      <h3 style={styles.sectionTitle}>Contato</h3>
      <div style={styles.formGrid}>
        <div style={styles.formGroup}>
          <label style={styles.label}>WhatsApp</label>
          <input
            type="text"
            style={styles.input}
            placeholder="(00) 00000-0000"
            value={localClient.whatsapp || ''}
            onChange={(e) => handleChange('whatsapp', formatPhone(e.target.value))}
            disabled={readOnly}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Telefone</label>
          <input
            type="text"
            style={styles.input}
            placeholder="(00) 0000-0000"
            value={localClient.telefone || ''}
            onChange={(e) => handleChange('telefone', formatPhone(e.target.value))}
            disabled={readOnly}
          />
        </div>

        <div style={{ ...styles.formGroup, ...styles.formGridFull }}>
          <label style={styles.label}>E-mail</label>
          <input
            type="email"
            style={styles.input}
            placeholder="email@empresa.com.br"
            value={localClient.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TAB HISTORICO
// ============================================================================

function TabHistorico({ history }: { history?: HistoryItem[] }) {
  if (!history || history.length === 0) {
    return <EmptyState message="Nenhum historico de interacoes registrado" />;
  }

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  }, [history]);

  return (
    <div style={styles.timeline}>
      {sortedHistory.map((item, index) => {
        const config = historyTypeConfig[item.type] || historyTypeConfig.nota;
        const isLast = index === sortedHistory.length - 1;

        return (
          <div key={item.id} style={{ ...styles.timelineItem, ...(isLast ? styles.timelineItemLast : {}) }}>
            <div 
              style={{ 
                ...styles.timelineDot, 
                background: config.color,
              }} 
            />
            {!isLast && <div style={styles.timelineLine} />}
            <div style={styles.timelineContent}>
              <span 
                style={{ 
                  ...styles.timelineTypeBadge, 
                  background: config.bg, 
                  color: config.color,
                }}
              >
                {config.label}
              </span>
              <div style={styles.timelineHeader}>
                <h4 style={styles.timelineTitle}>{item.title}</h4>
                <span style={styles.timelineDate}>{formatDateTime(item.date)}</span>
              </div>
              {item.description && (
                <p style={styles.timelineDescription}>{item.description}</p>
              )}
              {item.user && (
                <p style={{ ...styles.timelineDescription, marginTop: 'var(--space-1)' }}>
                  Por: {item.user}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// TAB EQUIPAMENTOS
// ============================================================================

function TabEquipamentos({ 
  equipments, 
  onAction 
}: { 
  equipments?: Equipment[];
  onAction?: (action: 'view' | 'edit' | 'delete', equipment: Equipment) => void;
}) {
  if (!equipments || equipments.length === 0) {
    return <EmptyState message="Nenhum equipamento cadastrado" />;
  }

  return (
    <div style={styles.tableContainer}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Equipamento</th>
            <th style={styles.th}>Tipo</th>
            <th style={styles.th}>Capacidade</th>
            <th style={styles.th}>Local</th>
            <th style={styles.th}>Ultima Manutencao</th>
            <th style={styles.th}>Status</th>
            <th style={{ ...styles.th, width: '100px' }}>Acoes</th>
          </tr>
        </thead>
        <tbody>
          {equipments.map((equipment) => {
            const statusCfg = equipmentStatusConfig[equipment.status];
            return (
              <tr key={equipment.id}>
                <td style={styles.td}>
                  <div>
                    <div style={{ fontWeight: 'var(--font-weight-medium)' as unknown as number, color: 'var(--color-text)' }}>
                      {equipment.marca}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                      {equipment.modelo}
                    </div>
                  </div>
                </td>
                <td style={styles.td}>{equipmentTypeConfig[equipment.tipo] || equipment.tipo}</td>
                <td style={styles.td}>{formatBTU(equipment.capacidadeBtu)}</td>
                <td style={styles.td}>{equipment.local}</td>
                <td style={styles.td}>
                  {equipment.ultimaManutencao 
                    ? formatDate(equipment.ultimaManutencao) 
                    : <span style={{ color: 'var(--color-text-subtle)' }}>-</span>
                  }
                </td>
                <td style={styles.td}>
                  <StatusBadge config={statusCfg} />
                </td>
                <td style={styles.td}>
                  <div style={styles.actionsCell}>
                    <button
                      type="button"
                      style={{ ...styles.button, ...styles.buttonOutline, ...styles.buttonIcon }}
                      onClick={() => onAction?.('view', equipment)}
                      title="Visualizar"
                    >
                      <EyeIcon />
                    </button>
                    <button
                      type="button"
                      style={{ ...styles.button, ...styles.buttonOutline, ...styles.buttonIcon }}
                      onClick={() => onAction?.('edit', equipment)}
                      title="Editar"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      style={{ ...styles.button, ...styles.buttonOutline, ...styles.buttonIcon, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                      onClick={() => onAction?.('delete', equipment)}
                      title="Excluir"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// TAB PMOC
// ============================================================================

function TabPMOC({ pmocData }: { pmocData?: PMOCData }) {
  if (!pmocData || pmocData.status === 'sem_contrato') {
    return (
      <EmptyState message="Nenhum contrato PMOC ativo para este cliente" />
    );
  }

  const statusCfg = pmocStatusConfig[pmocData.status];

  return (
    <div>
      <div style={styles.pmocCard}>
        <div style={styles.pmocHeader}>
          <div style={styles.pmocStatus}>
            <span 
              style={{ 
                ...styles.pmocStatusDot, 
                background: statusCfg.color,
              }} 
            />
            <span style={{ fontWeight: 'var(--font-weight-semibold)' as unknown as number, color: statusCfg.color }}>
              {statusCfg.label}
            </span>
          </div>
          {pmocData.contrato && (
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              Contrato: {pmocData.contrato}
            </span>
          )}
        </div>

        <div style={styles.pmocGrid}>
          {pmocData.vigenciaInicio && (
            <div style={styles.pmocItem}>
              <span style={styles.pmocLabel}>Inicio da Vigencia</span>
              <span style={styles.pmocValue}>{formatDate(pmocData.vigenciaInicio)}</span>
            </div>
          )}
          {pmocData.vigenciaFim && (
            <div style={styles.pmocItem}>
              <span style={styles.pmocLabel}>Fim da Vigencia</span>
              <span style={styles.pmocValue}>{formatDate(pmocData.vigenciaFim)}</span>
            </div>
          )}
          {pmocData.proximaVisita && (
            <div style={styles.pmocItem}>
              <span style={styles.pmocLabel}>Proxima Visita</span>
              <span style={styles.pmocValue}>{formatDate(pmocData.proximaVisita)}</span>
            </div>
          )}
          {pmocData.responsavelTecnico && (
            <div style={styles.pmocItem}>
              <span style={styles.pmocLabel}>Responsavel Tecnico</span>
              <span style={styles.pmocValue}>{pmocData.responsavelTecnico}</span>
            </div>
          )}
          {pmocData.artNumero && (
            <div style={styles.pmocItem}>
              <span style={styles.pmocLabel}>ART</span>
              <span style={styles.pmocValue}>{pmocData.artNumero}</span>
            </div>
          )}
        </div>
      </div>

      {pmocData.relatorios && pmocData.relatorios.length > 0 && (
        <>
          <div style={styles.sectionDivider} />
          <h3 style={styles.sectionTitle}>Relatorios</h3>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Periodo</th>
                  <th style={styles.th}>Data</th>
                  <th style={styles.th}>Status</th>
                  <th style={{ ...styles.th, width: '80px' }}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {pmocData.relatorios.map((relatorio) => (
                  <tr key={relatorio.id}>
                    <td style={styles.td}>{relatorio.periodo}</td>
                    <td style={styles.td}>{formatDate(relatorio.data)}</td>
                    <td style={styles.td}>
                      <StatusBadge 
                        config={
                          relatorio.status === 'concluido' 
                            ? { label: 'Concluido', color: 'var(--color-success)', bg: 'rgba(21, 128, 61, 0.1)' }
                            : { label: 'Pendente', color: 'var(--color-warning)', bg: 'rgba(217, 119, 6, 0.1)' }
                        } 
                      />
                    </td>
                    <td style={styles.td}>
                      <button
                        type="button"
                        style={{ ...styles.button, ...styles.buttonOutline, ...styles.buttonIcon }}
                        title="Visualizar"
                      >
                        <EyeIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// TAB ORCAMENTOS E OS
// ============================================================================

function TabOrcamentosOS({ 
  orders, 
  budgets,
  onOrderAction,
  onBudgetAction,
}: { 
  orders?: ServiceOrder[];
  budgets?: Budget[];
  onOrderAction?: (action: 'view' | 'edit', order: ServiceOrder) => void;
  onBudgetAction?: (action: 'view' | 'edit' | 'send', budget: Budget) => void;
}) {
  const hasOrders = orders && orders.length > 0;
  const hasBudgets = budgets && budgets.length > 0;

  return (
    <div>
      <h3 style={styles.sectionTitle}>Orcamentos</h3>
      {!hasBudgets ? (
        <EmptyState message="Nenhum orcamento registrado" />
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Numero</th>
                <th style={styles.th}>Descricao</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Data</th>
                <th style={styles.th}>Validade</th>
                <th style={styles.th}>Status</th>
                <th style={{ ...styles.th, width: '120px' }}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {budgets!.map((budget) => {
                const statusCfg = budgetStatusConfig[budget.status];
                return (
                  <tr key={budget.id}>
                    <td style={{ ...styles.td, fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                      {budget.numero}
                    </td>
                    <td style={styles.td}>{budget.descricao}</td>
                    <td style={{ ...styles.td, fontWeight: 'var(--font-weight-semibold)' as unknown as number }}>
                      {formatCurrency(budget.valor)}
                    </td>
                    <td style={styles.td}>{formatDate(budget.data)}</td>
                    <td style={styles.td}>
                      {budget.validade ? formatDate(budget.validade) : '-'}
                    </td>
                    <td style={styles.td}>
                      <StatusBadge config={statusCfg} />
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionsCell}>
                        <button
                          type="button"
                          style={{ ...styles.button, ...styles.buttonOutline, ...styles.buttonIcon }}
                          onClick={() => onBudgetAction?.('view', budget)}
                          title="Visualizar"
                        >
                          <EyeIcon />
                        </button>
                        <button
                          type="button"
                          style={{ ...styles.button, ...styles.buttonOutline, ...styles.buttonIcon }}
                          onClick={() => onBudgetAction?.('edit', budget)}
                          title="Editar"
                        >
                          <EditIcon />
                        </button>
                        {budget.status === 'rascunho' && (
                          <button
                            type="button"
                            style={{ ...styles.button, ...styles.buttonOutline, ...styles.buttonIcon }}
                            onClick={() => onBudgetAction?.('send', budget)}
                            title="Enviar"
                          >
                            <SendIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.sectionDivider} />

      <h3 style={styles.sectionTitle}>Ordens de Servico</h3>
      {!hasOrders ? (
        <EmptyState message="Nenhuma ordem de servico registrada" />
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Numero</th>
                <th style={styles.th}>Descricao</th>
                <th style={styles.th}>Tecnico</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Data</th>
                <th style={styles.th}>Status</th>
                <th style={{ ...styles.th, width: '80px' }}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {orders!.map((order) => {
                const statusCfg = orderStatusConfig[order.status];
                return (
                  <tr key={order.id}>
                    <td style={{ ...styles.td, fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                      {order.numero}
                    </td>
                    <td style={styles.td}>{order.descricao}</td>
                    <td style={styles.td}>
                      {order.tecnico || <span style={{ color: 'var(--color-text-subtle)', fontStyle: 'italic' }}>Nao atribuido</span>}
                    </td>
                    <td style={{ ...styles.td, fontWeight: 'var(--font-weight-semibold)' as unknown as number }}>
                      {formatCurrency(order.valor)}
                    </td>
                    <td style={styles.td}>{formatDate(order.data)}</td>
                    <td style={styles.td}>
                      <StatusBadge config={statusCfg} />
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionsCell}>
                        <button
                          type="button"
                          style={{ ...styles.button, ...styles.buttonOutline, ...styles.buttonIcon }}
                          onClick={() => onOrderAction?.('view', order)}
                          title="Visualizar"
                        >
                          <EyeIcon />
                        </button>
                        <button
                          type="button"
                          style={{ ...styles.button, ...styles.buttonOutline, ...styles.buttonIcon }}
                          onClick={() => onOrderAction?.('edit', order)}
                          title="Editar"
                        >
                          <EditIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ClientFormView({
  client,
  equipments = [],
  history = [],
  orders = [],
  budgets = [],
  pmocData,
  activeTab: controlledActiveTab,
  onTabChange,
  onClientChange,
  onConsultCNPJ,
  loadingCNPJ = false,
  readOnly = false,
  onEquipmentAction,
  onOrderAction,
  onBudgetAction,
}: ClientFormViewProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<TabId>('cadastro');
  
  const activeTab = controlledActiveTab ?? internalActiveTab;
  
  const handleTabChange = useCallback((tab: TabId) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  }, [onTabChange]);

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'cadastro', label: 'Cadastro' },
    { id: 'historico', label: 'Historico' },
    { id: 'equipamentos', label: 'Equipamentos', count: equipments.length },
    { id: 'pmoc', label: 'PMOC' },
    { id: 'orcamentos', label: 'Orcamentos e OS', count: (orders.length || 0) + (budgets.length || 0) },
  ];

  return (
    <div style={styles.container}>
      {/* Tabs Header */}
      <div style={styles.tabsContainer} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span 
                style={{
                  ...styles.tabBadge,
                  ...(activeTab === tab.id ? styles.tabBadgeActive : {}),
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={styles.content}>
        {activeTab === 'cadastro' && (
          <TabCadastro
            client={client}
            onChange={onClientChange}
            onConsultCNPJ={onConsultCNPJ}
            loadingCNPJ={loadingCNPJ}
            readOnly={readOnly}
          />
        )}
        {activeTab === 'historico' && (
          <TabHistorico history={history} />
        )}
        {activeTab === 'equipamentos' && (
          <TabEquipamentos 
            equipments={equipments} 
            onAction={onEquipmentAction}
          />
        )}
        {activeTab === 'pmoc' && (
          <TabPMOC pmocData={pmocData} />
        )}
        {activeTab === 'orcamentos' && (
          <TabOrcamentosOS 
            orders={orders} 
            budgets={budgets}
            onOrderAction={onOrderAction}
            onBudgetAction={onBudgetAction}
          />
        )}
      </div>

      {/* Keyframes for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ClientFormView;
