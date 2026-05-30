import { Link } from 'react-router-dom';
import type { FinanceCreditCardInvoiceSummaryRow } from '../../../api/finance';
import styles from './FinanceSummarySidebar.module.css';

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

function formatDue(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

type Props = {
  cards: FinanceCreditCardInvoiceSummaryRow[];
  isLoading?: boolean;
};

export function CreditCardInvoicesSection({ cards, isLoading }: Props) {
  const withInvoices = cards.filter((c) => c.invoice_total > 0 || c.purchase_awaiting_total > 0);

  return (
    <section className={styles.block} aria-label="Faturas a pagar">
      <div className={styles.blockHead}>
        <h2 className={styles.blockTitle}>Faturas a pagar</h2>
      </div>
      {isLoading ? (
        <p className={styles.muted}>Carregando faturas…</p>
      ) : withInvoices.length === 0 ? (
        <p className={styles.muted}>Nenhuma fatura pendente nos cartões.</p>
      ) : (
        <ul className={styles.itemList}>
          {withInvoices.map((c) => (
            <li key={c.card_id} className={styles.item}>
              <span className={styles.itemDesc}>{c.card_name}</span>
              <span className={styles.itemMeta}>
                Fatura {money(c.invoice_total)}
                {c.next_due_date ? ` · Venc. ${formatDue(c.next_due_date)}` : ''}
              </span>
              {c.purchase_awaiting_total > 0 ? (
                <span className={styles.itemMeta}>
                  Em aberto no cartão: {money(c.purchase_awaiting_total)}
                  {c.purchase_count > 1 ? ` (${c.purchase_count} compras)` : ''}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Link to="/app/finance/settings/cards" className={styles.link}>
        Gerenciar cartões
      </Link>
    </section>
  );
}
