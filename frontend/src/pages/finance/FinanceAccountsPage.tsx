import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createFinanceAccount,
  deleteFinanceAccount,
  deleteFinanceGatewayAsaas,
  getFinanceGateways,
  listFinanceAccounts,
  listFinanceEntries,
  patchFinanceEntry,
  testFinanceGatewayAsaas,
  upsertFinanceGatewayAsaas,
  type FinanceBankAccountOut,
  type FinanceEntryOut,
  type FinanceGatewaysOut,
} from "../../api/finance";
import styles from "./FinanceAccountsPage.module.css";

type AccountKind = "checking" | "savings" | "investment" | "digital_wallet" | "cash" | "other";

const KIND_LABEL: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Conta poupança",
  investment: "Conta de investimento",
  digital_wallet: "Carteira digital",
  cash: "Caixa / dinheiro",
  other: "Outros",
};

const BANK_SUGGESTIONS = ["Bradesco", "Santander", "Banco do Brasil", "Caixa Econômica", "Itaú", "Inter", "Nubank", "Outros"];

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function sparklinePoints(seed: number): string {
  const base = Math.max(8, Math.min(72, seed));
  const vals = [12, 12, 13, 12, 14, 15, base];
  return vals.map((v, i) => `${i * 42},${84 - v}`).join(" ");
}

