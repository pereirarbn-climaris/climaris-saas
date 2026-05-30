/**
 * ServiceOrderFormView.tsx
 * 
 * Formulário completo para criação e edição de Ordens de Serviço (OS).
 * Organizado em seções: Informações Gerais, Equipamentos, Laudo Técnico/Checklist, e Fechamento.
 * 
 * Requisitos:
 * - Passe os dados da OS, lista de técnicos, clientes e equipamentos por props
 * - Componente 100% focado em UI/UX sem chamadas de API
 * - Use as callbacks (onSave, onCancel, onGeneratePDF) para ações
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  expandServiceOrderDescriptionToViewFields,
  serializeServiceOrderFormSnapshot,
  stripOsMetaFromText,
} from '../../../lib/serviceOrderFormViewAdapter'
import type { ProductOut } from '../../../api/products'
import type { ServiceOut } from '../../../api/services'
import type { SuggestedSlotOut } from '../../../api/serviceOrders'
import { computeEstimatedMinutesFromLines } from '../../../lib/serviceOrderEstimatedTime'
import type { PmocEstimatedTimeOut } from '../../../api/pmoc'
import { ServiceOrderChecklist } from '../../serviceOrders/ServiceOrderChecklist'
import { PmocScheduleOsSection, type PmocScheduleOsApplyPayload } from '../../pmoc/PmocScheduleOsSection'
import { SignaturePad } from '../../pmoc/SignaturePad'
import { addMinutesToTimeString } from '../../../lib/pmocOsSchedule'
import { formatDurationMinutes } from '../../../lib/formatDuration'
import {
  computeLaborTotal,
  computePartsTotal,
  toggleServiceOnEquipment,
} from '../../../lib/serviceOrderLinesSync'
import { ClientCombobox } from '../../ui/client-combobox'
import { ServiceOrderLineSections } from './ServiceOrderLineSections'
import { ServiceOrderSchedulingPanel } from './ServiceOrderSchedulingPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTextarea,
  AlertDialogTitle,
} from '../../ui/alert-dialog'
import { computeDiscountAmountFromView, type DiscountType } from '../../../lib/serviceOrderDiscount'
import { toast } from '../../../lib/toast'

export type { DiscountType }

// ============================================================================
// TYPES
// ============================================================================

export type ServiceOrderStatus = 
  | 'pendente' 
  | 'agendada' 
  | 'em_andamento' 
  | 'concluida' 
  | 'cancelada'

export type ServiceType = 
  | 'preventiva' 
  | 'corretiva' 
  | 'instalacao'

export type ChecklistItemStatus = 'sim' | 'nao' | 'na'

export interface Cliente {
  id: string
  nome: string
  /** Razão social / nome fantasia (CNPJ) — usado na busca do combobox */
  nomeFantasia?: string
  documento: string
  telefone?: string
  endereco?: string
}

export interface Tecnico {
  id: string
  nome: string
  avatar?: string
  especialidade?: string
}

export interface Equipamento {
  id: string
  marca: string
  modelo: string
  tipo: string
  capacidadeBtu: number
  tag?: string
  localizacao?: string
  numeroSerie?: string
}

export interface ChecklistItem {
  id: string
  descricao: string
  status: ChecklistItemStatus
  observacao?: string
}

export interface ServiceLineDraft {
  localId: string
  serverId?: number
  serviceId: string
  label: string
  quantity: number
  unitPrice: number
  /** @deprecated use equipmentIds */
  equipmentId?: string
  equipmentIds: string[]
  serverIds?: number[]
}

export interface ProductLineDraft {
  localId: string
  serverId?: number
  productId: string
  label: string
  quantity: number
  unitPrice: number
}

export interface ServiceOrderData {
  id?: string
  numero?: string
  clienteId: string
  tecnicoId: string
  status: ServiceOrderStatus
  tipoServico: ServiceType
  dataAgendamento: string
  horaAgendamento: string
  horaTermino?: string
  pmocPlanId?: string
  pmocPeriodYear?: number
  pmocPeriodMonth?: number
  pmocEstimatedMinutes?: number
  pmocBreakdown?: PmocEstimatedTimeOut['breakdown']
  equipamentosIds: string[]
  servicos: ServiceLineDraft[]
  pecas: ProductLineDraft[]
  descricaoProblema: string
  diagnosticoTecnico: string
  checklist: ChecklistItem[]
  valorPecas: number
  valorMaoDeObra: number
  /** Tipo do desconto no fechamento: valor fixo (R$) ou percentual (%) */
  descontoTipo?: DiscountType
  /** Valor digitado conforme `descontoTipo` */
  descontoValor?: number
  observacoesInternas?: string
  clientSignatureBase64?: string | null
  clientSignatureName?: string | null
  clientSignatureAt?: string | null
  clientSignatureGeo?: { lat: number; lng: number } | null
}

export interface ServiceOrderFormViewProps {
  /** Dados da OS (undefined para criação, preenchido para edição) */
  serviceOrder?: Partial<ServiceOrderData>
  /** Lista de clientes disponíveis */
  clientes: Cliente[]
  /** Lista de técnicos disponíveis */
  tecnicos: Tecnico[]
  /** Lista de equipamentos do cliente selecionado */
  equipamentosCliente: Equipamento[]
  /** Catálogo de serviços (API) */
  servicesCatalog?: ServiceOut[]
  /** Catálogo de produtos (API) */
  productsCatalog?: ProductOut[]
  /** Editar serviços/peças (admin, recepção ou técnico responsável) */
  canEditLines?: boolean
  /** Editar dados gerais (cliente, agenda, status) */
  canEditGeneral?: boolean
  /** Laudo técnico e checklist (admin ou técnico responsável) */
  canEditLaudo?: boolean
  /** Modo do formulário */
  mode: 'create' | 'edit'
  /** Loading state */
  isLoading?: boolean
  /** Callback ao salvar (pode ser async; aguardado no submit) */
  onSave: (data: ServiceOrderData) => void | Promise<void>
  /** Callback ao cancelar */
  onCancel: () => void
  /** Callback para gerar PDF (apenas se concluída) */
  onGeneratePDF?: (osId: string) => void
  /** Callback quando cliente muda (para buscar equipamentos) */
  onClienteChange?: (clienteId: string) => void
  /** ID numérico da OS (edição) — usado nas sugestões de agenda */
  orderId?: number
  /** Busca janelas livres (manhã/tarde) na API */
  onSuggestSlots?: (params: {
    orderId?: number
    durationMinutes: number
    technicianId?: number
  }) => Promise<SuggestedSlotOut[]>
  /** OS concluída (API status done): linhas de serviço/peça somente leitura */
  linesReadOnly?: boolean
  /** Exibir ação de cancelar compromisso na agenda */
  canCancelSchedule?: boolean
  /** Exibir ação de cancelar a OS inteira */
  canCancelOrder?: boolean
  /** Cancela agendamento (API) */
  onCancelSchedule?: () => void | Promise<void>
  /** Cancela a OS (API) — recebe motivo informado no modal */
  onCancelOrder?: (cancelReason: string) => void | Promise<void>
  /** Força remontagem do painel de agenda após cancelar agendamento */
  schedulingPanelKey?: string
  isCancellingSchedule?: boolean
  isCancellingOrder?: boolean
  /** Admin/recepção: concluir OS agendada/em andamento sem passar pelo fluxo de assinatura */
  canCompleteOrder?: boolean
  onCompleteOrder?: () => void | Promise<void>
  isCompletingOrder?: boolean
  /** Rótulo do badge financeiro no header (ex.: Pago, Pendente). */
  financePaymentLabel?: string | null
  /** Badge de margem de contribuição (insumos vs receita). */
  profitabilityBadge?: React.ReactNode
  /** Seção "Gestão Financeira" (OS concluída). */
  financeSection?: React.ReactNode
}

