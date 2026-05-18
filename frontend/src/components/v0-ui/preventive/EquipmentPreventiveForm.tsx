import React, { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Info, Loader2, X, Check } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export type IntervalType = 'months' | 'days';

export interface PreventiveScheduleConfig {
  enabled: boolean;
  intervalValue: number;
  intervalType: IntervalType;
}

export interface EquipmentPreventiveFormProps {
  /** Initial configuration from API */
  initialConfig?: PreventiveScheduleConfig;
  /** Equipment ID for context */
  equipmentId?: string;
  /** Equipment name for display */
  equipmentName?: string;
  /** Called when form is submitted */
  onSubmit?: (config: PreventiveScheduleConfig) => Promise<void> | void;
  /** Called when cancel is clicked */
  onCancel?: () => void;
  /** Show cancel button */
  showCancel?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const defaultConfig: PreventiveScheduleConfig = {
  enabled: false,
  intervalValue: 3,
  intervalType: 'months',
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

// Toggle Switch Component
function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? 'bg-[var(--color-primary)]' : 'bg-slate-200'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg
          ring-0 transition-transform duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  );
}

// Select Component
function Select({
  value,
  onChange,
  options,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`
          h-[var(--btn-height-base)] w-full appearance-none rounded-lg border
          border-[var(--color-border)] bg-white px-3 pr-8
          text-[var(--font-size-base)] text-[var(--color-text)]
          transition-colors duration-150
          focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]
          disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60
        `}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

// Number Input Component
function NumberInput({
  value,
  onChange,
  min,
  max,
  disabled,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  id?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      if (min !== undefined && val < min) return;
      if (max !== undefined && val > max) return;
      onChange(val);
    }
  };

  return (
    <input
      type="number"
      id={id}
      value={value}
      onChange={handleChange}
      min={min}
      max={max}
      disabled={disabled}
      className={`
        h-[var(--btn-height-base)] w-full rounded-lg border border-[var(--color-border)]
        bg-white px-3 text-center text-[var(--font-size-base)] text-[var(--color-text)]
        transition-colors duration-150
        focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]
        disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60
        [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
      `}
    />
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function EquipmentPreventiveForm({
  initialConfig,
  equipmentId,
  equipmentName,
  onSubmit,
  onCancel,
  showCancel = true,
  className = '',
}: EquipmentPreventiveFormProps) {
  // Merge initial config with defaults
  const [config, setConfig] = useState<PreventiveScheduleConfig>({
    ...defaultConfig,
    ...initialConfig,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes
  useEffect(() => {
    const initial = initialConfig || defaultConfig;
    const changed =
      config.enabled !== initial.enabled ||
      config.intervalValue !== initial.intervalValue ||
      config.intervalType !== initial.intervalType;
    setHasChanges(changed);
  }, [config, initialConfig]);

  // Handlers
  const handleToggle = useCallback((enabled: boolean) => {
    setConfig((prev) => ({ ...prev, enabled }));
  }, []);

  const handleIntervalValueChange = useCallback((intervalValue: number) => {
    setConfig((prev) => ({ ...prev, intervalValue }));
  }, []);

  const handleIntervalTypeChange = useCallback((intervalType: string) => {
    setConfig((prev) => ({ ...prev, intervalType: intervalType as IntervalType }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;

    setIsSubmitting(true);
    try {
      await onSubmit(config);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Reset to initial
    setConfig({ ...defaultConfig, ...initialConfig });
    onCancel?.();
  };

  // Generate helper text
  const getHelperText = (): string => {
    if (!config.enabled) {
      return 'O cronograma preventivo está desativado. Ative para configurar alertas automáticos de manutenção.';
    }

    const typeLabel = config.intervalType === 'months' ? 'mês' : 'dia';
    const typeLabelPlural = config.intervalType === 'months' ? 'meses' : 'dias';
    const intervalLabel = config.intervalValue === 1 ? typeLabel : typeLabelPlural;

    return `Este equipamento gerará alertas automáticos na aba de Gestão Preventiva a cada ${config.intervalValue} ${intervalLabel} após a conclusão da última Ordem de Serviço.`;
  };

  return (
    <form onSubmit={handleSubmit} className={`${className}`}>
      {/* Card Container */}
      <div className="rounded-xl bg-slate-50/50 p-5 sm:p-6">
        {/* Header */}
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10">
            <CalendarClock
              className="h-5 w-5 text-[var(--color-primary)]"
              strokeWidth={1.75}
            />
          </div>
          <div className="flex-1">
            <h3 className="text-[var(--font-size-lg)] font-semibold text-[var(--color-text)]">
              Configuracao de Recorrencia Preventiva
            </h3>
            {equipmentName && (
              <p className="mt-0.5 text-[var(--font-size-sm)] text-[var(--color-text-muted)]">
                Equipamento: {equipmentName}
              </p>
            )}
          </div>
        </div>

        {/* Toggle Section */}
        <div className="mb-5 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-white p-4">
          <div className="flex-1">
            <label
              htmlFor="preventive-toggle"
              className="cursor-pointer text-[var(--font-size-base)] font-medium text-[var(--color-text)]"
            >
              Ativar Cronograma Preventivo
            </label>
            <p className="mt-0.5 text-[var(--font-size-sm)] text-[var(--color-text-muted)]">
              Receba alertas automaticos para manutencao programada
            </p>
          </div>
          <Switch
            id="preventive-toggle"
            checked={config.enabled}
            onCheckedChange={handleToggle}
            disabled={isSubmitting}
          />
        </div>

        {/* Interval Configuration (visible only when enabled) */}
        <div
          className={`
            overflow-hidden transition-all duration-300 ease-in-out
            ${config.enabled ? 'mb-5 max-h-40 opacity-100' : 'max-h-0 opacity-0'}
          `}
        >
          <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <label className="mb-3 block text-[var(--font-size-sm)] font-medium text-[var(--color-text)]">
              Intervalo entre manutencoes
            </label>
            <div className="flex items-center gap-3">
              <div className="w-24">
                <NumberInput
                  id="interval-value"
                  value={config.intervalValue}
                  onChange={handleIntervalValueChange}
                  min={1}
                  max={365}
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex-1">
                <Select
                  id="interval-type"
                  value={config.intervalType}
                  onChange={handleIntervalTypeChange}
                  disabled={isSubmitting}
                  options={[
                    { value: 'months', label: 'Meses' },
                    { value: 'days', label: 'Dias' },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Helper Text */}
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-sky-100 bg-sky-50/50 p-4">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]"
            strokeWidth={1.75}
          />
          <p className="text-[var(--font-size-sm)] leading-relaxed text-[var(--color-text-muted)]">
            {getHelperText()}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {showCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className={`
                flex h-[var(--btn-height-base)] items-center justify-center gap-2
                rounded-lg border border-[var(--color-border)] bg-white
                px-[var(--btn-padding-md)] text-[var(--font-size-base)] font-medium
                text-[var(--color-text)] transition-colors duration-150
                hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]
                disabled:cursor-not-allowed disabled:opacity-50
              `}
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !hasChanges}
            className={`
              flex h-[var(--btn-height-base)] items-center justify-center gap-2
              rounded-lg bg-[var(--color-primary)] px-[var(--btn-padding-md)]
              text-[var(--font-size-base)] font-medium text-white
              transition-colors duration-150
              hover:bg-[var(--color-primary-hover)]
              focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]
              disabled:cursor-not-allowed disabled:opacity-50
            `}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" strokeWidth={1.75} />
                Salvar Configuracao
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

// =============================================================================
// MOCK DATA FOR TESTING
// =============================================================================

export const mockPreventiveConfig: PreventiveScheduleConfig = {
  enabled: true,
  intervalValue: 3,
  intervalType: 'months',
};

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/*
import { EquipmentPreventiveForm, PreventiveScheduleConfig } from '@/components/v0-ui/preventive';

function MyComponent() {
  const handleSubmit = async (config: PreventiveScheduleConfig) => {
    await api.updatePreventiveSchedule(equipmentId, config);
    toast.success('Configuração salva com sucesso!');
  };

  return (
    <EquipmentPreventiveForm
      initialConfig={{ enabled: true, intervalValue: 6, intervalType: 'months' }}
      equipmentId="eq-123"
      equipmentName="Split Inverter 12000 BTUs"
      onSubmit={handleSubmit}
      onCancel={() => setShowForm(false)}
    />
  );
}
*/

export default EquipmentPreventiveForm;
