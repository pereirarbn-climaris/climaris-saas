import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import { demoCreateBudget, demoListBudgets, demoUpdateBudget, isDemoMode } from "../lib/demoMode";
export type BudgetStatus = "draft" | "sent" | "approved" | "rejected" | "expired";

export type BudgetOut = {
  id: number;
  tenant_id: number;
  client_id: number;
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

export async function listBudgets(params?: { status?: BudgetStatus; skip?: number; limit?: number }): Promise<BudgetOut[]> {
  if (isDemoMode()) {
    let rows = demoListBudgets();
    if (params?.status) rows = rows.filter((b) => b.status === params.status);
    const skip = params?.skip ?? 0;
    const limit = params?.limit ?? 100;
    return Promise.resolve(rows.slice(skip, skip + limit));
  }
  const sp = new URLSearchParams();
  sp.set("skip", String(params?.skip ?? 0));
  sp.set("limit", String(params?.limit ?? 100));
  if (params?.status) sp.set("status", params.status);
  const response = await fetch(apiUrl(`/api/v1/budgets?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar os orçamentos."));
  return body as BudgetOut[];
}

export async function createBudget(payload: BudgetCreatePayload): Promise<{ id: number; status: BudgetStatus }> {
  if (isDemoMode()) return Promise.resolve(demoCreateBudget(payload));
  const response = await fetch(apiUrl("/api/v1/budgets"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar o orçamento."));
  return body as { id: number; status: BudgetStatus };
}

export async function getBudget(budgetId: number): Promise<BudgetOut> {
  if (isDemoMode()) {
    const row = demoListBudgets().find((item) => item.id === budgetId);
    if (!row) throw new Error("Orçamento não encontrado.");
    return Promise.resolve(row);
  }
  const response = await fetch(apiUrl(`/api/v1/budgets/${budgetId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar o orçamento."));
  return body as BudgetOut;
}

export async function sendBudget(budgetId: number): Promise<BudgetOut> {
  if (isDemoMode()) return Promise.resolve(demoUpdateBudget(budgetId, { status: "sent", sent_at: new Date().toISOString() }));
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
  if (isDemoMode()) return Promise.resolve(demoUpdateBudget(budgetId, { status: "rejected", observation: reason ?? null }));
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
  if (isDemoMode()) {
    const updated = demoUpdateBudget(budgetId, { status: "approved", approved_at: new Date().toISOString() });
    return Promise.resolve({
      budget_id: budgetId,
      budget_status: updated.status,
      service_order_id: budgetId + 1000,
      service_order_status: "open",
    });
  }
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
