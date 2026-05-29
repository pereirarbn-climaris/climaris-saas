/**
 * Motor de cálculo financeiro: liquidação, valor líquido e badges de fluxo de caixa.
 */
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

export type LiquidityBadge = {
  label: 'Disponível' | 'A receber' | 'Liquidado' | 'Cancelado';
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
};

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
    const plan = machinePlanToPlano(machinePlan);
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
  now = new Date(),
): LiquidityBadge {
  if (status === 'CANCELADO') {
    return { label: 'Cancelado', variant: 'destructive' };
  }
  if (status === 'LIQUIDADO') {
    return { label: 'Disponível', variant: 'success' };
  }
  const today = startOfDay(now);
  const settle = startOfDay(settlementDate);
  if (settle.getTime() <= today.getTime()) {
    return { label: 'Disponível', variant: 'success' };
  }
  return { label: 'A receber', variant: 'warning' };
}

export function buildSettlementPayloadMeta(
  settlementDate: Date,
  netValue: number,
  feeApplied: number,
): SettlementPayloadMeta {
  return {
    settlement_date: formatDateOnly(settlementDate),
    net_value: Math.round(netValue * 100) / 100,
    fee_applied: Math.round(feeApplied * 100) / 100,
  };
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
  }
  return Object.keys(merged).length ? JSON.stringify(merged) : null;
}
