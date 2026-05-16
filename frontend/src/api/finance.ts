import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import {
  demoCreateFinanceCategory,
  demoCreateFinanceAccount,
  demoDeleteFinanceCategory,
  demoPatchFinanceCategory,
  demoCreateFinanceEntry,
  demoCreateFinanceFee,
  demoDeleteFinanceEntry,
  demoDeleteFinanceFee,
  demoDeleteFinanceGatewayMercadoPago,
  demoGetFinanceSettings,
  demoGetFinanceSummary,
  demoGetFinanceBalanceSnapshot,
  demoGetFinanceGateways,
  demoListFinanceAccounts,
  demoListFinanceCategories,
  demoListFinanceEntries,
  demoListFinanceFees,
  demoMercadoPagoPixCharge,
  demoMercadoPagoBoletoCharge,
  demoMercadoPagoPreference,
  demoPatchFinanceEntry,
  demoPatchFinanceGatewayMercadoPagoProducts,
  demoPatchFinanceGatewayMercadoPagoWebhookSignature,
  demoTestFinanceGatewayMercadoPago,
  demoUpdateFinanceSettings,
  demoUpsertFinanceGatewayMercadoPago,
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
  gateway_preference_id?: string | null;
  mercadopago_archived_preference_id?: string | null;
  mercadopago_preapproval_id?: string | null;
  mp_reversal_at?: string | null;
  mp_reversal_status?: string | null;
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
  linked_payer_email?: string | null;
  linked_payer_name?: string | null;
  linked_payer_document?: string | null;
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
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (o.error?.message) return o.error.message;
    if (typeof o.detail === "string" && o.detail.trim()) return o.detail;
    if (Array.isArray(o.detail) && o.detail.length) {
      const parts = o.detail
        .map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg?: string }).msg) : String(x)))
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
  }
  return fallback;
}

/** 404 genérico do Starlette costuma indicar processo da API sem recarregar rotas novas. */
function errMessageWithHttp(response: Response, body: unknown, fallback: string): string {
  if (response.status === 404) {
    const fromBody = errMessage(body, "");
    if (!fromBody || fromBody === "Not Found") {
      return "A API respondeu 404 nesta rota. Reinicie o serviço da API após atualizar o código (ex.: docker compose restart api na VPS) e tente de novo.";
    }
  }
  return errMessage(body, fallback);
}

/** Erro de API: JSON (`detail`), corpo HTML (proxy/WAF) ou código HTTP. */
function apiErrorMessage(response: Response, body: unknown, rawText: string, fallback: string): string {
  const fromJson = errMessage(body, "");
  if (fromJson) return fromJson;
  const plain = rawText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length > 0) return plain.length > 280 ? `${plain.slice(0, 280)}…` : plain;
  if (response.status === 403)
    return "Sem permissão para esta ação. Apenas administrador ou recepcionista do workspace podem testar ou salvar chaves de pagamento.";
  if (response.status === 401) return "Sessão expirada ou credenciais inválidas. Faça login novamente.";
  return fallback || `Erro HTTP ${response.status}.`;
}