// ============================================================================
// DEFAULT CHECKLIST ITEMS
// ============================================================================

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: 'chk_1', descricao: 'Limpeza dos filtros de ar', status: 'na' },
  { id: 'chk_2', descricao: 'Limpeza da bandeja de condensado', status: 'na' },
  { id: 'chk_3', descricao: 'Verificação e limpeza do dreno', status: 'na' },
  { id: 'chk_4', descricao: 'Limpeza da serpentina evaporadora', status: 'na' },
  { id: 'chk_5', descricao: 'Limpeza da serpentina condensadora', status: 'na' },
  { id: 'chk_6', descricao: 'Verificação do nível de gás refrigerante', status: 'na' },
  { id: 'chk_7', descricao: 'Medição de pressão de sucção/descarga', status: 'na' },
  { id: 'chk_8', descricao: 'Verificação de ruídos anormais', status: 'na' },
  { id: 'chk_9', descricao: 'Teste do controle remoto', status: 'na' },
  { id: 'chk_10', descricao: 'Verificação das conexões elétricas', status: 'na' },
  { id: 'chk_11', descricao: 'Medição de temperatura de insuflamento', status: 'na' },
  { id: 'chk_12', descricao: 'Verificação do isolamento térmico', status: 'na' },
]

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

function resolveLaudoFieldsFromServiceOrder(so: Partial<ServiceOrderData>): Pick<
  ServiceOrderData,
  | "descricaoProblema"
  | "diagnosticoTecnico"
  | "checklist"
  | "clientSignatureBase64"
  | "clientSignatureName"
  | "clientSignatureAt"
  | "clientSignatureGeo"
> {
  const rawDesc = so.descricaoProblema ?? ""
  if (rawDesc.includes("---CLIMARIS_OS_META---")) {
    const expanded = expandServiceOrderDescriptionToViewFields(rawDesc)
    return {
      descricaoProblema: expanded.descricaoProblema,
      diagnosticoTecnico: expanded.diagnosticoTecnico,
      checklist: so.checklist?.length ? so.checklist : expanded.checklist,
      clientSignatureBase64: so.clientSignatureBase64 ?? expanded.clientSignatureBase64 ?? null,
      clientSignatureName: so.clientSignatureName ?? expanded.clientSignatureName ?? null,
      clientSignatureAt: so.clientSignatureAt ?? expanded.clientSignatureAt ?? null,
      clientSignatureGeo: so.clientSignatureGeo ?? expanded.clientSignatureGeo ?? null,
    }
  }
  return {
    descricaoProblema: stripOsMetaFromText(rawDesc),
    diagnosticoTecnico: stripOsMetaFromText(so.diagnosticoTecnico),
    checklist: so.checklist?.length ? so.checklist : DEFAULT_CHECKLIST,
    clientSignatureBase64: so.clientSignatureBase64 ?? null,
    clientSignatureName: so.clientSignatureName ?? null,
    clientSignatureAt: so.clientSignatureAt ?? null,
    clientSignatureGeo: so.clientSignatureGeo ?? null,
  }
}

const formatBtu = (btu: number): string => {
  if (btu >= 1000) {
    return `${(btu / 1000).toFixed(0)}k BTU`
  }
  return `${btu} BTU`
}

// ============================================================================
// ICONS
// ============================================================================

type IconProps = React.SVGProps<SVGSVGElement>;

const Icons = {
  Calendar: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Clock: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  ),
  User: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Building: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <line x1="8" y1="6" x2="8" y2="6.01" />
      <line x1="16" y1="6" x2="16" y2="6.01" />
      <line x1="12" y1="6" x2="12" y2="6.01" />
      <line x1="8" y1="10" x2="8" y2="10.01" />
      <line x1="16" y1="10" x2="16" y2="10.01" />
      <line x1="12" y1="10" x2="12" y2="10.01" />
      <line x1="8" y1="14" x2="8" y2="14.01" />
      <line x1="16" y1="14" x2="16" y2="14.01" />
      <line x1="12" y1="14" x2="12" y2="14.01" />
    </svg>
  ),
  Snowflake: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M20 16l-4-4 4-4" />
      <path d="M4 8l4 4-4 4" />
      <path d="M16 4l-4 4-4-4" />
      <path d="M8 20l4-4 4 4" />
    </svg>
  ),
  Clipboard: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  ),
  FileText: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  ),
  DollarSign: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Save: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17,21 17,13 7,13 7,21" />
      <polyline points="7,3 7,8 15,8" />
    </svg>
  ),
  X: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Download: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Check: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  ),
  Minus: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Search: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Plus: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Trash: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  ChevronDown: (props: IconProps) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6,9 12,15 18,9" />
    </svg>
  ),
}

// ============================================================================
// STATUS CONFIGS
// ============================================================================

const STATUS_CONFIG: Record<ServiceOrderStatus, { label: string; color: string; bg: string }> = {
  pendente: { 
    label: 'Pendente', 
    color: 'var(--color-warning)', 
    bg: 'rgba(217, 119, 6, 0.1)' 
  },
  agendada: { 
    label: 'Agendada', 
    color: 'var(--color-primary)', 
    bg: 'rgba(2, 132, 199, 0.1)' 
  },
  em_andamento: { 
    label: 'Em Andamento', 
    color: 'var(--color-primary-light)', 
    bg: 'rgba(14, 165, 233, 0.1)' 
  },
  concluida: { 
    label: 'Concluída', 
    color: 'var(--color-success)', 
    bg: 'rgba(21, 128, 61, 0.1)' 
  },
  cancelada: { 
    label: 'Cancelada', 
    color: 'var(--color-error)', 
    bg: 'rgba(185, 28, 28, 0.1)' 
  },
}

const SERVICE_TYPE_CONFIG: Record<ServiceType, { label: string; color: string }> = {
  preventiva: { label: 'Preventiva', color: 'var(--color-primary)' },
  corretiva: { label: 'Corretiva', color: 'var(--color-warning)' },
  instalacao: { label: 'Instalação', color: 'var(--color-success)' },
}

// ============================================================================
// FORM FIELD COMPONENTS
// ============================================================================

interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
  fullWidth?: boolean
}

const FormField: React.FC<FormFieldProps> = ({ 
  label, 
  required, 
  error, 
  hint,
  children,
  fullWidth 
}) => (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column', 
    gap: 'var(--form-label-to-control)',
    gridColumn: fullWidth ? '1 / -1' : undefined,
  }}>
    <label 
      style={{
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-medium)',
        color: 'var(--color-text)',
      }}
    >
      {label}
      {required && <span style={{ color: 'var(--color-error)', marginLeft: '2px' }}>*</span>}
    </label>
    {children}
    {hint && !error && (
      <span 
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-muted)',
          marginTop: 'var(--form-hint-margin-top)',
        }}
      >
        {hint}
      </span>
    )}
    {error && (
      <span 
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-error)',
          marginTop: 'var(--form-hint-margin-top)',
        }}
      >
        {error}
      </span>
    )}
  </div>
)

// ============================================================================
// INPUT COMPONENT
// ============================================================================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
  error?: boolean
}

