import { apiUrl } from "../lib/apiUrl";
import { clampApiLimit } from "../lib/apiPagination";
import { getAccessToken } from "../lib/authStorage";
import { demoCreateProduct, demoDeleteProduct, demoListProducts, demoUpdateProduct, isDemoMode } from "../lib/demoMode";
import { normalizeProductStock } from "../lib/productStock";

export type ProductOut = {
  id: number;
  tenant_id: number;
  name: string;
  sku: string;
  purchase_price: number;
  sale_price: number;
  unit_price: number;
  stock_quantity: number;
  quantity_physical: number;
  quantity_reserved: number;
  quantity_available: number;
  compatible_equipment_tags: string | null;
  btu_min: number | null;
  btu_max: number | null;
  application_scope: string | null;
  is_active: boolean;
};

export type ProductImageOut = {
  id: number;
  product_id: number;
  public_url: string;
  sort_order: number;
  created_at: string;
};

export type ProductDetailOut = ProductOut & {
  images: ProductImageOut[];
};

export type ProductCreatePayload = {
  name: string;
  sku: string;
  purchase_price: number;
  sale_price: number;
  stock_quantity?: number;
  compatible_equipment_tags?: string | null;
  btu_min?: number | null;
  btu_max?: number | null;
  application_scope?: string | null;
  is_active?: boolean;
};

export type ProductUpdatePayload = {
  name?: string;
  sku?: string;
  purchase_price?: number;
  sale_price?: number;
  stock_quantity?: number;
  compatible_equipment_tags?: string | null;
  btu_min?: number | null;
  btu_max?: number | null;
  application_scope?: string | null;
  is_active?: boolean;
};

export type ProductImportRowPayload = {
  row_number: number;
  name: string;
  sku: string;
  purchase_price?: number;
  sale_price?: number;
  stock_quantity?: number;
  is_active?: boolean;
};

export type ProductImportError = {
  row_number: number;
  sku?: string | null;
  message: string;
};

export type ProductImportResult = {
  created_count: number;
  skipped_count: number;
  error_count: number;
  errors: ProductImportError[];
  created_products: ProductOut[];
};

export type ProductListSort =
  | "name_asc"
  | "name_desc"
  | "sku_asc"
  | "sku_desc"
  | "purchase_asc"
  | "purchase_desc"
  | "sale_asc"
  | "sale_desc"
  | "margin_asc"
  | "margin_desc"
  | "status_active_first"
  | "status_inactive_first";

