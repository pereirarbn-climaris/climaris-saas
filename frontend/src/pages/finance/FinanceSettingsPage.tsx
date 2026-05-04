import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  getFinanceCashflow,
  getFinanceSettings,
  sendFinanceDueReminders,
  updateFinanceSettings,
  type FinanceCashflowOut,
  type FinanceSettingsOut,
} from "../../api/finance";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./FinanceSettingsPage.module.css";

export function FinanceSettingsPage() {
  const { user } = useOutletContext<DashboardOutletContext>();
  const isAdmin = user.role === "admin";
  const [settings, setSettings] = useState<FinanceSettingsOut | null>(null);
  const [cashflow, setCashflow] = useState<FinanceCashflowOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [remindDate, setRemindDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashflowStart, setCashflowStart] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [cashflowEnd, setCashflowEnd] = useState(() => new Date().toISOString().slice(0, 10));

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const s = await getFinanceSettings();
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function saveSettings(next: { finance_enabled: boolean; finance_mode: "basic" | "intermediate" | "management" }) {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await updateFinanceSettings(next);
      await loadData();
      setMsg("Configurações salvas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function fireReminders() {
    try {
      const r = await sendFinanceDueReminders({ due_date: remindDate, mode: "manual" });
      setMsg(`Lembretes enviados: ${r.sent}/${r.eligible}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar lembretes.");
    }
  }


  async function loadCashflow() {
    try {
      const out = await getFinanceCashflow({ start_date: cashflowStart, end_date: cashflowEnd });
      setCashflow(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar fluxo de caixa.");
    }
  }

  if (loading) return <section className={styles.page}>Carregando...</section>;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>Configurações do Financeiro</h1>
        <div className={styles.row}>
          <Link to="/app/finance/settings/accounts">Contas</Link>
          <Link to="/app/finance/settings/cards">Cartões</Link>
          <Link to="/app/finance/settings/machines">Maquininhas</Link>
          <Link to="/app/finance">Voltar ao Financeiro</Link>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {msg ? <p className={styles.msg}>{msg}</p> : null}

      {settings ? (
        <section className={styles.card}>
          <h2>Módulo financeiro</h2>
          <div className={styles.row}>
            <label>
              <input
                type="checkbox"
                checked={settings.finance_enabled}
                disabled={!isAdmin || saving}
                onChange={(e) =>
                  void saveSettings({ finance_enabled: e.target.checked, finance_mode: settings.selected_mode })
                }
              />
              Ativar financeiro
            </label>
            <select
              value={settings.selected_mode}
              disabled={!isAdmin || saving}
              onChange={(e) =>
                void saveSettings({
                  finance_enabled: settings.finance_enabled,
                  finance_mode: e.target.value as "basic" | "intermediate" | "management",
                })
              }
            >
              <option value="basic">Básico</option>
              <option value="intermediate">Intermediário</option>
              <option value="management">Gestão completa</option>
            </select>
          </div>
        </section>
      ) : null}

      <section className={styles.card}>
        <h2>Lembretes de vencimento</h2>
        <div className={styles.row}>
          <input type="date" value={remindDate} onChange={(e) => setRemindDate(e.target.value)} />
          <button type="button" onClick={() => void fireReminders()}>
            Disparar lembretes do dia
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Contas bancárias</h2>
        <p className={styles.muted}>Gestão completa de contas em página dedicada, com cards e fluxo de nova conta.</p>
        <Link to="/app/finance/settings/accounts">Abrir página de Contas</Link>
      </section>

      <section className={styles.card}>
        <h2>Cartões de crédito</h2>
        <p className={styles.muted}>Gestão completa de cartões em página dedicada, com configuração individual por cartão.</p>
        <Link to="/app/finance/settings/cards">Abrir página de Cartões</Link>
      </section>

      <section className={styles.card}>
        <h2>Maquininhas e taxas</h2>
        <p className={styles.muted}>Gestão de maquininhas em página dedicada, com taxas de débito e crédito por parcelas.</p>
        <Link to="/app/finance/settings/machines">Abrir página de Maquininhas</Link>
      </section>

      <section className={styles.card}>
        <h2>Fluxo de caixa</h2>
        <div className={styles.row}>
          <input type="date" value={cashflowStart} onChange={(e) => setCashflowStart(e.target.value)} />
          <input type="date" value={cashflowEnd} onChange={(e) => setCashflowEnd(e.target.value)} />
          <button type="button" onClick={() => void loadCashflow()}>
            Calcular
          </button>
        </div>
        {cashflow ? (
          <div className={styles.grid}>
            <div>Saldo inicial: R$ {cashflow.opening_balance}</div>
            <div>Entradas: R$ {cashflow.incomes}</div>
            <div>Saídas: R$ {cashflow.expenses}</div>
            <div>Fluxo líquido: R$ {cashflow.net_flow}</div>
            <div>Saldo final: R$ {cashflow.closing_balance}</div>
          </div>
        ) : (
          <p className={styles.muted}>Selecione o período e clique em calcular.</p>
        )}
      </section>

    </section>
  );
}
