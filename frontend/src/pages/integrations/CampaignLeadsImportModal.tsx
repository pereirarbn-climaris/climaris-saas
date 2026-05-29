import { useMemo, useState } from "react";
import type { CampaignLeadInvalidRow, CampaignLeadsValidateResult } from "../../api/whatsappCampaigns";
import styles from "./WhatsappIntegrationPage.module.css";

export type EditableInvalidRow = CampaignLeadInvalidRow & {
  rowKey: string;
  removed: boolean;
};

type Props = {
  open: boolean;
  busy: boolean;
  validation: CampaignLeadsValidateResult;
  onClose: () => void;
  onConfirm: (payload: {
    leads: Array<{ name: string; phone: string }>;
    discarded_invalid_count: number;
  }) => void;
};

export function CampaignLeadsImportModal({ open, busy, validation, onClose, onConfirm }: Props) {
  const validRows = validation.valid_rows;
  const [invalidRows, setInvalidRows] = useState<EditableInvalidRow[]>(() =>
    validation.invalid_rows.map((row, i) => ({
      ...row,
      rowKey: `inv-${row.line_no}-${i}`,
      removed: false,
    })),
  );

  const activeInvalid = useMemo(() => invalidRows.filter((r) => !r.removed), [invalidRows]);
  const removedCount = invalidRows.length - activeInvalid.length;

  if (!open) return null;

  function updateInvalid(rowKey: string, patch: Partial<EditableInvalidRow>) {
    setInvalidRows((rows) => rows.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)));
  }

  function handleConfirm() {
    const fromValid = validRows.map((r) => ({ name: r.name, phone: r.phone }));
    const fromFixed = activeInvalid
      .filter((r) => r.name.trim() && r.phone_raw.trim())
      .map((r) => ({ name: r.name.trim(), phone: r.phone_raw.trim() }));
    const leads = [...fromValid, ...fromFixed];
    if (leads.length === 0) return;
    onConfirm({
      leads,
      discarded_invalid_count: removedCount + activeInvalid.filter((r) => !r.phone_raw.trim()).length,
    });
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="import-cleanup-title">
      <div className={styles.modalCard}>
        <h3 id="import-cleanup-title" className={styles.cardTitle}>
          Limpeza de lista
        </h3>
        <p className={styles.hint}>
          Identificamos <strong>{validation.invalid_count}</strong> número(s) fora do formato.
          Corrija o telefone, remova a linha ou confirme apenas os{" "}
          <strong>{validation.valid_count}</strong> válidos.
        </p>

        {validRows.length > 0 ? (
          <>
            <p className={styles.fieldLabel} style={{ marginTop: "1rem" }}>
              Prontos para importar ({validRows.length})
            </p>
            <div className={styles.tableWrap} style={{ maxHeight: "8rem", overflow: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.slice(0, 30).map((r) => (
                    <tr key={`v-${r.line_no}`}>
                      <td>{r.name}</td>
                      <td>{r.formatted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {activeInvalid.length > 0 ? (
          <>
            <p className={styles.fieldLabel} style={{ marginTop: "1rem" }}>
              Corrigir ou remover ({activeInvalid.length})
            </p>
            <div className={styles.tableWrap} style={{ maxHeight: "14rem", overflow: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Erro</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invalidRows.map((r) =>
                    r.removed ? null : (
                      <tr key={r.rowKey}>
                        <td>{r.line_no}</td>
                        <td>
                          <input
                            className={styles.textInput}
                            value={r.name}
                            onChange={(e) => updateInvalid(r.rowKey, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.textInput}
                            value={r.phone_raw}
                            placeholder="11999887766"
                            onChange={(e) => updateInvalid(r.rowKey, { phone_raw: e.target.value })}
                          />
                        </td>
                        <td className={styles.hint} style={{ fontSize: "0.75rem", maxWidth: "10rem" }}>
                          {r.error}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => updateInvalid(r.rowKey, { removed: true })}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div className={styles.row} style={{ marginTop: "1.25rem", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" className={styles.btnGhost} disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={busy || (validRows.length === 0 && activeInvalid.every((r) => !r.phone_raw.trim()))}
            onClick={handleConfirm}
          >
            Confirmar importação
          </button>
        </div>
      </div>
    </div>
  );
}
