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

import React, { useState, useMemo, useCallback } from 'react'

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

export interface ServiceOrderData {
  id?: string
  numero?: string
  clienteId: string
  tecnicoId: string
  status: ServiceOrderStatus
  tipoServico: ServiceType
  dataAgendamento: string
  horaAgendamento: string
  equipamentosIds: string[]
  descricaoProblema: string
  diagnosticoTecnico: string
  checklist: ChecklistItem[]
  valorPecas: number
  valorMaoDeObra: number
  observacoesInternas?: string
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
  /** Modo do formulário */
  mode: 'create' | 'edit'
  /** Loading state */
  isLoading?: boolean
  /** Callback ao salvar */
  onSave: (data: ServiceOrderData) => void
  /** Callback ao cancelar */
  onCancel: () => void
  /** Callback para gerar PDF (apenas se concluída) */
  onGeneratePDF?: (osId: string) => void
  /** Callback quando cliente muda (para buscar equipamentos) */
  onClienteChange?: (clienteId: string) => void
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
// SECTION HEADER
// ============================================================================

interface SectionHeaderProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, subtitle }) => (
  <div 
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      marginBottom: 'var(--space-5)',
      paddingBottom: 'var(--space-3)',
      borderBottom: '1px solid var(--color-border)',
    }}
  >
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
      }}
    >
      {icon}
    </div>
    <div>
      <h3 
        style={{
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text)',
          margin: 0,
        }}
      >
        {title}
      </h3>
      {subtitle && (
        <p 
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            margin: 0,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  </div>
)

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
// THREE-WAY SWITCH (SIM / NÃO / N/A)
// ============================================================================

interface ThreeWaySwitchProps {
  value: ChecklistItemStatus
  onChange: (value: ChecklistItemStatus) => void
  disabled?: boolean
}

const ThreeWaySwitch: React.FC<ThreeWaySwitchProps> = ({ value, onChange, disabled }) => {
  const options: { value: ChecklistItemStatus; label: string }[] = [
    { value: 'sim', label: 'Sim' },
    { value: 'nao', label: 'Não' },
    { value: 'na', label: 'N/A' },
  ]
  
  return (
    <div 
      style={{
        display: 'flex',
        gap: '2px',
        padding: '2px',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--btn-radius)',
        border: '1px solid var(--color-border)',
      }}
    >
      {options.map((opt) => {
        const isActive = value === opt.value
        let bgColor = 'transparent'
        let textColor = 'var(--color-text-muted)'
        
        if (isActive) {
          if (opt.value === 'sim') {
            bgColor = 'var(--color-success)'
            textColor = 'white'
          } else if (opt.value === 'nao') {
            bgColor = 'var(--color-error)'
            textColor = 'white'
          } else {
            bgColor = 'var(--color-text-subtle)'
            textColor = 'white'
          }
        }
        
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-medium)',
              color: textColor,
              backgroundColor: bgColor,
              border: 'none',
              borderRadius: 'calc(var(--btn-radius) - 2px)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {opt.label}
          </button>
        )
      })}
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
// CHECKLIST ITEM ROW
// ============================================================================

interface ChecklistItemRowProps {
  item: ChecklistItem
  onChange: (item: ChecklistItem) => void
}

const ChecklistItemRow: React.FC<ChecklistItemRowProps> = ({ item, onChange }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: 'var(--color-surface-elevated)',
        borderRadius: 'var(--input-radius)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span 
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text)',
          flex: 1,
        }}
      >
        {item.descricao}
      </span>
      
      <ThreeWaySwitch
        value={item.status}
        onChange={(status) => onChange({ ...item, status })}
      />
    </div>
  )
}

// ============================================================================
// VALUE SUMMARY CARD
// ============================================================================

interface ValueSummaryProps {
  valorPecas: number
  valorMaoDeObra: number
}

