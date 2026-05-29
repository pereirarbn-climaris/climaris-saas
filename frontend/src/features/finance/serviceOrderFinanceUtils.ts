import type { Transacao } from './transaction.types';
import type { ServiceOrderPaymentStatus } from './serviceOrderFinance.types';

function activeRecebimentos(entries: Transacao[]): Transacao[] {
  return entries.filter((e) => e.kind === 'RECEBIMENTO' && e.status !== 'CANCELADO');
}

export function sumRecebimentosLiquidados(entries: Transacao[]): number {
  return activeRecebimentos(entries)
    .filter((e) => e.status === 'LIQUIDADO')
    .reduce((s, e) => s + e.valor, 0);
}

export function sumRecebimentosPendentes(entries: Transacao[]): number {
  return activeRecebimentos(entries)
    .filter((e) => e.status === 'PENDENTE')
    .reduce((s, e) => s + e.valor, 0);
}

/** Compara lançamentos vinculados à OS com o valor total da ordem. */
export function deriveServiceOrderPaymentStatus(
  entries: Transacao[] | undefined,
  orderTotal: number,
): ServiceOrderPaymentStatus {
  const recebimentos = activeRecebimentos(entries ?? []);
  if (recebimentos.length === 0) return 'pendente';

  const liquidado = sumRecebimentosLiquidados(recebimentos);
  const pendente = sumRecebimentosPendentes(recebimentos);
  const totalRegistrado = liquidado + pendente;

  if (orderTotal > 0 && liquidado >= orderTotal - 0.009) return 'pago';
  if (totalRegistrado > 0 && liquidado > 0 && liquidado < orderTotal - 0.009) return 'parcial';
  if (pendente > 0 || liquidado > 0) return 'parcial';
  return 'pendente';
}

export function financePaymentBadgeLabel(status: ServiceOrderPaymentStatus): string {
  if (status === 'pago') return 'Pago';
  if (status === 'parcial') return 'Parcial';
  return 'Pendente';
}
