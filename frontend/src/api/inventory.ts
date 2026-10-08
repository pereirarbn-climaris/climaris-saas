import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type InventoryProductRow = {
  product_id: number;
  name: string;
  sku: string;
  stock_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  is_active: boolean;
};

export type StockMovementOut = {
  id: number;
  tenant_id: number;
  product_id: number;
  quantity_delta: number;
  reason: string;
  service_order_id: number | null;
  notes: string | null;
  created_at: string;
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

export async function listInventory(params?: { skip?: number; limit?: number }): Promise<InventoryProductRow[]> {
  const sp = new URLSearchParams();
  sp.set("skip", String(params?.skip ?? 0));
  sp.set("limit", String(params?.limit ?? 200));
  const response = await fetch(apiUrl(`/api/v1/inventory?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o estoque."));
  }
  return body as InventoryProductRow[];
}

export async function listStockMovements(params?: {
  product_id?: number;
  skip?: number;
  limit?: number;
}): Promise<StockMovementOut[]> {
  const sp = new URLSearchParams();
  sp.set("skip", String(params?.skip ?? 0));
  sp.set("limit", String(params?.limit ?? 50));
  if (params?.product_id) sp.set("product_id", String(params.product_id));
  const response = await fetch(apiUrl(`/api/v1/inventory/movements?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar movimentações."));
  }
  return body as StockMovementOut[];
}

export async function createStockAdjustment(payload: {
  product_id: number;
  quantity_delta: number;
  notes?: string | null;
}): Promise<StockMovementOut> {
  const response = await fetch(apiUrl("/api/v1/inventory/adjustments"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível registrar o ajuste."));
  }
  return body as StockMovementOut;
}
