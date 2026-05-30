/**
 * Motor de cálculo financeiro: liquidação, valor líquido e badges de fluxo de caixa.
 */
import type { Transacao } from './transaction.types';
import type { PlanoRecebimento } from '../../schemas/financeMaquininha';
import type { PlanoTaxas } from '../../schemas/financeMaquininha';
import {
  feePercentForSimulation,
  netFromGross,
  planToCreditMethod,
  planToDebitMethod,
  type SimulatorMode,
} from '../../lib/financeMaquininhaUtils';

export type PaymentMethod = 'PIX' | 'BOLETO' | 'MAQUININHA';
export type MachinePlan = 'D0' | 'D1' | '30D';

/** Fluxo do wizard (minúsculo). */
export type PaymentMethodFlow = 'pix' | 'boleto' | 'maquininha';

export type SettlementPlan = 'same_as_due' | 'next_business_day';

/** Recebimento padrão (cronograma por parcela) vs antecipação total (D0/D1 — liquidação única). */
export type SettlementReceiptType = 'standard' | 'total_anticipated';

/**
 * Plano de liquidação da maquininha (alias de negócio).
 * - `anticipated`: D0/D1 — ignora parcelamento e credita líquido total na data da venda.
 * - `standard`: cronograma 30/60/90 conforme parcelas.
 */
export type MaquininhaLiquidationPlan = 'anticipated' | 'standard';

export function maquininhaLiquidationPlanFromPlano(plan: PlanoRecebimento): MaquininhaLiquidationPlan {
  return isMaquininhaAnticipatedPlan(plan) ? 'anticipated' : 'standard';
}

/** Alias de produto: plano de recebimento antecipado (D0/D1). */
export function isPlanoRecebimentoAntecipado(plan: PlanoRecebimento): boolean {
  return maquininhaLiquidationPlanFromPlano(plan) === 'anticipated';
}

/**
 * Maquininha: se plano antecipado, liquida líquido total na data da venda (1 lançamento).
 */
export function resolveMaquininhaLiquidation(
  paymentFlow: PaymentMethodFlow,
  plan: PlanoRecebimento,
  options: {
    saleDate: Date;
    installmentCount: number;
    gross: number;
    feeResult: MaquininhaFeeResult | null;
  },
): MaquininhaSettlementContext | null {
  if (paymentFlow !== 'maquininha') return null;
  return resolveMaquininhaReceiptSettlement({
    plan,
    saleDate: options.saleDate,
    installmentCount: options.installmentCount,
    gross: options.gross,
    feeResult: options.feeResult,
  });
}

export type LiquidityBadge = {
  label:
    | 'Disponível'
    | 'A receber'
    | 'A pagar'
    | 'Pago'
    | 'Vencido'
    | 'Liquidado'
    | 'Cancelado';
  variant: 'success' | 'warning' | 'destructive' | 'secondary';
};

export type MaquininhaFeeResult = {
  feePercent: number;
  feeAmount: number;
  net: number;
};

export type SettlementPayloadMeta = {
  settlement_date: string;
  net_value: number;
  fee_applied: number;
  settlement_type?: SettlementReceiptType;
  /** Parcelas da venda (referência quando antecipado). */
  installment_count?: number;
};

/** D0 e D1 antecipam o valor total; PADRAO_30_DIAS segue cronograma mensal. */
export function isMaquininhaAnticipatedPlan(plan: PlanoRecebimento): boolean {
  return plan === 'D0' || plan === 'D1';
}

export function maquininhaSettlementReceiptType(plan: PlanoRecebimento): SettlementReceiptType {
  if (isMaquininhaAnticipatedPlan(plan)) return 'total_anticipated';
  return 'standard';
}

/** Parcelas usadas só para cálculo de taxa e exibição; liquidação usa 1 entrada se antecipado. */
export function effectiveInstallmentCountForSettlement(
  plan: PlanoRecebimento,
  installmentCount: number,
): number {
  if (isMaquininhaAnticipatedPlan(plan)) return 1;
  return Math.max(1, installmentCount);
}

export type MaquininhaSettlementContext = {
  receiptType: SettlementReceiptType;
  settlementDate: Date;
  netValue: number;
  feeApplied: number;
  feeAmount: number;
  installmentsForPersistence: number;
  /** Nº de parcelas da operação (cartão), mesmo quando antecipado. */
  saleInstallmentCount: number;
};

/**
 * Resolve liquidação de recebimento em maquininha (entrada única do motor).
 */
