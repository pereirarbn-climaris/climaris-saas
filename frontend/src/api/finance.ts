import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import {
  demoCreateFinanceCategory,
  demoDeleteFinanceCategory,
  demoPatchFinanceCategory,
  demoCreateFinanceEntry,
  demoCreateFinanceFee,
  demoDeleteFinanceEntry,
  demoDeleteFinanceFee,
  demoGetFinanceSettings,
  demoGetFinanceSummary,
  demoGetFinanceBalanceSnapshot,
  demoListFinanceAccounts,
  demoListFinanceCategories,
  demoListFinanceEntries,
  demoListFinanceFees,
  demoPatchFinanceEntry,
  demoUpdateFinanceSettings,
  isDemoMode,
} from "../lib/demoMode";

export type FinanceEntryType = "income" | "expense";
export type FinanceEntryStatus = "pending" | "paid" | "overdue" | "cancelled";

export type FinanceCategoryOut = {
  id: number;
  tenant_id: number;
  name: string;
  color: string | null;
  created_at: string;
};

export type FinanceEntryOut = {
  id: number;
  tenant_id: number;
  category_id: number | null;
  category_name: string | null;
  description: string;
  entry_type: FinanceEntryType;
  status: FinanceEntryStatus;
  amount: number;
  payment_method: string | null;
  payment_provider: string | null;
  finance_account_id?: number | null;
  credit_card_id?: number | null;
  fee_fixed_amount: number;
  fee_percent: number;
  fee_amount: number;
  recipient_whatsapp?: string | null;
  gateway_payment_id?: string | null;
  installment_group_id?: string | null;
  installment_number?: number;
  installment_total?: number;
  net_amount: number;
  due_date: string;
  competence_date: string;
  expected_settlement_date: string;
  settlement_plan?: string | null;
  paid_at: string | null;
  notes: string | null;
  service_order_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type FinanceSummaryOut = {
  period_start: string;
  period_end: string;
  incomes: number;
  incomes_net: number;
  expenses: number;
  total_fees: number;
  net: number;
  pending_count: number;
  overdue_count: number;
  total_count: number;
};

export type FinanceCategorySummaryOut = {
  category_id: number | null;
  category_name: string;
  income_total: number;
  expense_total: number;
  balance: number;
};

export type FinanceSettingsOut = {
  finance_enabled: boolean;
  selected_mode: "basic" | "intermediate" | "management";
  effective_mode: "basic" | "intermediate" | "management";
  max_available_mode: "basic" | "intermediate" | "management";
  can_use_marketplace_upgrade: boolean;
  requires_marketplace_slug: string | null;
};

function bearer(json = false): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return json
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { Authorization: `Bearer ${token}` };
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function errMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as { error?: { message?: string }; detail?: string };
    if (o.error?.message) return o.error.message;
    if (o.detail) return o.detail;
  }
  return fallback;
}

export type FinanceEntryDateBasis = "due_date" | "competence_date" | "expected_settlement_date";