export function FinanceAccountsPage() {
  const [accounts, setAccounts] = useState<FinanceBankAccountOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [kind, setKind] = useState<AccountKind>("checking");
  const [bankName, setBankName] = useState("");
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");
  const [reconcileAccount, setReconcileAccount] = useState<FinanceBankAccountOut | null>(null);
  const [reconcileStart, setReconcileStart] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [reconcileEnd, setReconcileEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [reconcileRows, setReconcileRows] = useState<FinanceEntryOut[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [gateways, setGateways] = useState<FinanceGatewaysOut | null>(null);
  const [configAccount, setConfigAccount] = useState<FinanceBankAccountOut | null>(null);
  const [configProvider, setConfigProvider] = useState<"asaas" | "mercadopago" | "none">("none");
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [asaasSandbox, setAsaasSandbox] = useState(false);

  async function loadAccounts() {
    setLoading(true);
    setError(null);
    try {
      const [accs, gws] = await Promise.all([listFinanceAccounts(), getFinanceGateways()]);
      setAccounts(accs);
      setGateways(gws);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar contas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  const cards = useMemo(() => accounts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [accounts]);

  function openNew() {
    setStep(1);
    setKind("checking");
    setBankName("");
    setName("");
    setInitialBalance("0");
    setMsg(null);
    setError(null);
  }

  async function submitAccount(ev: FormEvent) {
    ev.preventDefault();
    try {
      await createFinanceAccount({
        name: name.trim() || `${KIND_LABEL[kind]} ${bankName}`.trim(),
        bank_name: bankName.trim() || null,
        account_type: kind === "other" ? "other" : kind,
        initial_balance: Number(initialBalance || "0"),
        is_active: true,
      });
      setStep(0);
      setMsg("Conta cadastrada.");
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar conta.");
    }
  }

  async function removeAccount(row: FinanceBankAccountOut) {
    if (!window.confirm(`Excluir conta "${row.name}"?`)) return;
    try {
      await deleteFinanceAccount(row.id);
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir conta.");
    }
  }

  function openReconcile(row: FinanceBankAccountOut) {
    setReconcileAccount(row);
    setReconcileRows([]);
    setMsg(null);
    setError(null);
  }

  async function loadReconcileRows() {
    if (!reconcileAccount) return;
    setReconcileLoading(true);
    setError(null);
    try {
      const rows = await listFinanceEntries({ start_date: reconcileStart, end_date: reconcileEnd });
      const filtered = rows.filter((r) => {
        if (r.finance_account_id === reconcileAccount.id) return true;
        return reconcileAccount.name.trim().toLowerCase() === "caixa" && (r.payment_method || "").toLowerCase() === "cash";
      });
      setReconcileRows(filtered.sort((a, b) => a.due_date.localeCompare(b.due_date)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar extrato para conciliação.");
    } finally {
      setReconcileLoading(false);
    }
  }

  async function reconcileAsPaid(row: FinanceEntryOut) {
    try {
      await patchFinanceEntry(row.id, { status: "paid" });
      await loadReconcileRows();
      setMsg(`Movimentação "${row.description}" conciliada como paga.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao conciliar movimentação.");
    }
  }

  function openConfig(row: FinanceBankAccountOut) {
    setConfigAccount(row);
    const bank = (row.bank_name || "").toLowerCase();
    if (bank.includes("asaas")) {
      setConfigProvider("asaas");
      setAsaasSandbox(Boolean(gateways?.asaas.sandbox));
    } else if (bank.includes("mercado")) setConfigProvider("mercadopago");
    else setConfigProvider("none");
  }

  async function testAsaasConfig() {
    if (!asaasApiKey.trim()) return;
    try {
      const r = await testFinanceGatewayAsaas({ api_key: asaasApiKey.trim(), sandbox: asaasSandbox });
      setMsg(r.ok ? "Asaas validado com sucesso." : r.error || "Falha ao validar Asaas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao testar Asaas.");
    }
  }

  async function saveAsaasConfig() {
    if (!asaasApiKey.trim()) return;
    try {
      await upsertFinanceGatewayAsaas({ api_key: asaasApiKey.trim(), sandbox: asaasSandbox });
      setAsaasApiKey("");
      await loadAccounts();
      setMsg("Integração Asaas salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar Asaas.");
    }
  }

  async function removeAsaasConfig() {
    if (!window.confirm("Remover integração Asaas?")) return;
    try {
      await deleteFinanceGatewayAsaas();
      await loadAccounts();
      setMsg("Integração Asaas removida.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover Asaas.");
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>Contas e carteiras</h1>
        <div className={styles.headerActions}>
          <button type="button" onClick={openNew}>
            + adicionar
          </button>
          <Link to="/app/finance/settings">Voltar às configurações</Link>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {msg ? <p className={styles.msg}>{msg}</p> : null}

      {loading ? <p>Carregando contas...</p> : null}
      {!loading ? (
        <div className={styles.cards}>
          {cards.map((a) => (
            <article key={a.id} className={styles.card}>
              <div className={styles.cardMain}>
                <div className={styles.cardHead}>
                  <div className={styles.bankDot}>{(a.bank_name || a.name).slice(0, 1).toUpperCase()}</div>
                  <div>
                    <h3>{a.name}</h3>
                    <p>{a.bank_name || "Sem banco informado"}</p>
                  </div>
                </div>
                <strong>{money(Number(a.initial_balance || 0))}</strong>
                <span className={styles.smallLink}>Ver extrato</span>
                <svg className={styles.sparkline} viewBox="0 0 252 84" preserveAspectRatio="none" aria-hidden="true">
                  <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={sparklinePoints(Number(a.initial_balance || 0))} />
                </svg>
              </div>
              <div className={styles.cardActions}>
                <button type="button" className={styles.btnGhost} onClick={() => openReconcile(a)}>
                  Conciliar
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => openConfig(a)}>
                  Configurar conta
                </button>
                {a.name.trim().toLowerCase() !== "caixa" ? (
                  <button type="button" className={styles.btnDanger} onClick={() => void removeAccount(a)}>
                    Excluir
                  </button>
                ) : (
                  <span className={styles.badge}>Obrigatória</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header>
              <h2>Tipo de conta</h2>
              <button type="button" onClick={() => setStep(0)}>
                x
              </button>
            </header>
            <div className={styles.typeList}>
              {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={styles.typeBtn}
                  onClick={() => {
                    setKind(k);
                    setStep(2);
                  }}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header>
              <h2>Selecione o banco</h2>
              <button type="button" onClick={() => setStep(1)}>
                x
              </button>
            </header>
            <form className={styles.form} onSubmit={submitAccount}>
              <div className={styles.bankGrid}>
                {[...BANK_SUGGESTIONS, "Asaas", "Mercado Pago"].map((bank) => (
                  <button
                    key={bank}
                    type="button"
                    className={`${styles.bankItem} ${bankName === bank ? styles.bankItemActive : ""}`}
                    onClick={() => setBankName(bank)}
                  >
                    {bank}
                  </button>
                ))}
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da conta (opcional)" />
              <input
                type="number"
                step="0.01"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="Saldo inicial"
              />
              <button type="submit">Salvar conta</button>
            </form>
          </div>
        </div>
      ) : null}

      {reconcileAccount ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalWide}>
            <header>
              <h2>Conciliação - {reconcileAccount.name}</h2>
              <button type="button" onClick={() => setReconcileAccount(null)}>
                x
              </button>
            </header>
            <div className={styles.reconcileFilters}>
              <input type="date" value={reconcileStart} onChange={(e) => setReconcileStart(e.target.value)} />
              <input type="date" value={reconcileEnd} onChange={(e) => setReconcileEnd(e.target.value)} />
              <button type="button" onClick={() => void loadReconcileRows()} disabled={reconcileLoading}>
                {reconcileLoading ? "Carregando..." : "Atualizar extrato"}
              </button>
            </div>
            <div className={styles.reconcileList}>
              {reconcileRows.length === 0 ? (
                <p className={styles.smallLink}>Sem movimentações para este período.</p>
              ) : (
                reconcileRows.map((row) => (
                  <div key={row.id} className={styles.reconcileRow}>
                    <div>
                      <strong>{row.description}</strong>
                      <p>
                        {row.due_date} · {row.entry_type === "income" ? "Entrada" : "Saída"} · {row.status}
                      </p>
                    </div>
                    <div className={styles.reconcileRowActions}>
                      <strong>{money(Number(row.amount || 0))}</strong>
                      {row.status !== "paid" ? (
                        <button type="button" onClick={() => void reconcileAsPaid(row)}>
                          Conciliar (pago)
                        </button>
                      ) : (
                        <span className={styles.badge}>Conciliado</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {configAccount ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header>
              <h2>Configurar conta - {configAccount.name}</h2>
              <button type="button" onClick={() => setConfigAccount(null)}>
                x
              </button>
            </header>
            <div className={styles.form}>
              <select value={configProvider} onChange={(e) => setConfigProvider(e.target.value as "asaas" | "mercadopago" | "none")}>
                <option value="none">Sem integração API</option>
                <option value="asaas">Asaas</option>
                <option value="mercadopago">Mercado Pago</option>
              </select>
              {configProvider === "asaas" ? (
                <>
                  <p className={styles.smallLink}>Status atual: {gateways?.asaas.connected ? "Conectado" : "Desconectado"}</p>
                  <input
                    type="password"
                    value={asaasApiKey}
                    onChange={(e) => setAsaasApiKey(e.target.value)}
                    placeholder="API Key Asaas"
                  />
                  <label className={styles.smallLink}>
                    <input type="checkbox" checked={asaasSandbox} onChange={(e) => setAsaasSandbox(e.target.checked)} /> Sandbox
                  </label>
                  <div className={styles.rowActions}>
                    <button type="button" onClick={() => void testAsaasConfig()}>
                      Testar
                    </button>
                    <button type="button" onClick={() => void saveAsaasConfig()}>
                      Salvar
                    </button>
                    {gateways?.asaas.connected ? (
                      <button type="button" className={styles.btnDanger} onClick={() => void removeAsaasConfig()}>
                        Remover
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
              {configProvider === "mercadopago" ? (
                <p className={styles.smallLink}>
                  Integração Mercado Pago será adicionada no próximo passo (OAuth e conciliação automática por webhook).
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

