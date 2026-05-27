/**
 * AirConditionerForm.tsx
 * Formulário completo de cadastro de ar-condicionado com layout limpo e organizado.
 * Segue o padrão visual do Climaris com seções bem definidas.
 * 
 * Uso:
 * import { AirConditionerForm } from '@/components/v0-ui/equipments';
 * 
 * <AirConditionerForm
 *   mode="create"
 *   onSubmit={(data) => console.log(data)}
 *   onCancel={() => navigate(-1)}
 * />
 */

import React, { useState, useCallback } from 'react';

// ==================== TYPES ====================

export type ACType = 'split' | 'split_inverter' | 'janela' | 'portatil' | 'piso_teto' | 'cassete' | 'multi_split' | 'vrf' | 'chiller' | 'self_contained' | 'fan_coil' | 'dutado';
export type ACCycle = 'frio' | 'quente_frio' | 'so_quente';
export type VoltageType = '110V' | '127V' | '220V' | '380V' | '440V';
export type RefrigerantGas = 'R22' | 'R32' | 'R410A' | 'R407C' | 'R134A' | 'R290' | 'R600A' | 'R404A' | 'R507' | 'outros';
export type CompressorType = 'rotativo' | 'scroll' | 'reciproco' | 'parafuso' | 'centrifugo';
export type EnergyClass = 'A' | 'B' | 'C' | 'D' | 'E';
export type CondensationType = 'ar' | 'agua';
export type InstallationEnvironment = 'residencial' | 'comercial' | 'industrial' | 'hospitalar' | 'data_center' | 'laboratorio' | 'farmaceutico';

export interface AirConditionerData {
  // Identificação
  tag?: string;
  serialNumber?: string;
  patrimonyNumber?: string;
  brand: string;
  model: string;
  productLine?: string;
  manufacturingYear?: number;
  
  // Tipo e Capacidade
  type: ACType;
  cycle: ACCycle;
  inverterTechnology: boolean;
  capacityBtu: number;
  capacityKw?: number;
  capacityTr?: number;
  heatingCapacityBtu?: number;
  
  // Elétrica
  voltageIndoor: VoltageType;
  currentIndoor?: number;
  powerIndoor?: number;
  voltageOutdoor?: VoltageType;
  currentOutdoor?: number;
  powerOutdoor?: number;
  phases: 1 | 2 | 3;
  frequency: 50 | 60;
  powerFactor?: number;
  startingCurrent?: number;
  
  // Compressor
  compressorType?: CompressorType;
  compressorBrand?: string;
  compressorModel?: string;
  compressorQuantity?: number;
  
  // Refrigeração
  refrigerantGas: RefrigerantGas;
  refrigerantCharge?: number;
  maxOperatingPressure?: number;
  minOperatingPressure?: number;
  condensationType: CondensationType;
  
  // Dimensões
  indoorWidth?: number;
  indoorHeight?: number;
  indoorDepth?: number;
  indoorWeight?: number;
  outdoorWidth?: number;
  outdoorHeight?: number;
  outdoorDepth?: number;
  outdoorWeight?: number;
  
  // Tubulação
  liquidLineDiameter?: number;
  suctionLineDiameter?: number;
  drainLineDiameter?: number;
  maxPipingLength?: number;
  maxHeightDifference?: number;
  
  // Eficiência
  energyClass?: EnergyClass;
  seer?: number;
  eer?: number;
  cop?: number;
  inmetroNumber?: string;
  noiseIndoor?: number;
  noiseOutdoor?: number;
  
  // Recursos
  hasWifi: boolean;
  hasRemoteControl: boolean;
  hasTimerFunction: boolean;
  hasAutoRestart: boolean;
  hasSleepMode: boolean;
  hasTurboMode: boolean;
  hasDryMode: boolean;
  hasAirPurifier: boolean;
  filterType?: string;
  
  // Operação
  minOperatingTempCooling?: number;
  maxOperatingTempCooling?: number;
  minOperatingTempHeating?: number;
  maxOperatingTempHeating?: number;
  
  // Instalação
  installationDate?: string;
  installationLocation: string;
  installationSector?: string;
  installationFloor?: string;
  installationEnvironment?: InstallationEnvironment;
  installationResponsible?: string;
  
  // Garantia e Compra
  warrantyEndDate?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  purchaseValue?: number;
  
  // Manutenção
  preventiveEnabled: boolean;
  preventiveIntervalMonths?: number;
  lastPreventiveDate?: string;
  
  // Documentos
  manualUrl?: string;
  dataSheetUrl?: string;
  
  // Observações
  observations?: string;
  status: 'ativo' | 'inativo' | 'em_manutencao' | 'descartado';
  clientId?: string;
}

export interface AirConditionerFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<AirConditionerData>;
  onSubmit: (data: AirConditionerData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  brands?: string[];
  clients?: Array<{ id: string; name: string }>;
}

// ==================== CONSTANTS ====================

const AC_TYPES: Record<ACType, string> = {
  split: 'Split Hi-Wall',
  split_inverter: 'Split Inverter',
  janela: 'Janela',
  portatil: 'Portátil',
  piso_teto: 'Piso-Teto',
  cassete: 'Cassete',
  multi_split: 'Multi-Split',
  vrf: 'VRF/VRV',
  chiller: 'Chiller',
  self_contained: 'Self-Contained',
  fan_coil: 'Fan Coil',
  dutado: 'Dutado',
};

