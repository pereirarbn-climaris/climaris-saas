import { useEffect, useState } from "react";
import {
  addPreset,
  createEmptyPreset,
  removePreset,
  setDefaultPreset,
  updatePreset,
  type BudgetTextPreset,
} from "../../lib/budgetTextPresets";
import styles from "./BudgetTextPresetsField.module.css";

type BudgetTextPresetsFieldProps = {
  idPrefix: string;
  label: string;
  placeholder: string;
  presets: BudgetTextPreset[];
  onChange: (presets: BudgetTextPreset[]) => void;
};

export function BudgetTextPresetsField({
  idPrefix,
  label,
  placeholder,
  presets,
  onChange,
}: BudgetTextPresetsFieldProps) {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    if (!presets.length) {
      setActiveId("");
      return;
    }
    if (!activeId || !presets.some((p) => p.id === activeId)) {
      const marked = presets.find((p) => p.is_default);
      setActiveId(marked?.id ?? presets[0].id);
    }
  }, [presets, activeId]);

  const active = presets.find((p) => p.id === activeId) ?? presets[0];

  function onAdd() {
    const next = addPreset(presets, createEmptyPreset(`Modelo ${presets.length + 1}`));
    onChange(next);
    setActiveId(next[next.length - 1].id);
  }

  function onRemove() {
    if (presets.length <= 1) {
      onChange([createEmptyPreset("Padrão")]);
      return;
    }
    onChange(removePreset(presets, activeId));
  }

  if (!active) {
    return (
      <div className={styles.wrap}>
        <div className={styles.labelRow}>
          <label className={styles.label}>{label}</label>
          <button type="button" className={styles.linkBtn} onClick={onAdd}>
            + Novo modelo
          </button>
        </div>
        <p className={styles.emptyHint}>Nenhum modelo salvo. Clique em &quot;Novo modelo&quot; para começar.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={`${idPrefix}-name`}>
          {label}
        </label>
        <button type="button" className={styles.linkBtn} onClick={onAdd}>
          + Novo modelo
        </button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label={`Modelos de ${label}`}>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="tab"
            aria-selected={preset.id === activeId}
            className={`${styles.tab} ${preset.id === activeId ? styles.tabActive : ""}`}
            onClick={() => setActiveId(preset.id)}
          >
            {preset.name.trim() || "Sem nome"}
            {preset.is_default ? <span className={styles.defaultBadge}>padrão</span> : null}
          </button>
        ))}
      </div>

      <div className={styles.editor}>
        <input
          id={`${idPrefix}-name`}
          type="text"
          className={styles.nameInput}
          value={active.name}
          onChange={(e) => onChange(updatePreset(presets, active.id, { name: e.target.value }))}
          placeholder="Nome do modelo"
          maxLength={120}
        />
        <textarea
          id={`${idPrefix}-text`}
          className={styles.textarea}
          value={active.text}
          onChange={(e) => onChange(updatePreset(presets, active.id, { text: e.target.value }))}
          placeholder={placeholder}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.linkBtn}
            disabled={active.is_default}
            onClick={() => onChange(setDefaultPreset(presets, active.id))}
          >
            {active.is_default ? "Modelo padrão" : "Definir como padrão"}
          </button>
          <button type="button" className={styles.dangerBtn} onClick={onRemove}>
            Excluir modelo
          </button>
        </div>
      </div>
    </div>
  );
}
