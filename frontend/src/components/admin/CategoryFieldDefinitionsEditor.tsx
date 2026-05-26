import { useCallback } from "react";
import type { CategoryFieldDraft, CategoryFieldType } from "../../lib/categoryFieldDefinitions";
import { emptyDraft } from "../../lib/categoryFieldDefinitions";
import styles from "./CategoryFieldDefinitionsEditor.module.css";

type Props = {
  fields: CategoryFieldDraft[];
  onChange: (fields: CategoryFieldDraft[]) => void;
  disabled?: boolean;
};

const TYPE_OPTIONS: { value: CategoryFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "select", label: "Lista (select)" },
];

export function CategoryFieldDefinitionsEditor({ fields, onChange, disabled }: Props) {
  const updateField = useCallback(
    (localId: string, patch: Partial<CategoryFieldDraft>) => {
      onChange(fields.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));
    },
    [fields, onChange],
  );

  const removeField = useCallback(
    (localId: string) => {
      onChange(fields.filter((f) => f.localId !== localId));
    },
    [fields, onChange],
  );

  const addField = () => {
    onChange([...fields, emptyDraft()]);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>Campos técnicos do cadastro</span>
        <button type="button" className={styles.addBtn} onClick={addField} disabled={disabled}>
          + Adicionar campo
        </button>
      </div>
      {fields.length === 0 ? (
        <p className={styles.hint}>
          Nenhum campo configurado. Os modelos desta categoria não exibirão dados técnicos no formulário.
        </p>
      ) : null}
      <ul className={styles.list}>
        {fields.map((field, index) => (
          <li key={field.localId} className={styles.row}>
            <div className={styles.rowTop}>
              <span className={styles.rowIndex}>#{index + 1}</span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeField(field.localId)}
                disabled={disabled}
                aria-label="Remover campo"
              >
                Remover
              </button>
            </div>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span>Nome *</span>
                <input
                  type="text"
                  value={field.name}
                  onChange={(e) => updateField(field.localId, { name: e.target.value })}
                  placeholder="Ex: Capacidade, Disjuntor"
                  disabled={disabled}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Tipo</span>
                <select
                  value={field.type}
                  onChange={(e) =>
                    updateField(field.localId, { type: e.target.value as CategoryFieldType })
                  }
                  disabled={disabled}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Unidade (opcional)</span>
                <input
                  type="text"
                  value={field.unit}
                  onChange={(e) => updateField(field.localId, { unit: e.target.value })}
                  placeholder="Ex: BTUs, Ampères, V"
                  disabled={disabled}
                />
              </label>
            </div>
            {field.type === "select" ? (
              <label className={styles.fieldFull}>
                <span>Opções (uma por linha)</span>
                <textarea
                  rows={3}
                  value={field.optionsText}
                  onChange={(e) => updateField(field.localId, { optionsText: e.target.value })}
                  placeholder={"R-410A\nR-32\nR-134a"}
                  disabled={disabled}
                />
              </label>
            ) : null}
            <div className={styles.checks}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(field.localId, { required: e.target.checked })}
                  disabled={disabled}
                />
                Obrigatório
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={field.is_active}
                  onChange={(e) => updateField(field.localId, { is_active: e.target.checked })}
                  disabled={disabled}
                />
                Ativo
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