const Input: React.FC<InputProps> = ({ icon, error, style, ...props }) => {
  const [focused, setFocused] = useState(false)
  
  return (
    <div 
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {icon && (
        <div 
          style={{
            position: 'absolute',
            left: 'var(--input-padding-x)',
            color: focused ? 'var(--color-primary)' : 'var(--color-text-muted)',
            pointerEvents: 'none',
            transition: 'color 0.15s ease',
          }}
        >
          {icon}
        </div>
      )}
      <input
        {...props}
        onFocus={(e) => {
          setFocused(true)
          props.onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          props.onBlur?.(e)
        }}
        style={{
          width: '100%',
          height: 'var(--input-height)',
          padding: `var(--input-padding-y) var(--input-padding-x)`,
          paddingLeft: icon ? '2.75rem' : 'var(--input-padding-x)',
          fontSize: 'var(--font-size-base)',
          color: 'var(--color-text)',
          backgroundColor: 'var(--input-bg)',
          border: error 
            ? '1px solid var(--color-error)' 
            : focused 
              ? '1px solid var(--color-primary)' 
              : 'var(--input-border)',
          borderRadius: 'var(--input-radius)',
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px var(--color-focus-ring)` : 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          ...style,
        }}
      />
    </div>
  )
}

// ============================================================================
// TEXTAREA COMPONENT
// ============================================================================

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

const Textarea: React.FC<TextareaProps> = ({ error, style, ...props }) => {
  const [focused, setFocused] = useState(false)
  
  return (
    <textarea
      {...props}
      onFocus={(e) => {
        setFocused(true)
        props.onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        props.onBlur?.(e)
      }}
      style={{
        width: '100%',
        minHeight: '100px',
        padding: 'var(--input-padding-y) var(--input-padding-x)',
        fontSize: 'var(--font-size-base)',
        color: 'var(--color-text)',
        backgroundColor: 'var(--input-bg)',
        border: error 
          ? '1px solid var(--color-error)' 
          : focused 
            ? '1px solid var(--color-primary)' 
            : 'var(--input-border)',
        borderRadius: 'var(--input-radius)',
        outline: 'none',
        boxShadow: focused ? `0 0 0 3px var(--color-focus-ring)` : 'none',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        resize: 'vertical',
        fontFamily: 'inherit',
        lineHeight: 'var(--line-height-normal)',
        ...style,
      }}
    />
  )
}

// ============================================================================
// SELECT COMPONENT
// ============================================================================

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: boolean
  disabled?: boolean
}

const Select: React.FC<SelectProps> = ({ 
  options, 
  value, 
  onChange, 
  placeholder,
  error,
  disabled 
}) => {
  const [focused, setFocused] = useState(false)
  
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          height: 'var(--input-height)',
          padding: `var(--input-padding-y) 2.5rem var(--input-padding-y) var(--input-padding-x)`,
          fontSize: 'var(--font-size-base)',
          color: value ? 'var(--color-text)' : 'var(--color-text-muted)',
          backgroundColor: disabled ? 'var(--color-surface)' : 'var(--input-bg)',
          border: error 
            ? '1px solid var(--color-error)' 
            : focused 
              ? '1px solid var(--color-primary)' 
              : 'var(--input-border)',
          borderRadius: 'var(--input-radius)',
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px var(--color-focus-ring)` : 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          cursor: disabled ? 'not-allowed' : 'pointer',
          appearance: 'none',
        }}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <Icons.ChevronDown 
        className="" 
        style={{
          position: 'absolute',
          right: 'var(--input-padding-x)',
          top: '50%',
          transform: 'translateY(-50%)',
          width: 'var(--icon-size-sm)',
          height: 'var(--icon-size-sm)',
          color: 'var(--color-text-muted)',
          pointerEvents: 'none',
        } as React.CSSProperties}
      />
    </div>
  )
}

// ============================================================================
// BUTTON COMPONENT
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  loading?: boolean
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading,
  children,
  disabled,
  style,
  ...props
}) => {
  const [hovered, setHovered] = useState(false)
  
  const sizeStyles = {
    sm: {
      height: 'var(--btn-height-sm)',
      padding: `0 var(--btn-padding-sm)`,
      fontSize: 'var(--font-size-sm)',
      gap: 'var(--space-1)',
    },
    md: {
      height: 'var(--btn-height-base)',
      padding: `0 var(--btn-padding-base)`,
      fontSize: 'var(--font-size-base)',
      gap: 'var(--space-2)',
    },
    lg: {
      height: 'var(--btn-height-lg)',
      padding: `0 var(--btn-padding-lg)`,
      fontSize: 'var(--font-size-md)',
      gap: 'var(--space-2)',
    },
  }
  
  const variantStyles = {
    primary: {
      backgroundColor: hovered ? 'var(--color-primary-hover)' : 'var(--color-primary)',
      color: 'white',
      border: 'none',
    },
    secondary: {
      backgroundColor: hovered ? 'var(--color-surface)' : 'var(--color-surface-elevated)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
    },
    ghost: {
      backgroundColor: hovered ? 'var(--color-surface)' : 'transparent',
      color: 'var(--color-text-muted)',
      border: 'none',
    },
    danger: {
      backgroundColor: hovered ? 'var(--color-error)' : 'var(--color-error-light)',
      color: 'white',
      border: 'none',
    },
  }
  
  return (
    <button
      {...props}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--btn-radius)',
        fontWeight: 'var(--font-weight-medium)',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
    >
      {loading ? (
        <div 
          style={{
            width: '1rem',
            height: '1rem',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && icon}
          {children}
          {icon && iconPosition === 'right' && icon}
        </>
      )}
    </button>
  )
}

// ============================================================================
// EQUIPMENT CARD
// ============================================================================

interface EquipmentCardProps {
  equipamento: Equipamento
  selected: boolean
  onToggle: () => void
}