export async function listFinanceEntries(params: {
  start_date: string;
  end_date: string;
  status?: FinanceEntryStatus;
  entry_type?: FinanceEntryType;
  date_basis?: FinanceEntryDateBasis;
  service_order_id?: number;
}): Promise<FinanceEntryOut[]> {
  if (isDemoMode()) {
    let rows = demoListFinanceEntries();
    if (params.status) rows = rows.filter((item) => item.status === params.status);
    if (params.entry_type) rows = rows.filter((item) => item.entry_type === params.entry_type);
    if (params.service_order_id != null) {
      rows = rows.filter((item) => item.service_order_id === params.service_order_id);
    }
    return Promise.resolve(rows);
  }
  const sp = new URLSearchParams();
  sp.set("start_date", params.start_date);
  sp.set("end_date", params.end_date);
  if (params.status) sp.set("status", params.status);
  if (params.entry_type) sp.set("entry_type", params.entry_type);
  if (params.date_basis) sp.set("date_basis", params.date_basis);
  if (params.service_order_id != null) sp.set("service_order_id", String(params.service_order_id));
  const response = await fetch(apiUrl(`/api/v1/finance/entries?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível listar lançamentos."));
  return body as FinanceEntryOut[];
}

export async function createFinanceEntry(payload: {
  description: string;
  entry_type: FinanceEntryType;
  amount: number;
  payment_method?: string | null;
  payment_provider?: string | null;
  finance_account_id?: number | null;
  credit_card_id?: number | null;
  fee_fixed_amount?: number;
  fee_percent?: number;
  fee_amount?: number;
  recipient_whatsapp?: string | null;
  installments?: number;
  installment_interval_months?: number;
  due_date: string;
  competence_date?: string;
  settlement_plan?: "same_as_due" | "next_business_day";
  category_id?: number | null;
  status?: FinanceEntryStatus;
  notes?: string | null;
  service_order_id?: number | null;
}): Promise<FinanceEntryOut> {
  if (isDemoMode()) return Promise.resolve(demoCreateFinanceEntry(payload));
  const response = await fetch(apiUrl("/api/v1/finance/entries"), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível criar lançamento."));
  return body as FinanceEntryOut;
}

export async function patchFinanceEntry(
  entryId: number,
  payload: {
    description?: string;
    amount?: number;
    due_date?: string;
    category_id?: number | null;
    status?: FinanceEntryStatus;
    notes?: string | null;
    payment_method?: string | null;
    payment_provider?: string | null;
    finance_account_id?: number | null;
    credit_card_id?: number | null;
    edit_scope?: "single" | "future" | "all";
    fee_fixed_amount?: number;
    fee_percent?: number;
    fee_amount?: number;
    recipient_whatsapp?: string | null;
    gateway_payment_id?: string | null;
    competence_date?: string;
    settlement_plan?: "same_as_due" | "next_business_day";
  },
): Promise<FinanceEntryOut> {
  if (isDemoMode()) return Promise.resolve(demoPatchFinanceEntry(entryId, payload));
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}`), {
    method: "PATCH",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível atualizar lançamento."));
  return body as FinanceEntryOut;
}

export type FinanceBankAccountOut = {
  id: number;
  tenant_id: number;
  name: string;
  bank_name: string | null;
  account_type: "checking" | "savings" | "investment" | "digital_wallet" | "cash" | "other";
  initial_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceCreditCardOut = {
  id: number;
  tenant_id: number;
  billing_account_id: number | null;
  name: string;
  brand: string;
  limit_amount: number;
  used_limit: number;
  available_limit: number;
  closing_day: number;
  due_day: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceCashflowOut = {
  period_start: string;
  period_end: string;
  opening_balance: number;
  incomes: number;
  expenses: number;
  net_flow: number;
  closing_balance: number;
};

export type FinanceAccountBalanceRowOut = {
  id: number;
  name: string;
  initial_balance: number;
  current_balance: number;
  projected_balance: number;
};

export type FinanceBalanceSnapshotOut = {
  date_basis: string;
  period_end: string;
  as_of: string;
  initial_balance_total: number;
  current_balance_total: number;
  projected_balance_total: number;
  accounts: FinanceAccountBalanceRowOut[];
};

export async function listFinanceAccounts(): Promise<FinanceBankAccountOut[]> {
  if (isDemoMode()) {
    return Promise.resolve(demoListFinanceAccounts());
  }
  const response = await fetch(apiUrl("/api/v1/finance/accounts"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível listar contas bancárias."));
  return body as FinanceBankAccountOut[];
}

export async function getFinanceBalanceSnapshot(params: {
  end_date: string;
  date_basis: FinanceEntryDateBasis;
}): Promise<FinanceBalanceSnapshotOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoGetFinanceBalanceSnapshot(params));
  }
  const sp = new URLSearchParams({ end_date: params.end_date, date_basis: params.date_basis });
  const response = await fetch(apiUrl(`/api/v1/finance/balance-snapshot?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar saldos das contas."));
  return body as FinanceBalanceSnapshotOut;
}

export async function createFinanceAccount(payload: {
  name: string;
  bank_name?: string | null;
  account_type?: "checking" | "savings" | "investment" | "digital_wallet" | "cash" | "other";
  initial_balance?: number;
  is_active?: boolean;
}): Promise<FinanceBankAccountOut> {
  const response = await fetch(apiUrl("/api/v1/finance/accounts"), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível criar conta bancária."));
  return body as FinanceBankAccountOut;
}

export async function deleteFinanceAccount(accountId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/finance/accounts/${accountId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errMessage(body, "Não foi possível remover conta bancária."));
  }
}

export async function listFinanceCreditCards(): Promise<FinanceCreditCardOut[]> {
  const response = await fetch(apiUrl("/api/v1/finance/credit-cards"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível listar cartões de crédito."));
  return body as FinanceCreditCardOut[];
}

export async function createFinanceCreditCard(payload: {
  name: string;
  brand?: string;
  billing_account_id?: number | null;
  limit_amount?: number;
  closing_day?: number;
  due_day?: number;
  is_active?: boolean;
}): Promise<FinanceCreditCardOut> {
  const response = await fetch(apiUrl("/api/v1/finance/credit-cards"), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível criar cartão."));
  return body as FinanceCreditCardOut;
}

export async function deleteFinanceCreditCard(cardId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/finance/credit-cards/${cardId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errMessage(body, "Não foi possível remover cartão."));
  }
}

export async function patchFinanceCreditCard(
  cardId: number,
  payload: {
    name?: string;
    brand?: string;
    billing_account_id?: number | null;
    limit_amount?: number;
    closing_day?: number;
    due_day?: number;
    is_active?: boolean;
  },
): Promise<FinanceCreditCardOut> {
  const response = await fetch(apiUrl(`/api/v1/finance/credit-cards/${cardId}`), {
    method: "PATCH",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível atualizar cartão."));
  return body as FinanceCreditCardOut;
}

export async function getFinanceCashflow(params: { start_date: string; end_date: string }): Promise<FinanceCashflowOut> {
  const sp = new URLSearchParams(params);
  const response = await fetch(apiUrl(`/api/v1/finance/cashflow?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar fluxo de caixa."));
  return body as FinanceCashflowOut;
}

export async function createFinanceEntryAsaasCharge(
  entryId: number,
  payload: { customer_id: string; billing_type: "PIX" | "BOLETO" },
): Promise<{
  status: string;
  entry: FinanceEntryOut;
  payment_id: string;
  invoice_url: string | null;
  external_reference: string;
  sandbox: boolean;
}> {
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}/asaas-charge`), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível emitir cobrança Asaas."));
  return body as {
    status: string;
    entry: FinanceEntryOut;
    payment_id: string;
    invoice_url: string | null;
    external_reference: string;
    sandbox: boolean;
  };
}

export async function deleteFinanceEntry(
  entryId: number,
  params?: { edit_scope?: "single" | "future" | "all" },
): Promise<void> {
  if (isDemoMode()) {
    demoDeleteFinanceEntry(entryId, params?.edit_scope ?? "single");
    return Promise.resolve();
  }
  const sp = new URLSearchParams();
  if (params?.edit_scope && params.edit_scope !== "single") {
    sp.set("edit_scope", params.edit_scope);
  }
  const q = sp.toString();
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}${q ? `?${q}` : ""}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errMessage(body, "Não foi possível remover lançamento."));
  }
}

export async function listFinanceCategories(): Promise<FinanceCategoryOut[]> {
  if (isDemoMode()) return Promise.resolve(demoListFinanceCategories());
  const response = await fetch(apiUrl("/api/v1/finance/categories"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível listar categorias."));
  return body as FinanceCategoryOut[];
}

export async function createFinanceCategory(payload: { name: string; color?: string | null }): Promise<FinanceCategoryOut> {
  if (isDemoMode()) return Promise.resolve(demoCreateFinanceCategory(payload));
  const response = await fetch(apiUrl("/api/v1/finance/categories"), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível criar categoria."));
  return body as FinanceCategoryOut;
}

export async function patchFinanceCategory(
  categoryId: number,
  payload: { name?: string; color?: string | null },
): Promise<FinanceCategoryOut> {
  if (isDemoMode()) return Promise.resolve(demoPatchFinanceCategory(categoryId, payload));
  const response = await fetch(apiUrl(`/api/v1/finance/categories/${categoryId}`), {
    method: "PATCH",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível atualizar categoria."));
  return body as FinanceCategoryOut;
}

export async function deleteFinanceCategory(categoryId: number): Promise<void> {
  if (isDemoMode()) {
    demoDeleteFinanceCategory(categoryId);
    return Promise.resolve();
  }
  const response = await fetch(apiUrl(`/api/v1/finance/categories/${categoryId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.ok) return;
  const body = await parseBody(response);
  throw new Error(errMessage(body, "Não foi possível remover categoria."));
}

export type FinancePaymentFeeOut = {
  id: number;
  tenant_id: number;
  provider_name: string;
  payment_method: string;
  installments: number;
  fee_percent: number;
  fee_fixed_amount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listFinancePaymentFees(): Promise<FinancePaymentFeeOut[]> {
  if (isDemoMode()) return Promise.resolve(demoListFinanceFees());
  const response = await fetch(apiUrl("/api/v1/finance/payment-fees"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível listar taxas de pagamento."));
  return body as FinancePaymentFeeOut[];
}

export async function createFinancePaymentFee(payload: {
  provider_name: string;
  payment_method: string;
  installments: number;
  fee_percent: number;
  fee_fixed_amount: number;
  is_active?: boolean;
}): Promise<FinancePaymentFeeOut> {
  if (isDemoMode()) return Promise.resolve(demoCreateFinanceFee({ ...payload, is_active: payload.is_active ?? true }));
  const response = await fetch(apiUrl("/api/v1/finance/payment-fees"), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível criar taxa."));
  return body as FinancePaymentFeeOut;
}

export async function deleteFinancePaymentFee(feeId: number): Promise<void> {
  if (isDemoMode()) {
    demoDeleteFinanceFee(feeId);
    return Promise.resolve();
  }
  const response = await fetch(apiUrl(`/api/v1/finance/payment-fees/${feeId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errMessage(body, "Não foi possível remover taxa."));
  }
}

export async function getFinanceSummary(params: {
  start_date: string;
  end_date: string;
  date_basis?: FinanceEntryDateBasis;
}): Promise<FinanceSummaryOut> {
  if (isDemoMode()) return Promise.resolve(demoGetFinanceSummary());
  const sp = new URLSearchParams();
  sp.set("start_date", params.start_date);
  sp.set("end_date", params.end_date);
  if (params.date_basis) sp.set("date_basis", params.date_basis);
  const response = await fetch(apiUrl(`/api/v1/finance/summary?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar resumo financeiro."));
  return body as FinanceSummaryOut;
}

export async function getAdvancedFinanceSummary(params: {
  start_date: string;
  end_date: string;
  date_basis?: FinanceEntryDateBasis;
}): Promise<FinanceCategorySummaryOut[]> {
  if (isDemoMode()) return Promise.resolve([]);
  const sp = new URLSearchParams();
  sp.set("start_date", params.start_date);
  sp.set("end_date", params.end_date);
  if (params.date_basis) sp.set("date_basis", params.date_basis);
  const response = await fetch(apiUrl(`/api/v1/finance/advanced-summary?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar resumo avançado."));
  return body as FinanceCategorySummaryOut[];
}

export async function getFinanceSettings(): Promise<FinanceSettingsOut> {
  if (isDemoMode()) return Promise.resolve(demoGetFinanceSettings());
  const response = await fetch(apiUrl("/api/v1/finance/settings"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar configurações do financeiro."));
  return body as FinanceSettingsOut;
}

export async function updateFinanceSettings(payload: {
  finance_enabled: boolean;
  finance_mode: "basic" | "intermediate" | "management";
}): Promise<FinanceSettingsOut> {
  if (isDemoMode()) {
    return Promise.resolve(
      demoUpdateFinanceSettings({
        finance_enabled: payload.finance_enabled,
        selected_mode: payload.finance_mode,
      }),
    );
  }
  const response = await fetch(apiUrl("/api/v1/finance/settings"), {
    method: "PATCH",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível salvar configurações do financeiro."));
  return body as FinanceSettingsOut;
}

export type FinanceGatewayAsaasPublic = {
  connected: boolean;
  sandbox: boolean;
  api_key_hint: string | null;
  account_label: string | null;
  last_validated_at: string | null;
  last_validation_error: string | null;
  webhook_url: string | null;
  webhook_registered: boolean;
  webhook_last_error: string | null;
};

export type FinanceGatewayMercadoPagoPublic = {
  connected: boolean;
  oauth_available: boolean;
  requires_mode: "intermediate" | null;
};

export type FinanceGatewaysOut = {
  effective_mode: "basic" | "intermediate" | "management";
  asaas: FinanceGatewayAsaasPublic;
  mercadopago: FinanceGatewayMercadoPagoPublic;
};

export async function getFinanceGateways(): Promise<FinanceGatewaysOut> {
  const response = await fetch(apiUrl("/api/v1/finance/gateways"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar gateways."));
  return body as FinanceGatewaysOut;
}

export async function testFinanceGatewayAsaas(payload: {
  api_key: string;
  sandbox?: boolean;
}): Promise<{ ok: boolean; error: string | null; account_label: string | null }> {
  const response = await fetch(apiUrl("/api/v1/finance/gateways/asaas/test"), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify({ api_key: payload.api_key, sandbox: payload.sandbox ?? false }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível testar o Asaas."));
  return body as { ok: boolean; error: string | null; account_label: string | null };
}

export async function upsertFinanceGatewayAsaas(payload: {
  api_key: string;
  sandbox?: boolean;
}): Promise<{ status: string; asaas: FinanceGatewayAsaasPublic; mercadopago: FinanceGatewayMercadoPagoPublic }> {
  const response = await fetch(apiUrl("/api/v1/finance/gateways/asaas"), {
    method: "PUT",
    headers: bearer(true),
    body: JSON.stringify({ api_key: payload.api_key, sandbox: payload.sandbox ?? false }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível salvar o gateway Asaas."));
  return body as { status: string; asaas: FinanceGatewayAsaasPublic; mercadopago: FinanceGatewayMercadoPagoPublic };
}

export async function deleteFinanceGatewayAsaas(): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/finance/gateways/asaas"), {
    method: "DELETE",
    headers: bearer(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errMessage(body, "Não foi possível remover o gateway."));
  }
}

export async function sendFinanceDueReminders(params: {
  due_date: string;
  mode?: "manual" | "automatic";
}): Promise<{ status: string; sent: number; eligible: number; due_date: string }> {
  const sp = new URLSearchParams();
  sp.set("due_date", params.due_date);
  sp.set("mode", params.mode ?? "manual");
  const response = await fetch(apiUrl(`/api/v1/finance/entries/send-reminders?${sp.toString()}`), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível enviar lembretes."));
  return body as { status: string; sent: number; eligible: number; due_date: string };
}
