/** Meios de pagamento padronizados (alinhado ao módulo Financeiro). */

export type ExpensePaymentMethod =
  | "pix"
  | "cash"
  | "credit_card"
  | "debit_card"
  | "boleto"
  | "bank_transfer";

export const EXPENSE_PAYMENT_METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: "pix", label: "PIX" },
  { value: "cash", label: "Dinheiro" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "debit_card", label: "Cartão de débito" },
  { value: "boleto", label: "Boleto" },
  { value: "bank_transfer", label: "Transferência bancária" },
];

export function expensePaymentMethodLabel(method: string | null | undefined): string {
  const v = (method || "").trim().toLowerCase();
  return EXPENSE_PAYMENT_METHODS.find((m) => m.value === v)?.label ?? (v || "—");
}

/** Conta bancária de saída (PIX, débito, dinheiro, boleto, transferência). */
export function expenseShowsBankAccount(method: string): boolean {
  return method !== "credit_card";
}

/** Cartão cadastrado no financeiro (fatura). */
export function expenseShowsCreditCard(method: string): boolean {
  return method === "credit_card";
}

export function normalizeExpensePaymentMethod(raw: string): ExpensePaymentMethod {
  const v = raw.trim().toLowerCase();
  if (EXPENSE_PAYMENT_METHODS.some((m) => m.value === v)) return v as ExpensePaymentMethod;
  return "pix";
}
