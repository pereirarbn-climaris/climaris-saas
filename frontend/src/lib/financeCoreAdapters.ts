import type { FinanceBankAccountOut, FinanceEntryOut, FinanceEntryStatus, FinanceEntryType } from "../api/finance";
import type {
  FinancialAccount,
  FinancialAccountKind,
  FinancialTransaction,
  TransactionDirection,
  TransactionStatus,
} from "../schemas/financeCore";

const ENTRY_STATUS_TO_TRANSACTION: Record<FinanceEntryStatus, TransactionStatus> = {
  pending: "pending",
  paid: "settled",
  overdue: "overdue",
  cancelled: "cancelled",
  awaiting_invoice: "pending",
};

const TRANSACTION_TO_ENTRY_STATUS: Record<TransactionStatus, FinanceEntryStatus> = {
  pending: "pending",
  settled: "paid",
  overdue: "overdue",
  cancelled: "cancelled",
  reconciled: "paid",
};

export function entryTypeToDirection(entryType: FinanceEntryType): TransactionDirection {
  return entryType === "income" ? "inflow" : "outflow";
}

export function directionToEntryType(direction: TransactionDirection): FinanceEntryType {
  return direction === "inflow" ? "income" : "expense";
}

export function mapEntryStatusToTransaction(status: FinanceEntryStatus): TransactionStatus {
  return ENTRY_STATUS_TO_TRANSACTION[status] ?? "pending";
}

export function mapTransactionStatusToEntry(status: TransactionStatus): FinanceEntryStatus {
  return TRANSACTION_TO_ENTRY_STATUS[status] ?? "pending";
}

function accountTypeToKind(accountType: string, name: string): FinancialAccountKind {
  const t = (accountType || "").toLowerCase();
  const n = name.toLowerCase();
  if (t === "cash" || n.includes("caixa")) return "cash";
  return "bank";
}

/** Converte conta bancária legada para o modelo unificado. */
export function bankAccountToFinancialAccount(row: FinanceBankAccountOut): FinancialAccount {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    kind: accountTypeToKind(row.account_type, row.name),
    status: row.is_active ? "active" : "inactive",
    bank_subtype: row.account_type as FinancialAccount["bank_subtype"],
    bank_name: row.bank_name ?? null,
    initial_balance: row.initial_balance,
    provider_slug: null,
    gateway_id: null,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Converte lançamento legado (`finance_entries`) para transação unificada. */
export function financeEntryToTransaction(row: FinanceEntryOut): FinancialTransaction {
  const direction = entryTypeToDirection(row.entry_type);
  let status = mapEntryStatusToTransaction(row.status);
  if (row.paid_at && status === "pending") status = "settled";

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    account_id: row.finance_account_id ?? null,
    description: row.description,
    direction,
    status,
    amount: row.amount,
    fee_amount: row.fee_amount ?? 0,
    net_amount: row.net_amount ?? row.amount - (row.fee_amount ?? 0),
    category_id: row.category_id,
    category_name: row.category_name,
    scheduled_at: row.due_date,
    settled_at: row.paid_at ?? null,
    reconciled_at: null,
    competence_at: row.competence_date,
    payment_method: row.payment_method,
    payment_provider: row.payment_provider,
    installment_number: row.installment_number ?? 1,
    installment_total: row.installment_total ?? 1,
    service_order_id: row.service_order_id ?? null,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