export function resolveMaquininhaReceiptSettlement(options: {
  plan: PlanoRecebimento;
  saleDate: Date;
  installmentCount: number;
  gross: number;
  feeResult: MaquininhaFeeResult | null;
}): MaquininhaSettlementContext {
  const saleInstallmentCount = Math.max(1, options.installmentCount);
  const liquidationPlan = maquininhaLiquidationPlanFromPlano(options.plan);
  const feeApplied = options.feeResult?.feePercent ?? 0;
  const feeAmount = options.feeResult?.feeAmount ?? 0;
  const netValue =
    options.feeResult?.net ?? calculateNetValue(options.gross, feeApplied, 0);

  if (liquidationPlan === 'anticipated') {
    const settlementDate = calculateSettlementDateFromFlow('maquininha', options.saleDate, {
      machinePlan: options.plan,
      installmentCount: 1,
      installmentIndex: 1,
    });
    return {
      receiptType: 'total_anticipated',
      settlementDate,
      netValue,
      feeApplied,
      feeAmount,
      installmentsForPersistence: 1,
      saleInstallmentCount,
    };
  }

  const settlementDate = calculateSettlementDateFromFlow('maquininha', options.saleDate, {
    machinePlan: options.plan,
    installmentCount: saleInstallmentCount,
    installmentIndex: 1,
  });
  return {
    receiptType: 'standard',
    settlementDate,
    netValue,
    feeApplied,
    feeAmount,
    installmentsForPersistence: saleInstallmentCount,
    saleInstallmentCount,
  };
}

export function buildMaquininhaSettlementContext(options: {
  plan: PlanoRecebimento;
  saleDate: Date;
  installmentCount: number;
  gross: number;
  feeResult: MaquininhaFeeResult | null;
}): MaquininhaSettlementContext {
  return resolveMaquininhaReceiptSettlement(options);
}

export function flowToPaymentMethod(flow: PaymentMethodFlow): PaymentMethod {
  const map: Record<PaymentMethodFlow, PaymentMethod> = {
    pix: 'PIX',
    boleto: 'BOLETO',
    maquininha: 'MAQUININHA',
  };
  return map[flow];
}

export function planoToMachinePlan(plan: PlanoRecebimento): MachinePlan {
  if (plan === 'D0') return 'D0';
  if (plan === 'PADRAO_30_DIAS') return '30D';
  return 'D1';
}

export function machinePlanToPlano(plan: MachinePlan): PlanoRecebimento {
  if (plan === 'D0') return 'D0';
  if (plan === '30D') return 'PADRAO_30_DIAS';
  return 'D1';
}

