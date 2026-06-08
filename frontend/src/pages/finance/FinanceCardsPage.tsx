import { useEffect, useState, type FormEvent } from "react";
import { CreditCard, Plus, Settings2, X } from "lucide-react";
import {
  createFinanceCreditCard,
  deleteFinanceCreditCard,
  getFinanceGateways,
  listFinanceAccounts,
  listFinanceBankCatalog,
  listFinanceCreditCards,
  patchFinanceCreditCard,
  type FinanceBankAccountOut,
  type FinanceBankCatalogRow,
  type FinanceCreditCardOut,
  type FinanceGatewaysOut,
} from "../../api/finance";
import { FinanceAccountCombobox } from "../../components/finance/FinanceAccountCombobox";
import {
  FinanceCadastroPageShell,
  financeCadastroShellStyles as shell,
} from "../../components/finance/FinanceCadastroPageShell";
import styles from "./FinanceCardsPage.module.css";

const CADASTRO_NAV = [
  { to: "/app/finance/settings/accounts", label: "Contas" },
  { to: "/app/finance/settings/cards", label: "Cartões", active: true },
  { to: "/app/finance/settings/machines", label: "Maquininhas" },
];

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

export function FinanceCardsPage() {
  const [cards, setCards] = useState<FinanceCreditCardOut[]>([]);
  const [accounts, setAccounts] = useState<FinanceBankAccountOut[]>([]);
  const [gateways, setGateways] = useState<FinanceGatewaysOut | null>(null);
  const [bankCatalog, setBankCatalog] = useState<FinanceBankCatalogRow[] | null>(null);
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
      const [c, a, gw, cat] = await Promise.all([
        listFinanceCreditCards(),
        listFinanceAccounts(),
        getFinanceGateways().catch(() => null),
        listFinanceBankCatalog().catch(() => [] as FinanceBankCatalogRow[]),
      ]);
      setCards(c);
      setAccounts(a);
      setGateways(gw);
      setBankCatalog(cat.length ? cat : null);
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
      setMsg("Cartão excluído.");
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
    <FinanceCadastroPageShell
      breadcrumb="Financeiro · Cadastros · Cartões"
      title="Cartões de crédito"
      subtitle="Cadastre cartões, acompanhe limite e defina fechamento e vencimento da fatura."
      navLinks={CADASTRO_NAV}
      error={error}
      msg={msg}
    >
      <article className={shell.panel}>
        <div className={shell.panelHead}>
          <span className={`${shell.panelIcon} ${shell.panelIconViolet}`}>
            <Plus aria-hidden />
          </span>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>Novo cartão</h2>
            <p className={shell.panelDesc}>Informe bandeira, limite e datas de fechamento para previsão correta de gastos.</p>
          </div>
        </div>
        <div className={shell.panelBody}>
          <form className={styles.formGrid} onSubmit={addCard}>
            <label className={styles.field}>
              <span>Nome do cartão</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank principal" required />
            </label>
            <label className={styles.field}>
              <span>Bandeira</span>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex.: visa, master" />
            </label>
            <label className={styles.field}>
              <span>Limite total</span>
              <input type="number" min="0" step="0.01" value={limitAmount} onChange={(e) => setLimitAmount(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Dia de fechamento</span>
              <input type="number" min="1" max="31" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Dia de vencimento</span>
              <input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Conta para pagar a fatura</span>
              <FinanceAccountCombobox
                id="fin-card-billing-account"
                accounts={accounts}
                value={billingAccountId}
                onChange={setBillingAccountId}
                gateways={gateways}
                catalog={bankCatalog}
                emptyOption
                emptyLabel="Não vincular agora"
              />
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={shell.btnPrimary}>
                <Plus aria-hidden />
                Criar cartão
              </button>
            </div>
          </form>
        </div>
      </article>

      <article className={shell.panel}>
        <div className={shell.panelHead}>
          <span className={shell.panelIcon}>
            <CreditCard aria-hidden />
          </span>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>Cartões cadastrados</h2>
            <p className={shell.panelDesc}>{sortedCards.length} cartão(ões) no workspace.</p>
          </div>
        </div>
        <div className={shell.panelBody}>
          {sortedCards.length === 0 ? (
            <div className={styles.emptyState}>
              <CreditCard aria-hidden />
              <p>Nenhum cartão cadastrado. Crie o primeiro acima.</p>
            </div>
          ) : (
            <div className={styles.cardsGrid}>
              {sortedCards.map((c) => {
                const used = Number(c.used_limit || 0);
                const limit = Number(c.limit_amount || 0);
                const usagePct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                const usageTone =
                  usagePct >= 85 ? styles.usageHigh : usagePct >= 60 ? styles.usageMedium : styles.usageLow;
                return (
                  <article key={c.id} className={styles.cardItem}>
                    <div className={styles.cardHead}>
                      <div>
                        <h3 className={styles.cardName}>{c.name}</h3>
                        <p className={styles.cardMeta}>
                          Fechamento dia {c.closing_day} · Vencimento dia {c.due_day}
                        </p>
                      </div>
                      <span className={styles.cardBrand}>{c.brand}</span>
                    </div>
                    <p className={styles.cardLimit}>{money(limit)}</p>
                    <div className={styles.cardStats}>
                      <div className={styles.cardStat}>
                        <span className={styles.cardStatLabel}>Usado</span>
                        <span className={styles.cardStatValue}>{money(used)}</span>
                      </div>
                      <div className={styles.cardStat}>
                        <span className={styles.cardStatLabel}>Disponível</span>
                        <span className={styles.cardStatValue}>{money(Number(c.available_limit || 0))}</span>
                      </div>
                    </div>
                    <div className={styles.usageWrap}>
                      <div className={styles.usageTrack}>
                        <div className={`${styles.usageFill} ${usageTone}`} style={{ width: `${usagePct}%` }} />
                      </div>
                      <span className={styles.usageText}>Uso do limite: {usagePct}%</span>
                    </div>
                    <div className={styles.cardFooter}>
                      <button type="button" className={shell.btnSecondary} onClick={() => openConfig(c)}>
                        <Settings2 aria-hidden />
                        Configurar
                      </button>
                      <button type="button" className={shell.btnDangerGhost} onClick={() => void removeCard(c)}>
                        Excluir
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </article>

      {configCard ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setConfigCard(null)}>
          <form
            className={styles.modal}
            onSubmit={saveConfig}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="finance-card-config-title"
          >
            <header className={styles.modalHead}>
              <h2 id="finance-card-config-title">Configurar {configCard.name}</h2>
              <button type="button" className={styles.modalClose} onClick={() => setConfigCard(null)} aria-label="Fechar">
                <X aria-hidden />
              </button>
            </header>
            <div className={styles.modalBody}>
              <label className={styles.field}>
                <span>Limite total</span>
                <input type="number" min="0" step="0.01" value={cfgLimit} onChange={(e) => setCfgLimit(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Dia de fechamento</span>
                <input type="number" min="1" max="31" value={cfgClosing} onChange={(e) => setCfgClosing(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Dia de vencimento</span>
                <input type="number" min="1" max="31" value={cfgDue} onChange={(e) => setCfgDue(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Conta para pagar fatura</span>
                <FinanceAccountCombobox
                  id="fin-card-config-billing"
                  accounts={accounts}
                  value={cfgAccount}
                  onChange={setCfgAccount}
                  gateways={gateways}
                  catalog={bankCatalog}
                  emptyOption
                  emptyLabel="Não vincular agora"
                />
              </label>
            </div>
            <footer className={styles.modalFooter}>
              <button type="button" className={shell.btnGhost} onClick={() => setConfigCard(null)}>
                Cancelar
              </button>
              <button type="submit" className={shell.btnPrimary}>
                Salvar configuração
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </FinanceCadastroPageShell>
  );
}
