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

import { useState, useCallback, useEffect } from 'react';
import { formatCepInput } from '../../../lib/brMask';
import { PhoneInputWithContactPicker } from '../../ui/PhoneInputWithContactPicker';
import { StreetAddressLookupInput } from './StreetAddressLookupInput';
import { FormSwitch } from '../../ui/form-switch';
import cadastroStyles from './client-form-cadastro.module.css';
import viewStyles from './client-form-view.module.css';

// ============================================================================
// TYPES
// ============================================================================

export type ClientType = 'pf' | 'pj';
export type ClientRegime = 'regular' | 'mei' | 'simples' | 'lucro_presumido' | 'lucro_real';
export type TabId = 'cadastro' | 'historico' | 'equipamentos' | 'pmoc' | 'orcamentos' | 'preventiva';

export interface ClientData {
  id?: string;
  /** Obrigatório antes de salvar; indefinido em cadastro novo até o usuário escolher. */
  type?: ClientType;
  razaoSocial: string;
  nomeFantasia?: string;
  documento: string;
  regime?: ClientRegime;
  whatsapp?: string;
  telefone?: string;
  email?: string;
  contactPersonName?: string;
  stateRegistration?: string;
  ieIndicator?: string;
  municipalRegistration?: string;
  addressIbgeCode?: string;
  preventiveCampaignOptOut?: boolean;
  isActive?: boolean;
  /** CNPJ validado na Receita (consulta CNPJA ou flag do banco). */
  isVerifiedCnpj?: boolean;
  /** ISO datetime da última atualização comercial persistida. */
  lastCnpjCommercialUpdate?: string | null;
  /** CNAE principal (código), preenchido via consulta CNPJA. */
  mainActivityCode?: string;
  /** CNAE principal (descrição), preenchido via consulta CNPJA. */
  mainActivityDescription?: string;
  /** Natureza jurídica, preenchida via consulta CNPJA. */
  legalNature?: string;
  /** Situação cadastral na Receita (ex.: Ativa). */
  registrationStatus?: string;
  /** Data de abertura (YYYY-MM-DD). */
  foundedAt?: string;
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
  /** Consulta rápida CNPJA Open (cadastro inicial, sem créditos). */
  onConsultCNPJ?: (cnpj: string) => void;
  /** Validação fiscal CNPJA Comercial (dados completos para NFS-e). */
  onConsultCNPJCommercial?: (cnpj: string) => void;
  /** Callback para buscar endereço pelo CEP */
  onBuscarCep?: () => void;
  /** Estado de loading da consulta CNPJ Open */
  loadingCNPJ?: boolean;
  /** Estado de loading da consulta CNPJ Comercial */
  loadingCNPJCommercial?: boolean;
  /** Exibe aba PMOC (somente PJ com cadastro salvo). */
  showPmocTab?: boolean;
  /** Trava tipo, CNPJ e razão social após validação na Receita */
  fiscalFieldsLocked?: boolean;
  /** Atualização comercial persistida (cliente já salvo) — respeita trava de 60 dias */
  onRefreshCnpjCommercial?: () => void;
  loadingCnpjCommercialRefresh?: boolean;
  cnpjCommercialCooldownDays?: number | null;
  /** Filiais / obras do cliente */
  sitesPanel?: React.ReactNode;
  /** Estado de loading da busca de CEP */
  cepLoading?: boolean;
  /** Modo somente leitura */
  readOnly?: boolean;
  /** Callback para ações em equipamentos */
  onEquipmentAction?: (action: 'view' | 'edit' | 'delete', equipment: Equipment) => void;
  /** Painel customizado da aba Equipamentos (ex.: ClientEquipmentManager) */
  equipamentosPanel?: React.ReactNode;
  /** Contagem exibida na aba Equipamentos quando usa painel customizado */
  equipamentosCount?: number;
  /** Callback para ações em OS */
  onOrderAction?: (action: 'view' | 'edit', order: ServiceOrder) => void;
  /** Callback para ações em orçamentos */
  onBudgetAction?: (action: 'view' | 'edit' | 'send', budget: Budget) => void;
  /** Painel customizado da aba Preventiva */
  preventivaPanel?: React.ReactNode;
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
  labelRequiredMark: {
    color: 'var(--color-danger, #dc2626)',
    marginLeft: '0.15rem',
  },
  cnpjApiHint: {
    margin: '0.75rem 0 0',
    padding: '0.75rem 1rem',
    fontSize: 'var(--font-size-sm)',
    lineHeight: 1.55,
    color: 'var(--color-text-muted)',
    background: 'color-mix(in srgb, var(--color-primary) 6%, #fff)',
    border: '1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border))',
    borderRadius: 'var(--radius-md)',
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
  inputLocked: {
    background: 'color-mix(in srgb, var(--color-text-muted) 6%, var(--input-bg))',
    color: 'var(--color-text-muted)',
    cursor: 'not-allowed',
    border: '1px solid #bfdbfe',
  },
  fiscalLockBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border))',
    background: 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-elevated))',
    fontSize: '0.8125rem',
    lineHeight: 1.45,
    color: 'var(--color-text)',
  },
  identMetaRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
    gap: 'var(--form-grid-column-gap)',
    alignItems: 'end',
    gridColumn: '1 / -1',
  },
  identMetaRowPj: {
    gridTemplateColumns: 'minmax(12rem, 1fr) minmax(12rem, 1fr) auto',
  },
  identMetaRowPf: {
    gridTemplateColumns: 'minmax(12rem, 1fr) auto',
  },
  activeToggleWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--form-label-to-control)',
    minWidth: '8.5rem',
  },
  activeToggleControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    minHeight: 'var(--input-height)',
  },
  activeToggleState: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap' as const,
  },
  refreshReceitaRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: 'var(--space-4)',
    gridColumn: '1 / -1',
  },
  inputFocus: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 3px var(--color-focus-ring)',
  },
  inputWithButton: {
    display: 'flex',
    gap: 'var(--space-2)',
  },
  /** Grid responsivo CPF/CNPJ + consultas (equivalente a grid-cols-1 md:grid-cols-4). */
  documentFieldGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '0.5rem',
    alignItems: 'end',
    width: '100%',
  },
  documentFieldInput: {
    minWidth: 0,
    width: '100%',
  },
  documentFieldButton: {
    width: '100%',
    whiteSpace: 'normal' as const,
    textAlign: 'center' as const,
    minWidth: 0,
    lineHeight: 1.25,
    padding: '0 0.65rem',
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

const EDITABLE_ADDRESS_FIELDS = new Set(['cep', 'logradouro', 'numero', 'complemento']);

function CadastroAtivoToggle({
  checked,
  onChange,
  readOnly,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <div className={`${cadastroStyles.field} ${cadastroStyles.activeToggleField}`}>
      <label
        htmlFor="client-is-active"
        style={{
          ...styles.label,
          margin: 0,
          display: 'block',
        }}
      >
        Cadastro ativo
      </label>
      <div style={styles.activeToggleControl}>
        <FormSwitch
          id="client-is-active"
          checked={checked}
          onChange={onChange}
          disabled={readOnly}
          ariaLabel="Cadastro ativo"
        />
        <span style={styles.activeToggleState}>{checked ? 'Ativo' : 'Inativo'}</span>
      </div>
    </div>
  );
}

function TabCadastro({
  client,
  onChange,
  onConsultCNPJ,
  onConsultCNPJCommercial,
  onRefreshCnpjCommercial,
  onBuscarCep,
  loadingCNPJ,
  loadingCNPJCommercial,
  loadingCnpjCommercialRefresh,
  cnpjCommercialCooldownDays,
  fiscalFieldsLocked,
  cepLoading,
  readOnly,
  sitesPanel,
}: {
  client?: ClientData;
  onChange?: (data: Partial<ClientData>) => void;
  onConsultCNPJ?: (cnpj: string) => void;
  onConsultCNPJCommercial?: (cnpj: string) => void;
  onRefreshCnpjCommercial?: () => void;
  onBuscarCep?: () => void;
  loadingCNPJ?: boolean;
  loadingCNPJCommercial?: boolean;
  loadingCnpjCommercialRefresh?: boolean;
  cnpjCommercialCooldownDays?: number | null;
  fiscalFieldsLocked?: boolean;
  cepLoading?: boolean;
  readOnly?: boolean;
  sitesPanel?: React.ReactNode;
}) {
  const [localClient, setLocalClient] = useState<Partial<ClientData>>(client || { isActive: true });

  useEffect(() => {
    if (client) setLocalClient(client);
  }, [client]);

  const handleChange = useCallback((field: keyof ClientData, value: unknown) => {
    setLocalClient((prev) => {
      const updated = { ...prev, [field]: value };
      onChange?.(updated);
      return updated;
    });
  }, [onChange]);

  const handleEnderecoChange = useCallback((field: keyof NonNullable<ClientData['endereco']>, value: string) => {
    setLocalClient((prev) => {
      const updated = {
        ...prev,
        endereco: { ...prev.endereco, [field]: value },
      };
      onChange?.(updated);
      return updated;
    });
  }, [onChange]);

  const handleDocumentoChange = (value: string) => {
    const formatted = localClient.type === 'pf' ? formatCPF(value) : formatCNPJ(value);
    handleChange('documento', formatted);
  };

  const canConsultCNPJ = localClient.type === 'pj' && localClient.documento && localClient.documento.replace(/\D/g, '').length === 14;
  const cnpjBusy = Boolean(loadingCNPJ || loadingCNPJCommercial);
  /** Após CNPJ verificado: trava somente tipo, documento, razão social e nome fantasia. */
  const identCoreLocked = Boolean(readOnly || fiscalFieldsLocked);
  /** Dados enriquecidos pela Receita (regime, CNAE, situação, abertura) não são editáveis manualmente. */
  const fiscalEnrichmentLocked = Boolean(readOnly || (fiscalFieldsLocked && localClient.type === 'pj'));
  const lockedInputStyle = identCoreLocked ? { ...styles.input, ...styles.inputLocked } : styles.input;

  const isAddressFieldEditable = (field: keyof NonNullable<ClientData['endereco']>) =>
    !readOnly && (!fiscalFieldsLocked || EDITABLE_ADDRESS_FIELDS.has(field));

  const commercialCooldownActive =
    cnpjCommercialCooldownDays != null && cnpjCommercialCooldownDays > 0;
  const [cooldownHintVisible, setCooldownHintVisible] = useState(false);

  useEffect(() => {
    if (!commercialCooldownActive) setCooldownHintVisible(false);
  }, [commercialCooldownActive]);

  return (
    <div className={cadastroStyles.root}>
      {fiscalFieldsLocked && onRefreshCnpjCommercial && localClient.type === 'pj' ? (
        <div className={cadastroStyles.refreshReceitaRow}>
          <button
            type="button"
            style={{
              ...styles.button,
              ...styles.buttonOutline,
              opacity: readOnly || loadingCnpjCommercialRefresh ? 0.55 : commercialCooldownActive ? 0.75 : 1,
              cursor: readOnly || loadingCnpjCommercialRefresh ? 'not-allowed' : 'pointer',
            }}
            onClick={() => {
              if (readOnly || loadingCnpjCommercialRefresh) return;
              if (commercialCooldownActive) {
                setCooldownHintVisible(true);
                return;
              }
              setCooldownHintVisible(false);
              onRefreshCnpjCommercial();
            }}
            disabled={readOnly || loadingCnpjCommercialRefresh}
            title={
              commercialCooldownActive
                ? 'Consulta comercial indisponível no momento — clique para ver quando poderá atualizar'
                : 'Atualiza nome fantasia, endereço e regime via API comercial CNPJá (consome créditos)'
            }
          >
            {loadingCnpjCommercialRefresh ? <LoaderIcon size={16} /> : <SearchIcon size={16} />}
            Atualizar via Receita (Comercial)
          </button>
          {cooldownHintVisible && commercialCooldownActive ? (
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              Próxima consulta em ~{cnpjCommercialCooldownDays} dia(s).
            </span>
          ) : null}
        </div>
      ) : null}

      <h3 className={cadastroStyles.sectionTitle}>Identificacao</h3>
      <div className={cadastroStyles.formGrid}>
        <div
          className={[
            cadastroStyles.identMetaRow,
            localClient.type === 'pj'
              ? cadastroStyles.identMetaRowPj
              : localClient.type === 'pf'
                ? cadastroStyles.identMetaRowPf
                : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className={cadastroStyles.field}>
            <label style={styles.label}>
              Tipo de Cadastro
              <span style={styles.labelRequiredMark} aria-hidden>
                *
              </span>
            </label>
            <select
              style={identCoreLocked ? { ...styles.select, ...styles.inputLocked } : styles.select}
              value={localClient.type ?? ''}
              onChange={(e) => {
                const nextType = e.target.value as ClientType | '';
                handleChange('type', nextType || undefined);
              }}
              disabled={identCoreLocked}
              required
              title={fiscalFieldsLocked ? 'Tipo de cadastro protegido após validação do CNPJ' : undefined}
            >
              <option value="" disabled>
                Selecione o tipo de cadastro
              </option>
              <option value="pf">Pessoa Física (CPF)</option>
              <option value="pj">Pessoa Jurídica (CNPJ)</option>
            </select>
          </div>

          {localClient.type === 'pj' ? (
            <div className={cadastroStyles.field}>
              <label style={styles.label}>Regime</label>
              <select
                style={fiscalEnrichmentLocked ? { ...styles.select, ...styles.inputLocked } : styles.select}
                value={localClient.regime || 'regular'}
                onChange={(e) => handleChange('regime', e.target.value as ClientRegime)}
                disabled={fiscalEnrichmentLocked}
                title={fiscalFieldsLocked ? 'Regime protegido após validação na Receita' : undefined}
              >
                {Object.entries(regimeConfig).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          ) : null}

          {localClient.type === 'pf' || localClient.type === 'pj' ? (
            <CadastroAtivoToggle
              checked={localClient.isActive !== false}
              onChange={(value) => handleChange('isActive', value)}
              readOnly={readOnly}
            />
          ) : null}
        </div>

        {(localClient.type === 'pf' || localClient.type === 'pj') && (
        <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
          <label style={styles.label}>{localClient.type === 'pf' ? 'CPF' : 'CNPJ'}</label>
          {localClient.type === 'pj' && !fiscalFieldsLocked ? (
            <>
              <style>{`
                .client-cnpj-doc-grid {
                  display: grid;
                  grid-template-columns: 1fr;
                  gap: 0.5rem;
                  align-items: end;
                  width: 100%;
                }
                @media (min-width: 768px) {
                  .client-cnpj-doc-grid {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                  }
                  .client-cnpj-doc-grid .client-cnpj-doc-input {
                    grid-column: span 2;
                  }
                  .client-cnpj-doc-grid .client-cnpj-doc-btn {
                    grid-column: span 1;
                  }
                }
              `}</style>
              <div className="client-cnpj-doc-grid" style={styles.documentFieldGrid}>
                <input
                  type="text"
                  className="client-cnpj-doc-input"
                  style={{
                    ...(identCoreLocked ? lockedInputStyle : styles.input),
                    ...styles.documentFieldInput,
                  }}
                  placeholder="00.000.000/0000-00"
                  value={localClient.documento || ''}
                  onChange={(e) => handleDocumentoChange(e.target.value)}
                  disabled={identCoreLocked}
                  readOnly={fiscalFieldsLocked}
                  title={fiscalFieldsLocked ? 'CNPJ protegido após validação na Receita' : undefined}
                />
                <button
                  type="button"
                  className="client-cnpj-doc-btn"
                  style={{
                    ...styles.button,
                    ...styles.buttonOutline,
                    ...styles.documentFieldButton,
                    opacity: canConsultCNPJ && !cnpjBusy ? 1 : 0.5,
                    cursor: canConsultCNPJ && !cnpjBusy ? 'pointer' : 'not-allowed',
                  }}
                  onClick={() => canConsultCNPJ && !cnpjBusy && onConsultCNPJ?.(localClient.documento!)}
                  disabled={!canConsultCNPJ || cnpjBusy || identCoreLocked}
                  title="Consulta gratuita CNPJá Open; se falhar ou vier incompleta, usa automaticamente a API comercial (chave configurada) ou BrasilAPI"
                >
                  {loadingCNPJ ? <LoaderIcon size={16} /> : <SearchIcon size={16} />}
                  Open
                </button>
                {onConsultCNPJCommercial ? (
                  <button
                    type="button"
                    className="client-cnpj-doc-btn"
                    style={{
                      ...styles.button,
                      ...styles.buttonOutline,
                      ...styles.documentFieldButton,
                      opacity: canConsultCNPJ && !cnpjBusy ? 1 : 0.5,
                      cursor: canConsultCNPJ && !cnpjBusy ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => canConsultCNPJ && !cnpjBusy && onConsultCNPJCommercial(localClient.documento!)}
                    disabled={!canConsultCNPJ || cnpjBusy || identCoreLocked}
                    title="Consulta comercial CNPJá: razão social, nome fantasia, endereço, regime MEI, CNAE (código e descrição) e natureza jurídica"
                  >
                    {loadingCNPJCommercial ? <LoaderIcon size={16} /> : <SearchIcon size={16} />}
                    Consultar CNPJ na Receita
                  </button>
                ) : null}
              </div>
              <div style={styles.cnpjApiHint} role="note">
                <strong>Open</strong> tenta a consulta gratuita; se falhar, indisponível ou incompleta, o servidor usa
                automaticamente a <strong>CNPJá comercial</strong> (quando a chave está em Chaves APIs) ou a BrasilAPI.
                {' '}
                <strong>Receita</strong> força a consulta comercial completa (Receita + Cadastro de Contribuintes).
              </div>
            </>
          ) : (
            <input
              type="text"
              style={{
                ...(identCoreLocked ? lockedInputStyle : styles.input),
                ...styles.documentFieldInput,
              }}
              placeholder={localClient.type === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'}
              value={localClient.documento || ''}
              onChange={(e) => handleDocumentoChange(e.target.value)}
              disabled={identCoreLocked}
              readOnly={fiscalFieldsLocked}
              title={fiscalFieldsLocked ? 'CNPJ protegido após validação na Receita' : undefined}
            />
          )}
        </div>
        )}

        {(localClient.type === 'pf' || localClient.type === 'pj') && (
        <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
          <label style={styles.label}>{localClient.type === 'pf' ? 'Nome Completo' : 'Razao Social'}</label>
          <input
            type="text"
            style={identCoreLocked ? lockedInputStyle : styles.input}
            placeholder={localClient.type === 'pf' ? 'Nome completo' : 'Razao Social da empresa'}
            value={localClient.razaoSocial || ''}
            onChange={(e) => handleChange('razaoSocial', e.target.value)}
            disabled={identCoreLocked}
            readOnly={fiscalFieldsLocked}
            title={fiscalFieldsLocked ? 'Razão social protegida após validação na Receita' : undefined}
          />
        </div>
        )}

        {localClient.type === 'pj' && (
          <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
            <label style={styles.label}>Nome Fantasia</label>
            <input
              type="text"
              style={readOnly ? lockedInputStyle : styles.input}
              placeholder="Nome fantasia"
              value={localClient.nomeFantasia || ''}
              onChange={(e) => handleChange('nomeFantasia', e.target.value)}
              disabled={readOnly}
            />
          </div>
        )}

        {localClient.type === 'pj' && (
          <details className={cadastroStyles.fiscalDetails}>
            <summary className={cadastroStyles.fiscalSummary}>Dados fiscais complementares</summary>
            <div className={cadastroStyles.fiscalBody}>
            <div className={cadastroStyles.field}>
              <label style={styles.label}>Inscrição estadual</label>
              <input
                type="text"
                style={styles.input}
                value={localClient.stateRegistration || ''}
                onChange={(e) => handleChange('stateRegistration', e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className={cadastroStyles.field}>
              <label style={styles.label}>Indicador IE</label>
              <select
                style={readOnly ? { ...styles.select, ...styles.inputLocked } : styles.select}
                value={localClient.ieIndicator || ''}
                onChange={(e) => handleChange('ieIndicator', e.target.value)}
                disabled={readOnly}
              >
                <option value="">—</option>
                <option value="1">Contribuinte</option>
                <option value="2">Isento</option>
                <option value="9">Não contribuinte</option>
              </select>
            </div>
            <div className={cadastroStyles.field}>
              <label style={styles.label}>Inscrição municipal</label>
              <input
                type="text"
                style={styles.input}
                value={localClient.municipalRegistration || ''}
                onChange={(e) => handleChange('municipalRegistration', e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className={cadastroStyles.field}>
              <label style={styles.label}>CNAE principal (código)</label>
              <input
                type="text"
                style={fiscalEnrichmentLocked ? lockedInputStyle : styles.input}
                placeholder="Ex.: 4322-3/01"
                value={localClient.mainActivityCode || ''}
                onChange={(e) => handleChange('mainActivityCode', e.target.value)}
                disabled={fiscalEnrichmentLocked}
                readOnly={fiscalFieldsLocked}
              />
            </div>
            <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
              <label style={styles.label}>CNAE principal (descrição)</label>
              <input
                type="text"
                style={fiscalEnrichmentLocked ? lockedInputStyle : styles.input}
                placeholder="Atividade econômica principal"
                value={localClient.mainActivityDescription || ''}
                onChange={(e) => handleChange('mainActivityDescription', e.target.value)}
                disabled={fiscalEnrichmentLocked}
                readOnly={fiscalFieldsLocked}
              />
            </div>
            <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
              <label style={styles.label}>Natureza jurídica</label>
              <input
                type="text"
                style={fiscalEnrichmentLocked ? lockedInputStyle : styles.input}
                placeholder="Ex.: Sociedade Empresária Limitada"
                value={localClient.legalNature || ''}
                onChange={(e) => handleChange('legalNature', e.target.value)}
                disabled={fiscalEnrichmentLocked}
                readOnly={fiscalFieldsLocked}
              />
            </div>
            <div className={cadastroStyles.field}>
              <label style={styles.label}>Situação cadastral</label>
              <input
                type="text"
                style={fiscalEnrichmentLocked ? lockedInputStyle : styles.input}
                placeholder="Ex.: Ativa"
                value={localClient.registrationStatus || ''}
                onChange={(e) => handleChange('registrationStatus', e.target.value)}
                disabled={fiscalEnrichmentLocked}
                readOnly={fiscalFieldsLocked}
              />
            </div>
            <div className={cadastroStyles.field}>
              <label style={styles.label}>Data de abertura</label>
              <input
                type="date"
                style={fiscalEnrichmentLocked ? lockedInputStyle : styles.input}
                value={localClient.foundedAt || ''}
                onChange={(e) => handleChange('foundedAt', e.target.value)}
                disabled={fiscalEnrichmentLocked}
                readOnly={fiscalFieldsLocked}
              />
            </div>
            </div>
          </details>
        )}
      </div>

      <div className={cadastroStyles.sectionDivider} />

      <h3 className={cadastroStyles.sectionTitle}>Contato</h3>
      <div className={cadastroStyles.formGrid}>
        <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
          <label style={styles.label}>WhatsApp</label>
          <div className={cadastroStyles.fieldControl}>
          <PhoneInputWithContactPicker
            value={localClient.whatsapp || ''}
            onChange={(v) => handleChange('whatsapp', formatPhone(v))}
            disabled={readOnly}
            placeholder="(00) 00000-0000"
            inputStyle={styles.input}
          />
          </div>
        </div>

        <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
          <label style={styles.label}>Telefone</label>
          <div className={cadastroStyles.fieldControl}>
          <PhoneInputWithContactPicker
            value={localClient.telefone || ''}
            onChange={(v) => handleChange('telefone', formatPhone(v))}
            disabled={readOnly}
            placeholder="(00) 0000-0000"
            inputStyle={styles.input}
          />
          </div>
        </div>

        <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
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

        {localClient.type === 'pj' && (
          <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
            <label style={styles.label}>Responsável / contato</label>
            <input
              type="text"
              style={styles.input}
              value={localClient.contactPersonName || ''}
              onChange={(e) => handleChange('contactPersonName', e.target.value)}
              disabled={readOnly}
            />
          </div>
        )}
      </div>
      <div className={cadastroStyles.sectionDivider} />

      <h3 className={cadastroStyles.sectionTitle}>Endereco</h3>
      <div className={cadastroStyles.formGrid}>
        <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
          <label style={styles.label}>CEP</label>
          <div className={cadastroStyles.inputWithButton}>
            <input
              type="text"
              style={isAddressFieldEditable('cep') ? styles.input : lockedInputStyle}
              placeholder="00000-000"
              value={localClient.endereco?.cep || ''}
              onChange={(e) => handleEnderecoChange('cep', e.target.value)}
              disabled={!isAddressFieldEditable('cep')}
            />
            {onBuscarCep ? (
              <button
                type="button"
                style={{ ...styles.button, ...styles.buttonOutline }}
                onClick={onBuscarCep}
                disabled={!isAddressFieldEditable('cep') || cepLoading}
              >
                {cepLoading ? <LoaderIcon size={16} /> : 'Buscar CEP'}
              </button>
            ) : null}
          </div>
        </div>
        <div className={`${cadastroStyles.field} ${cadastroStyles.formGridFull}`}>
          <label style={styles.label}>Logradouro</label>
          <div className={cadastroStyles.fieldControl}>
          {isAddressFieldEditable('logradouro') ? (
            <StreetAddressLookupInput
              value={localClient.endereco?.logradouro || ''}
              onChange={(logradouro) => handleEnderecoChange('logradouro', logradouro)}
              city={localClient.endereco?.cidade || ''}
              state={localClient.endereco?.estado || ''}
              nearCity={localClient.endereco?.cidade || ''}
              nearState={localClient.endereco?.estado || ''}
              style={{ ...styles.input, width: '100%' }}
              onSelect={(sel) => {
                handleEnderecoChange('logradouro', sel.street);
                if (sel.district) handleEnderecoChange('bairro', sel.district);
                if (sel.city) handleEnderecoChange('cidade', sel.city);
                if (sel.state) handleEnderecoChange('estado', sel.state);
                if (sel.cep) handleEnderecoChange('cep', formatCepInput(sel.cep));
              }}
            />
          ) : (
            <input
              type="text"
              value={localClient.endereco?.logradouro || ''}
              disabled
              style={lockedInputStyle}
            />
          )}
          </div>
        </div>
        <div className={cadastroStyles.field}>
          <label style={styles.label}>Número</label>
          <input
            type="text"
            value={localClient.endereco?.numero || ''}
            onChange={(e) => handleEnderecoChange('numero', e.target.value)}
            disabled={!isAddressFieldEditable('numero')}
            style={isAddressFieldEditable('numero') ? styles.input : lockedInputStyle}
          />
        </div>
        <div className={cadastroStyles.field}>
          <label style={styles.label}>Complemento</label>
          <input
            type="text"
            value={localClient.endereco?.complemento || ''}
            onChange={(e) => handleEnderecoChange('complemento', e.target.value)}
            disabled={!isAddressFieldEditable('complemento')}
            style={isAddressFieldEditable('complemento') ? styles.input : lockedInputStyle}
          />
        </div>
        <div className={cadastroStyles.field}>
          <label style={styles.label}>Bairro</label>
          <input
            type="text"
            value={localClient.endereco?.bairro || ''}
            onChange={(e) => handleEnderecoChange('bairro', e.target.value)}
            disabled={!isAddressFieldEditable('bairro')}
            style={isAddressFieldEditable('bairro') ? styles.input : lockedInputStyle}
          />
        </div>
        <div className={cadastroStyles.addressCityUf}>
        <div className={cadastroStyles.field}>
          <label style={styles.label}>Cidade</label>
          <input
            type="text"
            value={localClient.endereco?.cidade || ''}
            onChange={(e) => handleEnderecoChange('cidade', e.target.value)}
            disabled={!isAddressFieldEditable('cidade')}
            style={isAddressFieldEditable('cidade') ? styles.input : lockedInputStyle}
          />
        </div>
        <div className={cadastroStyles.field}>
          <label style={styles.label}>UF</label>
          <input
            type="text"
            maxLength={2}
            value={localClient.endereco?.estado || ''}
            onChange={(e) => handleEnderecoChange('estado', e.target.value.toUpperCase())}
            disabled={!isAddressFieldEditable('estado')}
            style={isAddressFieldEditable('estado') ? styles.input : lockedInputStyle}
          />
        </div>
        </div>
        <div className={cadastroStyles.field}>
          <label style={styles.label}>Código IBGE (7 dígitos)</label>
          <input
            type="text"
            value={localClient.addressIbgeCode || ''}
            onChange={(e) => handleChange('addressIbgeCode', e.target.value.replace(/\D/g, '').slice(0, 7))}
            disabled={readOnly}
            style={styles.input}
          />
        </div>
      </div>

      {sitesPanel ? (
        <>
          <div className={cadastroStyles.sectionDivider} />
          {sitesPanel}
        </>
      ) : null}
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

        {pmocData.id ? (
          <a
            href={`/app/pmoc/conformidade/${pmocData.id}`}
            style={{
              display: 'inline-flex',
              marginTop: 'var(--space-4)',
              padding: '10px 14px',
              borderRadius: 'var(--input-radius)',
              background: 'var(--color-primary, #006FEE)',
              color: '#fff',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)' as unknown as number,
              textDecoration: 'none',
            }}
          >
            Abrir Painel de Conformidade
          </a>
        ) : null}
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
  orders = [],
  budgets = [],
  pmocData,
  activeTab: controlledActiveTab,
  onTabChange,
  onClientChange,
  onConsultCNPJ,
  onConsultCNPJCommercial,
  onBuscarCep,
  loadingCNPJ = false,
  loadingCNPJCommercial = false,
  onRefreshCnpjCommercial,
  loadingCnpjCommercialRefresh = false,
  cnpjCommercialCooldownDays = null,
  fiscalFieldsLocked = false,
  showPmocTab = false,
  cepLoading = false,
  readOnly = false,
  onEquipmentAction,
  equipamentosPanel,
  sitesPanel,
  equipamentosCount,
  onOrderAction,
  onBudgetAction,
  preventivaPanel,
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

  useEffect(() => {
    if (activeTab === 'pmoc' && !showPmocTab) {
      handleTabChange('cadastro');
    }
    if (activeTab === 'historico') {
      handleTabChange('cadastro');
    }
  }, [activeTab, showPmocTab, handleTabChange]);

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'cadastro', label: 'Cadastro' },
    { id: 'equipamentos', label: 'Equipamentos', count: equipamentosCount ?? equipments.length },
    ...(showPmocTab ? [{ id: 'pmoc' as TabId, label: 'PMOC' }] : []),
    { id: 'orcamentos', label: 'Orcamentos e OS', count: (orders.length || 0) + (budgets.length || 0) },
    { id: 'preventiva', label: 'Preventiva' },
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
      <div className={viewStyles.formContent}>
        {activeTab === 'cadastro' && (
          <TabCadastro
            client={client}
            onChange={onClientChange}
            onConsultCNPJ={onConsultCNPJ}
            onConsultCNPJCommercial={onConsultCNPJCommercial}
            onRefreshCnpjCommercial={onRefreshCnpjCommercial}
            onBuscarCep={onBuscarCep}
            loadingCNPJ={loadingCNPJ}
            loadingCNPJCommercial={loadingCNPJCommercial}
            loadingCnpjCommercialRefresh={loadingCnpjCommercialRefresh}
            cnpjCommercialCooldownDays={cnpjCommercialCooldownDays}
            fiscalFieldsLocked={fiscalFieldsLocked}
            cepLoading={cepLoading}
            readOnly={readOnly}
            sitesPanel={sitesPanel}
          />
        )}
        {activeTab === 'equipamentos' && (
          equipamentosPanel ?? (
            <TabEquipamentos
              equipments={equipments}
              onAction={onEquipmentAction}
            />
          )
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
        {activeTab === 'preventiva' && (
          preventivaPanel ?? (
            <EmptyState message="Salve o cliente para configurar a gestão preventiva por equipamento." />
          )
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
