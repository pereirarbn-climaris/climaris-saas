import type { CategoryFieldDefinition } from "../../lib/categoryFieldDefinitions";
import { getCapacityFieldMeta } from "../../lib/equipmentCategoryForm";
import styles from "./DynamicTechnicalFields.module.css";

type Props = {
  definitions: CategoryFieldDefinition[];
  values: Record<string, string>;
  errors: Record<string, string>;
  categoryName?: string;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
};

export function DynamicTechnicalFields({
  definitions,
  values,
  errors,
  categoryName,
  onChange,
  disabled,
}: Props) {
  const active = definitions.filter((d) => d.is_active);
  if (!active.length) return null;

  return (
    <div className={styles.wrap}>
      <p className={styles.sectionTitle}>Dados técnicos</p>
      {active.map((def) => {
        const label =
          def.key === "capacity" && categoryName
            ? getCapacityFieldMeta({ name: categoryName }).label.replace(" *", "")
            : def.name + (def.required ? " *" : "");
        const placeholder =
          def.key === "capacity" && categoryName
            ? getCapacityFieldMeta({ name: categoryName }).placeholder
            : def.unit
              ? `Ex: valor em ${def.unit}`
              : undefined;
        const error = errors[def.key];
        const value = values[def.key] ?? "";

        if (def.type === "select" && def.options?.length) {
          return (
            <label key={def.key} className={styles.field}>
              <span className={styles.label}>{label}</span>
              <select
                value={value}
                onChange={(e) => onChange(def.key, e.target.value)}
                disabled={disabled}
                className={styles.input}
              >
                <option value="">Selecione...</option>
                {def.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              {error ? <span className={styles.error}>{error}</span> : null}
            </label>
          );
        }

        return (
          <label key={def.key} className={styles.field}>
            <span className={styles.label}>
              {label}
              {def.unit && def.type !== "select" ? (
                <span className={styles.unit}> ({def.unit})</span>
              ) : null}
            </span>
            <input
              type={def.type === "number" ? "text" : "text"}
              inputMode={def.type === "number" ? "decimal" : "text"}
              value={value}
              onChange={(e) => onChange(def.key, e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className={styles.input}
            />
            {error ? <span className={styles.error}>{error}</span> : null}
          </label>
        );
      })}
    </div>
  );
}
