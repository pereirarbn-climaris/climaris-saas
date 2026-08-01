import type { ClientSiteOut } from "../../api/clients";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import styles from "./EquipmentSheetEditForm.module.css";

export type EquipmentEditDraft = {
  tag: string;
  installationReference: string;
  installationDate: string;
  manufactureYear: string;
  gasChargeKg: string;
  notes: string;
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
    manufactureYear: equipment.manufactureYear != null ? String(equipment.manufactureYear) : "",
    gasChargeKg: equipment.gasChargeKg != null ? String(equipment.gasChargeKg) : "",
    notes: equipment.notes ?? "",
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
  const capacityLabel = equipment.specs?.capacityBTU
    ? `${new Intl.NumberFormat("pt-BR").format(equipment.specs.capacityBTU)} BTUs`
    : "—";

  return (
    <div className={styles.form}>
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Informações gerais</h3>
        <p className={styles.cardSubtitle}>Identificação e vínculo do equipamento na unidade/filial.</p>

        <div className={styles.readonlyGrid}>
          <div className={styles.readonlyItem}>
            <p className={styles.readonlyLabel}>Tipo</p>
            <p className={styles.readonlyValue}>{equipment.categoryName || "Equipamento"}</p>
          </div>
          <div className={styles.readonlyItem}>
            <p className={styles.readonlyLabel}>Marca</p>
            <p className={styles.readonlyValue}>{equipment.brandName || "—"}</p>
          </div>
          <div className={styles.readonlyItem}>
            <p className={styles.readonlyLabel}>Modelo</p>
            <p className={styles.readonlyValue}>{equipment.modelName || "—"}</p>
          </div>
          <div className={styles.readonlyItem}>
            <p className={styles.readonlyLabel}>Capacidade</p>
            <p className={styles.readonlyValue}>{capacityLabel}</p>
          </div>
          {equipment.specs?.voltage ? (
            <div className={styles.readonlyItem}>
              <p className={styles.readonlyLabel}>Tensão</p>
              <p className={styles.readonlyValue}>{equipment.specs.voltage}</p>
            </div>
          ) : null}
          {equipment.specs?.gasType ? (
            <div className={styles.readonlyItem}>
              <p className={styles.readonlyLabel}>Fluido</p>
              <p className={styles.readonlyValue}>{equipment.specs.gasType}</p>
            </div>
          ) : null}
        </div>

        <div className={styles.grid3}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="eq-edit-tag">
              TAG / Identificação *
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
            equipment.components.map((part) => (
              <div key={part.id} className={styles.field}>
                <label className={styles.label} htmlFor={`eq-edit-serial-${part.id}`}>
                  Nº de série · {componentTypeLabel(part.componentType)}
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
            ))
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
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Localização</h3>
        <p className={styles.cardSubtitle}>Onde o equipamento está instalado no cliente.</p>

        <div className={styles.grid2}>
          {clientSites && clientSites.length > 0 ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="eq-edit-site">
                Unidade / Filial
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

          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label className={styles.label} htmlFor="eq-edit-reference">
              Local / Ambiente / Referência
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
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Detalhes técnicos adicionais</h3>
        <p className={styles.cardSubtitle}>Opcional — ajuda o técnico e entra nos relatórios de PMOC.</p>

        <div className={styles.grid3}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="eq-edit-year">
              Ano de fabricação
            </label>
            <input
              id="eq-edit-year"
              type="number"
              inputMode="numeric"
              className={styles.input}
              value={draft.manufactureYear}
              disabled={disabled}
              min={1970}
              max={2100}
              onChange={(e) => onChange({ ...draft, manufactureYear: e.target.value })}
              placeholder="Ex: 2024"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="eq-edit-gas">
              Carga de gás (kg)
            </label>
            <input
              id="eq-edit-gas"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              className={styles.input}
              value={draft.gasChargeKg}
              disabled={disabled}
              onChange={(e) => onChange({ ...draft, gasChargeKg: e.target.value })}
              placeholder="Ex: 1,05"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="eq-edit-notes">
            Observações
          </label>
          <textarea
            id="eq-edit-notes"
            className={styles.textarea}
            rows={3}
            value={draft.notes}
            disabled={disabled}
            placeholder="Ex: Acesso difícil, cliente pediu atenção especial, equipamento antigo..."
            onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          />
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Status do equipamento</h3>
        <p className={styles.cardSubtitle}>Defina se o aparelho está ativo ou inativo no cadastro.</p>
        <div className={styles.statusGroup} role="radiogroup" aria-label="Status do equipamento">
          <button
            type="button"
            className={`${styles.statusBtn} ${styles.statusGreen} ${draft.status === "ativo" ? styles.statusBtnActive : ""}`}
            disabled={disabled}
            aria-pressed={draft.status === "ativo"}
            onClick={() => onChange({ ...draft, status: "ativo" })}
          >
            <span className={styles.statusDot} aria-hidden />
            Ativo
          </button>
          <button
            type="button"
            className={`${styles.statusBtn} ${styles.statusGray} ${draft.status === "inativo" ? styles.statusBtnActive : ""}`}
            disabled={disabled}
            aria-pressed={draft.status === "inativo"}
            onClick={() => onChange({ ...draft, status: "inativo" })}
          >
            <span className={styles.statusDot} aria-hidden />
            Inativo
          </button>
        </div>
      </section>
    </div>
  );
}
