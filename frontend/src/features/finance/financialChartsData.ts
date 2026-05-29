import { effectiveReceivableAmount, formatDateOnly, startOfDay } from './financeCalculator';
import type { Transacao } from './transaction.types';

export const CHART_COLORS = {
  previsto: '#3B82F6',
  recebido: '#10B981',
} as const;

export const HORIZON_DAYS = 30;

export type DailyCashFlowPoint = {
  dateKey: string;
  label: string;
  previsto: number;
  recebido: number;
  /** Detalhes para tooltip (agregado do dia) */
  tooltipItems: ChartTooltipItem[];
};

export type ChartTooltipItem = {
  descricao: string;
  valorBruto: number;
  taxaAplicada: number;
  valorLiquido: number;
  tipo: 'previsto' | 'recebido';
};

export type FinancialChartsSummary = {
  totalPrevisto: number;
  totalDisponivel: number;
  totalRecebidoOs: number;
  totalInsumosOs: number;
  margemRoi: number | null;
  margemRoiPercent: string;
};

export type RoiTrendPoint = {
  label: string;
  margem: number;
};

function netOf(row: Transacao): number {
  return effectiveReceivableAmount(row.valor, row.netValue, row.taxaDescontada);
}

function feePercentOf(row: Transacao): number {
  if (row.feeApplied != null && row.feeApplied > 0) return row.feeApplied;
  if (row.valor > 0 && row.taxaDescontada) {
    return Math.round((row.taxaDescontada / row.valor) * 10000) / 100;
  }
  return 0;
}

function settlementOf(row: Transacao): Date {
  return startOfDay(row.settlementDate ?? row.dataLiquidacaoPrevista ?? row.dataPrevista);
}

function isRecebimentoAtivo(row: Transacao): boolean {
  return row.kind === 'RECEBIMENTO' && row.status !== 'CANCELADO';
}

/** Janela: hoje até +30 dias (e inclui recebidos recentes nos últimos 7 dias). */
export function chartPeriodBounds(now = new Date()): { inicio: Date; fim: Date } {
  const inicio = startOfDay(now);
  inicio.setDate(inicio.getDate() - 7);
  const fim = startOfDay(now);
  fim.setDate(fim.getDate() + HORIZON_DAYS);
  fim.setHours(23, 59, 59, 999);
  return { inicio, fim };
}

export function buildNext30DaysAxis(now = new Date()): { dateKey: string; label: string; date: Date }[] {
  const start = startOfDay(now);
  return Array.from({ length: HORIZON_DAYS }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateKey = formatDateOnly(d);
    return {
      dateKey,
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      date: d,
    };
  });
}

export function buildDailyCashFlowChart(
  entries: Transacao[] | undefined,
  now = new Date(),
): DailyCashFlowPoint[] {
  const axis = buildNext30DaysAxis(now);
  const byDay = new Map<string, DailyCashFlowPoint>();

  for (const day of axis) {
    byDay.set(day.dateKey, {
      dateKey: day.dateKey,
      label: day.label,
      previsto: 0,
      recebido: 0,
      tooltipItems: [],
    });
  }

  for (const row of entries ?? []) {
    if (!isRecebimentoAtivo(row)) continue;
    const settle = settlementOf(row);
    const key = formatDateOnly(settle);
    const bucket = byDay.get(key);
    if (!bucket) continue;

    const liquido = netOf(row);
    const item: ChartTooltipItem = {
      descricao: row.descricao,
      valorBruto: row.valor,
      taxaAplicada: feePercentOf(row),
      valorLiquido: liquido,
      tipo: row.status === 'LIQUIDADO' ? 'recebido' : 'previsto',
    };

    if (row.status === 'LIQUIDADO') {
      bucket.recebido += liquido;
    } else if (row.status === 'PENDENTE') {
      bucket.previsto += liquido;
    }
    bucket.tooltipItems.push(item);
  }

  return axis.map((d) => byDay.get(d.dateKey)!);
}

export function buildFinancialChartsSummary(
  entries: Transacao[] | undefined,
  now = new Date(),
): FinancialChartsSummary {
  const today = startOfDay(now);
  let totalPrevisto = 0;
  let totalDisponivel = 0;
  let totalRecebidoOs = 0;
  let totalInsumosOs = 0;

  for (const row of entries ?? []) {
    if (row.kind === 'RECEBIMENTO' && row.status !== 'CANCELADO') {
      const liquido = netOf(row);
      const settle = settlementOf(row);

      if (row.status === 'PENDENTE' && settle.getTime() >= today.getTime()) {
        totalPrevisto += liquido;
      }
      if (row.status === 'LIQUIDADO') {
        totalDisponivel += liquido;
        if (row.ordemServicoId) totalRecebidoOs += liquido;
      }
    }

    if (row.kind === 'PAGAMENTO' && row.status === 'LIQUIDADO') {
      const cat = `${row.categoria} ${row.descricao}`.toLowerCase();
      const isInsumo =
        /insumo|pe[cç]a|material|estoque|fornecedor/.test(cat) ||
        Boolean(row.ordemServicoId);
      if (isInsumo) totalInsumosOs += row.valor;
    }
  }

  const margemRoi =
    totalRecebidoOs > 0 ? (totalRecebidoOs - totalInsumosOs) / totalRecebidoOs : null;

  return {
    totalPrevisto,
    totalDisponivel,
    totalRecebidoOs,
    totalInsumosOs,
    margemRoi,
    margemRoiPercent:
      margemRoi != null ? `${(margemRoi * 100).toFixed(1)}%` : '—',
  };
}

/** Tendência simples de margem por semana (últimas 4 semanas). */
export function buildRoiTrend(
  entries: Transacao[] | undefined,
  now = new Date(),
): RoiTrendPoint[] {
  const weeks: RoiTrendPoint[] = [];
  for (let w = 3; w >= 0; w -= 1) {
    const end = startOfDay(now);
    end.setDate(end.getDate() - w * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);

    let rec = 0;
    let ins = 0;
    for (const row of entries ?? []) {
      const settle = settlementOf(row);
      if (settle < start || settle > end) continue;
      if (row.kind === 'RECEBIMENTO' && row.status === 'LIQUIDADO' && row.ordemServicoId) {
        rec += netOf(row);
      }
      if (row.kind === 'PAGAMENTO' && row.status === 'LIQUIDADO') {
        const cat = `${row.categoria} ${row.descricao}`.toLowerCase();
        if (/insumo|pe[cç]a|material|estoque|fornecedor/.test(cat)) ins += row.valor;
      }
    }
    weeks.push({
      label: end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      margem: rec > 0 ? (rec - ins) / rec : 0,
    });
  }
  return weeks;
}
