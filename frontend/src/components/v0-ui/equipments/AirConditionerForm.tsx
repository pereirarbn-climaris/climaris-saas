/**
 * AirConditionerForm.tsx
 * Formulário completo de cadastro de ar-condicionado com todos os campos técnicos possíveis.
 * Organizado em seções colapsáveis para melhor UX.
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

import React, { useState, useCallback, useMemo } from 'react';

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
  // Identificação Básica
  tag?: string;
  serialNumber?: string;
  patrimonyNumber?: string;
  
  // Fabricante e Modelo
  brand: string;
  model: string;
  productLine?: string;
  manufacturingYear?: number;
  
  // Tipo e Características
  type: ACType;
  cycle: ACCycle;
  inverterTechnology: boolean;
  
  // Capacidade
  capacityBtu: number;
  capacityKw?: number;
  capacityTr?: number;
  heatingCapacityBtu?: number;
  heatingCapacityKw?: number;
  
  // Dados Elétricos - Unidade Interna
  voltageIndoor: VoltageType;
  currentIndoor?: number;
  powerIndoor?: number;
  
  // Dados Elétricos - Unidade Externa
  voltageOutdoor?: VoltageType;
  currentOutdoor?: number;
  powerOutdoor?: number;
  
  // Dados Elétricos Gerais
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
  
  // Condensação
  condensationType: CondensationType;
  condenserFanQuantity?: number;
  condenserFanDiameter?: number;
  
  // Evaporação
  evaporatorFanQuantity?: number;
  evaporatorFanType?: string;
  airFlowRate?: number;
  
  // Dimensões - Unidade Interna
  indoorWidth?: number;
  indoorHeight?: number;
  indoorDepth?: number;
  indoorWeight?: number;
  
  // Dimensões - Unidade Externa
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
  
  // Eficiência Energética
  energyClass?: EnergyClass;
  seer?: number;
  eer?: number;
  cop?: number;
  hspf?: number;
  monthlyConsumption?: number;
  inmetroNumber?: string;
  
  // Ruído
  noiseIndoor?: number;
  noiseOutdoor?: number;
  
  // Controle e Automação
  hasWifi: boolean;
  hasRemoteControl: boolean;
  remoteControlModel?: string;
  hasTimerFunction: boolean;
  hasAutoRestart: boolean;
  hasSleepMode: boolean;
  hasTurboMode: boolean;
  hasDryMode: boolean;
  hasAirPurifier: boolean;
  hasIonizer: boolean;
  hasUvLight: boolean;
  filterType?: string;
  
  // Ambiente de Operação
  minOperatingTempCooling?: number;
  maxOperatingTempCooling?: number;
  minOperatingTempHeating?: number;
  maxOperatingTempHeating?: number;
  operatingHumidityRange?: string;
  
  // Instalação
  installationDate?: string;
  installationLocation: string;
  installationSector?: string;
  installationFloor?: string;
  installationEnvironment?: InstallationEnvironment;
  installationResponsible?: string;
  installationCompany?: string;
  
  // Garantia
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  warrantyMonths?: number;
  extendedWarrantyEndDate?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  purchaseValue?: number;
  
  // Manutenção Preventiva
  preventiveEnabled: boolean;
  preventiveIntervalMonths?: number;
  lastPreventiveDate?: string;
  nextPreventiveDate?: string;
  
  // Documentos
  manualUrl?: string;
  dataSheetUrl?: string;
  invoiceUrl?: string;
  installationReportUrl?: string;
  photos?: string[];
  
  // Observações
  observations?: string;
  
  // Metadados
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
  multi_split: 'Multi Split',
  vrf: 'VRF/VRV',
  chiller: 'Chiller',
  self_contained: 'Self-Contained',
  fan_coil: 'Fan Coil',
  dutado: 'Dutado',
};

const AC_CYCLES: Record<ACCycle, string> = {
  frio: 'Só Frio',
  quente_frio: 'Quente/Frio (Ciclo Reverso)',
  so_quente: 'Só Quente',
};

const VOLTAGE_OPTIONS: VoltageType[] = ['110V', '127V', '220V', '380V', '440V'];

const REFRIGERANT_GASES: Record<RefrigerantGas, string> = {
  R22: 'R-22 (HCFC)',
  R32: 'R-32 (HFC)',
  R410A: 'R-410A (HFC)',
  R407C: 'R-407C (HFC)',
  R134A: 'R-134a (HFC)',
  R290: 'R-290 (Propano)',
  R600A: 'R-600a (Isobutano)',
  R404A: 'R-404A (HFC)',
  R507: 'R-507 (HFC)',
  outros: 'Outros',
};

const COMPRESSOR_TYPES: Record<CompressorType, string> = {
  rotativo: 'Rotativo',
  scroll: 'Scroll',
  reciproco: 'Recíproco (Pistão)',
  parafuso: 'Parafuso',
  centrifugo: 'Centrífugo',
};

const ENERGY_CLASSES: EnergyClass[] = ['A', 'B', 'C', 'D', 'E'];

const INSTALLATION_ENVIRONMENTS: Record<InstallationEnvironment, string> = {
  residencial: 'Residencial',
  comercial: 'Comercial',
  industrial: 'Industrial',
  hospitalar: 'Hospitalar',
  data_center: 'Data Center',
  laboratorio: 'Laboratório',
  farmaceutico: 'Farmacêutico',
};

const DEFAULT_BRANDS = [
  'Carrier', 'LG', 'Samsung', 'Fujitsu', 'Daikin', 'Midea', 'Elgin', 'Springer',
  'Consul', 'Electrolux', 'Gree', 'Hitachi', 'Trane', 'York', 'Komeco', 'Philco',
  'Agratto', 'TCL', 'Aux', 'Haier', 'Panasonic', 'Mitsubishi Electric', 'Johnson Controls'
];

// ==================== HELPERS ====================

const btuToKw = (btu: number): number => Math.round((btu * 0.000293071) * 100) / 100;
const btuToTr = (btu: number): number => Math.round((btu / 12000) * 100) / 100;

// ==================== SUB-COMPONENTS ====================

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, icon, defaultOpen = true, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div style={{
      backgroundColor: 'var(--color-surface-elevated)',
      borderRadius: 'var(--card-radius)',
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--card-padding)',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '2.5rem',
            height: '2.5rem',
            borderRadius: '0.625rem',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-primary)',
          }}>
            {icon}
          </div>
          <span style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text)',
          }}>
            {title}
          </span>
        </div>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: 'var(--color-text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div style={{
          padding: '0 var(--card-padding) var(--card-padding)',
          borderTop: '1px solid var(--color-border)',
        }}>
          <div style={{ paddingTop: 'var(--card-padding)' }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

interface FieldGroupProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
}

const FieldGroup: React.FC<FieldGroupProps> = ({ children, columns = 3 }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: '1rem',
  }}>
    {children}
  </div>
);

interface InputFieldProps {
  label: string;
  name: string;
  value: string | number | undefined;
  onChange: (name: string, value: string | number) => void;
  type?: 'text' | 'number' | 'date' | 'url' | 'textarea';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  fullWidth?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  disabled,
  min,
  max,
  step,
  unit,
  hint,
  fullWidth,
}) => {
  const inputStyles: React.CSSProperties = {
    width: '100%',
    height: type === 'textarea' ? 'auto' : 'var(--input-height)',
    padding: type === 'textarea' ? '0.75rem var(--input-padding-x)' : '0 var(--input-padding-x)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-text)',
    backgroundColor: disabled ? 'var(--color-surface)' : 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--input-radius)',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    minHeight: type === 'textarea' ? '100px' : undefined,
    resize: type === 'textarea' ? 'vertical' : undefined,
  };

  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <label style={{
        display: 'block',
        marginBottom: '0.375rem',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-medium)',
        color: 'var(--color-text)',
      }}>
        {label}
        {required && <span style={{ color: 'var(--color-error)' }}> *</span>}
      </label>
      <div style={{ position: 'relative' }}>
        {type === 'textarea' ? (
          <textarea
            name={name}
            value={value || ''}
            onChange={(e) => onChange(name, e.target.value)}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            style={inputStyles}
          />
        ) : (
          <input
            type={type}
            name={name}
            value={value ?? ''}
            onChange={(e) => onChange(name, type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value)}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            style={{
              ...inputStyles,
              paddingRight: unit ? '3rem' : 'var(--input-padding-x)',
            }}
          />
        )}
        {unit && (
          <span style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            pointerEvents: 'none',
          }}>
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <p style={{
          marginTop: '0.25rem',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-muted)',
        }}>
          {hint}
        </p>
      )}
    </div>
  );
};

interface SelectFieldProps {
  label: string;
  name: string;
  value: string | number | undefined;
  onChange: (name: string, value: string | number) => void;
  options: Array<{ value: string | number; label: string }>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const SelectField: React.FC<SelectFieldProps> = ({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
}) => (
  <div>
    <label style={{
      display: 'block',
      marginBottom: '0.375rem',
      fontSize: 'var(--font-size-sm)',
      fontWeight: 'var(--font-weight-medium)',
      color: 'var(--color-text)',
    }}>
      {label}
      {required && <span style={{ color: 'var(--color-error)' }}> *</span>}
    </label>
    <select
      name={name}
      value={value ?? ''}
      onChange={(e) => onChange(name, e.target.value)}
      required={required}
      disabled={disabled}
      style={{
        width: '100%',
        height: 'var(--input-height)',
        padding: '0 var(--input-padding-x)',
        fontSize: 'var(--font-size-base)',
        color: value ? 'var(--color-text)' : 'var(--color-text-muted)',
        backgroundColor: disabled ? 'var(--color-surface)' : 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--input-radius)',
        outline: 'none',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.75rem center',
        paddingRight: '2.5rem',
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

interface CheckboxFieldProps {
  label: string;
  name: string;
  checked: boolean;
  onChange: (name: string, checked: boolean) => void;
  disabled?: boolean;
}

const CheckboxField: React.FC<CheckboxFieldProps> = ({
  label,
  name,
  checked,
  onChange,
  disabled,
}) => (
  <label style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }}>
    <input
      type="checkbox"
      name={name}
      checked={checked}
      onChange={(e) => onChange(name, e.target.checked)}
      disabled={disabled}
      style={{
        width: '1.125rem',
        height: '1.125rem',
        accentColor: 'var(--color-primary)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    />
    <span style={{
      fontSize: 'var(--font-size-base)',
      color: 'var(--color-text)',
    }}>
      {label}
    </span>
  </label>
);

// ==================== ICONS ====================

const IdentificationIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="18" rx="2" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="12" y2="16" />
  </svg>
);

const SnowflakeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
    <line x1="2" y1="12" x2="22" y2="12" />
  </svg>
);

const ZapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const CogIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const ThermometerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
  </svg>
);

const RulerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z" />
    <path d="m7.5 10.5 2 2" />
    <path d="m10.5 7.5 2 2" />
    <path d="m13.5 4.5 2 2" />
    <path d="m4.5 13.5 2 2" />
  </svg>
);

const LeafIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
);

const VolumeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const WifiIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

const MapPinIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const WrenchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const MessageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// ==================== MAIN COMPONENT ====================

export const AirConditionerForm: React.FC<AirConditionerFormProps> = ({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  brands = DEFAULT_BRANDS,
}) => {
  const [formData, setFormData] = useState<Partial<AirConditionerData>>({
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
    hasIonizer: false,
    hasUvLight: false,
    preventiveEnabled: false,
    status: 'ativo',
    installationLocation: '',
    ...initialData,
  });

  const handleChange = useCallback((name: string, value: string | number | boolean) => {
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      
      // Auto-calculate kW and TR when BTU changes
      if (name === 'capacityBtu' && typeof value === 'number') {
        updated.capacityKw = btuToKw(value);
        updated.capacityTr = btuToTr(value);
      }
      
      return updated;
    });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData as AirConditionerData);
  };

  const brandOptions = useMemo(() => 
    brands.map((b) => ({ value: b, label: b })),
    [brands]
  );

  const typeOptions = useMemo(() => 
    Object.entries(AC_TYPES).map(([value, label]) => ({ value, label })),
    []
  );

  const cycleOptions = useMemo(() => 
    Object.entries(AC_CYCLES).map(([value, label]) => ({ value, label })),
    []
  );

  const voltageOptions = useMemo(() => 
    VOLTAGE_OPTIONS.map((v) => ({ value: v, label: v })),
    []
  );

  const gasOptions = useMemo(() => 
    Object.entries(REFRIGERANT_GASES).map(([value, label]) => ({ value, label })),
    []
  );

  const compressorOptions = useMemo(() => 
    Object.entries(COMPRESSOR_TYPES).map(([value, label]) => ({ value, label })),
    []
  );

  const energyClassOptions = useMemo(() => 
    ENERGY_CLASSES.map((c) => ({ value: c, label: `Classe ${c}` })),
    []
  );

  const environmentOptions = useMemo(() => 
    Object.entries(INSTALLATION_ENVIRONMENTS).map(([value, label]) => ({ value, label })),
    []
  );

  const phaseOptions = useMemo(() => [
    { value: 1, label: 'Monofásico' },
    { value: 2, label: 'Bifásico' },
    { value: 3, label: 'Trifásico' },
  ], []);

  const frequencyOptions = useMemo(() => [
    { value: 50, label: '50 Hz' },
    { value: 60, label: '60 Hz' },
  ], []);

  const condensationOptions = useMemo(() => [
    { value: 'ar', label: 'A Ar' },
    { value: 'agua', label: 'A Água' },
  ], []);

  const statusOptions = useMemo(() => [
    { value: 'ativo', label: 'Ativo' },
    { value: 'inativo', label: 'Inativo' },
    { value: 'em_manutencao', label: 'Em Manutenção' },
    { value: 'descartado', label: 'Descartado' },
  ], []);

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h1 style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-text)',
            margin: 0,
          }}>
            {mode === 'create' ? 'Cadastrar Ar-Condicionado' : 'Editar Ar-Condicionado'}
          </h1>
          <p style={{
            fontSize: 'var(--font-size-base)',
            color: 'var(--color-text-muted)',
            margin: '0.25rem 0 0',
          }}>
            Preencha os dados técnicos do equipamento
          </p>
        </div>
        <SelectField
          label="Status"
          name="status"
          value={formData.status}
          onChange={handleChange}
          options={statusOptions}
        />
      </div>

      {/* Seção 1: Identificação */}
      <Section title="Identificação" icon={<IdentificationIcon />} defaultOpen={true}>
        <FieldGroup columns={3}>
          <InputField
            label="Tag / Código Interno"
            name="tag"
            value={formData.tag}
            onChange={handleChange}
            placeholder="Ex: AC-SALA-01"
          />
          <InputField
            label="Número de Série"
            name="serialNumber"
            value={formData.serialNumber}
            onChange={handleChange}
            placeholder="Ex: ABC123456789"
          />
          <InputField
            label="Número de Patrimônio"
            name="patrimonyNumber"
            value={formData.patrimonyNumber}
            onChange={handleChange}
            placeholder="Ex: PAT-00123"
          />
        </FieldGroup>

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={4}>
            <SelectField
              label="Marca"
              name="brand"
              value={formData.brand}
              onChange={handleChange}
              options={brandOptions}
              placeholder="Selecione..."
              required
            />
            <InputField
              label="Modelo"
              name="model"
              value={formData.model}
              onChange={handleChange}
              placeholder="Ex: AJ09R5BVHN1"
              required
            />
            <InputField
              label="Linha de Produto"
              name="productLine"
              value={formData.productLine}
              onChange={handleChange}
              placeholder="Ex: WindFree"
            />
            <InputField
              label="Ano de Fabricação"
              name="manufacturingYear"
              value={formData.manufacturingYear}
              onChange={handleChange}
              type="number"
              min={1990}
              max={new Date().getFullYear()}
              placeholder={String(new Date().getFullYear())}
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 2: Tipo e Capacidade */}
      <Section title="Tipo e Capacidade" icon={<SnowflakeIcon />} defaultOpen={true}>
        <FieldGroup columns={4}>
          <SelectField
            label="Tipo de Equipamento"
            name="type"
            value={formData.type}
            onChange={handleChange}
            options={typeOptions}
            required
          />
          <SelectField
            label="Ciclo"
            name="cycle"
            value={formData.cycle}
            onChange={handleChange}
            options={cycleOptions}
            required
          />
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.5rem' }}>
            <CheckboxField
              label="Tecnologia Inverter"
              name="inverterTechnology"
              checked={formData.inverterTechnology || false}
              onChange={handleChange}
            />
          </div>
        </FieldGroup>

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={4}>
            <InputField
              label="Capacidade de Refrigeração"
              name="capacityBtu"
              value={formData.capacityBtu}
              onChange={handleChange}
              type="number"
              min={7000}
              max={1000000}
              unit="BTU/h"
              required
              hint="7.000 a 1.000.000 BTU/h"
            />
            <InputField
              label="Capacidade (kW)"
              name="capacityKw"
              value={formData.capacityKw}
              onChange={handleChange}
              type="number"
              step={0.01}
              unit="kW"
              disabled
              hint="Calculado automaticamente"
            />
            <InputField
              label="Capacidade (TR)"
              name="capacityTr"
              value={formData.capacityTr}
              onChange={handleChange}
              type="number"
              step={0.01}
              unit="TR"
              disabled
              hint="1 TR = 12.000 BTU/h"
            />
          </FieldGroup>
        </div>

        {formData.cycle === 'quente_frio' && (
          <div style={{ marginTop: '1rem' }}>
            <FieldGroup columns={4}>
              <InputField
                label="Capacidade de Aquecimento"
                name="heatingCapacityBtu"
                value={formData.heatingCapacityBtu}
                onChange={handleChange}
                type="number"
                min={7000}
                unit="BTU/h"
              />
              <InputField
                label="Capacidade Aquec. (kW)"
                name="heatingCapacityKw"
                value={formData.heatingCapacityKw}
                onChange={handleChange}
                type="number"
                step={0.01}
                unit="kW"
              />
            </FieldGroup>
          </div>
        )}
      </Section>

      {/* Seção 3: Dados Elétricos */}
      <Section title="Dados Elétricos" icon={<ZapIcon />} defaultOpen={true}>
        <p style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-muted)',
          marginBottom: '1rem',
          fontWeight: 'var(--font-weight-medium)',
        }}>
          Unidade Interna (Evaporadora)
        </p>
        <FieldGroup columns={4}>
          <SelectField
            label="Tensão"
            name="voltageIndoor"
            value={formData.voltageIndoor}
            onChange={handleChange}
            options={voltageOptions}
            required
          />
          <InputField
            label="Corrente"
            name="currentIndoor"
            value={formData.currentIndoor}
            onChange={handleChange}
            type="number"
            step={0.1}
            unit="A"
          />
          <InputField
            label="Potência"
            name="powerIndoor"
            value={formData.powerIndoor}
            onChange={handleChange}
            type="number"
            unit="W"
          />
        </FieldGroup>

        <div style={{ marginTop: '1.5rem' }}>
          <p style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            marginBottom: '1rem',
            fontWeight: 'var(--font-weight-medium)',
          }}>
            Unidade Externa (Condensadora)
          </p>
          <FieldGroup columns={4}>
            <SelectField
              label="Tensão"
              name="voltageOutdoor"
              value={formData.voltageOutdoor}
              onChange={handleChange}
              options={voltageOptions}
            />
            <InputField
              label="Corrente"
              name="currentOutdoor"
              value={formData.currentOutdoor}
              onChange={handleChange}
              type="number"
              step={0.1}
              unit="A"
            />
            <InputField
              label="Potência"
              name="powerOutdoor"
              value={formData.powerOutdoor}
              onChange={handleChange}
              type="number"
              unit="W"
            />
          </FieldGroup>
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <p style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            marginBottom: '1rem',
            fontWeight: 'var(--font-weight-medium)',
          }}>
            Dados Gerais
          </p>
          <FieldGroup columns={4}>
            <SelectField
              label="Número de Fases"
              name="phases"
              value={formData.phases}
              onChange={handleChange}
              options={phaseOptions}
            />
            <SelectField
              label="Frequência"
              name="frequency"
              value={formData.frequency}
              onChange={handleChange}
              options={frequencyOptions}
            />
            <InputField
              label="Fator de Potência"
              name="powerFactor"
              value={formData.powerFactor}
              onChange={handleChange}
              type="number"
              step={0.01}
              min={0}
              max={1}
              hint="0 a 1"
            />
            <InputField
              label="Corrente de Partida"
              name="startingCurrent"
              value={formData.startingCurrent}
              onChange={handleChange}
              type="number"
              step={0.1}
              unit="A"
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 4: Compressor */}
      <Section title="Compressor" icon={<CogIcon />} defaultOpen={false}>
        <FieldGroup columns={4}>
          <SelectField
            label="Tipo de Compressor"
            name="compressorType"
            value={formData.compressorType}
            onChange={handleChange}
            options={compressorOptions}
            placeholder="Selecione..."
          />
          <InputField
            label="Marca do Compressor"
            name="compressorBrand"
            value={formData.compressorBrand}
            onChange={handleChange}
            placeholder="Ex: GMCC, Toshiba"
          />
          <InputField
            label="Modelo do Compressor"
            name="compressorModel"
            value={formData.compressorModel}
            onChange={handleChange}
          />
          <InputField
            label="Quantidade de Compressores"
            name="compressorQuantity"
            value={formData.compressorQuantity}
            onChange={handleChange}
            type="number"
            min={1}
            max={10}
          />
        </FieldGroup>
      </Section>

      {/* Seção 5: Refrigeração */}
      <Section title="Sistema de Refrigeração" icon={<ThermometerIcon />} defaultOpen={true}>
        <FieldGroup columns={4}>
          <SelectField
            label="Gás Refrigerante"
            name="refrigerantGas"
            value={formData.refrigerantGas}
            onChange={handleChange}
            options={gasOptions}
            required
          />
          <InputField
            label="Carga de Gás"
            name="refrigerantCharge"
            value={formData.refrigerantCharge}
            onChange={handleChange}
            type="number"
            step={0.01}
            unit="kg"
          />
          <InputField
            label="Pressão Máx. Operação"
            name="maxOperatingPressure"
            value={formData.maxOperatingPressure}
            onChange={handleChange}
            type="number"
            step={0.1}
            unit="bar"
          />
          <InputField
            label="Pressão Mín. Operação"
            name="minOperatingPressure"
            value={formData.minOperatingPressure}
            onChange={handleChange}
            type="number"
            step={0.1}
            unit="bar"
          />
        </FieldGroup>

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={4}>
            <SelectField
              label="Tipo de Condensação"
              name="condensationType"
              value={formData.condensationType}
              onChange={handleChange}
              options={condensationOptions}
            />
            <InputField
              label="Qtd. Ventiladores Condens."
              name="condenserFanQuantity"
              value={formData.condenserFanQuantity}
              onChange={handleChange}
              type="number"
              min={1}
              max={10}
            />
            <InputField
              label="Diâmetro Ventilador"
              name="condenserFanDiameter"
              value={formData.condenserFanDiameter}
              onChange={handleChange}
              type="number"
              unit="mm"
            />
            <InputField
              label="Vazão de Ar"
              name="airFlowRate"
              value={formData.airFlowRate}
              onChange={handleChange}
              type="number"
              unit="m³/h"
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 6: Dimensões e Tubulação */}
      <Section title="Dimensões e Tubulação" icon={<RulerIcon />} defaultOpen={false}>
        <p style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-muted)',
          marginBottom: '1rem',
          fontWeight: 'var(--font-weight-medium)',
        }}>
          Unidade Interna
        </p>
        <FieldGroup columns={4}>
          <InputField
            label="Largura"
            name="indoorWidth"
            value={formData.indoorWidth}
            onChange={handleChange}
            type="number"
            unit="mm"
          />
          <InputField
            label="Altura"
            name="indoorHeight"
            value={formData.indoorHeight}
            onChange={handleChange}
            type="number"
            unit="mm"
          />
          <InputField
            label="Profundidade"
            name="indoorDepth"
            value={formData.indoorDepth}
            onChange={handleChange}
            type="number"
            unit="mm"
          />
          <InputField
            label="Peso"
            name="indoorWeight"
            value={formData.indoorWeight}
            onChange={handleChange}
            type="number"
            step={0.1}
            unit="kg"
          />
        </FieldGroup>

        <div style={{ marginTop: '1.5rem' }}>
          <p style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            marginBottom: '1rem',
            fontWeight: 'var(--font-weight-medium)',
          }}>
            Unidade Externa
          </p>
          <FieldGroup columns={4}>
            <InputField
              label="Largura"
              name="outdoorWidth"
              value={formData.outdoorWidth}
              onChange={handleChange}
              type="number"
              unit="mm"
            />
            <InputField
              label="Altura"
              name="outdoorHeight"
              value={formData.outdoorHeight}
              onChange={handleChange}
              type="number"
              unit="mm"
            />
            <InputField
              label="Profundidade"
              name="outdoorDepth"
              value={formData.outdoorDepth}
              onChange={handleChange}
              type="number"
              unit="mm"
            />
            <InputField
              label="Peso"
              name="outdoorWeight"
              value={formData.outdoorWeight}
              onChange={handleChange}
              type="number"
              step={0.1}
              unit="kg"
            />
          </FieldGroup>
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <p style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            marginBottom: '1rem',
            fontWeight: 'var(--font-weight-medium)',
          }}>
            Tubulação
          </p>
          <FieldGroup columns={4}>
            <InputField
              label="Diâmetro Linha Líquido"
              name="liquidLineDiameter"
              value={formData.liquidLineDiameter}
              onChange={handleChange}
              type="number"
              step={0.01}
              unit="pol"
              hint="Ex: 1/4, 3/8"
            />
            <InputField
              label="Diâmetro Linha Sucção"
              name="suctionLineDiameter"
              value={formData.suctionLineDiameter}
              onChange={handleChange}
              type="number"
              step={0.01}
              unit="pol"
              hint="Ex: 3/8, 1/2, 5/8"
            />
            <InputField
              label="Diâmetro Dreno"
              name="drainLineDiameter"
              value={formData.drainLineDiameter}
              onChange={handleChange}
              type="number"
              unit="mm"
            />
            <InputField
              label="Comprimento Máx. Tubulação"
              name="maxPipingLength"
              value={formData.maxPipingLength}
              onChange={handleChange}
              type="number"
              unit="m"
            />
          </FieldGroup>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={4}>
            <InputField
              label="Desnível Máximo"
              name="maxHeightDifference"
              value={formData.maxHeightDifference}
              onChange={handleChange}
              type="number"
              unit="m"
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 7: Eficiência Energética */}
      <Section title="Eficiência Energética" icon={<LeafIcon />} defaultOpen={false}>
        <FieldGroup columns={4}>
          <SelectField
            label="Classe Energética (INMETRO)"
            name="energyClass"
            value={formData.energyClass}
            onChange={handleChange}
            options={energyClassOptions}
            placeholder="Selecione..."
          />
          <InputField
            label="SEER"
            name="seer"
            value={formData.seer}
            onChange={handleChange}
            type="number"
            step={0.01}
            hint="Seasonal Energy Efficiency Ratio"
          />
          <InputField
            label="EER"
            name="eer"
            value={formData.eer}
            onChange={handleChange}
            type="number"
            step={0.01}
            hint="Energy Efficiency Ratio"
          />
          <InputField
            label="COP"
            name="cop"
            value={formData.cop}
            onChange={handleChange}
            type="number"
            step={0.01}
            hint="Coefficient of Performance"
          />
        </FieldGroup>

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={4}>
            <InputField
              label="HSPF"
              name="hspf"
              value={formData.hspf}
              onChange={handleChange}
              type="number"
              step={0.01}
              hint="Heating Seasonal Performance Factor"
            />
            <InputField
              label="Consumo Mensal Estimado"
              name="monthlyConsumption"
              value={formData.monthlyConsumption}
              onChange={handleChange}
              type="number"
              step={0.1}
              unit="kWh"
            />
            <InputField
              label="Número INMETRO"
              name="inmetroNumber"
              value={formData.inmetroNumber}
              onChange={handleChange}
              placeholder="Número do registro"
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 8: Ruído */}
      <Section title="Nível de Ruído" icon={<VolumeIcon />} defaultOpen={false}>
        <FieldGroup columns={4}>
          <InputField
            label="Ruído Unidade Interna"
            name="noiseIndoor"
            value={formData.noiseIndoor}
            onChange={handleChange}
            type="number"
            unit="dB(A)"
            hint="Típico: 19-45 dB(A)"
          />
          <InputField
            label="Ruído Unidade Externa"
            name="noiseOutdoor"
            value={formData.noiseOutdoor}
            onChange={handleChange}
            type="number"
            unit="dB(A)"
            hint="Típico: 48-65 dB(A)"
          />
        </FieldGroup>
      </Section>

      {/* Seção 9: Recursos e Funções */}
      <Section title="Recursos e Funções" icon={<WifiIcon />} defaultOpen={false}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1rem',
        }}>
          <CheckboxField
            label="Wi-Fi / Smart"
            name="hasWifi"
            checked={formData.hasWifi || false}
            onChange={handleChange}
          />
          <CheckboxField
            label="Controle Remoto"
            name="hasRemoteControl"
            checked={formData.hasRemoteControl || false}
            onChange={handleChange}
          />
          <CheckboxField
            label="Timer / Programação"
            name="hasTimerFunction"
            checked={formData.hasTimerFunction || false}
            onChange={handleChange}
          />
          <CheckboxField
            label="Auto Restart"
            name="hasAutoRestart"
            checked={formData.hasAutoRestart || false}
            onChange={handleChange}
          />
          <CheckboxField
            label="Modo Sleep"
            name="hasSleepMode"
            checked={formData.hasSleepMode || false}
            onChange={handleChange}
          />
          <CheckboxField
            label="Modo Turbo"
            name="hasTurboMode"
            checked={formData.hasTurboMode || false}
            onChange={handleChange}
          />
          <CheckboxField
            label="Modo Dry (Desumidificador)"
            name="hasDryMode"
            checked={formData.hasDryMode || false}
            onChange={handleChange}
          />
          <CheckboxField
            label="Purificador de Ar"
            name="hasAirPurifier"
            checked={formData.hasAirPurifier || false}
            onChange={handleChange}
          />
          <CheckboxField
            label="Ionizador"
            name="hasIonizer"
            checked={formData.hasIonizer || false}
            onChange={handleChange}
          />
          <CheckboxField
            label="Luz UV Germicida"
            name="hasUvLight"
            checked={formData.hasUvLight || false}
            onChange={handleChange}
          />
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <FieldGroup columns={2}>
            <InputField
              label="Modelo do Controle Remoto"
              name="remoteControlModel"
              value={formData.remoteControlModel}
              onChange={handleChange}
              placeholder="Ex: AR-RAH2E"
            />
            <InputField
              label="Tipo de Filtro"
              name="filterType"
              value={formData.filterType}
              onChange={handleChange}
              placeholder="Ex: HEPA, Carvão Ativado"
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 10: Faixa de Operação */}
      <Section title="Faixa de Operação" icon={<ThermometerIcon />} defaultOpen={false}>
        <p style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-muted)',
          marginBottom: '1rem',
          fontWeight: 'var(--font-weight-medium)',
        }}>
          Modo Refrigeração
        </p>
        <FieldGroup columns={4}>
          <InputField
            label="Temperatura Mínima Externa"
            name="minOperatingTempCooling"
            value={formData.minOperatingTempCooling}
            onChange={handleChange}
            type="number"
            unit="°C"
            hint="Típico: -15 a 18°C"
          />
          <InputField
            label="Temperatura Máxima Externa"
            name="maxOperatingTempCooling"
            value={formData.maxOperatingTempCooling}
            onChange={handleChange}
            type="number"
            unit="°C"
            hint="Típico: 43 a 52°C"
          />
        </FieldGroup>

        {formData.cycle === 'quente_frio' && (
          <div style={{ marginTop: '1.5rem' }}>
            <p style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-muted)',
              marginBottom: '1rem',
              fontWeight: 'var(--font-weight-medium)',
            }}>
              Modo Aquecimento
            </p>
            <FieldGroup columns={4}>
              <InputField
                label="Temperatura Mínima Externa"
                name="minOperatingTempHeating"
                value={formData.minOperatingTempHeating}
                onChange={handleChange}
                type="number"
                unit="°C"
              />
              <InputField
                label="Temperatura Máxima Externa"
                name="maxOperatingTempHeating"
                value={formData.maxOperatingTempHeating}
                onChange={handleChange}
                type="number"
                unit="°C"
              />
            </FieldGroup>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={4}>
            <InputField
              label="Faixa de Umidade"
              name="operatingHumidityRange"
              value={formData.operatingHumidityRange}
              onChange={handleChange}
              placeholder="Ex: 30% - 80%"
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 11: Instalação */}
      <Section title="Instalação" icon={<MapPinIcon />} defaultOpen={true}>
        <FieldGroup columns={3}>
          <InputField
            label="Local de Instalação"
            name="installationLocation"
            value={formData.installationLocation}
            onChange={handleChange}
            placeholder="Ex: Sala de Reuniões"
            required
          />
          <InputField
            label="Setor / Departamento"
            name="installationSector"
            value={formData.installationSector}
            onChange={handleChange}
            placeholder="Ex: TI, Administrativo"
          />
          <InputField
            label="Andar / Pavimento"
            name="installationFloor"
            value={formData.installationFloor}
            onChange={handleChange}
            placeholder="Ex: 2º Andar"
          />
        </FieldGroup>

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={3}>
            <SelectField
              label="Tipo de Ambiente"
              name="installationEnvironment"
              value={formData.installationEnvironment}
              onChange={handleChange}
              options={environmentOptions}
              placeholder="Selecione..."
            />
            <InputField
              label="Data de Instalação"
              name="installationDate"
              value={formData.installationDate}
              onChange={handleChange}
              type="date"
            />
            <InputField
              label="Responsável pela Instalação"
              name="installationResponsible"
              value={formData.installationResponsible}
              onChange={handleChange}
              placeholder="Nome do técnico"
            />
          </FieldGroup>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={3}>
            <InputField
              label="Empresa Instaladora"
              name="installationCompany"
              value={formData.installationCompany}
              onChange={handleChange}
              placeholder="Nome da empresa"
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 12: Garantia e Compra */}
      <Section title="Garantia e Compra" icon={<ShieldIcon />} defaultOpen={false}>
        <FieldGroup columns={4}>
          <InputField
            label="Data Início Garantia"
            name="warrantyStartDate"
            value={formData.warrantyStartDate}
            onChange={handleChange}
            type="date"
          />
          <InputField
            label="Meses de Garantia"
            name="warrantyMonths"
            value={formData.warrantyMonths}
            onChange={handleChange}
            type="number"
            min={0}
            max={120}
            unit="meses"
          />
          <InputField
            label="Data Fim Garantia"
            name="warrantyEndDate"
            value={formData.warrantyEndDate}
            onChange={handleChange}
            type="date"
          />
          <InputField
            label="Fim Garantia Estendida"
            name="extendedWarrantyEndDate"
            value={formData.extendedWarrantyEndDate}
            onChange={handleChange}
            type="date"
          />
        </FieldGroup>

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={4}>
            <InputField
              label="Número da Nota Fiscal"
              name="invoiceNumber"
              value={formData.invoiceNumber}
              onChange={handleChange}
              placeholder="Ex: 000123456"
            />
            <InputField
              label="Data da Nota Fiscal"
              name="invoiceDate"
              value={formData.invoiceDate}
              onChange={handleChange}
              type="date"
            />
            <InputField
              label="Valor de Compra"
              name="purchaseValue"
              value={formData.purchaseValue}
              onChange={handleChange}
              type="number"
              step={0.01}
              unit="R$"
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 13: Manutenção Preventiva */}
      <Section title="Manutenção Preventiva" icon={<WrenchIcon />} defaultOpen={false}>
        <div style={{ marginBottom: '1rem' }}>
          <CheckboxField
            label="Habilitar cronograma de manutenção preventiva"
            name="preventiveEnabled"
            checked={formData.preventiveEnabled || false}
            onChange={handleChange}
          />
        </div>

        {formData.preventiveEnabled && (
          <FieldGroup columns={4}>
            <InputField
              label="Intervalo de Manutenção"
              name="preventiveIntervalMonths"
              value={formData.preventiveIntervalMonths}
              onChange={handleChange}
              type="number"
              min={1}
              max={24}
              unit="meses"
            />
            <InputField
              label="Última Manutenção"
              name="lastPreventiveDate"
              value={formData.lastPreventiveDate}
              onChange={handleChange}
              type="date"
            />
            <InputField
              label="Próxima Manutenção"
              name="nextPreventiveDate"
              value={formData.nextPreventiveDate}
              onChange={handleChange}
              type="date"
            />
          </FieldGroup>
        )}
      </Section>

      {/* Seção 14: Documentos */}
      <Section title="Documentos e Anexos" icon={<FileIcon />} defaultOpen={false}>
        <FieldGroup columns={2}>
          <InputField
            label="URL do Manual"
            name="manualUrl"
            value={formData.manualUrl}
            onChange={handleChange}
            type="url"
            placeholder="https://..."
          />
          <InputField
            label="URL do Datasheet"
            name="dataSheetUrl"
            value={formData.dataSheetUrl}
            onChange={handleChange}
            type="url"
            placeholder="https://..."
          />
        </FieldGroup>

        <div style={{ marginTop: '1rem' }}>
          <FieldGroup columns={2}>
            <InputField
              label="URL da Nota Fiscal"
              name="invoiceUrl"
              value={formData.invoiceUrl}
              onChange={handleChange}
              type="url"
              placeholder="https://..."
            />
            <InputField
              label="URL do Relatório de Instalação"
              name="installationReportUrl"
              value={formData.installationReportUrl}
              onChange={handleChange}
              type="url"
              placeholder="https://..."
            />
          </FieldGroup>
        </div>
      </Section>

      {/* Seção 15: Observações */}
      <Section title="Observações" icon={<MessageIcon />} defaultOpen={false}>
        <InputField
          label="Observações Gerais"
          name="observations"
          value={formData.observations}
          onChange={handleChange}
          type="textarea"
          placeholder="Informações adicionais sobre o equipamento..."
          fullWidth
        />
      </Section>

      {/* Footer com botões */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--color-border)',
      }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            height: 'var(--btn-height-md)',
            padding: '0 var(--btn-padding-md)',
            fontSize: 'var(--font-size-base)',
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-text)',
            backgroundColor: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--btn-radius)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            height: 'var(--btn-height-md)',
            padding: '0 var(--btn-padding-lg)',
            fontSize: 'var(--font-size-base)',
            fontWeight: 'var(--font-weight-medium)',
            color: '#ffffff',
            backgroundColor: 'var(--color-primary)',
            border: 'none',
            borderRadius: 'var(--btn-radius)',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.15s ease',
          }}
        >
          {isSubmitting && (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
          {mode === 'create' ? 'Cadastrar Equipamento' : 'Salvar Alterações'}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        input:focus, select:focus, textarea:focus {
          border-color: var(--color-primary) !important;
          box-shadow: 0 0 0 3px var(--color-focus-ring) !important;
        }
        
        button:hover:not(:disabled) {
          filter: brightness(0.95);
        }
        
        @media (max-width: 768px) {
          form > div > div > div {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </form>
  );
};

// ==================== MOCK DATA ====================

export const mockAirConditionerData: Partial<AirConditionerData> = {
  tag: 'AC-RECEPCAO-01',
  serialNumber: 'AJ09R5BVHN1-2024-001',
  brand: 'Samsung',
  model: 'AJ09R5BVHN1',
  productLine: 'WindFree',
  manufacturingYear: 2024,
  type: 'split_inverter',
  cycle: 'quente_frio',
  inverterTechnology: true,
  capacityBtu: 9000,
  capacityKw: 2.64,
  capacityTr: 0.75,
  voltageIndoor: '220V',
  currentIndoor: 3.5,
  powerIndoor: 25,
  voltageOutdoor: '220V',
  currentOutdoor: 4.2,
  powerOutdoor: 780,
  phases: 1,
  frequency: 60,
  compressorType: 'rotativo',
  refrigerantGas: 'R32',
  refrigerantCharge: 0.58,
  condensationType: 'ar',
  energyClass: 'A',
  seer: 6.5,
  noiseIndoor: 21,
  noiseOutdoor: 52,
  hasWifi: true,
  hasRemoteControl: true,
  hasTimerFunction: true,
  hasAutoRestart: true,
  hasSleepMode: true,
  hasTurboMode: true,
  hasDryMode: true,
  hasAirPurifier: true,
  installationLocation: 'Recepção',
  installationSector: 'Administrativo',
  installationEnvironment: 'comercial',
  status: 'ativo',
};

export default AirConditionerForm;
