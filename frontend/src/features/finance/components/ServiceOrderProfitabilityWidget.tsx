import { useMemo } from 'react';
import { calculateOSProfitability } from '../financeCalculator';
import type { Transacao } from '../transaction.types';
import styles from './ServiceOrderProfitabilityWidget.module.css';

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

export type ServiceOrderProfitabilityWidgetProps = {
  serviceOrderId: number;
  entries: Transacao[];
};

/** Rentabilidade da OS (margem + breakdown) — uso em OS concluída. */
export function ServiceOrderProfitabilityWidget({
  serviceOrderId,
  entries,
}: ServiceOrderProfitabilityWidgetProps) {
  const { revenue, cost, profit, marginPercent, marginVariant } = useMemo(
    () => calculateOSProfitability(serviceOrderId, entries),
    [serviceOrderId, entries],
  );

  const marginLabel =
    marginPercent != null ? `${marginPercent.toFixed(1)}%` : 'Sem receita paga';

  return (
    <section
      className={styles.card}
      aria-label="Rentabilidade da ordem de serviço"
    >
      <div className={styles.header}>
        <h3 className={styles.title}>Rentabilidade da OS</h3>
        <span className={`${styles.badge} ${styles[marginVariant]}`}>
          Margem: {marginLabel}
        </span>
      </div>
      <p className={styles.breakdown}>
        Receita ({money(revenue)}) − Custo de Insumos ({money(cost)}) = Lucro ({money(profit)})
      </p>
      <p className={styles.hint}>
        Considera apenas lançamentos pagos (ignora pendentes e aguardando fatura).
      </p>
    </section>
  );
}