export type ProductCountOut = {
  total: number;
  active: number;
  inactive: number;
  avg_margin: number;
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

function errorMessage(body: unknown, fallback: string, status: number): string {
  if (body && typeof body === "object") {
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
    const d = o.detail;
    if (typeof d === "string") return d;
  }
  if (status === 404) return "Produto não encontrado.";
  if (status === 409) return "Já existe um produto com este SKU nesta empresa.";
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

function compareProductsForSort(a: ProductOut, b: ProductOut, sort: ProductListSort): number {
  const cmp = (x: string, y: string) => x.localeCompare(y, "pt-BR", { sensitivity: "base" });
  const num = (x: number, y: number) => x - y;
  const margin = (p: ProductOut) => Number((p.sale_price || p.unit_price || 0) - (p.purchase_price || 0));
  switch (sort) {
    case "name_desc":
      return cmp(b.name, a.name);
    case "sku_asc":
      return cmp(a.sku, b.sku);
    case "sku_desc":
      return cmp(b.sku, a.sku);
    case "purchase_asc":
      return num(Number(a.purchase_price || 0), Number(b.purchase_price || 0));
    case "purchase_desc":
      return num(Number(b.purchase_price || 0), Number(a.purchase_price || 0));
    case "sale_asc":
      return num(Number(a.sale_price || a.unit_price || 0), Number(b.sale_price || b.unit_price || 0));
    case "sale_desc":
      return num(Number(b.sale_price || b.unit_price || 0), Number(a.sale_price || a.unit_price || 0));
    case "margin_asc":
      return num(margin(a), margin(b));
    case "margin_desc":
      return num(margin(b), margin(a));
    case "status_active_first":
      return Number(b.is_active) - Number(a.is_active) || cmp(a.name, b.name);
    case "status_inactive_first":
      return Number(a.is_active) - Number(b.is_active) || cmp(a.name, b.name);
    default:
      return cmp(a.name, b.name);
  }
}

export async function listProducts(params?: {
  q?: string;
  skip?: number;
  limit?: number;
  sort?: ProductListSort;
}): Promise<ProductOut[]> {
  const sort = params?.sort ?? "name_asc";
  if (isDemoMode()) {
    const q = params?.q?.trim().toLowerCase();
    let filtered = demoListProducts();
    if (q) {
      filtered = filtered.filter((p: ProductOut) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    const skip = params?.skip ?? 0;
    const limit = params?.limit ?? 20;
    return Promise.resolve(
      [...filtered]
        .sort((a, b) => compareProductsForSort(a, b, sort))
        .slice(skip, skip + limit)
        .map(normalizeProductStock),
    );
  }
  const q = params?.q?.trim();
  const skip = params?.skip ?? 0;
  const limit = clampApiLimit(params?.limit, 50);
  const sp = new URLSearchParams();
  sp.set("skip", String(skip));
  sp.set("limit", String(limit));
  sp.set("sort", sort);
  if (q) sp.set("q", q);
  const response = await fetch(apiUrl(`/api/v1/products?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar produtos.", response.status));
  }
  return (body as ProductOut[]).map(normalizeProductStock);
}

export async function countProducts(params?: { q?: string }): Promise<ProductCountOut> {
  if (isDemoMode()) {
    const q = params?.q?.trim().toLowerCase();
    let filtered = demoListProducts();
    if (q) {
      filtered = filtered.filter((p: ProductOut) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    const total = filtered.length;
    const active = filtered.filter((p) => p.is_active).length;
    const inactive = total - active;
    const avgMargin =
      total > 0
        ? filtered.reduce(
            (acc, p) => acc + Number((p.sale_price || p.unit_price || 0) - (p.purchase_price || 0)),
            0,
          ) / total
        : 0;
    return Promise.resolve({ total, active, inactive, avg_margin: avgMargin });
  }
  const q = params?.q?.trim();
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  const suffix = sp.toString();
  const response = await fetch(apiUrl(`/api/v1/products/count${suffix ? `?${suffix}` : ""}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível contar produtos.", response.status));
  }
  return body as ProductCountOut;
}

export async function getProduct(productId: number): Promise<ProductDetailOut> {
  if (isDemoMode()) {
    const row = demoListProducts().find((item) => item.id === productId);
    if (!row) throw new Error("Produto não encontrado.");
    return Promise.resolve({ ...row, images: [] });
  }
  const response = await fetch(apiUrl(`/api/v1/products/${productId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o produto.", response.status));
  }
  const raw = body as ProductDetailOut & { images?: ProductImageOut[] };
  return { ...raw, images: raw.images ?? [] };
}

export async function createProduct(payload: ProductCreatePayload): Promise<ProductOut> {
  if (isDemoMode()) {
    return Promise.resolve(
      demoCreateProduct({
        ...payload,
        stock_quantity: payload.stock_quantity ?? 0,
        compatible_equipment_tags: payload.compatible_equipment_tags ?? null,
        btu_min: payload.btu_min ?? null,
        btu_max: payload.btu_max ?? null,
        application_scope: payload.application_scope ?? null,
        is_active: payload.is_active ?? true,
      }),
    );
  }
  const response = await fetch(apiUrl("/api/v1/products"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível criar o produto.", response.status));
  }
  return body as ProductOut;
}

export async function updateProduct(productId: number, payload: ProductUpdatePayload): Promise<ProductOut> {
  if (isDemoMode()) return Promise.resolve(demoUpdateProduct(productId, payload));
  const response = await fetch(apiUrl(`/api/v1/products/${productId}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar o produto.", response.status));
  }
  return body as ProductOut;
}

export async function deleteProduct(productId: number): Promise<void> {
  if (isDemoMode()) {
    demoDeleteProduct(productId);
    return Promise.resolve();
  }
  const response = await fetch(apiUrl(`/api/v1/products/${productId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir o produto.", response.status));
}

export async function importProducts(rows: ProductImportRowPayload[]): Promise<ProductImportResult> {
  const response = await fetch(apiUrl("/api/v1/products/import"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ items: rows }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível importar os produtos.", response.status));
  }
  return body as ProductImportResult;
}

export async function importProductsFile(file: File): Promise<ProductImportResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(apiUrl("/api/v1/products/import/file"), {
    method: "POST",
    headers: bearer(),
    body: form,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível importar os produtos.", response.status));
  }
  return body as ProductImportResult;
}