const ValueSummary: React.FC<ValueSummaryProps> = ({ valorPecas, valorMaoDeObra }) => {
  const valorTotal = valorPecas + valorMaoDeObra
  
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
              color: 'var(--color-text)' 
            }}
          >
            Total
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ServiceOrderFormView: React.FC<ServiceOrderFormViewProps> = ({
  serviceOrder,
  clientes,
  tecnicos,
  equipamentosCliente,
  mode,
  isLoading = false,
  onSave,
  onCancel,
  onGeneratePDF,
  onClienteChange,
}) => {
  // Form state
  const [formData, setFormData] = useState<ServiceOrderData>(() => ({
    clienteId: serviceOrder?.clienteId || '',
    tecnicoId: serviceOrder?.tecnicoId || '',
    status: serviceOrder?.status || 'pendente',
    tipoServico: serviceOrder?.tipoServico || 'corretiva',
    dataAgendamento: serviceOrder?.dataAgendamento || '',
    horaAgendamento: serviceOrder?.horaAgendamento || '',
    equipamentosIds: serviceOrder?.equipamentosIds || [],
    descricaoProblema: serviceOrder?.descricaoProblema || '',
    diagnosticoTecnico: serviceOrder?.diagnosticoTecnico || '',
    checklist: serviceOrder?.checklist || DEFAULT_CHECKLIST,
    valorPecas: serviceOrder?.valorPecas || 0,
    valorMaoDeObra: serviceOrder?.valorMaoDeObra || 0,
    observacoesInternas: serviceOrder?.observacoesInternas || '',
  }))
  
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
  
  const handleClienteChange = useCallback((clienteId: string) => {
    updateField('clienteId', clienteId)
    updateField('equipamentosIds', [])
    onClienteChange?.(clienteId)
  }, [updateField, onClienteChange])
  
  const toggleEquipamento = useCallback((id: string) => {
    setFormData(prev => ({
      ...prev,
      equipamentosIds: prev.equipamentosIds.includes(id)
        ? prev.equipamentosIds.filter(e => e !== id)
        : [...prev.equipamentosIds, id]
    }))
  }, [])
  
  const updateChecklistItem = useCallback((updatedItem: ChecklistItem) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      )
    }))
  }, [])
  
  const handleCurrencyInput = useCallback((field: 'valorPecas' | 'valorMaoDeObra', value: string) => {
    const numValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
    updateField(field, numValue)
  }, [updateField])
  
  // Validation
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.clienteId) newErrors.clienteId = 'Selecione um cliente'
    if (!formData.tecnicoId) newErrors.tecnicoId = 'Selecione um técnico'
    if (!formData.dataAgendamento) newErrors.dataAgendamento = 'Informe a data'
    if (!formData.horaAgendamento) newErrors.horaAgendamento = 'Informe a hora'
    if (formData.equipamentosIds.length === 0) newErrors.equipamentos = 'Selecione ao menos um equipamento'
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])
  
  const handleSubmit = useCallback(() => {
    if (validate()) {
      onSave(formData)
    }
  }, [validate, onSave, formData])
  
  // Computed values
  const canGeneratePDF = mode === 'edit' && formData.status === 'concluida' && serviceOrder?.id
  
  const clienteOptions = useMemo(() => 
    clientes.map(c => ({ value: c.id, label: `${c.nome} - ${c.documento}` })),
    [clientes]
  )
  
  const tecnicoOptions = useMemo(() => 
    tecnicos.map(t => ({ value: t.id, label: t.nome })),
    [tecnicos]
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Form Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-6)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          
          {/* Section 1: Informações Gerais */}
          <section
            style={{
              backgroundColor: 'var(--color-surface-elevated)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--card-padding-lg)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <SectionHeader
              icon={<Icons.Clipboard style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />}
              title="Informações Gerais"
              subtitle="Dados básicos da ordem de serviço"
            />
            
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--form-grid-column-gap)',
                rowGap: 'var(--form-field-gap-loose)',
              }}
            >
              <FormField label="Cliente" required error={errors.clienteId}>
                <Select
                  options={clienteOptions}
                  value={formData.clienteId}
                  onChange={handleClienteChange}
                  placeholder="Selecione o cliente"
                  error={!!errors.clienteId}
                />
              </FormField>
              
              <FormField label="Técnico Responsável" required error={errors.tecnicoId}>
                <Select
                  options={tecnicoOptions}
                  value={formData.tecnicoId}
                  onChange={(v) => updateField('tecnicoId', v)}
                  placeholder="Selecione o técnico"
                  error={!!errors.tecnicoId}
                />
              </FormField>
              
              <FormField label="Data do Agendamento" required error={errors.dataAgendamento}>
                <Input
                  type="date"
                  value={formData.dataAgendamento}
                  onChange={(e) => updateField('dataAgendamento', e.target.value)}
                  icon={<Icons.Calendar style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
                  error={!!errors.dataAgendamento}
                />
              </FormField>
              
              <FormField label="Hora do Agendamento" required error={errors.horaAgendamento}>
                <Input
                  type="time"
                  value={formData.horaAgendamento}
                  onChange={(e) => updateField('horaAgendamento', e.target.value)}
                  icon={<Icons.Clock style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
                  error={!!errors.horaAgendamento}
                />
              </FormField>
              
              <FormField label="Status">
                <Select
                  options={statusOptions}
                  value={formData.status}
                  onChange={(v) => updateField('status', v as ServiceOrderStatus)}
                />
              </FormField>
              
              <FormField label="Tipo de Serviço">
                <Select
                  options={tipoServicoOptions}
                  value={formData.tipoServico}
                  onChange={(v) => updateField('tipoServico', v as ServiceType)}
                />
              </FormField>
            </div>
          </section>
          
          {/* Section 2: Equipamentos */}
          <section
            style={{
              backgroundColor: 'var(--color-surface-elevated)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--card-padding-lg)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <SectionHeader
              icon={<Icons.Snowflake style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />}
              title="Equipamentos"
              subtitle="Selecione os aparelhos que farão parte desta OS"
            />
            
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
                {errors.equipamentos && (
                  <p style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
                    {errors.equipamentos}
                  </p>
                )}
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
                      onToggle={() => toggleEquipamento(equip.id)}
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
          </section>
          
          {/* Section 3: Laudo Técnico e Checklist */}
          <section
            style={{
              backgroundColor: 'var(--color-surface-elevated)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--card-padding-lg)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <SectionHeader
              icon={<Icons.FileText style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />}
              title="Laudo Técnico e Checklist"
              subtitle="Documentação do serviço executado (PMOC)"
            />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              {/* Text fields */}
              <div 
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                  gap: 'var(--form-grid-column-gap)',
                }}
              >
                <FormField label="Descrição do Problema / Solicitação">
                  <Textarea
                    value={formData.descricaoProblema}
                    onChange={(e) => updateField('descricaoProblema', e.target.value)}
                    placeholder="Descreva o problema relatado pelo cliente ou a solicitação de serviço..."
                    rows={4}
                  />
                </FormField>
                
                <FormField label="Diagnóstico Técnico / Serviço Executado">
                  <Textarea
                    value={formData.diagnosticoTecnico}
                    onChange={(e) => updateField('diagnosticoTecnico', e.target.value)}
                    placeholder="Descreva o diagnóstico, procedimentos realizados e observações técnicas..."
                    rows={4}
                  />
                </FormField>
              </div>
              
              {/* Checklist */}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {formData.checklist.map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      onChange={updateChecklistItem}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
          
          {/* Section 4: Fechamento e Valores */}
          <section
            style={{
              backgroundColor: 'var(--color-surface-elevated)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--card-padding-lg)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <SectionHeader
              icon={<Icons.DollarSign style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />}
              title="Fechamento e Valores"
              subtitle="Valores e observações finais"
            />
            
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--space-6)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--form-field-gap-loose)' }}>
                <FormField label="Valor das Peças" hint="Informe o valor total das peças utilizadas">
                  <Input
                    type="text"
                    value={formData.valorPecas ? formatCurrency(formData.valorPecas) : ''}
                    onChange={(e) => handleCurrencyInput('valorPecas', e.target.value)}
                    placeholder="R$ 0,00"
                    icon={<Icons.DollarSign style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
                  />
                </FormField>
                
                <FormField label="Valor da Mão de Obra" hint="Informe o valor da mão de obra">
                  <Input
                    type="text"
                    value={formData.valorMaoDeObra ? formatCurrency(formData.valorMaoDeObra) : ''}
                    onChange={(e) => handleCurrencyInput('valorMaoDeObra', e.target.value)}
                    placeholder="R$ 0,00"
                    icon={<Icons.DollarSign style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
                  />
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
                />
              </div>
            </div>
          </section>
        </div>
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
        }}
      >
        <div 
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <Button
            variant="ghost"
            onClick={onCancel}
            icon={<Icons.X style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
          >
            Cancelar
          </Button>
          
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {canGeneratePDF && onGeneratePDF && (
              <Button
                variant="secondary"
                onClick={() => onGeneratePDF(serviceOrder!.id!)}
                icon={<Icons.Download style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
              >
                Gerar PDF/Laudo
              </Button>
            )}
            
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isLoading}
              icon={<Icons.Save style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />}
            >
              {mode === 'create' ? 'Criar Ordem de Serviço' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </div>
      
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
