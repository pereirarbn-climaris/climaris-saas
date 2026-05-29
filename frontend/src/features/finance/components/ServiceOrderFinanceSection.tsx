import { Banknote, List } from 'lucide-react';
import {
  deriveServiceOrderPaymentStatus,
  financePaymentBadgeLabel,
} from '../serviceOrderFinanceUtils';
import type { Transacao } from '../transaction.types';
import styles from './ServiceOrderFinanceSection.module.css';

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

export type ServiceOrderFinanceSectionProps = {
  orderTotal: number;
  entries: Transacao[];
  onGenerateRecebimento: () => void;
  onViewTransacoes: () => void;
  canGenerateRecebimento?: boolean;
  generateDisabledReason?: string;
};

export function ServiceOrderFinanceSection({
  orderTotal,
  entries,
  onGenerateRecebimento,
  onViewTransacoes,
  canGenerateRecebimento = true,
  generateDisabledReason,
}: ServiceOrderFinanceSectionProps) {
  const paymentStatus = deriveServiceOrderPaymentStatus(entries, orderTotal);
  const hasEntry = entries.some((e) => e.kind === 'RECEBIMENTO' && e.status !== 'CANCELADO');

  return (
    <section className={styles.card} aria-labelledby="os-finance-section-title">
      <div className={styles.header}>
        <h3 id="os-finance-section-title" className={styles.title}>
          Gestão Financeira
        </h3>
        <p className={styles.subtitle}>
          Registre o recebimento desta OS no módulo financeiro e acompanhe o status do pagamento.
        </p>
      </div>

      <p className={styles.summary}>
        Valor total da OS: <strong>{money(orderTotal)}</strong>
        {' · '}
        Situação: <strong>{financePaymentBadgeLabel(paymentStatus)}</strong>
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onGenerateRecebimento}
          disabled={!canGenerateRecebimento}
        >
          <Banknote size={16} aria-hidden />
          Gerar Recebimento
        </button>
        <button type="button" className={styles.btnSecondary} onClick={onViewTransacoes}>
          <List size={16} aria-hidden />
          Ver Transações
          {hasEntry ? ` (${entries.filter((e) => e.kind === 'RECEBIMENTO').length})` : ''}
        </button>
      </div>

      {!canGenerateRecebimento && generateDisabledReason ? (
        <p className={styles.hint}>{generateDisabledReason}</p>
      ) : paymentStatus === 'pago' ? (
        <p className={styles.hint}>Recebimento registrado e liquidado. Esta OS consta como paga no financeiro.</p>
      ) : hasEntry ? (
        <p className={styles.hint}>
          Já existe um lançamento para esta OS. Use &quot;Ver Transações&quot; para conferir ou liquidar no
          financeiro.
        </p>
      ) : null}
    </section>
  );
}