const EquipmentCard: React.FC<EquipmentCardProps> = ({ equipamento, selected, onToggle }) => {
  const [hovered, setHovered] = useState(false)
  
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 'var(--space-4)',
        backgroundColor: selected ? 'rgba(2, 132, 199, 0.05)' : 'var(--color-surface-elevated)',
        border: selected 
          ? '2px solid var(--color-primary)' 
          : hovered 
            ? '2px solid var(--color-border)' 
            : '2px solid transparent',
        borderRadius: 'var(--card-radius)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: hovered ? 'var(--card-shadow-hover)' : 'var(--card-shadow)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div
            style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: 'var(--stat-card-icon-radius)',
              background: selected ? 'rgba(2, 132, 199, 0.15)' : 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: selected ? 'var(--color-primary)' : 'var(--color-text-muted)',
              flexShrink: 0,
            }}
          >
            <Icons.Snowflake style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />
          </div>
          <div>
            <p 
              style={{
                fontSize: 'var(--font-size-base)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text)',
                margin: 0,
              }}
            >
              {equipamento.marca} {equipamento.modelo}
            </p>
            <p 
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-muted)',
                margin: '2px 0 0 0',
              }}
            >
              {equipamento.tipo} • {formatBtu(equipamento.capacidadeBtu)}
            </p>
            {(equipamento.tag || equipamento.localizacao) && (
              <p 
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-subtle)',
                  margin: '4px 0 0 0',
                }}
              >
                {equipamento.tag && `Tag: ${equipamento.tag}`}
                {equipamento.tag && equipamento.localizacao && ' • '}
                {equipamento.localizacao}
              </p>
            )}
          </div>
        </div>
        
        <div
          style={{
            width: '1.5rem',
            height: '1.5rem',
            borderRadius: '6px',
            border: selected ? 'none' : '2px solid var(--color-border)',
            backgroundColor: selected ? 'var(--color-primary)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          {selected && (
            <Icons.Check style={{ width: '1rem', height: '1rem', color: 'white' }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// VALUE SUMMARY CARD
// ============================================================================

interface ValueSummaryProps {
  valorPecas: number
  valorMaoDeObra: number
  descontoTipo: DiscountType
  descontoValor: number
}

const ValueSummary: React.FC<ValueSummaryProps> = ({
  valorPecas,
  valorMaoDeObra,
  descontoTipo,
  descontoValor,
}) => {
  const subtotal = valorPecas + valorMaoDeObra
  const discountPreview = computeDiscountAmountFromView({
    servicos: [],
    pecas: [],
    valorPecas,
    valorMaoDeObra,
    descontoTipo,
    descontoValor,
    clienteId: '',
    tecnicoId: '',
    status: 'pendente',
    tipoServico: 'corretiva',
    dataAgendamento: '',
    horaAgendamento: '',
    equipamentosIds: [],
    descricaoProblema: '',
    diagnosticoTecnico: '',
    checklist: [],
  })
  const valorTotal = Math.max(0, subtotal - discountPreview)
  
  return (
    <div
      style={{
        padding: 'var(--card-padding)',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--card-radius)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Peças
          </span>
          <span style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>
            {formatCurrency(valorPecas)}
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Mão de Obra
          </span>
          <span style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>
            {formatCurrency(valorMaoDeObra)}
          </span>
        </div>
        {discountPreview > 0.009 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              Desconto ({descontoTipo === 'percent' ? `${descontoValor}%` : 'R$'})
            </span>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-error)', fontWeight: 500 }}>
              − {formatCurrency(discountPreview)}
            </span>
          </div>
        ) : null}
        <div
          style={{
            height: '1px',
            backgroundColor: 'var(--color-border)',
            margin: 'var(--space-1) 0',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: 'var(--font-size-md)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text)',
            }}
          >
            Total Geral
          </span>
          <span 
            style={{ 
              fontSize: 'var(--font-size-xl)', 
              fontWeight: 'var(--font-weight-bold)', 
              color: 'var(--color-primary)' 
            }}
          >
            {formatCurrency(valorTotal)}
          </span>
        </div>
      </div>
    </div>
  )
}

interface FormCardProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}

const FormCard: React.FC<FormCardProps> = ({ icon, title, subtitle, children }) => (
  <Card>
    <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
      <div
        style={{
          width: '2.5rem',
          height: '2.5rem',
          borderRadius: 'var(--stat-card-icon-radius)',
          background: 'rgba(2, 132, 199, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-primary)',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CardTitle>{title}</CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </div>
    </CardHeader>
    <CardContent style={{ paddingTop: 0 }}>{children}</CardContent>
  </Card>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ServiceOrderFormView: React.FC<ServiceOrderFormViewProps> = ({
  serviceOrder,
  clientes,
  tecnicos,
  equipamentosCliente,
  servicesCatalog = [],
  productsCatalog = [],
  canEditLines = true,
  canEditGeneral = true,
  canEditLaudo = true,
  mode,
  isLoading = false,
  onSave,
  onCancel,
  onGeneratePDF,
  onClienteChange,
  orderId,
  onSuggestSlots,
  linesReadOnly = false,
  canCancelSchedule = false,
  canCancelOrder = false,
  onCancelSchedule,
  onCancelOrder,
  schedulingPanelKey = 'default',
  isCancellingSchedule = false,
  isCancellingOrder = false,
  canCompleteOrder = false,
  onCompleteOrder,
  isCompletingOrder = false,
  financePaymentLabel = null,
  profitabilityBadge = null,
  financeSection = null,
}) => {
  const clientLocked = mode === 'edit' && Boolean(serviceOrder?.id ?? orderId)
  // Form state
  const [formData, setFormData] = useState<ServiceOrderData>(() => {
    const laudo = serviceOrder ? resolveLaudoFieldsFromServiceOrder(serviceOrder) : null
    return {
    clienteId: serviceOrder?.clienteId || '',
    tecnicoId: serviceOrder?.tecnicoId || '',
    status: serviceOrder?.status || 'pendente',
    tipoServico: serviceOrder?.tipoServico || 'corretiva',
    dataAgendamento: serviceOrder?.dataAgendamento || '',
    horaAgendamento: serviceOrder?.horaAgendamento || '',
    horaTermino: serviceOrder?.horaTermino || '',
    pmocPlanId: serviceOrder?.pmocPlanId || '',
    pmocPeriodYear: serviceOrder?.pmocPeriodYear,
    pmocPeriodMonth: serviceOrder?.pmocPeriodMonth,
    pmocEstimatedMinutes: serviceOrder?.pmocEstimatedMinutes,
    pmocBreakdown: serviceOrder?.pmocBreakdown,
    equipamentosIds: serviceOrder?.equipamentosIds || [],
    servicos: serviceOrder?.servicos || [],
    pecas: serviceOrder?.pecas || [],
    descricaoProblema: laudo?.descricaoProblema ?? '',
    diagnosticoTecnico: laudo?.diagnosticoTecnico ?? '',
    checklist: laudo?.checklist ?? DEFAULT_CHECKLIST,
    valorPecas: serviceOrder?.valorPecas || 0,
    valorMaoDeObra: serviceOrder?.valorMaoDeObra || 0,
    descontoTipo: serviceOrder?.descontoTipo ?? 'fixed',
    descontoValor: serviceOrder?.descontoValor ?? 0,
    observacoesInternas: serviceOrder?.observacoesInternas || '',
    clientSignatureBase64: laudo?.clientSignatureBase64 ?? serviceOrder?.clientSignatureBase64 ?? null,
    clientSignatureName: laudo?.clientSignatureName ?? serviceOrder?.clientSignatureName ?? null,
    clientSignatureAt: laudo?.clientSignatureAt ?? serviceOrder?.clientSignatureAt ?? null,
    clientSignatureGeo: laudo?.clientSignatureGeo ?? serviceOrder?.clientSignatureGeo ?? null,
  }})


  const [activeTab, setActiveTab] = useState<'dados' | 'laudo'>('dados')
  const [cancelScheduleOpen, setCancelScheduleOpen] = useState(false)
  const [cancelOrderOpen, setCancelOrderOpen] = useState(false)
  const [completeOrderOpen, setCompleteOrderOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const savedSnapshotRef = useRef('')

  const confirmCancelSchedule = useCallback(async () => {
    if (!onCancelSchedule) return
    setCancelScheduleOpen(false)
    await onCancelSchedule()
  }, [onCancelSchedule])

  const confirmCompleteOrder = useCallback(async () => {
    if (!onCompleteOrder) return
    setCompleteOrderOpen(false)
    await onCompleteOrder()
  }, [onCompleteOrder])

  const confirmCancelOrder = useCallback(async () => {
    if (!onCancelOrder) return
    const reason = cancelReason.trim()
    if (!reason) return
    setCancelOrderOpen(false)
    await onCancelOrder(reason)
    setCancelReason('')
  }, [onCancelOrder, cancelReason])

  useEffect(() => {
    if (!serviceOrder) {
      savedSnapshotRef.current = ''
      return
    }
    const laudoBaseline = resolveLaudoFieldsFromServiceOrder(serviceOrder)
    const baseline: ServiceOrderData = {
      clienteId: serviceOrder.clienteId || '',
      tecnicoId: serviceOrder.tecnicoId || '',
      status: serviceOrder.status || 'pendente',
      tipoServico: serviceOrder.tipoServico || 'corretiva',
      dataAgendamento: serviceOrder.dataAgendamento || '',
      horaAgendamento: serviceOrder.horaAgendamento || '',
      horaTermino: serviceOrder.horaTermino || '',
      pmocPlanId: serviceOrder.pmocPlanId || '',
      pmocPeriodYear: serviceOrder.pmocPeriodYear,
      pmocPeriodMonth: serviceOrder.pmocPeriodMonth,
      pmocEstimatedMinutes: serviceOrder.pmocEstimatedMinutes,
      pmocBreakdown: serviceOrder.pmocBreakdown,
      equipamentosIds: serviceOrder.equipamentosIds || [],
      servicos: serviceOrder.servicos || [],
      pecas: serviceOrder.pecas || [],
      descricaoProblema: laudoBaseline.descricaoProblema,
      diagnosticoTecnico: laudoBaseline.diagnosticoTecnico,
      checklist: laudoBaseline.checklist,
      valorPecas: serviceOrder.valorPecas || 0,
      valorMaoDeObra: serviceOrder.valorMaoDeObra || 0,
      descontoTipo: serviceOrder.descontoTipo ?? 'fixed',
      descontoValor: serviceOrder.descontoValor ?? 0,
      observacoesInternas: serviceOrder.observacoesInternas || '',
      clientSignatureBase64: laudoBaseline.clientSignatureBase64 ?? null,
      clientSignatureName: laudoBaseline.clientSignatureName ?? null,
      clientSignatureAt: laudoBaseline.clientSignatureAt ?? null,
      clientSignatureGeo: laudoBaseline.clientSignatureGeo ?? null,
    }
    savedSnapshotRef.current = serializeServiceOrderFormSnapshot(baseline)
  }, [serviceOrder])

  useEffect(() => {
    if (!serviceOrder) return
    const laudo = resolveLaudoFieldsFromServiceOrder(serviceOrder)
    setFormData({
      clienteId: serviceOrder.clienteId || '',
      tecnicoId: serviceOrder.tecnicoId || '',
      status: serviceOrder.status || 'pendente',
      tipoServico: serviceOrder.tipoServico || 'corretiva',
      dataAgendamento: serviceOrder.dataAgendamento || '',
      horaAgendamento: serviceOrder.horaAgendamento || '',
      horaTermino: serviceOrder.horaTermino || '',
      pmocPlanId: serviceOrder.pmocPlanId || '',
      pmocPeriodYear: serviceOrder.pmocPeriodYear,
      pmocPeriodMonth: serviceOrder.pmocPeriodMonth,
      pmocEstimatedMinutes: serviceOrder.pmocEstimatedMinutes,
      pmocBreakdown: serviceOrder.pmocBreakdown,
      equipamentosIds: serviceOrder.equipamentosIds || [],
      servicos: serviceOrder.servicos || [],
      pecas: serviceOrder.pecas || [],
      descricaoProblema: laudo.descricaoProblema,
      diagnosticoTecnico: laudo.diagnosticoTecnico,
      checklist: laudo.checklist,
      valorPecas: serviceOrder.valorPecas || 0,
      valorMaoDeObra: serviceOrder.valorMaoDeObra || 0,
      descontoTipo: serviceOrder.descontoTipo ?? 'fixed',
      descontoValor: serviceOrder.descontoValor ?? 0,
      observacoesInternas: serviceOrder.observacoesInternas || '',
      clientSignatureBase64: laudo.clientSignatureBase64 ?? null,
      clientSignatureName: laudo.clientSignatureName ?? null,
      clientSignatureAt: laudo.clientSignatureAt ?? null,
      clientSignatureGeo: laudo.clientSignatureGeo ?? null,
    })
  }, [serviceOrder])

  useEffect(() => {
    const labor = computeLaborTotal(formData.servicos)
    const parts = computePartsTotal(formData.pecas)
    setFormData((prev) => {
      if (prev.valorMaoDeObra === labor && prev.valorPecas === parts) return prev
      return { ...prev, valorMaoDeObra: labor, valorPecas: parts }
    })
  }, [formData.servicos, formData.pecas])
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // Handlers
  const updateField = useCallback(<K extends keyof ServiceOrderData>(
    field: K, 
    value: ServiceOrderData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }, [errors])
  
  useEffect(() => {
    if (!formData.clientSignatureBase64 || formData.clientSignatureGeo) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          clientSignatureGeo: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
        }))
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [formData.clientSignatureBase64, formData.clientSignatureGeo])
  
  const handleClienteChange = useCallback((clienteId: string) => {
    updateField('clienteId', clienteId)
    updateField('equipamentosIds', [])
    onClienteChange?.(clienteId)
  }, [updateField, onClienteChange])
  
  const toggleEquipamento = useCallback((id: string) => {
    setFormData((prev) => {
      const isSelecting = !prev.equipamentosIds.includes(id);
      const equipamentosIds = isSelecting
        ? [...prev.equipamentosIds, id]
        : prev.equipamentosIds.filter((e) => e !== id);
      let servicos = prev.servicos;
      if (prev.servicos.length === 1) {
        servicos = toggleServiceOnEquipment(prev.servicos, id, prev.servicos[0].localId, isSelecting);
      }
      return { ...prev, equipamentosIds, servicos };
    });
  }, []);
  
  const handleChecklistChange = useCallback((checklist: ChecklistItem[]) => {
    setFormData((prev) => ({ ...prev, checklist }))
  }, [])
  
  const initialStatus = serviceOrder?.status ?? 'pendente'

  // Validation
  const validate = useCallback((): Record<string, string> => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.clienteId) newErrors.clienteId = 'Selecione um cliente'
    const schedulingRequired =
      canEditGeneral &&
      formData.servicos.length > 0 &&
      !['concluida', 'cancelada'].includes(formData.status)
    if (schedulingRequired && !formData.tecnicoId) newErrors.tecnicoId = 'Selecione um técnico'
    if (schedulingRequired && !formData.dataAgendamento) newErrors.dataAgendamento = 'Informe a data'
    if (schedulingRequired && !formData.horaAgendamento) newErrors.horaAgendamento = 'Informe a hora'
    if (formData.servicos.length === 0) newErrors.servicos = 'Adicione ao menos um serviço'

    const completingNow = formData.status === 'concluida' && initialStatus !== 'concluida'
    if (completingNow && canEditLaudo) {
      if (!formData.clientSignatureName?.trim()) {
        newErrors.clientSignatureName = 'Informe o nome do cliente signatário'
      }
      if (!formData.clientSignatureBase64) {
        newErrors.clientSignature = 'A assinatura do cliente é obrigatória para concluir a OS'
      }
    }

    if (initialStatus !== 'concluida') {
      const missingFailureNotes = formData.checklist.filter(
        (item) => item.status === 'nao' && !item.observacao?.trim(),
      )
      if (missingFailureNotes.length > 0) {
        newErrors.checklist = 'Informe a descrição da falha para todos os itens reprovados'
      }
    }
    
    setErrors(newErrors)
    return newErrors
  }, [formData, canEditGeneral, canEditLaudo, initialStatus])
  
  const handleSubmit = useCallback(async () => {
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      console.warn("[ServiceOrderFormView] validação falhou", validationErrors);
      const firstMessage =
        validationErrors.servicos ??
        validationErrors.tecnicoId ??
        validationErrors.dataAgendamento ??
        validationErrors.horaAgendamento ??
        validationErrors.clientSignature ??
        validationErrors.clientSignatureName ??
        validationErrors.checklist ??
        validationErrors.clienteId ??
        'Corrija os campos destacados antes de salvar.'
      toast.error(firstMessage)
      if (
        validationErrors.clientSignature ||
        validationErrors.clientSignatureName ||
        validationErrors.checklist
      ) {
        setActiveTab('laudo')
      }
      return;
    }
    try {
      await onSave(formData);
    } catch (e) {
      console.error("[ServiceOrderFormView] onSave rejeitou", e);
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar ordem de serviço.');
    }
  }, [validate, onSave, formData])
  
  // Computed values
  const canGeneratePDF = mode === 'edit' && formData.status === 'concluida' && serviceOrder?.id
  
  const estimatedMinutes = useMemo(() => {
    if ((formData.pmocEstimatedMinutes ?? 0) > 0) {
      return formData.pmocEstimatedMinutes!;
    }
    return computeEstimatedMinutesFromLines(formData.servicos, servicesCatalog);
  }, [formData.pmocEstimatedMinutes, formData.servicos, servicesCatalog]);

  const schedulingEnabled = formData.servicos.length > 0 || (formData.pmocEstimatedMinutes ?? 0) > 0;

  const pmocDurationHint =
    formData.pmocPlanId && (formData.pmocEstimatedMinutes ?? 0) > 0
      ? `⏱ Tempo estimado com base nos serviços do cronograma para este mês: ${formatDurationMinutes(formData.pmocEstimatedMinutes!)}.`
      : undefined;

  const handlePmocApply = useCallback((payload: PmocScheduleOsApplyPayload) => {
    setFormData((prev) => ({
      ...prev,
      pmocPlanId: payload.pmocPlanId,
      pmocPeriodYear: payload.pmocPeriodYear,
      pmocPeriodMonth: payload.pmocPeriodMonth,
      pmocEstimatedMinutes: payload.pmocEstimatedMinutes,
      pmocBreakdown: payload.pmocBreakdown,
      servicos: payload.servicos,
      checklist: payload.checklist,
      descricaoProblema: payload.descricaoProblema || prev.descricaoProblema,
      equipamentosIds: payload.equipamentosIds.length ? payload.equipamentosIds : prev.equipamentosIds,
    }));
  }, []);

  const handlePmocClear = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      pmocPlanId: '',
      pmocPeriodYear: undefined,
      pmocPeriodMonth: undefined,
      pmocEstimatedMinutes: undefined,
      pmocBreakdown: undefined,
      horaTermino: '',
    }));
  }, []);

  useEffect(() => {
    if (!formData.horaAgendamento || estimatedMinutes < 1) return;
    const end = addMinutesToTimeString(formData.horaAgendamento, estimatedMinutes);
    if (!end) return;
    setFormData((prev) => (prev.horaTermino === end ? prev : { ...prev, horaTermino: end }));
  }, [formData.horaAgendamento, estimatedMinutes]);

  const isDirty = useMemo(() => {
    if (mode === 'create') {
      return serializeServiceOrderFormSnapshot(formData) !== serializeServiceOrderFormSnapshot({
        clienteId: '',
        tecnicoId: '',
        status: 'pendente',
        tipoServico: 'corretiva',
        dataAgendamento: '',
        horaAgendamento: '',
        equipamentosIds: [],
        servicos: [],
        pecas: [],
        descricaoProblema: '',
        diagnosticoTecnico: '',
        checklist: DEFAULT_CHECKLIST,
        valorPecas: 0,
        valorMaoDeObra: 0,
        descontoTipo: 'fixed',
        descontoValor: 0,
        observacoesInternas: '',
      })
    }
    return serializeServiceOrderFormSnapshot(formData) !== savedSnapshotRef.current
  }, [formData, mode])

  const showSaveButton = mode === 'create' ? isDirty : isDirty

  const handleSuggestSlots = useCallback(
    async (params: { orderId?: number; durationMinutes: number; technicianId?: number }) => {
      if (!onSuggestSlots) return []
      return onSuggestSlots(params)
    },
    [onSuggestSlots],
  )

  const statusOptions: SelectOption[] = [
    { value: 'pendente', label: 'Pendente' },
    { value: 'agendada', label: 'Agendada' },
    { value: 'em_andamento', label: 'Em Andamento' },
    { value: 'concluida', label: 'Concluída' },
    { value: 'cancelada', label: 'Cancelada' },
  ]
  
  const tipoServicoOptions: SelectOption[] = [
    { value: 'preventiva', label: 'Preventiva (PMOC)' },
    { value: 'corretiva', label: 'Corretiva' },
    { value: 'instalacao', label: 'Instalação' },
  ]

  return (
    <div 
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-surface)',
        paddingBottom: '6rem', // Space for floating buttons
      }}
    >
      {/* Header */}
      <div 
        style={{
          backgroundColor: 'var(--color-surface-elevated)',
          borderBottom: '1px solid var(--color-border)',
          padding: 'var(--space-5) var(--space-6)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 
                style={{
                  fontSize: 'var(--font-size-2xl)',
                  fontWeight: 'var(--font-weight-bold)',
                  color: 'var(--color-text)',
                  margin: 0,
                }}
              >
                {mode === 'create' ? 'Nova Ordem de Serviço' : `OS #${serviceOrder?.numero}`}
              </h1>
              {mode === 'edit' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--space-1)',
                      padding: `0 var(--badge-padding-x)`,
                      height: 'var(--badge-height)',
                      fontSize: 'var(--badge-font-size)',
                      fontWeight: 'var(--font-weight-medium)',
                      color: STATUS_CONFIG[formData.status].color,
                      backgroundColor: STATUS_CONFIG[formData.status].bg,
                      borderRadius: 'var(--badge-radius)',
                    }}
                  >
                    {STATUS_CONFIG[formData.status].label}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {SERVICE_TYPE_CONFIG[formData.tipoServico].label}
                  </span>
                  {financePaymentLabel ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: `0 var(--badge-padding-x)`,
                        height: 'var(--badge-height)',
                        fontSize: 'var(--badge-font-size)',
                        fontWeight: 'var(--font-weight-medium)',
                        color:
                          financePaymentLabel === 'Pago'
                            ? 'var(--color-success, #15803d)'
                            : financePaymentLabel === 'Parcial'
                              ? 'var(--color-warning, #b45309)'
                              : 'var(--color-text-muted, #64748b)',
                        backgroundColor:
                          financePaymentLabel === 'Pago'
                            ? 'rgba(21, 128, 61, 0.1)'
                            : financePaymentLabel === 'Parcial'
                              ? 'rgba(180, 83, 9, 0.12)'
                              : 'rgba(100, 116, 139, 0.12)',
                        borderRadius: 'var(--badge-radius)',
                      }}
                    >
                      Financeiro: {financePaymentLabel}
                    </span>
                  ) : null}
                  {profitabilityBadge}
                  {financePaymentLabel === 'Pago' && formData.status === 'concluida' ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: `0 var(--badge-padding-x)`,
                        height: 'var(--badge-height)',
                        fontSize: 'var(--badge-font-size)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--color-success, #15803d)',
                        backgroundColor: 'rgba(21, 128, 61, 0.1)',
                        borderRadius: 'var(--badge-radius)',
                      }}
                    >
                      Recebida
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Form Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-6)' }}>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'dados' | 'laudo')}>
          <TabsList>
            <TabsTrigger value="dados">Dados Gerais</TabsTrigger>
            <TabsTrigger value="laudo">Laudo e Checklist</TabsTrigger>
          </TabsList>

          <TabsContent value="dados">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <FormCard
            icon={<Icons.User style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />}
            title="Cliente"
            subtitle="Cliente vinculado à ordem de serviço"
          >
            <div style={{ maxWidth: '480px' }}>
              <FormField label="Cliente" required error={errors.clienteId}>
                <ClientCombobox
                  id="os-cliente"
                  clientes={clientes}
                  value={formData.clienteId}
                  onChange={handleClienteChange}
                  placeholder="Selecione o cliente"
                  searchPlaceholder="Pesquisar cliente..."
                  error={!!errors.clienteId}
                  disabled={!canEditGeneral || clientLocked}
                />
              </FormField>
              {clientLocked ? (
                <p style={{ margin: '0.5rem 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  O cliente não pode ser alterado após a OS ser salva.
                </p>
              ) : null}
            </div>
          </FormCard>

          {errors.servicos ? (
            <p style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-sm)', margin: 0 }}>{errors.servicos}</p>
          ) : null}

          <ServiceOrderLineSections
            servicos={formData.servicos}
            pecas={formData.pecas}
            onServicosChange={(servicos) => setFormData((prev) => ({ ...prev, servicos }))}
            onPecasChange={(pecas) => setFormData((prev) => ({ ...prev, pecas }))}
            servicesCatalog={servicesCatalog}
            productsCatalog={productsCatalog}
            canEditLines={canEditLines}
            readOnly={linesReadOnly}
            equipamentosCliente={equipamentosCliente}
            equipamentosIds={formData.equipamentosIds}
          />
          
          <FormCard
            icon={<Icons.Snowflake style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />}
            title="Equipamentos"
            subtitle="Selecione os aparelhos que farão parte desta OS"
          >
            {!formData.clienteId ? (
              <div 
                style={{
                  textAlign: 'center',
                  padding: 'var(--space-10)',
                  color: 'var(--color-text-muted)',
                }}
              >
                <Icons.Building style={{ width: 'var(--icon-size-2xl)', height: 'var(--icon-size-2xl)', marginBottom: 'var(--space-3)' }} />
                <p style={{ margin: 0, fontSize: 'var(--font-size-base)' }}>
                  Selecione um cliente para visualizar os equipamentos
                </p>
              </div>
            ) : equipamentosCliente.length === 0 ? (
              <div 
                style={{
                  textAlign: 'center',
                  padding: 'var(--space-10)',
                  color: 'var(--color-text-muted)',
                }}
              >
                <Icons.Snowflake style={{ width: 'var(--icon-size-2xl)', height: 'var(--icon-size-2xl)', marginBottom: 'var(--space-3)' }} />
                <p style={{ margin: 0, fontSize: 'var(--font-size-base)' }}>
                  Nenhum equipamento cadastrado para este cliente
                </p>
              </div>
            ) : (
              <>
                <div 
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: 'var(--space-4)',
                  }}
                >
                  {equipamentosCliente.map((equip) => (
                    <EquipmentCard
                      key={equip.id}
                      equipamento={equip}
                      selected={formData.equipamentosIds.includes(equip.id)}
                      onToggle={() => (canEditGeneral || canEditLines) && toggleEquipamento(equip.id)}
                    />
                  ))}
                </div>
                <p 
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-muted)',
                    marginTop: 'var(--space-4)',
                  }}
                >
                  {formData.equipamentosIds.length} equipamento(s) selecionado(s)
                </p>
              </>
            )}
          </FormCard>

          {formData.tipoServico === 'preventiva' && canEditGeneral ? (
            <PmocScheduleOsSection
              clientId={formData.clienteId}
              dataAgendamento={formData.dataAgendamento}
              pmocPlanId={formData.pmocPlanId ?? ''}
              pmocPeriodYear={formData.pmocPeriodYear}
              pmocPeriodMonth={formData.pmocPeriodMonth}
              servicesCatalog={servicesCatalog}
              disabled={!formData.clienteId}
              onPlanChange={(planId) => {
                if (!planId) {
                  handlePmocClear();
                  updateField('pmocPlanId', '');
                  return;
                }
                updateField('pmocPlanId', planId);
              }}
              onApply={handlePmocApply}
              onClear={handlePmocClear}
            />
          ) : null}

          <ServiceOrderSchedulingPanel
              key={schedulingPanelKey}
              tecnicoId={formData.tecnicoId}
              dataAgendamento={formData.dataAgendamento}
              horaAgendamento={formData.horaAgendamento}
              horaTermino={formData.horaTermino ?? ''}
              onTecnicoChange={(v) => updateField('tecnicoId', v)}
              onDataChange={(v) => updateField('dataAgendamento', v)}
              onHoraChange={(v) => updateField('horaAgendamento', v)}
              tecnicos={tecnicos}
              estimatedMinutes={estimatedMinutes}
              pmocDurationHint={pmocDurationHint}
              schedulingEnabled={schedulingEnabled}
              canEditScheduling={canEditGeneral}
              orderId={orderId}
              onSuggestSlots={handleSuggestSlots}
              errors={{
                tecnicoId: errors.tecnicoId,
                dataAgendamento: errors.dataAgendamento,
                horaAgendamento: errors.horaAgendamento,
              }}
            />

          <FormCard
            icon={<Icons.Clipboard style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />}
            title="Status e tipo"
            subtitle="Situação da OS e classificação do serviço"
          >
            {canCompleteOrder ? (
              <p
                style={{
                  margin: '0 0 var(--space-4)',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--input-radius)',
                  backgroundColor: 'color-mix(in srgb, var(--color-success, #16a34a) 10%, transparent)',
                  fontSize: 'var(--font-size-sm)',
                  lineHeight: 1.45,
                  color: 'var(--color-text)',
                }}
              >
                O serviço já foi executado mas a OS continua aberta? Use o botão{' '}
                <strong>Concluir OS</strong> no rodapé para registrar a conclusão e atualizar a gestão preventiva.
              </p>
            ) : null}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 'var(--form-grid-column-gap)',
              }}
            >
              <FormField label="Status">
                <Select
                  options={statusOptions}
                  value={formData.status}
                  onChange={(v) => updateField('status', v as ServiceOrderStatus)}
                  disabled={!canEditGeneral}
                />
              </FormField>
              <FormField label="Tipo de Serviço">
                <Select
                  options={tipoServicoOptions}
                  value={formData.tipoServico}
                  onChange={(v) => {
                    const tipo = v as ServiceType
                    if (tipo !== 'preventiva') handlePmocClear()
                    updateField('tipoServico', tipo)
                  }}
                  disabled={!canEditGeneral}
                />
              </FormField>
            </div>
          </FormCard>

          <FormCard
            icon={<Icons.DollarSign style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />}
            title="Fechamento e Valores"
            subtitle="Desconto, totais e observações internas"
          >
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--space-6)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--form-field-gap-loose)' }}>
                <FormField label="Valor das Peças" hint="Calculado automaticamente a partir das peças/insumos">
                  <Input
                    type="text"
                    value={formatCurrency(formData.valorPecas)}
                    readOnly
                    disabled
                    icon={<Icons.DollarSign style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
                  />
                </FormField>
                
                <FormField label="Valor da Mão de Obra" hint="Calculado automaticamente a partir dos serviços">
                  <Input
                    type="text"
                    value={formatCurrency(formData.valorMaoDeObra)}
                    readOnly
                    disabled
                    icon={<Icons.DollarSign style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
                  />
                </FormField>

                <FormField
                  label="Desconto"
                  hint={
                    formData.descontoTipo === 'percent'
                      ? 'Percentual sobre o subtotal (mão de obra + peças)'
                      : 'Valor fixo em reais descontado do subtotal'
                  }
                >
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'stretch' }}>
                    <select
                      value={formData.descontoTipo ?? 'fixed'}
                      onChange={(e) =>
                        updateField('descontoTipo', e.target.value as DiscountType)
                      }
                      disabled={linesReadOnly && !canEditGeneral}
                      style={{
                        width: '4.25rem',
                        height: 'var(--input-height)',
                        padding: '0 var(--input-padding-x)',
                        fontSize: 'var(--font-size-base)',
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        backgroundColor: 'var(--input-bg)',
                        border: 'var(--input-border)',
                        borderRadius: 'var(--input-radius)',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="fixed">R$</option>
                      <option value="percent">%</option>
                    </select>
                    <Input
                      type="number"
                      min={0}
                      max={formData.descontoTipo === 'percent' ? 100 : undefined}
                      step={formData.descontoTipo === 'percent' ? 0.1 : 0.01}
                      value={formData.descontoValor ?? 0}
                      onChange={(e) =>
                        updateField('descontoValor', Math.max(0, Number(e.target.value) || 0))
                      }
                      disabled={linesReadOnly && !canEditGeneral}
                      placeholder={formData.descontoTipo === 'percent' ? '0' : '0,00'}
                    />
                  </div>
                </FormField>
                
                <FormField label="Observações Internas" hint="Notas internas (não aparecem no relatório)">
                  <Textarea
                    value={formData.observacoesInternas || ''}
                    onChange={(e) => updateField('observacoesInternas', e.target.value)}
                    placeholder="Observações internas da equipe..."
                    rows={3}
                  />
                </FormField>
              </div>
              
              <div>
                <p 
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-medium)',
                    color: 'var(--color-text)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  Resumo dos Valores
                </p>
                <ValueSummary
                  valorPecas={formData.valorPecas}
                  valorMaoDeObra={formData.valorMaoDeObra}
                  descontoTipo={formData.descontoTipo ?? 'fixed'}
                  descontoValor={formData.descontoValor ?? 0}
                />
              </div>
            </div>
          </FormCard>

          {formData.status === 'concluida' && financeSection ? financeSection : null}
            </div>
          </TabsContent>

          <TabsContent value="laudo">
            {canEditLaudo ? (
              <FormCard
                icon={<Icons.FileText style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />}
                title="Laudo Técnico e Checklist"
                subtitle="Documentação do serviço executado (PMOC)"
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 'var(--form-grid-column-gap)',
                    }}
                  >
                    <FormField label="Descrição do Problema / Solicitação">
                      <Textarea
                        value={formData.descricaoProblema}
                        onChange={(e) => updateField('descricaoProblema', e.target.value)}
                        placeholder="Descreva o problema relatado pelo cliente ou a solicitação de serviço..."
                        rows={5}
                      />
                    </FormField>
                    <FormField label="Diagnóstico Técnico / Parecer">
                      <Textarea
                        value={formData.diagnosticoTecnico}
                        onChange={(e) => updateField('diagnosticoTecnico', e.target.value)}
                        placeholder="Descreva o diagnóstico, procedimentos realizados e observações técnicas..."
                        rows={5}
                      />
                    </FormField>
                  </div>
                  <div>
                    <h4
                      style={{
                        fontSize: 'var(--font-size-md)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--color-text)',
                        marginBottom: 'var(--space-4)',
                      }}
                    >
                      Checklist de Verificação
                    </h4>
                    <ServiceOrderChecklist
                      items={formData.checklist}
                      onChange={handleChecklistChange}
                      pmocPlanId={formData.pmocPlanId}
                      orderId={orderId}
                      equipmentIds={formData.equipamentosIds}
                      error={errors.checklist}
                    />
                  </div>

                  {(formData.status === 'em_andamento' || formData.status === 'concluida') ? (
                    <div>
                      <h4
                        style={{
                          fontSize: 'var(--font-size-md)',
                          fontWeight: 'var(--font-weight-medium)',
                          color: 'var(--color-text)',
                          marginBottom: 'var(--space-4)',
                        }}
                      >
                        Assinatura digital do cliente
                      </h4>
                      <FormField
                        label="Nome do signatário"
                        required={formData.status === 'concluida'}
                        error={errors.clientSignatureName}
                      >
                        <Input
                          value={formData.clientSignatureName ?? ''}
                          onChange={(e) => updateField('clientSignatureName', e.target.value)}
                          placeholder="Nome completo do cliente"
                        />
                      </FormField>
                      <div style={{ marginTop: 'var(--space-4)' }}>
                        <SignaturePad
                          onChange={(dataUrl) => {
                            updateField('clientSignatureBase64', dataUrl)
                            if (dataUrl && !formData.clientSignatureAt) {
                              updateField('clientSignatureAt', new Date().toISOString())
                            }
                          }}
                        />
                        {errors.clientSignature ? (
                          <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-error)' }}>
                            {errors.clientSignature}
                          </p>
                        ) : null}
                        {formData.clientSignatureGeo ? (
                          <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                            Geolocalização capturada: {formData.clientSignatureGeo.lat.toFixed(5)}, {formData.clientSignatureGeo.lng.toFixed(5)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </FormCard>
            ) : (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                Você não tem permissão para editar o laudo desta ordem de serviço.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Floating Action Buttons */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'var(--color-surface-elevated)',
          borderTop: '1px solid var(--color-border)',
          padding: 'var(--space-4) var(--space-6)',
          zIndex: 50,
          boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div 
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 'var(--space-3)',
          }}
        >
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading || isCancellingSchedule || isCancellingOrder}
            icon={<Icons.X style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
          >
            Voltar
          </Button>

          {canCancelSchedule && onCancelSchedule ? (
            <Button
              variant="secondary"
              onClick={() => setCancelScheduleOpen(true)}
              loading={isCancellingSchedule}
              disabled={isLoading || isCancellingOrder}
              style={{
                borderColor: 'color-mix(in srgb, var(--color-warning) 55%, var(--color-border))',
                color: 'var(--color-warning)',
                backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, var(--color-surface-elevated))',
              }}
            >
              Cancelar Agendamento
            </Button>
          ) : null}

          {canCancelOrder && onCancelOrder ? (
            <Button
              variant="danger"
              onClick={() => {
                setCancelReason('')
                setCancelOrderOpen(true)
              }}
              loading={isCancellingOrder}
              disabled={isLoading || isCancellingSchedule || isCompletingOrder}
            >
              Cancelar OS
            </Button>
          ) : null}

          {canCompleteOrder && onCompleteOrder ? (
            <Button
              variant="primary"
              onClick={() => setCompleteOrderOpen(true)}
              loading={isCompletingOrder}
              disabled={isLoading || isCancellingSchedule || isCancellingOrder}
              icon={<Icons.Check style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
              style={{
                backgroundColor: 'var(--color-success, #16a34a)',
              }}
            >
              Concluir OS
            </Button>
          ) : null}

            {canGeneratePDF && onGeneratePDF && (
              <Button
                variant="secondary"
                onClick={() => onGeneratePDF(serviceOrder!.id!)}
                disabled={isLoading || isCancellingSchedule || isCancellingOrder}
                icon={<Icons.Download style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
              >
                Gerar PDF/Laudo
              </Button>
            )}

            {showSaveButton ? (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isLoading}
              disabled={isCancellingSchedule || isCancellingOrder}
              icon={<Icons.Save style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
            >
              {mode === 'create' ? 'Criar Ordem de Serviço' : 'Salvar Alterações'}
            </Button>
            ) : null}
        </div>
      </div>
      
      <AlertDialog open={cancelScheduleOpen} onOpenChange={setCancelScheduleOpen}>
        <AlertDialogContent labelledBy="os-cancel-schedule-title" describedBy="os-cancel-schedule-desc">
          <AlertDialogHeader>
            <AlertDialogTitle id="os-cancel-schedule-title">Cancelar Agendamento da Visita?</AlertDialogTitle>
            <AlertDialogDescription id="os-cancel-schedule-desc">
              Esta ação removerá o técnico e o horário reservado na agenda, voltando o status da OS para
              Pendente/Aprovada. Você poderá agendar uma nova data a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelScheduleOpen(false)} disabled={isCancellingSchedule}>
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="warning"
              disabled={isCancellingSchedule}
              onClick={() => void confirmCancelSchedule()}
            >
              {isCancellingSchedule ? 'Cancelando…' : 'Confirmar Cancelamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelOrderOpen}
        onOpenChange={(open) => {
          setCancelOrderOpen(open)
          if (!open) setCancelReason('')
        }}
      >
        <AlertDialogContent wide labelledBy="os-cancel-order-title" describedBy="os-cancel-order-desc">
          <AlertDialogHeader>
            <AlertDialogTitle id="os-cancel-order-title">
              Tem certeza que deseja cancelar esta Ordem de Serviço?
            </AlertDialogTitle>
            <AlertDialogDescription id="os-cancel-order-desc">
              Esta ação é irreversível. A OS será marcada como Cancelada, o agendamento será excluído e os itens
              financeiros serão travados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogTextarea
              id="os-cancel-reason"
              label="Motivo do Cancelamento"
              value={cancelReason}
              onChange={setCancelReason}
              placeholder="Descreva o motivo do cancelamento…"
              disabled={isCancellingOrder}
            />
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setCancelOrderOpen(false)
                setCancelReason('')
              }}
              disabled={isCancellingOrder}
            >
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isCancellingOrder || !cancelReason.trim()}
              onClick={() => void confirmCancelOrder()}
            >
              {isCancellingOrder ? 'Cancelando…' : 'Sim, Cancelar OS'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={completeOrderOpen} onOpenChange={setCompleteOrderOpen}>
        <AlertDialogContent labelledBy="os-complete-order-title" describedBy="os-complete-order-desc">
          <AlertDialogHeader>
            <AlertDialogTitle id="os-complete-order-title">Concluir ordem de serviço?</AlertDialogTitle>
            <AlertDialogDescription id="os-complete-order-desc">
              Use esta opção quando o serviço já foi realizado mas o técnico não finalizou a OS. A conclusão
              registra a manutenção, atualiza prazos da gestão preventiva e consome estoque reservado — sem
              exigir assinatura do cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCompleteOrderOpen(false)} disabled={isCompletingOrder}>
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isCompletingOrder}
              onClick={() => void confirmCompleteOrder()}
            >
              {isCompletingOrder ? 'Concluindo…' : 'Sim, concluir OS'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Keyframes for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default ServiceOrderFormView
