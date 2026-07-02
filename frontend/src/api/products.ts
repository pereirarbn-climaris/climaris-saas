import { apiUrl } from "../lib/apiUrl";
import { clampApiLimit } from "../lib/apiPagination";
import { getAccessToken } from "../lib/authStorage";
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
  primary_image_url: string | null;
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

export async function listProducts(params?: {
  q?: string;
  skip?: number;
  limit?: number;
  sort?: ProductListSort;
}): Promise<ProductOut[]> {
  const sort = params?.sort ?? "name_asc";
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

  const response = await fetch(apiUrl(`/api/v1/products/${productId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o produto.", response.status));
  }
  const raw = body as ProductDetailOut & { images?: ProductImageOut[] };
  return { ...raw, images: raw.images ?? [] };
}

export async function createProduct(payload: ProductCreatePayload): Promise<ProductOut> {

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
