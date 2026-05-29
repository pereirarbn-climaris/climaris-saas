import { useCallback, useMemo, useState, type FormEvent } from "react";
import { CreditCard, Info, Landmark, Save, X } from "lucide-react";
import {
  configToFeeRows,
  formatTaxaDisplay,
  parseTaxaInput,
  PLANO_META,
} from "../../lib/financeMaquininhaUtils";
import {
  MaquininhaConfigSchema,
  PLANO_RECEBIMENTO_VALUES,
  type MaquininhaConfig,
  type PlanoRecebimento,
} from "../../schemas/financeMaquininha";
import { MachineProfitSimulator } from "./MachineProfitSimulator";
import styles from "./FinanceMachinesPage.module.css";

type Props = {
  initial: MaquininhaConfig;
  saving: boolean;
  onClose: () => void;
  onSave: (config: MaquininhaConfig) => Promise<void>;
};

export function MachineRatesEditor({ initial, saving, onClose, onSave }: Props) {
  const [config, setConfig] = useState<MaquininhaConfig>(() => structuredClone(initial));
  const [activePlan, setActivePlan] = useState<PlanoRecebimento>("D1");
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeMeta = PLANO_META[activePlan];
  const activeTaxas = config.planos[activePlan];

  const creditEntries = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), label: `${i + 1}x` })),
    [],
  );

  const updatePlano = useCallback(
    (plan: PlanoRecebimento, patch: Partial<typeof activeTaxas>) => {
      setConfig((prev) => ({
        ...prev,
        planos: {
          ...prev.planos,
          [plan]: { ...prev.planos[plan], ...patch },
        },
      }));
    },
    [],
  );

  const setDebitTaxa = useCallback(
    (plan: PlanoRecebimento, raw: string) => {
      updatePlano(plan, { taxaDebito: parseTaxaInput(raw) });
    },
    [updatePlano],
  );

  const setCreditTaxa = useCallback((plan: PlanoRecebimento, parcela: string, raw: string) => {
    setConfig((prev) => ({
      ...prev,
      planos: {
        ...prev.planos,
        [plan]: {
          ...prev.planos[plan],
          taxasCredito: {
            ...prev.planos[plan].taxasCredito,
            [parcela]: parseTaxaInput(raw),
          },
        },
      },
    }));
  }, []);

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setValidationError(null);
    const parsed = MaquininhaConfigSchema.safeParse(config);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      setValidationError(first?.message ?? "Revise os campos de taxa.");
      return;
    }
    try {
      await onSave(parsed.data);
    } catch {
      /* mensagem de erro tratada na página pai */
    }
  }

  return (
    <div className={styles.editorOverlay} role="dialog" aria-modal="true" aria-labelledby="machine-editor-title">
      <div className={styles.editorPanel}>
        <form className={styles.editorForm} onSubmit={(ev) => void handleSubmit(ev)}>
          <header className={styles.editorHeader}>
            <div>
              <h2 id="machine-editor-title">Gestão de taxas</h2>
              <p className={styles.editorLead}>Configure planos de recebimento, débito e crédito parcelado.</p>
            </div>
            <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar">
              <X size={20} />
            </button>
          </header>

          <label className={styles.nameField}>
            <span>Nome da maquininha</span>
            <input
              value={config.nomeMaquininha}
              onChange={(e) => setConfig((prev) => ({ ...prev, nomeMaquininha: e.target.value }))}
              placeholder="Ex.: Stone, PagSeguro, Cielo"
              disabled={saving}
            />
          </label>

          <div className={styles.planSection}>
            <div className={styles.planSectionHead}>
              <p className={styles.sectionLabel}>Plano de recebimento</p>
              <p className={styles.sectionHint}>
                <Info size={14} aria-hidden />
                Cada plano possui taxas independentes. O plano D+1 alimenta os lançamentos automáticos no financeiro.
              </p>
            </div>

            <div className={styles.planTabs} role="tablist" aria-label="Planos de recebimento">
              {PLANO_RECEBIMENTO_VALUES.map((plan) => {
                const meta = PLANO_META[plan];
                const isActive = activePlan === plan;
                return (
                  <button
                    key={plan}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`${styles.planTab} ${isActive ? styles.planTabActive : ""}`}
                    onClick={() => setActivePlan(plan)}
                  >
                    {meta.shortLabel}
                    {meta.defaultForEntries ? (
                      <span className={styles.planTabBadge}>Lançamentos</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <p className={styles.planDescription}>{activeMeta.description}</p>
          </div>

          <div className={`${styles.editorBody} lg:grid lg:grid-cols-[1fr_minmax(260px,300px)] lg:gap-6`}>
            <div className={styles.editorMain}>
              <section className={styles.feeSection}>
                <h3 className={styles.feeSectionTitle}>
                  <Landmark size={16} aria-hidden />
                  Débito
                </h3>
                <label className={styles.rateField}>
                  <span>Taxa no débito (%)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.rateInput}
                    value={formatTaxaDisplay(activeTaxas.taxaDebito)}
                    disabled={saving}
                    onChange={(e) => setDebitTaxa(activePlan, e.target.value)}
                  />
                </label>
              </section>

              <section className={styles.feeSection}>
                <h3 className={styles.feeSectionTitle}>
                  <CreditCard size={16} aria-hidden />
                  Crédito parcelado (1x a 12x)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {creditEntries.map(({ key, label }) => (
                    <label key={key} className={styles.rateFieldCompact}>
                      <span>{label}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={styles.rateInput}
                        value={formatTaxaDisplay(activeTaxas.taxasCredito[key] ?? 0)}
                        disabled={saving}
                        onChange={(e) => setCreditTaxa(activePlan, key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <MachineProfitSimulator planoTaxas={activeTaxas} planLabel={activeMeta.label} />
          </div>

          {validationError ? <p className={styles.error}>{validationError}</p> : null}

          <footer className={styles.editorFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              <Save size={16} />
              {saving ? "Salvando…" : "Salvar taxas"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/** Exportado para testes — valida antes de persistir. */
export function validateMaquininhaConfig(config: MaquininhaConfig) {
  return MaquininhaConfigSchema.safeParse(config);
}

export function buildFeeRowsFromConfig(config: MaquininhaConfig) {
  return configToFeeRows(config);
}