const AC_CYCLES: Record<ACCycle, string> = {
  frio: 'Só Frio',
  quente_frio: 'Quente/Frio',
  so_quente: 'Só Quente',
};

const VOLTAGES: VoltageType[] = ['110V', '127V', '220V', '380V', '440V'];
const GASES: RefrigerantGas[] = ['R22', 'R32', 'R410A', 'R407C', 'R134A', 'R290', 'R600A', 'R404A', 'R507', 'outros'];
const COMPRESSOR_TYPES: Record<CompressorType, string> = {
  rotativo: 'Rotativo',
  scroll: 'Scroll',
  reciproco: 'Recíproco/Pistão',
  parafuso: 'Parafuso',
  centrifugo: 'Centrífugo',
};
const ENERGY_CLASSES: EnergyClass[] = ['A', 'B', 'C', 'D', 'E'];
const ENVIRONMENTS: Record<InstallationEnvironment, string> = {
  residencial: 'Residencial',
  comercial: 'Comercial',
  industrial: 'Industrial',
  hospitalar: 'Hospitalar',
  data_center: 'Data Center',
  laboratorio: 'Laboratório',
  farmaceutico: 'Farmacêutico',
};

const DEFAULT_BRANDS = [
  'Carrier', 'Daikin', 'Fujitsu', 'Gree', 'Hitachi', 'LG', 'Midea', 'Panasonic',
  'Samsung', 'Springer', 'Trane', 'York', 'Elgin', 'Consul', 'Electrolux', 'Philco',
];

// ==================== STYLES ====================

