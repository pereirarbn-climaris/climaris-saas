import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Plus, Settings2 } from "lucide-react";
import {
  createFinancePaymentFee,
  deleteFinancePaymentFee,
  listFinancePaymentFees,
  type FinancePaymentFeeOut,
} from "../../api/finance";
import {
  configFromPaymentFees,
  configToFeeRows,
  PLANO_META,
} from "../../lib/financeMaquininhaUtils";
import type { MaquininhaConfig } from "../../schemas/financeMaquininha";
import { MachineRatesEditor } from "./MachineRatesEditor";
import styles from "./FinanceMachinesPage.module.css";

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
    <section className={styles.page}>
      <header className={`${styles.header} flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between`}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Maquininhas de cartão</h1>
          <p className={styles.subtitle}>
            Gestão profissional de taxas por plano de recebimento (D+0, D+1 e parcelado 30 dias).
          </p>
        </div>
        <nav className={`${styles.actions} flex flex-wrap gap-2`}>
          <Link to="/app/finance/settings/accounts" className={styles.linkBtn}>
            Contas
          </Link>
          <Link to="/app/finance/settings/cards" className={styles.linkBtn}>
            Cartões
          </Link>
          <Link to="/app/finance/settings" className={styles.linkBtn}>
            Configurações
          </Link>
        </nav>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {msg ? <p className={styles.msg}>{msg}</p> : null}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <Plus size={18} className="text-teal-700" aria-hidden />
          <h2>Nova maquininha</h2>
        </div>
        <form
          className={`${styles.row} flex flex-col gap-3 sm:flex-row sm:items-center`}
          onSubmit={(ev) => {
            ev.preventDefault();
            openNewEditor();
          }}
        >
          <input
            className={`${styles.textInput} flex-1 min-w-0`}
            value={newMachineName}
            onChange={(e) => setNewMachineName(e.target.value)}
            placeholder="Nome da maquininha (ex.: Stone)"
          />
          <button type="submit" className={styles.btnPrimary} disabled={!newMachineName.trim()}>
            Criar e configurar taxas
          </button>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <CreditCard size={18} className="text-teal-700" aria-hidden />
          <h2>Maquininhas cadastradas</h2>
        </div>
        {loading ? (
          <p className={styles.hint}>Carregando…</p>
        ) : summaries.length === 0 ? (
          <p className={styles.hint}>Nenhuma maquininha cadastrada. Crie a primeira acima.</p>
        ) : (
          <ul className={styles.machineList}>
            {summaries.map((m) => (
              <li key={m.name} className={styles.machineRow}>
                <div className={styles.machineInfo}>
                  <strong>{m.name}</strong>
                  <span className={styles.hint}>
                    {m.hasRates
                      ? `${m.planCount} planos de recebimento configurados`
                      : "Taxas ainda não configuradas"}
                  </span>
                </div>
                <button type="button" className={styles.btnSecondary} onClick={() => openEditor(m.name)}>
                  <Settings2 size={16} />
                  Gerenciar taxas
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editorConfig ? (
        <MachineRatesEditor
          initial={editorConfig}
          saving={saving}
          onClose={() => setEditorConfig(null)}
          onSave={persistConfig}
        />
      ) : null}
    </section>
  );
}
