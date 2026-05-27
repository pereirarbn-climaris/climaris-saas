import type { ClientSiteOut } from "../../api/clients";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import styles from "./EquipmentSheetEditForm.module.css";

export type EquipmentEditDraft = {
  tag: string;
  installationReference: string;
  installationDate: string;
  status: "ativo" | "inativo";
  clientSiteId: number | null;
  componentSerials: Record<string, string>;
};

export function buildEquipmentEditDraft(equipment: EquipmentItem): EquipmentEditDraft {
  const componentSerials: Record<string, string> = {};
  for (const part of equipment.components ?? []) {
    componentSerials[part.id] = part.serialNumber ?? "";
  }
  return {
    tag: equipment.tag ?? "",
    installationReference: equipment.installationReference ?? "",
    installationDate: equipment.installationDate ?? "",
    status: equipment.status,
    clientSiteId: equipment.clientSiteId ?? null,
    componentSerials,
  };
}

type Props = {
  equipment: EquipmentItem;
  draft: EquipmentEditDraft;
  clientSites?: ClientSiteOut[];
  disabled?: boolean;
  onChange: (next: EquipmentEditDraft) => void;
};

function isMultiSplit(equipment: EquipmentItem): boolean {
  const parts = equipment.components ?? [];
  if (parts.length <= 1) return false;
  return parts.some((c) => c.componentType === "CONDENSADORA" || c.componentType === "EVAPORADORA");
}

function componentTypeLabel(type: string): string {
  if (type === "CONDENSADORA") return "Condensadora";
  if (type === "EVAPORADORA") return "Evaporadora";
  return "Unidade";
}

export function EquipmentSheetEditForm({ equipment, draft, clientSites, disabled, onChange }: Props) {
  const multiSplit = isMultiSplit(equipment);
  const primaryComponentId = equipment.components?.[0]?.id ?? null;

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="eq-edit-tag">
          Local / identificação
        </label>
        <input
          id="eq-edit-tag"
          className={styles.input}
          value={draft.tag}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, tag: e.target.value })}
          placeholder="Ex: Entrada inferior, Diretoria, Sala 01"
        />
      </div>

      {multiSplit && equipment.components ? (
        <div className={styles.fieldGroup}>
          <p className={styles.groupLabel}>Nº de série por componente</p>
          {equipment.components.map((part) => (
            <div key={part.id} className={styles.field}>
              <label className={styles.label} htmlFor={`eq-edit-serial-${part.id}`}>
                {componentTypeLabel(part.componentType)} · {part.brand} {part.model}
              </label>
              <input
                id={`eq-edit-serial-${part.id}`}
                className={styles.inputMono}
                value={draft.componentSerials[part.id] ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    componentSerials: { ...draft.componentSerials, [part.id]: e.target.value },
                  })
                }
                placeholder="Número de série"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="eq-edit-serial">
            Nº de série
          </label>
          <input
            id="eq-edit-serial"
            className={styles.inputMono}
            value={primaryComponentId ? (draft.componentSerials[primaryComponentId] ?? "") : equipment.serialNumber}
            disabled={disabled || !primaryComponentId}
            onChange={(e) => {
              if (!primaryComponentId) return;
              onChange({
                ...draft,
                componentSerials: { ...draft.componentSerials, [primaryComponentId]: e.target.value },
              });
            }}
            placeholder="Número de série"
          />
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="eq-edit-date">
            Data de instalação
          </label>
          <input
            id="eq-edit-date"
            type="date"
            className={styles.input}
            value={draft.installationDate}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, installationDate: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="eq-edit-status">
            Status
          </label>
          <select
            id="eq-edit-status"
            className={styles.input}
            value={draft.status}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...draft, status: e.target.value === "inativo" ? "inativo" : "ativo" })
            }
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
      </div>

      {clientSites && clientSites.length > 0 ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="eq-edit-site">
            Obra / filial
          </label>
          <select
            id="eq-edit-site"
            className={styles.input}
            value={draft.clientSiteId != null ? String(draft.clientSiteId) : ""}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({ ...draft, clientSiteId: raw === "" ? null : Number(raw) });
            }}
          >
            <option value="">Endereço principal / matriz</option>
            {clientSites.map((site) => (
              <option key={site.id} value={String(site.id)}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="eq-edit-reference">
          Referência de localização
        </label>
        <textarea
          id="eq-edit-reference"
          className={styles.textarea}
          rows={3}
          value={draft.installationReference}
          disabled={disabled}
          placeholder="Ex: Teto falso — sala de reunião — ao lado da janela"
          onChange={(e) => onChange({ ...draft, installationReference: e.target.value })}
        />
      </div>
    </div>
  );
}
