import { Link } from 'react-router-dom';
import { filterContasBancarias } from '../accountService';
import type { Conta } from '../account.types';
import type { FinanceUpcomingSummary } from '../hooks/useFinanceUpcoming';
import type { FinanceCreditCardInvoiceSummaryRow } from '../../../api/finance';
import { computeProjectedAvailableBalance } from '../financeService';
import { CreditCardInvoicesSection } from './CreditCardInvoicesSection';
import styles from './FinanceSummarySidebar.module.css';

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

type Props = {
  contas: Conta[];
  upcoming: FinanceUpcomingSummary;
  creditCardInvoices?: FinanceCreditCardInvoiceSummaryRow[];
  creditCardInvoicesLoading?: boolean;
  /** Total de faturas abertas (API); se omitido, soma dos cards. */
  openInvoicesTotalOverride?: number;
  selectedContaId?: string;
  onSelectConta?: (contaId: string) => void;
};

export function FinanceSummarySidebar({
  contas,
  upcoming,
  creditCardInvoices = [],
  creditCardInvoicesLoading,
  openInvoicesTotalOverride,
  selectedContaId,
  onSelectConta,
}: Props) {
  const activeContas = filterContasBancarias(contas);
  const bankBalanceTotal = activeContas.reduce((s, c) => s + (c.saldoAtual ?? 0), 0);
  const openInvoicesTotal =
    openInvoicesTotalOverride ??
    creditCardInvoices.reduce((s, c) => s + c.invoice_total, 0);
  const projectedAvailable = computeProjectedAvailableBalance(bankBalanceTotal, openInvoicesTotal);

  return (
    <aside className={styles.aside} aria-label="Resumo financeiro">
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.blockTitle}>Saldo projetado</h2>
        </div>
        <p className={styles.projectedAvailable}>{money(projectedAvailable)}</p>
        <p className={styles.muted}>
          Disponível {money(bankBalanceTotal)} − faturas abertas {money(openInvoicesTotal)}
        </p>
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Contas bancárias</h2>
        <ul className={styles.accountList}>
          {activeContas.length === 0 ? (
            <li className={styles.muted}>Nenhuma conta ativa.</li>
          ) : (
            activeContas.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`${styles.accountBtn} ${selectedContaId === c.id ? styles.accountBtnActive : ''}`}
                  onClick={() => onSelectConta?.(c.id)}
                >
                  <span className={styles.accountName}>{c.nome}</span>
                  <span className={styles.accountBalance}>{money(c.saldoAtual)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <Link to="/app/finance/settings/accounts" className={styles.link}>
          Gerenciar contas
        </Link>
      </section>

      <CreditCardInvoicesSection cards={creditCardInvoices} isLoading={creditCardInvoicesLoading} />

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.blockTitle}>A receber</h2>
          <span className={styles.totalPositive}>{money(upcoming.totalReceber)}</span>
        </div>
        <ul className={styles.itemList}>
          {upcoming.aReceber.length === 0 ? (
            <li className={styles.muted}>Nenhum recebimento pendente no horizonte.</li>
          ) : (
            upcoming.aReceber.map((item) => (
              <li key={item.id} className={styles.item}>
                <span className={styles.itemDesc}>{item.descricao}</span>
                <span className={styles.itemMeta}>
                  Prev. {formatShortDate(item.dataPrevista)} · {money(item.valor)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.blockTitle}>A pagar</h2>
          <span className={styles.totalNegative}>{money(upcoming.totalPagar)}</span>
        </div>
        <ul className={styles.itemList}>
          {upcoming.aPagar.length === 0 ? (
            <li className={styles.muted}>Nenhum pagamento pendente no horizonte.</li>
          ) : (
            upcoming.aPagar.map((item) => (
              <li key={item.id} className={styles.item}>
                <span className={styles.itemDesc}>{item.descricao}</span>
                <span className={styles.itemMeta}>
                  Prev. {formatShortDate(item.dataPrevista)} · {money(item.valor)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </aside>
  );
}
