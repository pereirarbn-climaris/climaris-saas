import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type ProductCategory = {
  id: number;
  tenant_id: number;
  name: string;
  is_active: boolean;
};

export type ProductType = {
  id: number;
  tenant_id: number;
  name: string;
  is_active: boolean;
};

export type ProductUnit = {
  id: number;
  tenant_id: number;
  name: string;
  is_active: boolean;
};

export type ProductLocation = {
  id: number;
  tenant_id: number;
  name: string;
  is_active: boolean;
};

type ProductCatalogCreatePayload = {
  name: string;
  is_active?: boolean;
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

export async function listProductCategories(): Promise<ProductCategory[]> {
  const response = await fetch(apiUrl("/api/v1/products/categories"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar categorias."));
  }
  return body as ProductCategory[];
}

export async function createProductCategory(payload: ProductCatalogCreatePayload): Promise<ProductCategory> {
  const response = await fetch(apiUrl("/api/v1/products/categories"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível cadastrar a categoria."));
  }
  return body as ProductCategory;
}

export async function listProductTypes(): Promise<ProductType[]> {
  const response = await fetch(apiUrl("/api/v1/products/types"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar tipos."));
  }
  return body as ProductType[];
}

export async function createProductType(payload: ProductCatalogCreatePayload): Promise<ProductType> {
  const response = await fetch(apiUrl("/api/v1/products/types"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível cadastrar o tipo."));
  }
  return body as ProductType;
}

export async function listProductUnits(): Promise<ProductUnit[]> {
  const response = await fetch(apiUrl("/api/v1/products/units"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar unidades."));
  }
  return body as ProductUnit[];
}

export async function createProductUnit(payload: ProductCatalogCreatePayload): Promise<ProductUnit> {
  const response = await fetch(apiUrl("/api/v1/products/units"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível cadastrar a unidade."));
  }
  return body as ProductUnit;
}

export async function listProductLocations(): Promise<ProductLocation[]> {
  const response = await fetch(apiUrl("/api/v1/products/locations"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar localizações."));
  }
  return body as ProductLocation[];
}

export async function createProductLocation(payload: ProductCatalogCreatePayload): Promise<ProductLocation> {
  const response = await fetch(apiUrl("/api/v1/products/locations"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível cadastrar a localização."));
  }
  return body as ProductLocation;
}