export function settlementPlanForMaquininhaPlan(plan: PlanoRecebimento): SettlementPlan {
  return plan === 'D1' ? 'next_business_day' : 'same_as_due';
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

export function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateInput(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return formatDateOnly(startOfDay(a)) === formatDateOnly(startOfDay(b));
}

/** Primeiro dia útil estritamente depois de `d` (seg–sex). */
export function nextBusinessDayAfter(d: Date): Date {
  const cur = startOfDay(d);
  cur.setDate(cur.getDate() + 1);
  while (cur.getDay() === 0 || cur.getDay() === 6) {
    cur.setDate(cur.getDate() + 1);
  }
  return cur;
}

function applySettlementPlan(due: Date, plan: SettlementPlan): Date {
  if (plan === 'next_business_day') return nextBusinessDayAfter(due);
  return startOfDay(due);
}

function addMonths(date: Date, months: number): Date {
  const d = startOfDay(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Data em que o dinheiro estará disponível no caixa.
 */
export function calculateSettlementDate(
  method: PaymentMethod,
  machinePlan?: MachinePlan,
  saleDate: Date = new Date(),
  dueDate?: Date,
  installmentCount = 1,
  installmentIndex = 1,
): Date {
  const sale = startOfDay(saleDate);

  if (method === 'PIX') return sale;

  if (method === 'BOLETO') return startOfDay(dueDate ?? sale);

  if (method === 'MAQUININHA' && machinePlan) {
    const plan = machinePlanToPlano(machinePlan);
    if (isMaquininhaAnticipatedPlan(plan)) {
      return applySettlementPlan(sale, settlementPlanForMaquininhaPlan(plan));
    }
    let parcelDue = sale;
    if (machinePlan === '30D') {
      if (installmentCount > 1) {
        parcelDue = addMonths(sale, installmentIndex - 1);
      } else {
        const d = new Date(sale);
        d.setDate(d.getDate() + 30);
        parcelDue = d;
      }
    }
    return applySettlementPlan(parcelDue, settlementPlanForMaquininhaPlan(plan));
  }

  return sale;
}

/** Calcula a partir do fluxo do wizard (compatível com parcelas). */
export function calculateSettlementDateFromFlow(
  flow: PaymentMethodFlow,
  saleDate: Date,
  options?: {
    machinePlan?: PlanoRecebimento;
    boletoDueDate?: Date;
    installmentCount?: number;
    installmentIndex?: number;
  },
): Date {
  const machinePlan = options?.machinePlan ? planoToMachinePlan(options.machinePlan) : undefined;
  return calculateSettlementDate(
    flowToPaymentMethod(flow),
    machinePlan,
    saleDate,
    options?.boletoDueDate,
    options?.installmentCount ?? 1,
    options?.installmentIndex ?? 1,
  );
}

export function calculateParcelDueDate(
  flow: PaymentMethodFlow,
  saleDate: Date,
  options?: {
    machinePlan?: PlanoRecebimento;
    boletoDueDate?: Date;
    installmentCount?: number;
    installmentIndex?: number;
  },
): Date {
  const method = flowToPaymentMethod(flow);
  const machinePlan = options?.machinePlan ? planoToMachinePlan(options.machinePlan) : undefined;
  const idx = options?.installmentIndex ?? 1;
  const n = options?.installmentCount ?? 1;
  const sale = startOfDay(saleDate);

  if (method === 'PIX') return sale;
  if (method === 'BOLETO') return startOfDay(options?.boletoDueDate ?? sale);

  if (machinePlan) {
    const plan = machinePlanToPlano(machinePlan);
    if (isMaquininhaAnticipatedPlan(plan)) {
      return calculateSettlementDateFromFlow('maquininha', sale, {
        machinePlan: plan,
        installmentCount: 1,
        installmentIndex: 1,
      });
    }
  }
  if (machinePlan === '30D') {
    if (n > 1) return addMonths(sale, idx - 1);
    const d = new Date(sale);
    d.setDate(d.getDate() + 30);
    return d;
  }
  return sale;
}

/** Valor líquido após taxas (percentual + fixa opcional). */
export function calculateNetValue(
  gross: number,
  feePercent: number,
  feeFixed = 0,
): number {
  return netFromGross(gross, feePercent, feeFixed);
}

export function resolveMaquininhaFee(
  planoTaxas: PlanoTaxas,
  mode: SimulatorMode,
  installments: number,
  gross: number,
): MaquininhaFeeResult {
  const feePercent = feePercentForSimulation(planoTaxas, mode, installments);
  const feeAmount = Math.round(gross * (feePercent / 100) * 100) / 100;
  const net = calculateNetValue(gross, feePercent, 0);
  return { feePercent, feeAmount, net };
}

export function resolveMaquininhaPaymentMethod(
  plan: PlanoRecebimento,
  mode: SimulatorMode,
): string {
  if (mode === 'debit') return planToDebitMethod(plan);
  return planToCreditMethod(plan);
}

export function effectiveReceivableAmount(
  gross: number,
  netValue?: number,
  feeAmount?: number,
): number {
  if (netValue != null && netValue > 0) return netValue;
  if (feeAmount != null && feeAmount > 0) return Math.max(0, gross - feeAmount);
  return gross;
}

export function getLiquidityBadge(
  settlementDate: Date,
  status: 'PENDENTE' | 'LIQUIDADO' | 'CANCELADO',
  kind: 'RECEBIMENTO' | 'PAGAMENTO' = 'RECEBIMENTO',
  now = new Date(),
): LiquidityBadge {
  if (status === 'CANCELADO') {
    return { label: 'Cancelado', variant: 'destructive' };
  }

  const today = startOfDay(now);
  const settle = startOfDay(settlementDate);
  const dueOrPast = settle.getTime() <= today.getTime();

  if (kind === 'PAGAMENTO') {
    if (status === 'LIQUIDADO') {
      return { label: 'Pago', variant: 'success' };
    }
    if (dueOrPast) {
      return { label: 'Vencido', variant: 'warning' };
    }
    return { label: 'A pagar', variant: 'warning' };
  }

  if (status === 'LIQUIDADO' || dueOrPast) {
    return { label: 'Disponível', variant: 'success' };
  }
  return { label: 'A receber', variant: 'warning' };
}

export function buildSettlementPayloadMeta(
  settlementDate: Date,
  netValue: number,
  feeApplied: number,
  extra?: Pick<SettlementPayloadMeta, 'settlement_type' | 'installment_count'>,
): SettlementPayloadMeta {
  return {
    settlement_date: formatDateOnly(settlementDate),
    net_value: Math.round(netValue * 100) / 100,
    fee_applied: Math.round(feeApplied * 100) / 100,
    ...(extra?.settlement_type ? { settlement_type: extra.settlement_type } : {}),
    ...(extra?.installment_count != null ? { installment_count: extra.installment_count } : {}),
  };
}

/** Cartão cadastrado (fechamento/vencimento) para cálculo de fatura. */
export type CreditCardBillingSchedule = {
  closingDay: number;
  dueDay: number;
};

/**
 * Vencimento da fatura: compras até o fechamento vencem no mês corrente; após, no mês seguinte.
 * Ajusta para o próximo dia útil se cair em fim de semana.
 */
export function calculateInvoiceDueDate(
  purchaseDate: Date,
  card: CreditCardBillingSchedule,
): Date {
  const closing = Math.max(1, Math.min(28, Math.floor(card.closingDay)));
  const dueDay = Math.max(1, Math.min(28, Math.floor(card.dueDay)));
  let year = purchaseDate.getFullYear();
  let month = purchaseDate.getMonth();
  const day = purchaseDate.getDate();
  if (day > closing) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  const due = new Date(year, month, Math.min(dueDay, lastDay));
  return toNextBusinessDay(due);
}

function toNextBusinessDay(d: Date): Date {
  const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (cur.getDay() === 0 || cur.getDay() === 6) {
    cur.setDate(cur.getDate() + 1);
  }
  return cur;
}

export type OSProfitabilityMarginVariant = 'success' | 'warning' | 'destructive' | 'secondary';

export type OSProfitability = {
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number | null;
  marginVariant: OSProfitabilityMarginVariant;
};

/**
 * Lançamento efetivamente pago — exclui pendente, aguardando fatura e cancelado.
 * Margem real só considera dinheiro já recebido/gasto.
 */
export function entryIsPaidForOSProfitability(row: Transacao): boolean {
  if (row.status === 'CANCELADO') return false;
  const api = row.apiStatus ?? (row.status === 'LIQUIDADO' ? 'paid' : 'pending');
  if (api === 'awaiting_invoice' || api === 'pending' || api === 'overdue' || api === 'cancelled') {
    return false;
  }
  return api === 'paid' || row.status === 'LIQUIDADO';
}

/** @deprecated Alias — use `entryIsPaidForOSProfitability`. */
export const entryCountsForOSProfitability = entryIsPaidForOSProfitability;

function marginVariantFromPercent(marginPercent: number | null): OSProfitabilityMarginVariant {
  if (marginPercent == null) return 'secondary';
  if (marginPercent <= 0) return 'destructive';
  if (marginPercent < 20) return 'warning';
  return 'success';
}

/**
 * Margem de contribuição por OS: ((Receitas − Custos) / Receitas) × 100.
 * Receitas: RECEBIMENTO vinculado à OS com status pago.
 * Custos: PAGAMENTO vinculado à OS com status pago (insumos/peças).
 */
export function calculateOSProfitability(
  orderServicoId: number,
  entries: Transacao[],
): OSProfitability {
  let revenue = 0;
  let cost = 0;

  for (const row of entries) {
    if (row.ordemServicoId !== orderServicoId) continue;
    if (!entryIsPaidForOSProfitability(row)) continue;
    if (row.kind === 'RECEBIMENTO') {
      revenue += effectiveReceivableAmount(row.valor, row.netValue, row.taxaDescontada);
    } else if (row.kind === 'PAGAMENTO') {
      cost += row.valor;
    }
  }

  const profit = revenue - cost;
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : null;

  return {
    revenue,
    cost,
    profit,
    marginPercent,
    marginVariant: marginVariantFromPercent(marginPercent),
  };
}

/** Meta mínima de margem (alerta informativo no wizard de despesa). */
export const OS_MARGIN_WARNING_THRESHOLD_PERCENT = 20;

export type ProjectedOSMargin = {
  margem: number | null;
  isBelowThreshold: boolean;
  revenue: number;
  projectedCost: number;
};

export type CalculateProjectedOSMarginOptions = {
  marginThresholdPercent?: number;
  /** Ao editar, exclui o lançamento atual dos custos pagos já contabilizados. */
  excludeEntryId?: string;
};

/**
 * Impacto de uma nova despesa na margem da OS (receitas/custos já pagos + valor informado).
 * Margem projetada = ((Receita − (Custos atuais + newExpenseAmount)) / Receita) × 100.
 */
export function calculateProjectedOSMargin(
  serviceOrderId: number,
  newExpenseAmount: number,
  entries: Transacao[],
  options: CalculateProjectedOSMarginOptions = {},
): ProjectedOSMargin {
  const { revenue, cost } = calculateOSProfitability(serviceOrderId, entries);
  let adjustedCost = cost;

  const excludeId = options.excludeEntryId;
  if (excludeId) {
    const excluded = entries.find((row) => row.id === excludeId);
    if (
      excluded &&
      excluded.ordemServicoId === serviceOrderId &&
      excluded.kind === 'PAGAMENTO' &&
      entryIsPaidForOSProfitability(excluded)
    ) {
      adjustedCost -= excluded.valor;
    }
  }

  const projectedCost = adjustedCost + Math.max(0, newExpenseAmount);
  const margem = revenue > 0 ? ((revenue - projectedCost) / revenue) * 100 : null;
  const threshold = options.marginThresholdPercent ?? OS_MARGIN_WARNING_THRESHOLD_PERCENT;
  const isBelowThreshold = margem != null && margem < threshold;

  return { margem, isBelowThreshold, revenue, projectedCost };
}

/** Linha mínima para agregação DRE (API ou domínio). */
export type DREFinanceEntryRow = {
  entry_type: 'income' | 'expense';
  status: string;
  amount: number;
  net_value?: number | null;
  fee_amount?: number | null;
  service_order_id?: number | null;
  service_order_status?: string | null;
  /** ISO date (YYYY-MM-DD) — paid_at ou competence_date */
  period_date: string;
};

export type MonthlyDRE = {
  month: number;
  year: number;
  receitaBruta: number;
  custosVariaveis: number;
  margemContribuicao: number;
  custosFixos: number;
  lucroLiquido: number;
};

function dreIncomeAmount(row: DREFinanceEntryRow): number {
  if (row.net_value != null && row.net_value > 0) return row.net_value;
  const fee = row.fee_amount ?? 0;
  return Math.max(0, row.amount - fee);
}

function parsePeriodMonthYear(periodDate: string): { month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(periodDate.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

function isPaidForDRE(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'paid' || s === 'liquidado';
}

/**
 * DRE mensal a partir de lançamentos pagos.
 * Receita bruta: income pago em OS concluída (done).
 * Custos variáveis: expense pago com service_order_id.
 * Custos fixos: expense pago sem OS.
 */
export function generateMonthlyDRE(
  month: number,
  year: number,
  entries: DREFinanceEntryRow[],
): MonthlyDRE {
  let receitaBruta = 0;
  let custosVariaveis = 0;
  let custosFixos = 0;

  for (const row of entries) {
    if (!isPaidForDRE(row.status)) continue;
    const period = parsePeriodMonthYear(row.period_date);
    if (!period || period.month !== month || period.year !== year) continue;

    if (row.entry_type === 'income') {
      if (row.service_order_id == null) continue;
      if (row.service_order_status !== 'done') continue;
      receitaBruta += dreIncomeAmount(row);
    } else if (row.entry_type === 'expense') {
      if (row.service_order_id != null) {
        custosVariaveis += row.amount;
      } else {
        custosFixos += row.amount;
      }
    }
  }

  const margemContribuicao = receitaBruta - custosVariaveis;
  const lucroLiquido = margemContribuicao - custosFixos;

  return {
    month,
    year,
    receitaBruta,
    custosVariaveis,
    margemContribuicao,
    custosFixos,
    lucroLiquido,
  };
}

export function shiftCalendarMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

export function buildMonthlyDREHistory(
  anchorMonth: number,
  anchorYear: number,
  entries: DREFinanceEntryRow[],
  monthsBack = 6,
): MonthlyDRE[] {
  const count = Math.max(1, monthsBack);
  const startDelta = -(count - 1);
  const out: MonthlyDRE[] = [];
  for (let i = 0; i < count; i++) {
    const { year, month } = shiftCalendarMonth(anchorYear, anchorMonth, startDelta + i);
    out.push(generateMonthlyDRE(month, year, entries));
  }
  return out;
}

export function mergeEntryNotes(
  base: Record<string, unknown> | null,
  settlement?: SettlementPayloadMeta,
): string | null {
  const merged = { ...(base ?? {}) };
  if (settlement) {
    merged.settlement_date = settlement.settlement_date;
    merged.net_value = settlement.net_value;
    merged.fee_applied = settlement.fee_applied;
    if (settlement.settlement_type) merged.settlement_type = settlement.settlement_type;
    if (settlement.installment_count != null) {
      merged.installment_count = settlement.installment_count;
    }
  }
  return Object.keys(merged).length ? JSON.stringify(merged) : null;
}
