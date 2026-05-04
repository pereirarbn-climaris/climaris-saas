import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createFinancePaymentFee, deleteFinancePaymentFee, listFinancePaymentFees, type FinancePaymentFeeOut } from "../../api/finance";
import styles from "./FinanceMachinesPage.module.css";

export function FinanceMachinesPage() {
  const [fees, setFees] = useState<FinancePaymentFeeOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newMachineName, setNewMachineName] = useState("");
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [machineName, setMachineName] = useState("");
  const [machineReceivableLabel, setMachineReceivableLabel] = useState("1 dia util");
  const [machineDebitFee, setMachineDebitFee] = useState("0");
  const [machineCreditFees, setMachineCreditFees] = useState<string[]>(Array.from({ length: 12 }, () => "0"));

  async function loadData() {
    setError(null);
    try {
      setFees(await listFinancePaymentFees());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar maquininhas.");
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const machineNames = useMemo(
    () => Array.from(new Set(fees.map((f) => f.provider_name.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [fees],
  );

  function openMachineModal(name: string) {
    const machineFees = fees.filter((f) => f.provider_name.trim().toLowerCase() === name.trim().toLowerCase());
    const debit = machineFees.find((f) => f.payment_method === "debit_card" && f.installments === 1);
    const receivable = machineFees.find((f) => f.payment_method.startsWith("receivable_"));
    const credit = Array.from({ length: 12 }, (_, i) => {
      const row = machineFees.find((f) => f.payment_method === "credit_card" && f.installments === i + 1);
      return row ? String(row.fee_percent) : "0";
    });
    setMachineName(name);
    setMachineDebitFee(debit ? String(debit.fee_percent) : "0");
    setMachineReceivableLabel(receivable ? receivable.payment_method.replace("receivable_", "").replaceAll("_", " ") : "1 dia util");
    setMachineCreditFees(credit);
    setMachineModalOpen(true);
  }

  async function saveMachineRates(ev: FormEvent) {
    ev.preventDefault();
    const provider = machineName.trim();
    if (!provider) return;
    try {
      const existing = fees.filter((f) => f.provider_name.trim().toLowerCase() === provider.toLowerCase());
      for (const row of existing) await deleteFinancePaymentFee(row.id);
      await createFinancePaymentFee({ provider_name: provider, payment_method: "debit_card", installments: 1, fee_percent: Number(machineDebitFee || "0"), fee_fixed_amount: 0, is_active: true });
      for (let i = 0; i < 12; i += 1) {
        await createFinancePaymentFee({
          provider_name: provider,
          payment_method: "credit_card",
          installments: i + 1,
          fee_percent: Number(machineCreditFees[i] || "0"),
          fee_fixed_amount: 0,
          is_active: true,
        });
      }
      const modeKey = `receivable_${machineReceivableLabel.trim().toLowerCase().replaceAll(" ", "_").slice(0, 28) || "padrao"}`;
      await createFinancePaymentFee({ provider_name: provider, payment_method: modeKey, installments: 1, fee_percent: 0, fee_fixed_amount: 0, is_active: true });
      await loadData();
      setMachineModalOpen(false);
      setMsg(`Taxas salvas para ${provider}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar taxas.");
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Maquininhas de cartão</h1>
          <p className={styles.subtitle}>Cadastre a maquininha e configure taxas de débito e crédito (1x a 12x).</p>
        </div>
        <div className={styles.actions}>
          <Link to="/app/finance/settings/accounts">Contas</Link>
          <Link to="/app/finance/settings/cards">Cartões</Link>
          <Link to="/app/finance/settings">Voltar às configurações</Link>
        </div>
      </header>
      {error ? <p className={styles.error}>{error}</p> : null}
      {msg ? <p className={styles.msg}>{msg}</p> : null}

      <section className={styles.card}>
        <h2>Nova maquininha</h2>
        <form
          className={styles.row}
          onSubmit={(ev) => {
            ev.preventDefault();
            const name = newMachineName.trim();
            if (!name) return;
            openMachineModal(name);
            setNewMachineName("");
          }}
        >
          <input value={newMachineName} onChange={(e) => setNewMachineName(e.target.value)} placeholder="Nome da maquininha (ex.: Stone)" />
          <button type="submit">Criar e configurar taxas</button>
        </form>
      </section>

      <section className={styles.card}>
        <h2>Maquininhas cadastradas</h2>
        <ul className={styles.list}>
          {machineNames.map((name) => (
            <li key={name}>
              <span>{name}</span>
              <button type="button" onClick={() => openMachineModal(name)}>
                Configurar taxas
              </button>
            </li>
          ))}
        </ul>
      </section>

      {machineModalOpen ? (
        <div className={styles.modalOverlay}>
          <form className={styles.modal} onSubmit={saveMachineRates}>
            <header>
              <h2>Taxas da maquininha</h2>
              <button type="button" onClick={() => setMachineModalOpen(false)}>
                x
              </button>
            </header>
            <label className={styles.field}>
              <span>Nome da maquininha</span>
              <input value={machineName} onChange={(e) => setMachineName(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Forma de recebimento</span>
              <input value={machineReceivableLabel} onChange={(e) => setMachineReceivableLabel(e.target.value)} placeholder="Ex.: 1 dia util" />
            </label>
            <label className={styles.field}>
              <span>Débito (%)</span>
              <input type="number" min="0" step="0.01" value={machineDebitFee} onChange={(e) => setMachineDebitFee(e.target.value)} />
            </label>
            <div className={styles.grid}>
              {machineCreditFees.map((value, idx) => (
                <label key={`cfee-${idx + 1}`} className={styles.field}>
                  <span>Crédito {idx + 1}x (%)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value}
                    onChange={(e) =>
                      setMachineCreditFees((prev) => {
                        const next = [...prev];
                        next[idx] = e.target.value;
                        return next;
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <button type="submit">Salvar taxas</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

