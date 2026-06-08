import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Plus, Settings2, Smartphone } from "lucide-react";
import {
  createFinancePaymentFee,
  deleteFinancePaymentFee,
  listFinancePaymentFees,
  type FinancePaymentFeeOut,
} from "../../api/finance";
import {
  FinanceCadastroPageShell,
  financeCadastroShellStyles as shell,
} from "../../components/finance/FinanceCadastroPageShell";
import {
  configFromPaymentFees,
  configToFeeRows,
  PLANO_META,
} from "../../lib/financeMaquininhaUtils";
import type { MaquininhaConfig } from "../../schemas/financeMaquininha";
import { MachineRatesEditor } from "./MachineRatesEditor";
import styles from "./FinanceMachinesPage.module.css";

const CADASTRO_NAV = [
  { to: "/app/finance/settings/accounts", label: "Contas" },
  { to: "/app/finance/settings/cards", label: "Cartões" },
  { to: "/app/finance/settings/machines", label: "Maquininhas", active: true },
];

type MachineSummary = {
  name: string;
  planCount: number;
  hasRates: boolean;
};

function summarizeMachine(name: string, fees: FinancePaymentFeeOut[]): MachineSummary {
  const rows = fees.filter((f) => f.provider_name.trim().toLowerCase() === name.trim().toLowerCase());
  const config = configFromPaymentFees(name, rows);
  const hasRates = Object.values(config.planos).some(
    (p) => p.taxaDebito > 0 || Object.values(p.taxasCredito).some((t) => t > 0),
  );
  return { name, planCount: 3, hasRates };
}

export function FinanceMachinesPage() {
  const [fees, setFees] = useState<FinancePaymentFeeOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [editorConfig, setEditorConfig] = useState<MaquininhaConfig | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      setFees(await listFinancePaymentFees());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar maquininhas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const machineNames = useMemo(
    () =>
      Array.from(new Set(fees.map((f) => f.provider_name.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [fees],
  );

  const summaries = useMemo(
    () => machineNames.map((name) => summarizeMachine(name, fees)),
    [machineNames, fees],
  );

  function openEditor(name: string) {
    const config = configFromPaymentFees(name, fees);
    setEditorConfig(config);
    setMsg(null);
    setError(null);
  }

  function openNewEditor() {
    const name = newMachineName.trim();
    if (!name) return;
    openEditor(name);
    setNewMachineName("");
  }

  async function persistConfig(config: MaquininhaConfig) {
    const provider = config.nomeMaquininha.trim();
    if (!provider) return;
    setSaving(true);
    setError(null);
    try {
      const existing = fees.filter((f) => f.provider_name.trim().toLowerCase() === provider.toLowerCase());
      for (const row of existing) await deleteFinancePaymentFee(row.id);
      const payloads = configToFeeRows(config);
      for (const payload of payloads) {
        await createFinancePaymentFee(payload);
      }
      await loadData();
      setEditorConfig(null);
      setMsg(`Taxas salvas para ${provider} (${Object.keys(PLANO_META).length} planos de recebimento).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar taxas.");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  return (
    <FinanceCadastroPageShell
      breadcrumb="Financeiro · Cadastros · Maquininhas"
      title="Maquininhas de cartão"
      subtitle="Gestão de taxas por plano de recebimento (D+0, D+1 e parcelado 30 dias)."
      navLinks={CADASTRO_NAV}
      error={error}
      msg={msg}
    >
      <article className={shell.panel}>
        <div className={shell.panelHead}>
          <span className={`${shell.panelIcon} ${shell.panelIconSuccess}`}>
            <Plus aria-hidden />
          </span>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>Nova maquininha</h2>
            <p className={shell.panelDesc}>Informe o nome e configure as taxas por bandeira e parcela.</p>
          </div>
        </div>
        <div className={shell.panelBody}>
          <form
            className={styles.newForm}
            onSubmit={(ev) => {
              ev.preventDefault();
              openNewEditor();
            }}
          >
            <input
              className={shell.input}
              value={newMachineName}
              onChange={(e) => setNewMachineName(e.target.value)}
              placeholder="Nome da maquininha (ex.: Stone)"
              aria-label="Nome da nova maquininha"
            />
            <button type="submit" className={shell.btnPrimary} disabled={!newMachineName.trim()}>
              <Plus aria-hidden />
              Criar e configurar taxas
            </button>
          </form>
        </div>
      </article>

      <article className={shell.panel}>
        <div className={shell.panelHead}>
          <span className={shell.panelIcon}>
            <Smartphone aria-hidden />
          </span>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>Maquininhas cadastradas</h2>
            <p className={shell.panelDesc}>
              {loading ? "Carregando…" : `${summaries.length} maquininha(s) no workspace.`}
            </p>
          </div>
        </div>
        <div className={shell.panelBody}>
          {loading ? (
            <p className={styles.loadingHint}>Carregando maquininhas…</p>
          ) : summaries.length === 0 ? (
            <div className={styles.emptyState}>
              <CreditCard aria-hidden />
              <p>Nenhuma maquininha cadastrada. Crie a primeira acima.</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {summaries.map((m) => (
                <li key={m.name} className={styles.machineRow}>
                  <div className={styles.machineInfo}>
                    <strong>{m.name}</strong>
                    <span className={`${styles.machineStatus} ${m.hasRates ? styles.machineStatusConfigured : ""}`}>
                      {m.hasRates
                        ? `${m.planCount} planos de recebimento configurados`
                        : "Taxas ainda não configuradas"}
                    </span>
                  </div>
                  <button type="button" className={shell.btnSecondary} onClick={() => openEditor(m.name)}>
                    <Settings2 aria-hidden />
                    Gerenciar taxas
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      {editorConfig ? (
        <MachineRatesEditor
          initial={editorConfig}
          saving={saving}
          onClose={() => setEditorConfig(null)}
          onSave={persistConfig}
        />
      ) : null}
    </FinanceCadastroPageShell>
  );
}