const styles = {
  // Layout
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px',
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  } as React.CSSProperties,
  
  // Header
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '32px',
  } as React.CSSProperties,
  
  headerIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'var(--color-primary-50, #EFF6FF)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,
  
  headerText: {
    flex: 1,
  } as React.CSSProperties,
  
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #1a1a1a)',
    margin: 0,
    marginBottom: '4px',
  } as React.CSSProperties,
  
  subtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary, #6b7280)',
    margin: 0,
  } as React.CSSProperties,
  
  // Sections
  section: {
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid var(--color-border, #e5e7eb)',
  } as React.CSSProperties,
  
  sectionLast: {
    marginBottom: '32px',
    paddingBottom: '0',
    borderBottom: 'none',
  } as React.CSSProperties,
  
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #1a1a1a)',
    marginBottom: '20px',
  } as React.CSSProperties,
  
  sectionSubtitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary, #6b7280)',
    marginBottom: '12px',
    marginTop: '20px',
  } as React.CSSProperties,
  
  // Grid
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  } as React.CSSProperties,
  
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  } as React.CSSProperties,
  
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  } as React.CSSProperties,
  
  // Form Fields
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  } as React.CSSProperties,
  
  fieldFull: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    gridColumn: '1 / -1',
  } as React.CSSProperties,
  
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary, #6b7280)',
  } as React.CSSProperties,
  
  input: {
    height: '44px',
    padding: '0 14px',
    fontSize: '14px',
    border: '1px solid var(--color-border, #e5e7eb)',
    borderRadius: '8px',
    backgroundColor: 'var(--color-surface, #fff)',
    color: 'var(--color-text-primary, #1a1a1a)',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  } as React.CSSProperties,
  
  inputFocus: {
    borderColor: 'var(--color-primary, #2563eb)',
    boxShadow: '0 0 0 3px var(--color-primary-100, rgba(37, 99, 235, 0.1))',
  } as React.CSSProperties,
  
  select: {
    height: '44px',
    padding: '0 14px',
    fontSize: '14px',
    border: '1px solid var(--color-border, #e5e7eb)',
    borderRadius: '8px',
    backgroundColor: 'var(--color-surface, #fff)',
    color: 'var(--color-text-primary, #1a1a1a)',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '16px',
    paddingRight: '40px',
  } as React.CSSProperties,
  
  textarea: {
    minHeight: '100px',
    padding: '12px 14px',
    fontSize: '14px',
    border: '1px solid var(--color-border, #e5e7eb)',
    borderRadius: '8px',
    backgroundColor: 'var(--color-surface, #fff)',
    color: 'var(--color-text-primary, #1a1a1a)',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  
  inputHelper: {
    fontSize: '12px',
    color: 'var(--color-text-tertiary, #9ca3af)',
  } as React.CSSProperties,
  
  // Checkbox Group
  checkboxGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
  } as React.CSSProperties,
  
  checkboxItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
  } as React.CSSProperties,
  
  checkbox: {
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    border: '2px solid var(--color-border, #d1d5db)',
    backgroundColor: 'var(--color-surface, #fff)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
  } as React.CSSProperties,
  
  checkboxChecked: {
    backgroundColor: 'var(--color-primary, #2563eb)',
    borderColor: 'var(--color-primary, #2563eb)',
  } as React.CSSProperties,
  
  checkboxLabel: {
    fontSize: '14px',
    color: 'var(--color-text-primary, #1a1a1a)',
  } as React.CSSProperties,
  
  // Toggle
  toggleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,
  
  toggle: {
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    backgroundColor: 'var(--color-border, #d1d5db)',
    position: 'relative',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    flexShrink: 0,
  } as React.CSSProperties,
  
  toggleActive: {
    backgroundColor: 'var(--color-primary, #2563eb)',
  } as React.CSSProperties,
  
  toggleKnob: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    position: 'absolute',
    top: '2px',
    left: '2px',
    transition: 'transform 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  } as React.CSSProperties,
  
  toggleKnobActive: {
    transform: 'translateX(20px)',
  } as React.CSSProperties,
  
  toggleLabel: {
    fontSize: '14px',
    color: 'var(--color-text-primary, #1a1a1a)',
  } as React.CSSProperties,
  
  // Info Box
  infoBox: {
    display: 'flex',
    gap: '12px',
    padding: '14px 16px',
    backgroundColor: 'var(--color-primary-50, #eff6ff)',
    borderRadius: '8px',
    marginBottom: '20px',
  } as React.CSSProperties,
  
  infoBoxIcon: {
    width: '20px',
    height: '20px',
    color: 'var(--color-primary, #2563eb)',
    flexShrink: 0,
    marginTop: '1px',
  } as React.CSSProperties,
  
  infoBoxText: {
    fontSize: '13px',
    color: 'var(--color-primary-700, #1d4ed8)',
    lineHeight: 1.5,
  } as React.CSSProperties,
  
  // Footer
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '24px',
    borderTop: '1px solid var(--color-border, #e5e7eb)',
    marginTop: '8px',
  } as React.CSSProperties,
  
  footerLeft: {
    display: 'flex',
    gap: '12px',
  } as React.CSSProperties,
  
  footerRight: {
    display: 'flex',
    gap: '12px',
  } as React.CSSProperties,
  
  // Buttons
  btnPrimary: {
    height: '44px',
    padding: '0 24px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    backgroundColor: 'var(--color-primary, #2563eb)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  
  btnSecondary: {
    height: '44px',
    padding: '0 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text-primary, #374151)',
    backgroundColor: 'var(--color-surface, #fff)',
    border: '1px solid var(--color-border, #d1d5db)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  
  btnDanger: {
    height: '44px',
    padding: '0 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-error, #dc2626)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error, #dc2626)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  } as React.CSSProperties,
  
  // Responsive
  '@media (max-width: 768px)': {
    grid2: { gridTemplateColumns: '1fr' },
    grid3: { gridTemplateColumns: '1fr' },
    grid4: { gridTemplateColumns: 'repeat(2, 1fr)' },
  },
};

// ==================== ICONS ====================

const AirConditionerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary, #2563eb)' }}>
    <path d="M8 21h8M12 17v4M5 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M7 8h10M7 12h10" />
  </svg>
);

const InfoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

// ==================== COMPONENTS ====================

interface InputFieldProps {
  label: string;
  name: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  helper?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

const InputField: React.FC<InputFieldProps> = ({
  label, name, value, onChange, type = 'text', placeholder, helper, required, disabled, min, max, step, suffix
}) => {
  const [focused, setFocused] = useState(false);
  
  return (
    <div style={styles.field}>
      <label style={styles.label}>
        {label} {required && <span style={{ color: 'var(--color-error, #dc2626)' }}>*</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={type}
          name={name}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            ...styles.input,
            ...(focused ? styles.inputFocus : {}),
            ...(suffix ? { paddingRight: '50px' } : {}),
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
        {suffix && (
          <span style={{
            position: 'absolute',
            right: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '13px',
            color: 'var(--color-text-tertiary, #9ca3af)',
          }}>
            {suffix}
          </span>
        )}
      </div>
      {helper && <span style={styles.inputHelper}>{helper}</span>}
    </div>
  );
};

interface SelectFieldProps {
  label: string;
  name: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const SelectField: React.FC<SelectFieldProps> = ({
  label, name, value, onChange, options, placeholder = 'Selecione...', required, disabled
}) => (
  <div style={styles.field}>
    <label style={styles.label}>
      {label} {required && <span style={{ color: 'var(--color-error, #dc2626)' }}>*</span>}
    </label>
    <select
      name={name}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      style={{ ...styles.select, width: '100%', boxSizing: 'border-box' }}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const CheckboxField: React.FC<CheckboxFieldProps> = ({ label, checked, onChange }) => (
  <label style={styles.checkboxItem}>
    <div
      style={{ ...styles.checkbox, ...(checked ? styles.checkboxChecked : {}) }}
      onClick={() => onChange(!checked)}
    >
      {checked && <CheckIcon />}
    </div>
    <span style={styles.checkboxLabel}>{label}</span>
  </label>
);

interface ToggleFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

const ToggleField: React.FC<ToggleFieldProps> = ({ label, checked, onChange, description }) => (
  <div>
    <div style={styles.toggleContainer}>
      <div
        style={{ ...styles.toggle, ...(checked ? styles.toggleActive : {}) }}
        onClick={() => onChange(!checked)}
      >
        <div style={{ ...styles.toggleKnob, ...(checked ? styles.toggleKnobActive : {}) }} />
      </div>
      <span style={styles.toggleLabel}>{label}</span>
    </div>
    {description && <p style={{ ...styles.inputHelper, marginTop: '6px', marginLeft: '56px' }}>{description}</p>}
  </div>
);

// ==================== MAIN COMPONENT ====================

export const AirConditionerForm: React.FC<AirConditionerFormProps> = ({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  brands = DEFAULT_BRANDS,
  clients = [],
}) => {
  const getDefaultData = (): Partial<AirConditionerData> => ({
    type: 'split',
    cycle: 'frio',
    inverterTechnology: false,
    voltageIndoor: '220V',
    phases: 1,
    frequency: 60,
    refrigerantGas: 'R410A',
    condensationType: 'ar',
    hasWifi: false,
    hasRemoteControl: true,
    hasTimerFunction: true,
    hasAutoRestart: true,
    hasSleepMode: true,
    hasTurboMode: false,
    hasDryMode: true,
    hasAirPurifier: false,
    preventiveEnabled: false,
    status: 'ativo',
    ...initialData,
  });

  const [data, setData] = useState<Partial<AirConditionerData>>(getDefaultData());
  const [isMobile, setIsMobile] = useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const updateField = useCallback(<K extends keyof AirConditionerData>(
    field: K,
    value: AirConditionerData[K]
  ) => {
    setData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(data as AirConditionerData);
  };

  const grid2 = isMobile ? { ...styles.grid2, gridTemplateColumns: '1fr' } : styles.grid2;
  const grid3 = isMobile ? { ...styles.grid3, gridTemplateColumns: '1fr' } : styles.grid3;
  const grid4 = isMobile ? { ...styles.grid4, gridTemplateColumns: 'repeat(2, 1fr)' } : styles.grid4;

  return (
    <form onSubmit={handleSubmit} style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <AirConditionerIcon />
        </div>
        <div style={styles.headerText}>
          <h1 style={styles.title}>
            {mode === 'create' ? 'Cadastrar Ar-Condicionado' : 'Editar Ar-Condicionado'}
          </h1>
          <p style={styles.subtitle}>
            Preencha os dados técnicos do equipamento para um controle completo de manutenção.
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div style={styles.infoBox}>
        <div style={styles.infoBoxIcon}><InfoIcon /></div>
        <p style={styles.infoBoxText}>
          Os campos marcados com <strong>*</strong> são obrigatórios. Preencha o máximo de informações 
          possível para um melhor controle do equipamento e histórico de manutenções.
        </p>
      </div>

      {/* SECTION: Identificação */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Identificação</h2>
        <div style={grid3}>
          <InputField
            label="Tag / Código"
            name="tag"
            value={data.tag}
            onChange={(v) => updateField('tag', v)}
            placeholder="Ex: AC-001"
            helper="Identificador interno do equipamento"
          />
          <InputField
            label="Número de Série"
            name="serialNumber"
            value={data.serialNumber}
            onChange={(v) => updateField('serialNumber', v)}
            placeholder="Ex: ABC123456789"
          />
          <InputField
            label="Patrimônio"
            name="patrimonyNumber"
            value={data.patrimonyNumber}
            onChange={(v) => updateField('patrimonyNumber', v)}
            placeholder="Ex: PAT-00123"
          />
        </div>
        
        <h3 style={styles.sectionSubtitle}>Fabricante e Modelo</h3>
        <div style={grid4}>
          <SelectField
            label="Marca"
            name="brand"
            value={data.brand}
            onChange={(v) => updateField('brand', v)}
            options={brands.map((b) => ({ value: b, label: b }))}
            required
          />
          <InputField
            label="Modelo"
            name="model"
            value={data.model}
            onChange={(v) => updateField('model', v)}
            placeholder="Ex: RINV12QCE"
            required
          />
          <InputField
            label="Linha / Série"
            name="productLine"
            value={data.productLine}
            onChange={(v) => updateField('productLine', v)}
            placeholder="Ex: Advance"
          />
          <InputField
            label="Ano de Fabricação"
            name="manufacturingYear"
            value={data.manufacturingYear}
            onChange={(v) => updateField('manufacturingYear', v ? parseInt(v) : undefined)}
            type="number"
            placeholder="2024"
            min={1990}
            max={new Date().getFullYear() + 1}
          />
        </div>
      </div>

      {/* SECTION: Tipo e Capacidade */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Tipo e Capacidade</h2>
        <div style={grid3}>
          <SelectField
            label="Tipo de Equipamento"
            name="type"
            value={data.type}
            onChange={(v) => updateField('type', v as ACType)}
            options={Object.entries(AC_TYPES).map(([value, label]) => ({ value, label }))}
            required
          />
          <SelectField
            label="Ciclo"
            name="cycle"
            value={data.cycle}
            onChange={(v) => updateField('cycle', v as ACCycle)}
            options={Object.entries(AC_CYCLES).map(([value, label]) => ({ value, label }))}
            required
          />
          <div style={styles.field}>
            <label style={styles.label}>Tecnologia</label>
            <div style={{ height: '44px', display: 'flex', alignItems: 'center' }}>
              <CheckboxField
                label="Inverter"
                checked={data.inverterTechnology || false}
                onChange={(v) => updateField('inverterTechnology', v)}
              />
            </div>
          </div>
        </div>
        
        <h3 style={styles.sectionSubtitle}>Capacidade de Refrigeração</h3>
        <div style={grid4}>
          <InputField
            label="Capacidade (BTU/h)"
            name="capacityBtu"
            value={data.capacityBtu}
            onChange={(v) => updateField('capacityBtu', v ? parseInt(v) : undefined)}
            type="number"
            placeholder="12000"
            required
            suffix="BTU/h"
          />
          <InputField
            label="Capacidade (kW)"
            name="capacityKw"
            value={data.capacityKw}
            onChange={(v) => updateField('capacityKw', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            suffix="kW"
          />
          <InputField
            label="Capacidade (TR)"
            name="capacityTr"
            value={data.capacityTr}
            onChange={(v) => updateField('capacityTr', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            suffix="TR"
          />
          <InputField
            label="Aquecimento (BTU/h)"
            name="heatingCapacityBtu"
            value={data.heatingCapacityBtu}
            onChange={(v) => updateField('heatingCapacityBtu', v ? parseInt(v) : undefined)}
            type="number"
            suffix="BTU/h"
            disabled={data.cycle === 'frio'}
          />
        </div>
      </div>

      {/* SECTION: Dados Elétricos */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Dados Elétricos</h2>
        
        <h3 style={styles.sectionSubtitle}>Unidade Interna (Evaporadora)</h3>
        <div style={grid3}>
          <SelectField
            label="Tensão"
            name="voltageIndoor"
            value={data.voltageIndoor}
            onChange={(v) => updateField('voltageIndoor', v as VoltageType)}
            options={VOLTAGES.map((v) => ({ value: v, label: v }))}
            required
          />
          <InputField
            label="Corrente"
            name="currentIndoor"
            value={data.currentIndoor}
            onChange={(v) => updateField('currentIndoor', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            suffix="A"
          />
          <InputField
            label="Potência"
            name="powerIndoor"
            value={data.powerIndoor}
            onChange={(v) => updateField('powerIndoor', v ? parseInt(v) : undefined)}
            type="number"
            suffix="W"
          />
        </div>
        
        <h3 style={styles.sectionSubtitle}>Unidade Externa (Condensadora)</h3>
        <div style={grid3}>
          <SelectField
            label="Tensão"
            name="voltageOutdoor"
            value={data.voltageOutdoor}
            onChange={(v) => updateField('voltageOutdoor', v as VoltageType)}
            options={VOLTAGES.map((v) => ({ value: v, label: v }))}
          />
          <InputField
            label="Corrente"
            name="currentOutdoor"
            value={data.currentOutdoor}
            onChange={(v) => updateField('currentOutdoor', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            suffix="A"
          />
          <InputField
            label="Potência"
            name="powerOutdoor"
            value={data.powerOutdoor}
            onChange={(v) => updateField('powerOutdoor', v ? parseInt(v) : undefined)}
            type="number"
            suffix="W"
          />
        </div>
        
        <h3 style={styles.sectionSubtitle}>Características Gerais</h3>
        <div style={grid4}>
          <SelectField
            label="Fases"
            name="phases"
            value={data.phases?.toString()}
            onChange={(v) => updateField('phases', parseInt(v) as 1 | 2 | 3)}
            options={[
              { value: '1', label: 'Monofásico' },
              { value: '2', label: 'Bifásico' },
              { value: '3', label: 'Trifásico' },
            ]}
            required
          />
          <SelectField
            label="Frequência"
            name="frequency"
            value={data.frequency?.toString()}
            onChange={(v) => updateField('frequency', parseInt(v) as 50 | 60)}
            options={[
              { value: '60', label: '60 Hz' },
              { value: '50', label: '50 Hz' },
            ]}
          />
          <InputField
            label="Fator de Potência"
            name="powerFactor"
            value={data.powerFactor}
            onChange={(v) => updateField('powerFactor', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.01}
            min={0}
            max={1}
          />
          <InputField
            label="Corrente de Partida"
            name="startingCurrent"
            value={data.startingCurrent}
            onChange={(v) => updateField('startingCurrent', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            suffix="A"
          />
        </div>
      </div>

      {/* SECTION: Compressor e Refrigeração */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Compressor e Refrigeração</h2>
        
        <h3 style={styles.sectionSubtitle}>Compressor</h3>
        <div style={grid4}>
          <SelectField
            label="Tipo"
            name="compressorType"
            value={data.compressorType}
            onChange={(v) => updateField('compressorType', v as CompressorType)}
            options={Object.entries(COMPRESSOR_TYPES).map(([value, label]) => ({ value, label }))}
          />
          <InputField
            label="Marca"
            name="compressorBrand"
            value={data.compressorBrand}
            onChange={(v) => updateField('compressorBrand', v)}
            placeholder="Ex: Copeland"
          />
          <InputField
            label="Modelo"
            name="compressorModel"
            value={data.compressorModel}
            onChange={(v) => updateField('compressorModel', v)}
          />
          <InputField
            label="Quantidade"
            name="compressorQuantity"
            value={data.compressorQuantity}
            onChange={(v) => updateField('compressorQuantity', v ? parseInt(v) : undefined)}
            type="number"
            min={1}
          />
        </div>
        
        <h3 style={styles.sectionSubtitle}>Sistema de Refrigeração</h3>
        <div style={grid4}>
          <SelectField
            label="Gás Refrigerante"
            name="refrigerantGas"
            value={data.refrigerantGas}
            onChange={(v) => updateField('refrigerantGas', v as RefrigerantGas)}
            options={GASES.map((g) => ({ value: g, label: g }))}
            required
          />
          <InputField
            label="Carga de Gás"
            name="refrigerantCharge"
            value={data.refrigerantCharge}
            onChange={(v) => updateField('refrigerantCharge', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            suffix="kg"
          />
          <InputField
            label="Pressão Alta (Máx)"
            name="maxOperatingPressure"
            value={data.maxOperatingPressure}
            onChange={(v) => updateField('maxOperatingPressure', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="psi"
          />
          <InputField
            label="Pressão Baixa (Mín)"
            name="minOperatingPressure"
            value={data.minOperatingPressure}
            onChange={(v) => updateField('minOperatingPressure', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="psi"
          />
        </div>
        <div style={{ ...grid2, marginTop: '16px' }}>
          <SelectField
            label="Tipo de Condensação"
            name="condensationType"
            value={data.condensationType}
            onChange={(v) => updateField('condensationType', v as CondensationType)}
            options={[
              { value: 'ar', label: 'A Ar' },
              { value: 'agua', label: 'A Água' },
            ]}
          />
        </div>
      </div>

      {/* SECTION: Dimensões e Tubulação */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Dimensões e Tubulação</h2>
        
        <h3 style={styles.sectionSubtitle}>Unidade Interna</h3>
        <div style={grid4}>
          <InputField
            label="Largura"
            name="indoorWidth"
            value={data.indoorWidth}
            onChange={(v) => updateField('indoorWidth', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="mm"
          />
          <InputField
            label="Altura"
            name="indoorHeight"
            value={data.indoorHeight}
            onChange={(v) => updateField('indoorHeight', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="mm"
          />
          <InputField
            label="Profundidade"
            name="indoorDepth"
            value={data.indoorDepth}
            onChange={(v) => updateField('indoorDepth', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="mm"
          />
          <InputField
            label="Peso"
            name="indoorWeight"
            value={data.indoorWeight}
            onChange={(v) => updateField('indoorWeight', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            suffix="kg"
          />
        </div>
        
        <h3 style={styles.sectionSubtitle}>Unidade Externa</h3>
        <div style={grid4}>
          <InputField
            label="Largura"
            name="outdoorWidth"
            value={data.outdoorWidth}
            onChange={(v) => updateField('outdoorWidth', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="mm"
          />
          <InputField
            label="Altura"
            name="outdoorHeight"
            value={data.outdoorHeight}
            onChange={(v) => updateField('outdoorHeight', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="mm"
          />
          <InputField
            label="Profundidade"
            name="outdoorDepth"
            value={data.outdoorDepth}
            onChange={(v) => updateField('outdoorDepth', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="mm"
          />
          <InputField
            label="Peso"
            name="outdoorWeight"
            value={data.outdoorWeight}
            onChange={(v) => updateField('outdoorWeight', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            suffix="kg"
          />
        </div>
        
        <h3 style={styles.sectionSubtitle}>Tubulação</h3>
        <div style={grid3}>
          <InputField
            label="Linha de Líquido"
            name="liquidLineDiameter"
            value={data.liquidLineDiameter}
            onChange={(v) => updateField('liquidLineDiameter', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.01}
            suffix="pol"
            helper="Diâmetro em polegadas"
          />
          <InputField
            label="Linha de Sucção"
            name="suctionLineDiameter"
            value={data.suctionLineDiameter}
            onChange={(v) => updateField('suctionLineDiameter', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.01}
            suffix="pol"
          />
          <InputField
            label="Dreno"
            name="drainLineDiameter"
            value={data.drainLineDiameter}
            onChange={(v) => updateField('drainLineDiameter', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.01}
            suffix="pol"
          />
        </div>
        <div style={{ ...grid2, marginTop: '16px' }}>
          <InputField
            label="Comprimento Máx. Tubulação"
            name="maxPipingLength"
            value={data.maxPipingLength}
            onChange={(v) => updateField('maxPipingLength', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="m"
          />
          <InputField
            label="Desnível Máximo"
            name="maxHeightDifference"
            value={data.maxHeightDifference}
            onChange={(v) => updateField('maxHeightDifference', v ? parseFloat(v) : undefined)}
            type="number"
            suffix="m"
          />
        </div>
      </div>

      {/* SECTION: Eficiência e Ruído */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Eficiência Energética e Ruído</h2>
        <div style={grid4}>
          <SelectField
            label="Classe Energética"
            name="energyClass"
            value={data.energyClass}
            onChange={(v) => updateField('energyClass', v as EnergyClass)}
            options={ENERGY_CLASSES.map((c) => ({ value: c, label: `Classe ${c}` }))}
          />
          <InputField
            label="SEER"
            name="seer"
            value={data.seer}
            onChange={(v) => updateField('seer', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            helper="Eficiência sazonal"
          />
          <InputField
            label="EER"
            name="eer"
            value={data.eer}
            onChange={(v) => updateField('eer', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
          />
          <InputField
            label="COP"
            name="cop"
            value={data.cop}
            onChange={(v) => updateField('cop', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.1}
            helper="Coef. de Performance"
          />
        </div>
        <div style={{ ...grid3, marginTop: '16px' }}>
          <InputField
            label="Nº Registro INMETRO"
            name="inmetroNumber"
            value={data.inmetroNumber}
            onChange={(v) => updateField('inmetroNumber', v)}
            placeholder="Ex: 012345/2024"
          />
          <InputField
            label="Ruído Interno"
            name="noiseIndoor"
            value={data.noiseIndoor}
            onChange={(v) => updateField('noiseIndoor', v ? parseInt(v) : undefined)}
            type="number"
            suffix="dB(A)"
          />
          <InputField
            label="Ruído Externo"
            name="noiseOutdoor"
            value={data.noiseOutdoor}
            onChange={(v) => updateField('noiseOutdoor', v ? parseInt(v) : undefined)}
            type="number"
            suffix="dB(A)"
          />
        </div>
      </div>

      {/* SECTION: Recursos e Funções */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Recursos e Funções</h2>
        <div style={styles.checkboxGrid}>
          <CheckboxField
            label="Wi-Fi / Smart"
            checked={data.hasWifi || false}
            onChange={(v) => updateField('hasWifi', v)}
          />
          <CheckboxField
            label="Controle Remoto"
            checked={data.hasRemoteControl || false}
            onChange={(v) => updateField('hasRemoteControl', v)}
          />
          <CheckboxField
            label="Timer / Programação"
            checked={data.hasTimerFunction || false}
            onChange={(v) => updateField('hasTimerFunction', v)}
          />
          <CheckboxField
            label="Auto Restart"
            checked={data.hasAutoRestart || false}
            onChange={(v) => updateField('hasAutoRestart', v)}
          />
          <CheckboxField
            label="Modo Sleep"
            checked={data.hasSleepMode || false}
            onChange={(v) => updateField('hasSleepMode', v)}
          />
          <CheckboxField
            label="Modo Turbo"
            checked={data.hasTurboMode || false}
            onChange={(v) => updateField('hasTurboMode', v)}
          />
          <CheckboxField
            label="Modo Desumidificar"
            checked={data.hasDryMode || false}
            onChange={(v) => updateField('hasDryMode', v)}
          />
          <CheckboxField
            label="Purificador de Ar"
            checked={data.hasAirPurifier || false}
            onChange={(v) => updateField('hasAirPurifier', v)}
          />
        </div>
        <div style={{ ...grid2, marginTop: '20px' }}>
          <InputField
            label="Tipo de Filtro"
            name="filterType"
            value={data.filterType}
            onChange={(v) => updateField('filterType', v)}
            placeholder="Ex: HEPA, Carvão Ativado"
          />
        </div>
      </div>

      {/* SECTION: Faixa de Operação */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Faixa de Operação</h2>
        <div style={grid4}>
          <InputField
            label="Temp. Mín. (Refrigeração)"
            name="minOperatingTempCooling"
            value={data.minOperatingTempCooling}
            onChange={(v) => updateField('minOperatingTempCooling', v ? parseInt(v) : undefined)}
            type="number"
            suffix="°C"
          />
          <InputField
            label="Temp. Máx. (Refrigeração)"
            name="maxOperatingTempCooling"
            value={data.maxOperatingTempCooling}
            onChange={(v) => updateField('maxOperatingTempCooling', v ? parseInt(v) : undefined)}
            type="number"
            suffix="°C"
          />
          <InputField
            label="Temp. Mín. (Aquecimento)"
            name="minOperatingTempHeating"
            value={data.minOperatingTempHeating}
            onChange={(v) => updateField('minOperatingTempHeating', v ? parseInt(v) : undefined)}
            type="number"
            suffix="°C"
            disabled={data.cycle === 'frio'}
          />
          <InputField
            label="Temp. Máx. (Aquecimento)"
            name="maxOperatingTempHeating"
            value={data.maxOperatingTempHeating}
            onChange={(v) => updateField('maxOperatingTempHeating', v ? parseInt(v) : undefined)}
            type="number"
            suffix="°C"
            disabled={data.cycle === 'frio'}
          />
        </div>
      </div>

      {/* SECTION: Instalação */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Instalação</h2>
        <div style={grid3}>
          <InputField
            label="Local / Ambiente"
            name="installationLocation"
            value={data.installationLocation}
            onChange={(v) => updateField('installationLocation', v)}
            placeholder="Ex: Sala de Reuniões"
            required
          />
          <InputField
            label="Setor / Departamento"
            name="installationSector"
            value={data.installationSector}
            onChange={(v) => updateField('installationSector', v)}
            placeholder="Ex: Administrativo"
          />
          <InputField
            label="Andar / Pavimento"
            name="installationFloor"
            value={data.installationFloor}
            onChange={(v) => updateField('installationFloor', v)}
            placeholder="Ex: 2º Andar"
          />
        </div>
        <div style={{ ...grid3, marginTop: '16px' }}>
          <SelectField
            label="Tipo de Ambiente"
            name="installationEnvironment"
            value={data.installationEnvironment}
            onChange={(v) => updateField('installationEnvironment', v as InstallationEnvironment)}
            options={Object.entries(ENVIRONMENTS).map(([value, label]) => ({ value, label }))}
          />
          <InputField
            label="Data de Instalação"
            name="installationDate"
            value={data.installationDate}
            onChange={(v) => updateField('installationDate', v)}
            type="date"
          />
          <InputField
            label="Responsável pela Instalação"
            name="installationResponsible"
            value={data.installationResponsible}
            onChange={(v) => updateField('installationResponsible', v)}
            placeholder="Nome do técnico"
          />
        </div>
      </div>

      {/* SECTION: Garantia e Compra */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Garantia e Compra</h2>
        <div style={grid4}>
          <InputField
            label="Nº Nota Fiscal"
            name="invoiceNumber"
            value={data.invoiceNumber}
            onChange={(v) => updateField('invoiceNumber', v)}
            placeholder="Ex: 000123"
          />
          <InputField
            label="Data da Compra"
            name="invoiceDate"
            value={data.invoiceDate}
            onChange={(v) => updateField('invoiceDate', v)}
            type="date"
          />
          <InputField
            label="Valor de Compra"
            name="purchaseValue"
            value={data.purchaseValue}
            onChange={(v) => updateField('purchaseValue', v ? parseFloat(v) : undefined)}
            type="number"
            step={0.01}
            suffix="R$"
          />
          <InputField
            label="Garantia até"
            name="warrantyEndDate"
            value={data.warrantyEndDate}
            onChange={(v) => updateField('warrantyEndDate', v)}
            type="date"
          />
        </div>
      </div>

      {/* SECTION: Manutenção Preventiva */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Manutenção Preventiva</h2>
        <ToggleField
          label="Habilitar cronograma de manutenção preventiva"
          checked={data.preventiveEnabled || false}
          onChange={(v) => updateField('preventiveEnabled', v)}
          description="Ao habilitar, o sistema gerará alertas automáticos para manutenção."
        />
        {data.preventiveEnabled && (
          <div style={{ ...grid3, marginTop: '20px' }}>
            <InputField
              label="Intervalo (meses)"
              name="preventiveIntervalMonths"
              value={data.preventiveIntervalMonths}
              onChange={(v) => updateField('preventiveIntervalMonths', v ? parseInt(v) : undefined)}
              type="number"
              min={1}
              max={24}
              placeholder="Ex: 3"
            />
            <InputField
              label="Última Manutenção"
              name="lastPreventiveDate"
              value={data.lastPreventiveDate}
              onChange={(v) => updateField('lastPreventiveDate', v)}
              type="date"
            />
          </div>
        )}
      </div>

      {/* SECTION: Documentos */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Documentos</h2>
        <div style={grid2}>
          <InputField
            label="URL do Manual"
            name="manualUrl"
            value={data.manualUrl}
            onChange={(v) => updateField('manualUrl', v)}
            placeholder="https://..."
            helper="Link para o manual do fabricante"
          />
          <InputField
            label="URL da Ficha Técnica"
            name="dataSheetUrl"
            value={data.dataSheetUrl}
            onChange={(v) => updateField('dataSheetUrl', v)}
            placeholder="https://..."
            helper="Link para datasheet do produto"
          />
        </div>
      </div>

      {/* SECTION: Observações */}
      <div style={styles.sectionLast}>
        <h2 style={styles.sectionTitle}>Observações</h2>
        <div style={styles.fieldFull}>
          <label style={styles.label}>Observações Gerais</label>
          <textarea
            name="observations"
            value={data.observations ?? ''}
            onChange={(e) => updateField('observations', e.target.value)}
            placeholder="Informações adicionais sobre o equipamento..."
            style={{ ...styles.textarea, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        
        <div style={{ ...grid2, marginTop: '20px' }}>
          <SelectField
            label="Status do Equipamento"
            name="status"
            value={data.status}
            onChange={(v) => updateField('status', v as AirConditionerData['status'])}
            options={[
              { value: 'ativo', label: 'Ativo' },
              { value: 'inativo', label: 'Inativo' },
              { value: 'em_manutencao', label: 'Em Manutenção' },
              { value: 'descartado', label: 'Descartado' },
            ]}
            required
          />
          {clients.length > 0 && (
            <SelectField
              label="Cliente"
              name="clientId"
              value={data.clientId}
              onChange={(v) => updateField('clientId', v)}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerLeft}>
          <button type="button" onClick={onCancel} style={styles.btnSecondary}>
            Voltar
          </button>
          {mode === 'edit' && (
            <button type="button" style={styles.btnDanger}>
              Excluir equipamento
            </button>
          )}
        </div>
        <div style={styles.footerRight}>
          <button type="submit" disabled={isSubmitting} style={styles.btnPrimary}>
            {isSubmitting ? (
              <>
                <SpinnerIcon />
                Salvando...
              </>
            ) : (
              mode === 'create' ? 'Cadastrar Equipamento' : 'Salvar Alterações'
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </form>
  );
};

// ==================== MOCK DATA ====================

export const mockAirConditionerData: Partial<AirConditionerData> = {
  tag: 'AC-001',
  serialNumber: 'ABC123456789',
  brand: 'LG',
  model: 'S4-Q12JA3WC',
  productLine: 'Dual Inverter Voice',
  manufacturingYear: 2024,
  type: 'split_inverter',
  cycle: 'quente_frio',
  inverterTechnology: true,
  capacityBtu: 12000,
  capacityKw: 3.52,
  voltageIndoor: '220V',
  currentIndoor: 4.5,
  powerIndoor: 990,
  phases: 1,
  frequency: 60,
  refrigerantGas: 'R32',
  refrigerantCharge: 0.68,
  energyClass: 'A',
  noiseIndoor: 19,
  noiseOutdoor: 50,
  hasWifi: true,
  hasRemoteControl: true,
  hasTimerFunction: true,
  hasAutoRestart: true,
  hasSleepMode: true,
  hasTurboMode: true,
  hasDryMode: true,
  hasAirPurifier: true,
  filterType: 'Dual Protection',
  installationLocation: 'Sala de Reuniões',
  installationSector: 'Administrativo',
  installationFloor: '2º Andar',
  installationEnvironment: 'comercial',
  preventiveEnabled: true,
  preventiveIntervalMonths: 6,
  status: 'ativo',
};

export default AirConditionerForm;
