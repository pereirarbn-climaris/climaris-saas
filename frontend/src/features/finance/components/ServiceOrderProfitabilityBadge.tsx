import { useMemo } from 'react';
import { calculateOSProfitability } from '../financeCalculator';
import type { Transacao } from '../transaction.types';
import styles from './ServiceOrderProfitabilityBadge.module.css';

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

export type ServiceOrderProfitabilityBadgeProps = {
  serviceOrderId: number;
  entries: Transacao[];
};

export function ServiceOrderProfitabilityBadge({
  serviceOrderId,
  entries,
}: ServiceOrderProfitabilityBadgeProps) {
  const profitability = useMemo(
    () => calculateOSProfitability(serviceOrderId, entries),
    [serviceOrderId, entries],
  );

  const { revenue, cost, profit, marginPercent, marginVariant } = profitability;
  const marginLabel =
    marginPercent != null ? `${marginPercent.toFixed(1)}%` : 'Sem receita paga';

  const tooltip = `Receita paga: ${money(revenue)}\nCusto de insumos pago: ${money(cost)}\nLucro: ${money(profit)}`;

  return (
    <span
      className={`${styles.badge} ${styles[marginVariant]}`}
      title={tooltip}
      aria-label={`Margem de contribuição ${marginLabel}. ${tooltip.replace('\n', '. ')}`}
    >
      Margem: {marginLabel}
    </span>
  );
}