/** Lê o corpo uma vez; em erro lança mensagem legível (inclui HTML de proxy/WAF). */
async function parseResponseOrApiError(response: Response, errFallback: string): Promise<unknown> {
  const rawText = await response.text();
  let body: unknown = {};
  try {
    if (rawText.trim()) body = JSON.parse(rawText) as unknown;
  } catch {
    body = {};
  }
  if (!response.ok) throw new Error(apiErrorMessage(response, body, rawText, errFallback));
  return body;
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
    let rows: FinanceEntryOut[] = demoListFinanceEntries();
    if (params.status) rows = rows.filter((item: FinanceEntryOut) => item.status === params.status);
    if (params.entry_type) rows = rows.filter((item: FinanceEntryOut) => item.entry_type === params.entry_type);
    if (params.service_order_id != null) {
      rows = rows.filter((item: FinanceEntryOut) => item.service_order_id === params.service_order_id);
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
    gateway_preference_id?: string | null;
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
  const body = await parseResponseOrApiError(response, "Não foi possível listar contas bancárias.");
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
  if (isDemoMode()) return Promise.resolve(demoCreateFinanceAccount(payload));
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

export async function createFinanceEntryMercadoPagoPixCharge(
  entryId: number,
  payload: { payer_email: string; payer_first_name?: string | null; payer_last_name?: string | null },
): Promise<{
  status: string;
  entry: FinanceEntryOut;
  payment_id: string;
  payment_status: string;
  ticket_url: string | null;
  pix_copy_paste: string | null;
  external_reference: string;
  sandbox: boolean;
}> {
  if (isDemoMode()) return Promise.resolve(demoMercadoPagoPixCharge(entryId, payload));
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}/mercadopago-charge`), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível emitir cobrança Mercado Pago."));
  return body as {
    status: string;
    entry: FinanceEntryOut;
    payment_id: string;
    payment_status: string;
    ticket_url: string | null;
    pix_copy_paste: string | null;
    external_reference: string;
    sandbox: boolean;
  };
}

export async function createFinanceEntryStonePixCharge(
  entryId: number,
  payload: { customer_email: string; customer_name?: string | null; payer_document?: string | null },
): Promise<{
  status: string;
  entry: FinanceEntryOut;
  order_id: string;
  pix_copy_paste: string | null;
  qr_code_url: string | null;
  order_code: string;
  sandbox: boolean;
}> {
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}/stone-charge`), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify({
      customer_email: payload.customer_email,
      customer_name: payload.customer_name ?? null,
      payer_document: payload.payer_document ?? null,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessageWithHttp(response, body, "Não foi possível emitir cobrança Stone / Pagar.me."));
  return body as {
    status: string;
    entry: FinanceEntryOut;
    order_id: string;
    pix_copy_paste: string | null;
    qr_code_url: string | null;
    order_code: string;
    sandbox: boolean;
  };
}

export async function createFinanceEntryStoneBoletoCharge(
  entryId: number,
  payload: {
    customer_email: string;
    customer_name?: string | null;
    payer_document: string;
    instructions?: string | null;
  },
): Promise<{
  status: string;
  entry: FinanceEntryOut;
  order_id: string;
  ticket_url: string | null;
  digitable_line: string | null;
  barcode: string | null;
  order_code: string;
  sandbox: boolean;
}> {
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}/stone-boleto-charge`), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify({
      customer_email: payload.customer_email,
      customer_name: payload.customer_name ?? null,
      payer_document: payload.payer_document,
      instructions: payload.instructions ?? null,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessageWithHttp(response, body, "Não foi possível emitir boleto Stone / Pagar.me."));
  return body as {
    status: string;
    entry: FinanceEntryOut;
    order_id: string;
    ticket_url: string | null;
    digitable_line: string | null;
    barcode: string | null;
    order_code: string;
    sandbox: boolean;
  };
}

export async function getFinanceEntryStoneBoletoArtifacts(entryId: number): Promise<{
  order_id: string;
  ticket_url: string | null;
  digitable_line: string | null;
  barcode: string | null;
  sandbox: boolean;
}> {
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}/stone-boleto-artifacts`), {
    method: "GET",
    headers: bearer(false),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errMessageWithHttp(response, body, "Não foi possível carregar o boleto no Pagar.me."));
  }
  return body as {
    order_id: string;
    ticket_url: string | null;
    digitable_line: string | null;
    barcode: string | null;
    sandbox: boolean;
  };
}

export async function createFinanceEntryStoneCardCharge(
  entryId: number,
  payload: {
    customer_email: string;
    customer_name?: string | null;
    payer_document: string;
    card_token: string;
    installments: number;
  },
): Promise<{
  status: string;
  entry: FinanceEntryOut;
  order_id: string;
  order_code: string;
  sandbox: boolean;
}> {
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}/stone-card-charge`), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify({
      customer_email: payload.customer_email,
      customer_name: payload.customer_name ?? null,
      payer_document: payload.payer_document,
      card_token: payload.card_token,
      installments: payload.installments,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessageWithHttp(response, body, "Não foi possível cobrar no cartão via Stone / Pagar.me."));
  return body as {
    status: string;
    entry: FinanceEntryOut;
    order_id: string;
    order_code: string;
    sandbox: boolean;
  };
}

export async function createFinanceEntryMercadoPagoBoletoCharge(
  entryId: number,
  payload: {
    payer_email: string;
    payer_cpf: string;
    payer_first_name?: string | null;
    payer_last_name?: string | null;
  },
): Promise<{
  status: string;
  entry: FinanceEntryOut;
  payment_id: string;
  payment_status: string;
  ticket_url: string | null;
  external_reference: string;
  sandbox: boolean;
}> {
  if (isDemoMode()) return Promise.resolve(demoMercadoPagoBoletoCharge(entryId, payload));
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}/mercadopago-boleto-charge`), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível emitir boleto Mercado Pago."));
  return body as {
    status: string;
    entry: FinanceEntryOut;
    payment_id: string;
    payment_status: string;
    ticket_url: string | null;
    external_reference: string;
    sandbox: boolean;
  };
}

