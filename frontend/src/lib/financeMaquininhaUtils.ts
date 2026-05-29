import type { FinancePaymentFeeOut } from "../api/finance";
import {
  PLANO_RECEBIMENTO_VALUES,
  type MaquininhaConfig,
  type PlanoRecebimento,
  type PlanoTaxas,
} from "../schemas/financeMaquininha";

export const EXAMPLE_SALE_AMOUNT = 1000;

export type PlanoMeta = {
  id: PlanoRecebimento;
  label: string;
  shortLabel: string;
  description: string;
  /** Usado automaticamente em lançamentos financeiros (debit_card / credit_card). */
  defaultForEntries: boolean;
};

export const PLANO_META: Record<PlanoRecebimento, PlanoMeta> = {
  D0: {
    id: "D0",
    label: "Recebimento no mesmo dia (D+0)",
    shortLabel: "D+0",
    description: "Crédito na conta no mesmo dia útil da venda.",
    defaultForEntries: false,
  },
  D1: {
    id: "D1",
    label: "Antecipado D+1",
    shortLabel: "D+1",
    description: "Compensação no próximo dia útil — padrão para lançamentos no financeiro.",
    defaultForEntries: true,
  },
  PADRAO_30_DIAS: {
    id: "PADRAO_30_DIAS",
    label: "Parcelado 30 dias",
    shortLabel: "30 dias",
    description: "Recebimento conforme calendário de parcelas (30 dias por parcela).",
    defaultForEntries: false,
  },
};

export function emptyPlanoTaxas(): PlanoTaxas {
  const taxasCredito: Record<string, number> = {};
  for (let i = 1; i <= 12; i += 1) taxasCredito[String(i)] = 0;
  return { taxaDebito: 0, taxasCredito };
}

export function emptyMaquininhaConfig(nome = ""): MaquininhaConfig {
  return {
    nomeMaquininha: nome,
    planos: {
      D0: emptyPlanoTaxas(),
      D1: emptyPlanoTaxas(),
      PADRAO_30_DIAS: emptyPlanoTaxas(),
    },
  };
}

export function roundTaxaPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

export function parseTaxaInput(raw: string): number {
  const normalized = raw.replace(",", ".").trim();
  if (!normalized) return 0;
  const n = Number.parseFloat(normalized);
  return roundTaxaPercent(Number.isFinite(n) ? n : 0);
}

export function formatTaxaDisplay(value: number): string {
  const v = roundTaxaPercent(value);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}

export function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function planToDebitMethod(plan: PlanoRecebimento): string {
  return plan === "D1" ? "debit_card" : `debit_card_plano_${plan.toLowerCase()}`;
}

export function planToCreditMethod(plan: PlanoRecebimento): string {
  return plan === "D1" ? "credit_card" : `credit_card_plano_${plan.toLowerCase()}`;
}

export function planToReceivableMethod(plan: PlanoRecebimento): string {
  const map: Record<PlanoRecebimento, string> = {
    D0: "receivable_d0",
    D1: "receivable_d1",
    PADRAO_30_DIAS: "receivable_padrao_30_dias",
  };
  return map[plan];
}

function receivableMethodToPlan(method: string): PlanoRecebimento | null {
  const key = method.replace(/^receivable_/, "").toLowerCase();
  if (key === "d0") return "D0";
  if (key === "d1" || key.includes("1_dia") || key.includes("dia_util")) return "D1";
  if (key.includes("30") || key.includes("padrao")) return "PADRAO_30_DIAS";
  return null;
}

/** Monta configuração a partir das linhas da API para um provedor. */
export function configFromPaymentFees(providerName: string, fees: FinancePaymentFeeOut[]): MaquininhaConfig {
  const config = emptyMaquininhaConfig(providerName);
  const providerKey = providerName.trim().toLowerCase();
  const rows = fees.filter((f) => f.provider_name.trim().toLowerCase() === providerKey);

  for (const plan of PLANO_RECEBIMENTO_VALUES) {
    const debitMethod = planToDebitMethod(plan);
    const creditMethod = planToCreditMethod(plan);
    const debit = rows.find((f) => f.payment_method === debitMethod && f.installments === 1);
    if (debit) config.planos[plan].taxaDebito = roundTaxaPercent(Number(debit.fee_percent));
    for (let i = 1; i <= 12; i += 1) {
      const credit = rows.find((f) => f.payment_method === creditMethod && f.installments === i);
      if (credit) config.planos[plan].taxasCredito[String(i)] = roundTaxaPercent(Number(credit.fee_percent));
    }
  }

  /* Legado: receivable com rótulo livre (ex. receivable_1_dia_util) — taxas em debit_card/credit_card */
  const legacyReceivable = rows.find((f) => f.payment_method.startsWith("receivable_"));
  if (legacyReceivable && !rows.some((f) => f.payment_method === planToReceivableMethod("D1"))) {
    const inferred = receivableMethodToPlan(legacyReceivable.payment_method);
    if (inferred) {
      const debit = rows.find((f) => f.payment_method === "debit_card");
      const credits = rows.filter((f) => f.payment_method === "credit_card");
      if (debit) config.planos[inferred].taxaDebito = roundTaxaPercent(Number(debit.fee_percent));
      for (const row of credits) {
        if (row.installments >= 1 && row.installments <= 12) {
          config.planos[inferred].taxasCredito[String(row.installments)] = roundTaxaPercent(Number(row.fee_percent));
        }
      }
    }
  }

  return config;
}

export type FeeRowPayload = {
  provider_name: string;
  payment_method: string;
  installments: number;
  fee_percent: number;
  fee_fixed_amount: number;
  is_active: boolean;
};

/** Gera payloads para persistir todos os planos de uma maquininha. */
export function configToFeeRows(config: MaquininhaConfig): FeeRowPayload[] {
  const provider = config.nomeMaquininha.trim();
  const rows: FeeRowPayload[] = [];

  for (const plan of PLANO_RECEBIMENTO_VALUES) {
    const taxas = config.planos[plan];
    const debitMethod = planToDebitMethod(plan);
    const creditMethod = planToCreditMethod(plan);

    rows.push({
      provider_name: provider,
      payment_method: debitMethod,
      installments: 1,
      fee_percent: taxas.taxaDebito,
      fee_fixed_amount: 0,
      is_active: true,
    });

    for (let i = 1; i <= 12; i += 1) {
      rows.push({
        provider_name: provider,
        payment_method: creditMethod,
        installments: i,
        fee_percent: taxas.taxasCredito[String(i)] ?? 0,
        fee_fixed_amount: 0,
        is_active: true,
      });
    }

    rows.push({
      provider_name: provider,
      payment_method: planToReceivableMethod(plan),
      installments: 1,
      fee_percent: 0,
      fee_fixed_amount: 0,
      is_active: true,
    });
  }

  return rows;
}

export type SimulatorMode = "debit" | "credit";

export function netFromGross(gross: number, feePercent: number, feeFixed = 0): number {
  const fee = gross * (feePercent / 100) + feeFixed;
  return Math.max(0, Math.round((gross - fee) * 100) / 100);
}

export function feePercentForSimulation(
  plano: PlanoTaxas,
  mode: SimulatorMode,
  installments: number,
): number {
  if (mode === "debit") return plano.taxaDebito;
  const key = String(Math.min(12, Math.max(1, installments)));
  return plano.taxasCredito[key] ?? 0;
}
