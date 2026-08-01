import { useMemo, useState } from "react";
import type { CategoryFieldDefinition } from "../../lib/categoryFieldDefinitions";
import { getCapacityFieldMeta } from "../../lib/equipmentCategoryForm";
import {
  AC_SPEC_GROUP_LABELS,
  AC_SPEC_GROUP_ORDER,
  getAcFieldGroup,
  type AcSpecGroupId,
} from "../../lib/acEquipmentFields";
import styles from "./DynamicTechnicalFields.module.css";

type Props = {
  definitions: CategoryFieldDefinition[];
  values: Record<string, string>;
  errors: Record<string, string>;
  categoryName?: string;
  onChange: (key: string, value: string) => void;
  onRemoveField?: (key: string) => void;
  onAddField?: (key: string, value: string) => void;
  disabled?: boolean;
  /** Quando true, agrupa campos em seções (Elétrica, Tubulação, etc.). */
  grouped?: boolean;
};

const URL_PATTERN = /^https?:\/\//i;

function humanizeKey(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function AddExtraFieldRow({ onAdd }: { onAdd: (key: string, value: string) => void }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const handleAdd = () => {
    const k = key.trim().toLowerCase().replace(/\s+/g, "_");
    if (!k || !value.trim()) return;
    onAdd(k, value.trim());
    setKey("");
    setValue("");
  };

  return (
    <div className={styles.addRow}>
      <input
        type="text"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Nome da especificação (ex: peso liquido)"
        className={styles.addInput}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Valor"
        className={styles.addInput}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
      />
      <button type="button" className={styles.addBtn} onClick={handleAdd} disabled={!key.trim() || !value.trim()}>
        + Adicionar
      </button>
    </div>
  );
}

function FieldControl({
  def,
  value,
  error,
  categoryName,
  disabled,
  onChange,
}: {
  def: CategoryFieldDefinition;
  value: string;
  error?: string;
  categoryName?: string;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
}) {
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

  if (def.type === "select" && def.options?.length) {
    return (
      <label className={styles.field}>
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
    <label className={styles.field}>
      <span className={styles.label}>
        {label}
        {def.unit && def.type !== "select" ? <span className={styles.unit}> ({def.unit})</span> : null}
      </span>
      <input
        type="text"
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
}

export function DynamicTechnicalFields({
  definitions,
  values,
  errors,
  categoryName,
  onChange,
  onRemoveField,
  onAddField,
  disabled,
  grouped = false,
}: Props) {
  const active = definitions.filter((d) => d.is_active);
  const knownKeys = new Set(active.map((d) => d.key));
  const extraEntries = Object.entries(values).filter(
    ([k, v]) => !knownKeys.has(k) && typeof v === "string" && v.trim() !== "",
  );

  const [extraOpen, setExtraOpen] = useState(extraEntries.length > 0);

  const groupedDefs = useMemo(() => {
    if (!grouped) return null;
    const buckets = new Map<AcSpecGroupId | "ungrouped", CategoryFieldDefinition[]>();
    for (const id of AC_SPEC_GROUP_ORDER) buckets.set(id, []);
    buckets.set("ungrouped", []);

    for (const def of active) {
      const group = getAcFieldGroup(def.key);
      if (group) {
        buckets.get(group)!.push(def);
      } else {
        buckets.get("ungrouped")!.push(def);
      }
    }
    return buckets;
  }, [active, grouped]);

  if (!active.length && !extraEntries.length && !onAddField) return null;

  const renderFieldGrid = (defs: CategoryFieldDefinition[]) => (
    <div className={styles.wrap}>
      {defs.map((def) => (
        <FieldControl
          key={def.key}
          def={def}
          value={values[def.key] ?? ""}
          error={errors[def.key]}
          categoryName={categoryName}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </div>
  );

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
            <path d="M1 14h6M9 8h6M17 16h6" />
          </svg>
        </span>
        <div className={styles.cardHeaderText}>
          <h3 className={styles.cardTitle}>Especificações Técnicas</h3>
          <p className={styles.cardHint}>
            {grouped
              ? "Dados do manual organizados por área (elétrica, tubulação, dimensões…)."
              : "Dados extraídos do manual ou preenchidos manualmente."}
          </p>
        </div>
      </div>

      {grouped && groupedDefs ? (
        <div className={styles.groups}>
          {AC_SPEC_GROUP_ORDER.map((groupId) => {
            const defs = groupedDefs.get(groupId) ?? [];
            if (!defs.length) return null;
            // Esconde grupos vazios de valor? Não — mostra todos os campos do grupo para edição,
            // mesmo vazios, pois o admin precisa ver o que o manual pode preencher.
            const meta = AC_SPEC_GROUP_LABELS[groupId];
            const filled = defs.filter((d) => (values[d.key] ?? "").trim()).length;
            return (
              <section key={groupId} className={styles.group} data-group={groupId}>
                <div className={styles.groupHeader}>
                  <div>
                    <h4 className={styles.groupTitle}>{meta.title}</h4>
                    <p className={styles.groupHint}>{meta.hint}</p>
                  </div>
                  {filled > 0 ? (
                    <span className={styles.groupBadge}>
                      {filled}/{defs.length} preenchido{filled === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                {renderFieldGrid(defs)}
              </section>
            );
          })}
          {(groupedDefs.get("ungrouped") ?? []).length > 0 ? (
            <section className={styles.group}>
              <div className={styles.groupHeader}>
                <div>
                  <h4 className={styles.groupTitle}>Outros campos da categoria</h4>
                </div>
              </div>
              {renderFieldGrid(groupedDefs.get("ungrouped")!)}
            </section>
          ) : null}
        </div>
      ) : active.length > 0 ? (
        renderFieldGrid(active)
      ) : null}

      {extraEntries.length > 0 || onAddField ? (
        <div className={styles.extraWrap}>
          <button
            type="button"
            className={styles.extraToggle}
            onClick={() => setExtraOpen((o) => !o)}
            aria-expanded={extraOpen}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.extraToggleIcon}
              style={{ transform: extraOpen ? "rotate(90deg)" : "none" }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {extraEntries.length > 0
              ? `${extraEntries.length} especificação${extraEntries.length === 1 ? "" : "ões"} adicional${
                  extraEntries.length === 1 ? "" : "is"
                } do manual`
              : "Adicionar especificação personalizada"}
          </button>

          {extraOpen ? (
            <div className={styles.extraList}>
              {extraEntries.map(([k, v]) => (
                <div key={k} className={styles.extraRow}>
                  <span className={styles.extraLabel} title={k}>
                    {humanizeKey(k)}
                  </span>
                  {URL_PATTERN.test(v) ? (
                    <a href={v} target="_blank" rel="noreferrer" className={styles.extraLink}>
                      {v}
                    </a>
                  ) : (
                    <input
                      type="text"
                      value={v}
                      disabled={disabled}
                      onChange={(e) => onChange(k, e.target.value)}
                      className={styles.extraInput}
                    />
                  )}
                  {onRemoveField ? (
                    <button
                      type="button"
                      className={styles.extraRemove}
                      onClick={() => onRemoveField(k)}
                      disabled={disabled}
                      aria-label={`Remover ${humanizeKey(k)}`}
                      title="Remover"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {onAddField ? <AddExtraFieldRow onAdd={onAddField} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