export async function createFinanceEntryMercadoPagoPreference(
  entryId: number,
  payload: {
    mode: "checkout_pro" | "payment_link" | "subscription";
    payer_email?: string | null;
    success_url?: string | null;
    failure_url?: string | null;
    pending_url?: string | null;
    subscription_frequency?: number;
    subscription_frequency_type?: "months" | "days";
  },
): Promise<{
  status: string;
  mode: string;
  preference_id: string;
  init_point: string | null;
  sandbox_init_point: string | null;
  checkout_url: string;
  external_reference: string;
  sandbox: boolean;
  entry?: FinanceEntryOut;
}> {
  if (isDemoMode()) return Promise.resolve(demoMercadoPagoPreference(entryId, payload));
  const response = await fetch(apiUrl(`/api/v1/finance/entries/${entryId}/mercadopago-preference`), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível criar o checkout Mercado Pago."));
  return body as {
    status: string;
    mode: string;
    preference_id: string;
    init_point: string | null;
    sandbox_init_point: string | null;
    checkout_url: string;
    external_reference: string;
    sandbox: boolean;
    entry?: FinanceEntryOut;
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

export type FinanceGatewayMercadoPagoProducts = {
  checkout_pro: boolean;
  pix: boolean;
  boleto: boolean;
  subscriptions: boolean;
  payment_link: boolean;
};

export type FinanceGatewayMercadoPagoPublic = {
  connected: boolean;
  sandbox: boolean;
  access_token_hint: string | null;
  public_key_hint: string | null;
  /** Chave pública (checkout no app). Só quando o gateway está configurado. */
  public_key: string | null;
  account_label: string | null;
  mp_user_id: string | null;
  finance_bank_account_id: number | null;
  products: FinanceGatewayMercadoPagoProducts;
  webhook_url: string | null;
  /** Base usada para montar webhook_url e notification_url (API_PUBLIC_BASE_URL ou fallback). */
  api_public_base_url: string | null;
  webhook_signature_configured: boolean;
  /** Servidor com MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE e conta não sandbox: webhook exige segredo. */
  webhook_signature_enforced: boolean;
  last_validated_at: string | null;
  last_validation_error: string | null;
  cached_balance: number | null;
};

export type FinanceGatewayStonePublic = {
  connected: boolean;
  sandbox: boolean;
  secret_key_hint: string | null;
  public_key_hint: string | null;
  public_key: string | null;
  account_label: string | null;
  finance_bank_account_id: number | null;
  webhook_url: string | null;
  last_validated_at: string | null;
  last_validation_error: string | null;
};

export type FinanceGatewaysOut = {
  effective_mode: "basic" | "intermediate" | "management";
  asaas: FinanceGatewayAsaasPublic;
  mercadopago: FinanceGatewayMercadoPagoPublic;
  stone: FinanceGatewayStonePublic;
};

export async function getFinanceGateways(): Promise<FinanceGatewaysOut> {
  if (isDemoMode()) return Promise.resolve(demoGetFinanceGateways());
  const response = await fetch(apiUrl("/api/v1/finance/gateways"), { headers: bearer() });
  const body = await parseResponseOrApiError(response, "Não foi possível carregar gateways.");
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
}): Promise<{
  status: string;
  asaas: FinanceGatewayAsaasPublic;
  mercadopago: FinanceGatewayMercadoPagoPublic;
  stone: FinanceGatewayStonePublic;
}> {
  const response = await fetch(apiUrl("/api/v1/finance/gateways/asaas"), {
    method: "PUT",
    headers: bearer(true),
    body: JSON.stringify({ api_key: payload.api_key, sandbox: payload.sandbox ?? false }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível salvar o gateway Asaas."));
  return body as {
    status: string;
    asaas: FinanceGatewayAsaasPublic;
    mercadopago: FinanceGatewayMercadoPagoPublic;
    stone: FinanceGatewayStonePublic;
  };
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

export async function testFinanceGatewayMercadoPago(payload: {
  access_token: string;
  public_key: string;
  sandbox?: boolean;
}): Promise<{ ok: boolean; error: string | null; account_label: string | null; mp_user_id: string | null }> {
  if (isDemoMode()) return Promise.resolve(demoTestFinanceGatewayMercadoPago());
  const response = await fetch(apiUrl("/api/v1/finance/gateways/mercadopago/test"), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify({
      access_token: payload.access_token,
      public_key: payload.public_key,
      sandbox: payload.sandbox ?? false,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível testar o Mercado Pago."));
  return body as { ok: boolean; error: string | null; account_label: string | null; mp_user_id: string | null };
}

export async function upsertFinanceGatewayMercadoPago(payload: {
  access_token: string;
  public_key: string;
  sandbox?: boolean;
  finance_bank_account_id: number;
  products?: FinanceGatewayMercadoPagoProducts;
}): Promise<{
  status: string;
  asaas: FinanceGatewayAsaasPublic;
  mercadopago: FinanceGatewayMercadoPagoPublic;
  stone: FinanceGatewayStonePublic;
}> {
  if (isDemoMode()) return Promise.resolve(demoUpsertFinanceGatewayMercadoPago(payload));
  const response = await fetch(apiUrl("/api/v1/finance/gateways/mercadopago"), {
    method: "PUT",
    headers: bearer(true),
    body: JSON.stringify({
      access_token: payload.access_token,
      public_key: payload.public_key,
      sandbox: payload.sandbox ?? false,
      finance_bank_account_id: payload.finance_bank_account_id,
      products: payload.products,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível salvar o Mercado Pago."));
  return body as {
    status: string;
    asaas: FinanceGatewayAsaasPublic;
    mercadopago: FinanceGatewayMercadoPagoPublic;
    stone: FinanceGatewayStonePublic;
  };
}

export async function patchFinanceGatewayMercadoPagoProducts(
  payload: FinanceGatewayMercadoPagoProducts,
): Promise<{
  status: string;
  asaas: FinanceGatewayAsaasPublic;
  mercadopago: FinanceGatewayMercadoPagoPublic;
  stone: FinanceGatewayStonePublic;
}> {
  if (isDemoMode()) return Promise.resolve(demoPatchFinanceGatewayMercadoPagoProducts(payload));
  const response = await fetch(apiUrl("/api/v1/finance/gateways/mercadopago/products"), {
    method: "PATCH",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível salvar os produtos."));
  return body as {
    status: string;
    asaas: FinanceGatewayAsaasPublic;
    mercadopago: FinanceGatewayMercadoPagoPublic;
    stone: FinanceGatewayStonePublic;
  };
}

export async function patchFinanceGatewayMercadoPagoWebhookSignature(payload: {
  webhook_signature_secret?: string;
  clear_webhook_signature_secret?: boolean;
}): Promise<{
  status: string;
  asaas: FinanceGatewayAsaasPublic;
  mercadopago: FinanceGatewayMercadoPagoPublic;
  stone: FinanceGatewayStonePublic;
}> {
  if (isDemoMode()) return Promise.resolve(demoPatchFinanceGatewayMercadoPagoWebhookSignature(payload));
  const response = await fetch(apiUrl("/api/v1/finance/gateways/mercadopago/webhook-signature"), {
    method: "PATCH",
    headers: bearer(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível salvar o segredo do webhook."));
  return body as {
    status: string;
    asaas: FinanceGatewayAsaasPublic;
    mercadopago: FinanceGatewayMercadoPagoPublic;
    stone: FinanceGatewayStonePublic;
  };
}

export async function deleteFinanceGatewayMercadoPago(): Promise<void> {
  if (isDemoMode()) {
    demoDeleteFinanceGatewayMercadoPago();
    return Promise.resolve();
  }
  const response = await fetch(apiUrl("/api/v1/finance/gateways/mercadopago"), {
    method: "DELETE",
    headers: bearer(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errMessage(body, "Não foi possível remover o Mercado Pago."));
  }
}

export async function testFinanceGatewayStone(payload: {
  secret_key: string;
}): Promise<{ ok: boolean; error: string | null; account_label: string | null }> {
  const response = await fetch(apiUrl("/api/v1/finance/gateways/stone/test"), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify({ secret_key: payload.secret_key }),
  });
  const body = (await parseResponseOrApiError(response, "Não foi possível testar Stone / Pagar.me.")) as {
    ok: boolean;
    error: string | null;
    account_label: string | null;
  };
  return body;
}

export async function upsertFinanceGatewayStone(payload: {
  secret_key?: string;
  sandbox?: boolean;
  finance_bank_account_id: number;
  public_key?: string;
}): Promise<{
  status: string;
  asaas: FinanceGatewayAsaasPublic;
  mercadopago: FinanceGatewayMercadoPagoPublic;
  stone: FinanceGatewayStonePublic;
}> {
  const response = await fetch(apiUrl("/api/v1/finance/gateways/stone"), {
    method: "PUT",
    headers: bearer(true),
    body: JSON.stringify({
      secret_key: payload.secret_key ?? "",
      sandbox: payload.sandbox ?? false,
      finance_bank_account_id: payload.finance_bank_account_id,
      public_key: payload.public_key ?? "",
    }),
  });
  const body = await parseResponseOrApiError(response, "Não foi possível salvar Stone / Pagar.me.");
  return body as {
    status: string;
    asaas: FinanceGatewayAsaasPublic;
    mercadopago: FinanceGatewayMercadoPagoPublic;
    stone: FinanceGatewayStonePublic;
  };
}

export async function deleteFinanceGatewayStone(): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/finance/gateways/stone"), {
    method: "DELETE",
    headers: bearer(),
  });
  await parseResponseOrApiError(response, "Não foi possível remover Stone / Pagar.me.");
}

export type FinanceBankCatalogRow = {
  id: number;
  slug: string;
  bank_name: string;
  display_label: string;
  sort_order: number;
  logo_url: string | null;
};

export async function listFinanceBankCatalog(): Promise<FinanceBankCatalogRow[]> {
  const response = await fetch(apiUrl("/api/v1/finance/bank-catalog"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar o catálogo de bancos."));
  return body as FinanceBankCatalogRow[];
}

export type FinanceOfxSuggestion = {
  id: number;
  description: string;
  amount: number;
  due_date: string;
  entry_type: string;
  status: string;
};

export type FinanceOfxLineOut = {
  id: number;
  fit_id: string;
  amount: number;
  posted_at: string;
  trn_type: string | null;
  payee: string | null;
  memo: string | null;
  matched_finance_entry_id: number | null;
  suggestions: FinanceOfxSuggestion[];
};

export type FinanceOfxUploadResult = {
  import_id: number;
  filename: string;
  finance_bank_account_id: number;
  lines_count: number;
  truncated: boolean;
  lines: FinanceOfxLineOut[];
  created_at?: string | null;
};

export async function uploadFinanceOfxImport(accountId: number, file: File): Promise<FinanceOfxUploadResult> {
  const fd = new FormData();
  fd.set("file", file);
  const response = await fetch(apiUrl(`/api/v1/finance/accounts/${accountId}/ofx-imports`), {
    method: "POST",
    headers: bearer(),
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível importar o OFX."));
  return body as FinanceOfxUploadResult;
}

export async function getFinanceOfxImport(accountId: number, importId: number): Promise<FinanceOfxUploadResult> {
  const response = await fetch(apiUrl(`/api/v1/finance/accounts/${accountId}/ofx-imports/${importId}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar o OFX."));
  const b = body as Partial<FinanceOfxUploadResult> & { lines?: FinanceOfxLineOut[]; created_at?: string | null };
  const lines = Array.isArray(b.lines) ? b.lines : [];
  return {
    import_id: Number(b.import_id),
    filename: String(b.filename ?? ""),
    finance_bank_account_id: Number(b.finance_bank_account_id ?? accountId),
    lines_count: typeof b.lines_count === "number" ? b.lines_count : lines.length,
    truncated: Boolean(b.truncated),
    lines,
    created_at: b.created_at ?? undefined,
  };
}

export async function applyFinanceOfxMatches(
  accountId: number,
  importId: number,
  matches: { line_id: number; finance_entry_id: number }[],
): Promise<{ status: string; applied: { line_id: number; finance_entry_id: number }[] }> {
  const response = await fetch(apiUrl(`/api/v1/finance/accounts/${accountId}/ofx-imports/${importId}/apply-matches`), {
    method: "POST",
    headers: bearer(true),
    body: JSON.stringify({ matches }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível aplicar a conciliação OFX."));
  return body as { status: string; applied: { line_id: number; finance_entry_id: number }[] };
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
