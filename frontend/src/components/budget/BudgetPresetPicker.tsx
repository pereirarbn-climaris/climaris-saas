import type { BudgetTextPreset } from "../../lib/budgetTextPresets";
import styles from "./BudgetPresetPicker.module.css";

type BudgetPresetPickerProps = {
  id: string;
  label: string;
  presets: BudgetTextPreset[];
  disabled?: boolean;
  onApply: (text: string) => void;
};

export function BudgetPresetPicker({ id, label, presets, disabled, onApply }: BudgetPresetPickerProps) {
  const options = presets.filter((p) => p.text.trim());
  if (!options.length) return null;

  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        disabled={disabled}
        defaultValue=""
        onChange={(e) => {
          const preset = options.find((p) => p.id === e.target.value);
          if (preset) onApply(preset.text);
          e.target.value = "";
        }}
      >
        <option value="">Aplicar modelo salvo…</option>
        {options.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name.trim() || "Modelo"}
            {preset.is_default ? " (padrão)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
