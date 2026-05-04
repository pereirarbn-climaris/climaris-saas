import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createFinanceCreditCard,
  deleteFinanceCreditCard,
  listFinanceAccounts,
  listFinanceCreditCards,
  patchFinanceCreditCard,
  type FinanceBankAccountOut,
  type FinanceCreditCardOut,
} from "../../api/finance";
import styles from "./FinanceCardsPage.module.css";

export function FinanceCardsPage() {
  const [cards, setCards] = useState<FinanceCreditCardOut[]>([]);
  const [accounts, setAccounts] = useState<FinanceBankAccountOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("visa");
  const [limitAmount, setLimitAmount] = useState("0");
  const [closingDay, setClosingDay] = useState("1");
  const [dueDay, setDueDay] = useState("10");
  const [billingAccountId, setBillingAccountId] = useState("");
  const [configCard, setConfigCard] = useState<FinanceCreditCardOut | null>(null);
  const [cfgLimit, setCfgLimit] = useState("0");
  const [cfgClosing, setCfgClosing] = useState("1");
  const [cfgDue, setCfgDue] = useState("10");
  const [cfgAccount, setCfgAccount] = useState("");

  async function loadData() {
    setError(null);
    try {
      const [c, a] = await Promise.all([listFinanceCreditCards(), listFinanceAccounts()]);
      setCards(c);
      setAccounts(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar cartões.");
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const sortedCards = [...cards].sort((a, b) => {
    const aPct = a.limit_amount > 0 ? a.used_limit / a.limit_amount : 0;
    const bPct = b.limit_amount > 0 ? b.used_limit / b.limit_amount : 0;
    return bPct - aPct;
  });

  async function addCard(ev: FormEvent) {
    ev.preventDefault();
    try {
      await createFinanceCreditCard({
        name: name.trim(),
        brand: brand.trim(),
        limit_amount: Number(limitAmount || "0"),
        closing_day: Number(closingDay || "1"),
        due_day: Number(dueDay || "10"),
        billing_account_id: billingAccountId ? Number(billingAccountId) : null,
      });
      setName("");
      setLimitAmount("0");
      await loadData();
      setMsg("Cartão criado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar cartão.");
    }
  }

  async function removeCard(row: FinanceCreditCardOut) {
    if (!window.confirm(`Excluir cartão "${row.name}"?`)) return;
    try {
      await deleteFinanceCreditCard(row.id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir cartão.");
    }
  }

  function openConfig(row: FinanceCreditCardOut) {
    setConfigCard(row);
    setCfgLimit(String(row.limit_amount || 0));
    setCfgClosing(String(row.closing_day || 1));
    setCfgDue(String(row.due_day || 10));
    setCfgAccount(row.billing_account_id ? String(row.billing_account_id) : "");
  }

  async function saveConfig(ev: FormEvent) {
    ev.preventDefault();
    if (!configCard) return;
    try {
      await patchFinanceCreditCard(configCard.id, {
        limit_amount: Number(cfgLimit || "0"),
        closing_day: Number(cfgClosing || "1"),
        due_day: Number(cfgDue || "10"),
        billing_account_id: cfgAccount ? Number(cfgAccount) : null,
      });
      setConfigCard(null);
      await loadData();
      setMsg("Configuração do cartão atualizada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar configuração do cartão.");
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Cartões de crédito</h1>
          <p className={styles.subtitle}>Cadastre cartões, acompanhe limite e defina fechamento/vencimento da fatura.</p>
        </div>
        <div className={styles.actions}>
          <Link to="/app/finance/settings/accounts">Contas</Link>
          <Link to="/app/finance/settings/machines">Maquininhas</Link>
          <Link to="/app/finance/settings">Voltar às configurações</Link>
        </div>
      </header>
      {error ? <p className={styles.error}>{error}</p> : null}
      {msg ? <p className={styles.msg}>{msg}</p> : null}

      <section className={styles.card}>
        <h2>Novo cartão</h2>
        <form className={styles.grid} onSubmit={addCard}>
          <label className={styles.field}>
            <span>Nome do cartão</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank principal" />
          </label>
          <label className={styles.field}>
            <span>Bandeira</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex.: visa, master" />
          </label>
          <label className={styles.field}>
            <span>Limite total</span>
            <input type="number" min="0" step="0.01" value={limitAmount} onChange={(e) => setLimitAmount(e.target.value)} placeholder="0,00" />
          </label>
          <label className={styles.field}>
            <span>Dia de fechamento</span>
            <input type="number" min="1" max="31" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} placeholder="1" />
          </label>
          <label className={styles.field}>
            <span>Dia de vencimento</span>
            <input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="10" />
          </label>
          <label className={styles.field}>
            <span>Conta para pagar a fatura</span>
            <select value={billingAccountId} onChange={(e) => setBillingAccountId(e.target.value)}>
              <option value="">Não vincular agora</option>
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Criar cartão</button>
        </form>
        <p className={styles.hint}>Use fechamento e vencimento para previsão correta de gastos e pagamento de fatura.</p>
      </section>

      <div className={styles.cards}>
        {sortedCards.map((c) => {
          const used = Number(c.used_limit || 0);
          const limit = Number(c.limit_amount || 0);
          const usagePct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
          const usageTone = usagePct >= 85 ? styles.usageHigh : usagePct >= 60 ? styles.usageMedium : styles.usageLow;
          return (
          <article key={c.id} className={styles.item}>
            <div>
              <h3>{c.name}</h3>
              <p>Bandeira: {c.brand.toUpperCase()}</p>
              <strong>Limite: R$ {Number(c.limit_amount || 0).toFixed(2)}</strong>
              <p>Usado: R$ {Number(c.used_limit || 0).toFixed(2)}</p>
              <p>Disponível: R$ {Number(c.available_limit || 0).toFixed(2)}</p>
              <div className={styles.usageWrap}>
                <div className={styles.usageTrack}>
                  <div className={`${styles.usageFill} ${usageTone}`} style={{ width: `${usagePct}%` }} />
                </div>
                <span className={styles.usageText}>Uso do limite: {usagePct}%</span>
              </div>
              <p>
                Fechamento: dia {c.closing_day} · Vencimento: dia {c.due_day}
              </p>
            </div>
            <div className={styles.row}>
              <button type="button" onClick={() => openConfig(c)}>
                Configurar cartão
              </button>
              <button type="button" onClick={() => void removeCard(c)}>
                Excluir
              </button>
            </div>
          </article>
          );
        })}
      </div>

      {configCard ? (
        <div className={styles.modalOverlay}>
          <form className={styles.modal} onSubmit={saveConfig}>
            <header>
              <h2>Configurar {configCard.name}</h2>
              <button type="button" onClick={() => setConfigCard(null)}>
                x
              </button>
            </header>
            <label className={styles.field}>
              <span>Limite total</span>
              <input type="number" min="0" step="0.01" value={cfgLimit} onChange={(e) => setCfgLimit(e.target.value)} placeholder="0,00" />
            </label>
            <label className={styles.field}>
              <span>Dia de fechamento</span>
              <input type="number" min="1" max="31" value={cfgClosing} onChange={(e) => setCfgClosing(e.target.value)} placeholder="1" />
            </label>
            <label className={styles.field}>
              <span>Dia de vencimento</span>
              <input type="number" min="1" max="31" value={cfgDue} onChange={(e) => setCfgDue(e.target.value)} placeholder="10" />
            </label>
            <label className={styles.field}>
              <span>Conta para pagar fatura</span>
              <select value={cfgAccount} onChange={(e) => setCfgAccount(e.target.value)}>
                <option value="">Não vincular agora</option>
                {accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Salvar configuração</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

