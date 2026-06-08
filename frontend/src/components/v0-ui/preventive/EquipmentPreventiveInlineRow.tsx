import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { IntervalType, PreventiveScheduleConfig } from "./EquipmentPreventiveForm";
import styles from "./EquipmentPreventiveInlineRow.module.css";

export type EquipmentPreventiveInlineRowProps = {
  equipmentKey: string;
  disabled?: boolean;
  initialConfig: PreventiveScheduleConfig;
  onSave: (config: PreventiveScheduleConfig) => Promise<void>;
  /** Atualiza prévia do próximo vencimento no cadastro do cliente enquanto o usuário edita. */
  onConfigChange?: (config: PreventiveScheduleConfig) => void;
};

function InlineSwitch({
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`${styles.switch} ${checked ? styles.switchOn : ""}`}
    >
      <span className={`${styles.switchThumb} ${checked ? styles.switchThumbOn : ""}`} />
    </button>
  );
}

export function EquipmentPreventiveInlineRow({
  equipmentKey,
  disabled = false,
  initialConfig,
  onSave,
  onConfigChange,
}: EquipmentPreventiveInlineRowProps) {
  const [config, setConfig] = useState<PreventiveScheduleConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setConfig(initialConfig);
    setDirty(false);
  }, [initialConfig, equipmentKey]);

  useEffect(() => {
    const changed =
      config.enabled !== initialConfig.enabled ||
      config.intervalValue !== initialConfig.intervalValue ||
      config.intervalType !== initialConfig.intervalType;
    setDirty(changed);
  }, [config, initialConfig]);

  useEffect(() => {
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(config);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [config, onSave]);

  const toggleId = `preventive-toggle-${equipmentKey}`;
  const valueId = `preventive-value-${equipmentKey}`;
  const typeId = `preventive-type-${equipmentKey}`;

  return (
    <div className={styles.rowControls}>
      <div className={styles.toggleWrap}>
        <label htmlFor={toggleId} className={styles.toggleLabel}>
          Cronograma
        </label>
        <InlineSwitch
          id={toggleId}
          checked={config.enabled}
          disabled={disabled || saving}
          onCheckedChange={(enabled) => setConfig((prev) => ({ ...prev, enabled }))}
        />
      </div>

      <div className={`${styles.intervalWrap} ${config.enabled ? "" : styles.intervalDisabled}`}>
        <input
          id={valueId}
          type="number"
          min={1}
          max={365}
          value={config.intervalValue}
          disabled={disabled || saving || !config.enabled}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!Number.isNaN(val) && val >= 1 && val <= 365) {
              setConfig((prev) => ({ ...prev, intervalValue: val }));
            }
          }}
          className={styles.numberInput}
          aria-label="Intervalo"
        />
        <select
          id={typeId}
          value={config.intervalType}
          disabled={disabled || saving || !config.enabled}
          onChange={(e) =>
            setConfig((prev) => ({
              ...prev,
              intervalType: e.target.value as IntervalType,
            }))
          }
          className={styles.select}
          aria-label="Unidade do intervalo"
        >
          <option value="months">Meses</option>
          <option value="days">Dias</option>
        </select>
      </div>

      <button
        type="button"
        className={styles.saveBtn}
        disabled={disabled || saving || !dirty}
        onClick={() => void handleSave()}
      >
        {saving ? (
          <>
            <Loader2 className={styles.saveIcon} strokeWidth={1.75} aria-hidden />
            Salvando
          </>
        ) : (
          <>
            <Check className={styles.saveIcon} strokeWidth={1.75} aria-hidden />
            Salvar
          </>
        )}
      </button>
    </div>
  );
}
