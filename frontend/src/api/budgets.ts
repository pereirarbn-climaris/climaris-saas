import { apiUrl } from "../lib/apiUrl";
import { clampApiLimit } from "../lib/apiPagination";
import { getAccessToken } from "../lib/authStorage";
export type BudgetStatus = "draft" | "sent" | "approved" | "rejected" | "expired";

export type BudgetOut = {
  id: number;
  tenant_id: number;
  client_id: number;
  scope_text: string | null;
  observation: string | null;
  status: BudgetStatus;
  payment_method: string | null;
  payment_terms: string | null;
  warranty_terms: string | null;
  validity_days: number;
  sent_at: string | null;
  approved_at: string | null;
  created_at: string;
  generated_service_order_id: number | null;
  tracking_url?: string | null;
  pdf_file_missing?: boolean;
  storage_alert?: string | null;
  service_items: Array<{
    id: number;
    service_id: number;
    quantity: number;
    unit_price: number;
    duration_minutes: number;
  }>;
  product_items: Array<{
    id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
  }>;
};

export type BudgetCreatePayload = {
  client_id: number;
  scope_text?: string | null;
  observation?: string | null;
  payment_method?: string | null;
  payment_terms?: string | null;
  warranty_terms?: string | null;
  validity_days?: number;
  services: Array<{ service_id: number; quantity: number }>;
  products?: Array<{ product_id: number; quantity: number }>;
};

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as { error?: { message?: string; details?: unknown[] }; detail?: unknown };
    if (Array.isArray(o.error?.details) && o.error.details.length > 0) {
      const first = o.error.details[0] as { msg?: string; loc?: unknown[] } | undefined;
      if (first?.msg) {
        const where = Array.isArray(first.loc) ? ` (${first.loc.join(".")})` : "";
        return `${first.msg}${where}`;
      }
    }
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
    if (typeof o.detail === "string" && o.detail) return o.detail;
  }
  return fallback;
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Aceita resposta legada (array) ou envelope `{ items, storage_alerts }`. */
export function parseBudgetListBody(body: unknown): BudgetOut[] {
  if (Array.isArray(body)) return body as BudgetOut[];
  if (body && typeof body === "object") {
    const items = (body as { items?: unknown }).items;
    if (Array.isArray(items)) return items as BudgetOut[];
  }
  return [];
}

export async function listBudgets(params?: { status?: BudgetStatus; skip?: number; limit?: number }): Promise<BudgetOut[]> {
  const sp = new URLSearchParams();
  sp.set("skip", String(params?.skip ?? 0));
  sp.set("limit", String(clampApiLimit(params?.limit, 100, 100)));
  if (params?.status) sp.set("status", params.status);
  const response = await fetch(apiUrl(`/api/v1/budgets?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar os orçamentos."));
  return parseBudgetListBody(body);
}

export type BudgetListResult = {
  items: BudgetOut[];
  storage_alerts: string[];
};

export async function listBudgetsWithAlerts(params?: {
  status?: BudgetStatus;
  skip?: number;
  limit?: number;
}): Promise<BudgetListResult> {

  const sp = new URLSearchParams();
  sp.set("skip", String(params?.skip ?? 0));
  sp.set("limit", String(clampApiLimit(params?.limit, 100, 100)));
  sp.set("include_storage_alerts", "true");
  if (params?.status) sp.set("status", params.status);
  const response = await fetch(apiUrl(`/api/v1/budgets?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar os orçamentos."));
  if (Array.isArray(body)) return { items: body as BudgetOut[], storage_alerts: [] };
  const wrapped = body as { items?: BudgetOut[]; storage_alerts?: string[] };
  return {
    items: parseBudgetListBody(body),
    storage_alerts: Array.isArray(wrapped.storage_alerts) ? wrapped.storage_alerts : [],
  };
}

export async function createBudget(payload: BudgetCreatePayload): Promise<{ id: number; status: BudgetStatus }> {
  const response = await fetch(apiUrl("/api/v1/budgets"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar o orçamento."));
  return body as { id: number; status: BudgetStatus };
}

export async function updateBudget(budgetId: number, payload: BudgetCreatePayload): Promise<BudgetOut> {

  const response = await fetch(apiUrl(`/api/v1/budgets/${budgetId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível salvar o orçamento."));
  return body as BudgetOut;
}

export async function getBudget(budgetId: number): Promise<BudgetOut> {
  const response = await fetch(apiUrl(`/api/v1/budgets/${budgetId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar o orçamento."));
  return body as BudgetOut;
}

export async function sendBudget(budgetId: number): Promise<BudgetOut> {
  const response = await fetch(apiUrl(`/api/v1/budgets/${budgetId}/send`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível enviar o orçamento."));
  return body as BudgetOut;
}

export async function rejectBudget(budgetId: number, reason?: string): Promise<BudgetOut> {
  const response = await fetch(apiUrl(`/api/v1/budgets/${budgetId}/reject`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ reason }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível reprovar o orçamento."));
  return body as BudgetOut;
}

export async function approveBudget(
  budgetId: number,
): Promise<{ budget_id: number; budget_status: BudgetStatus; service_order_id: number; service_order_status: string }> {

  const response = await fetch(apiUrl(`/api/v1/budgets/${budgetId}/approve`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível aprovar o orçamento."));
  return body as { budget_id: number; budget_status: BudgetStatus; service_order_id: number; service_order_status: string };
}

export async function fetchBudgetPdfBlob(budgetId: number): Promise<Blob> {
  const response = await fetch(apiUrl(`/api/v1/budgets/${budgetId}/pdf`), { headers: bearer() });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errorMessage(body, "Não foi possível gerar o PDF do orçamento."));
  }
  return response.blob();
}
