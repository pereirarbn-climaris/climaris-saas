import { useMemo } from 'react';
import { effectiveReceivableAmount, startOfDay } from '../financeCalculator';
import type { Transacao } from '../transaction.types';

export type UpcomingItem = {
  id: string;
  descricao: string;
  valor: number;
  /** Data prevista de liquidação no caixa */
  dataPrevista: Date;
  kind: 'RECEBIMENTO' | 'PAGAMENTO';
};

export type FinanceUpcomingSummary = {
  aPagar: UpcomingItem[];
  aReceber: UpcomingItem[];
  totalPagar: number;
  totalReceber: number;
};

const HORIZON_DAYS = 45;

function settlementDateForEntry(row: Transacao): Date {
  return row.settlementDate ?? row.dataLiquidacaoPrevista ?? row.dataPrevista;
}

function isWithinHorizon(d: Date, now: Date): boolean {
  const start = startOfDay(now);
  const end = new Date(start);
  end.setDate(end.getDate() + HORIZON_DAYS);
  const t = startOfDay(d).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function buildUpcomingFromEntries(
  entries: Transacao[] | undefined,
  now = new Date(),
): FinanceUpcomingSummary {
  const pending = (entries ?? []).filter(
    (e) => e.status === 'PENDENTE' && isWithinHorizon(settlementDateForEntry(e), now),
  );

  const aPagar: UpcomingItem[] = [];
  const aReceber: UpcomingItem[] = [];

  for (const row of pending) {
    const cashDate = settlementDateForEntry(row);
    const amount =
      row.kind === 'RECEBIMENTO'
        ? effectiveReceivableAmount(row.valor, row.netValue, row.taxaDescontada)
        : row.valor;

    const item: UpcomingItem = {
      id: row.id,
      descricao: row.descricao,
      valor: amount,
      dataPrevista: cashDate,
      kind: row.kind,
    };
    if (row.kind === 'PAGAMENTO') aPagar.push(item);
    else aReceber.push(item);
  }

  aPagar.sort((a, b) => a.dataPrevista.getTime() - b.dataPrevista.getTime());
  aReceber.sort((a, b) => a.dataPrevista.getTime() - b.dataPrevista.getTime());

  return {
    aPagar: aPagar.slice(0, 8),
    aReceber: aReceber.slice(0, 8),
    totalPagar: aPagar.reduce((s, i) => s + i.valor, 0),
    totalReceber: aReceber.reduce((s, i) => s + i.valor, 0),
  };
}

export function useFinanceUpcoming(entries: Transacao[] | undefined): FinanceUpcomingSummary {
  return useMemo(() => buildUpcomingFromEntries(entries), [entries]);
}
