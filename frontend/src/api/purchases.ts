import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import type { FinanceEntryStatus } from "./finance";

export type ProductPurchaseLineIn = {
  product_id: number;
  quantity: number;
  unit_cost?: number | null;
};

export type ProductPurchaseCreatePayload = {
  description?: string;
  total_amount: number;
  purchased_at: string;
  due_date: string;
  status?: FinanceEntryStatus;
  finance_account_id?: number | null;
  category_id?: number | null;
  payment_method?: string | null;
  credit_card_id?: number | null;
  supplier_name?: string | null;
  notes?: string | null;
  lines: ProductPurchaseLineIn[];
  update_product_cost?: boolean;
};

export type ProductPurchaseLineOut = {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

export type ProductPurchaseOut = {
  id: number;
  tenant_id: number;
  finance_entry_id: number;
  supplier_name: string | null;
  purchased_at: string;
  notes: string | null;
  created_at: string;
  lines_subtotal: number;
  total_paid: number;
  finance_entry: {
    id: number;
    description: string;
    status: string;
    amount: number;
    due_date: string;
    payment_method: string | null;
    finance_account_id: number | null;
    credit_card_id: number | null;
    category_id: number | null;
  } | null;
  lines: ProductPurchaseLineOut[];
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
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
    if (typeof o.detail === "string" && o.detail) return o.detail;
  }
  return fallback;
}

function jsonHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export async function listProductPurchases(params?: {
  skip?: number;
  limit?: number;
}): Promise<ProductPurchaseOut[]> {
  const sp = new URLSearchParams();
  sp.set("skip", String(params?.skip ?? 0));
  sp.set("limit", String(params?.limit ?? 30));
  const response = await fetch(apiUrl(`/api/v1/purchases?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar as compras."));
  return body as ProductPurchaseOut[];
}

export async function createProductPurchase(payload: ProductPurchaseCreatePayload): Promise<ProductPurchaseOut> {
  const response = await fetch(apiUrl("/api/v1/purchases"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível registrar a compra."));
  return body as ProductPurchaseOut;
}
