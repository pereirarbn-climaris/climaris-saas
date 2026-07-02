import { apiUrl } from "../lib/apiUrl";
import { clampApiLimit } from "../lib/apiPagination";
import { getAccessToken } from "../lib/authStorage";
export type ServiceOut = {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  equipment_type_tags: string | null;
  btu_min: number | null;
  btu_max: number | null;
  service_category: string | null;
  applies_residential: boolean;
  applies_commercial: boolean;
  is_active: boolean;
  nfse_codigo_tributacao_nacional: string | null;
  nfse_codigo_nbs: string | null;
  periodicidade_meses: number | null;
  preventive_enabled: boolean;
  preventive_interval_type: "days" | "months" | "years" | null;
  preventive_interval_value: number | null;
  product_inputs: Array<{
    id: number;
    product_id: number;
    quantity: number;
    unit_cost: number;
    total_cost: number;
  }>;
  estimated_material_cost: number;
  estimated_profit: number;
};

export type ServiceProductInputPayload = {
  product_id: number;
  quantity: number;
};

export type ServiceCreatePayload = {
  name: string;
  description?: string | null;
  price: number;
  duration_minutes: number;
  equipment_type_tags?: string | null;
  btu_min?: number | null;
  btu_max?: number | null;
  service_category?: string | null;
  applies_residential?: boolean;
  applies_commercial?: boolean;
  is_active?: boolean;
  nfse_codigo_tributacao_nacional?: string | null;
  nfse_codigo_nbs?: string | null;
  periodicidade_meses?: number | null;
  preventive_enabled?: boolean;
  preventive_interval_type?: "days" | "months" | "years" | null;
  preventive_interval_value?: number | null;
  product_inputs?: ServiceProductInputPayload[];
};

export type ServiceUpdatePayload = {
  name?: string;
  description?: string | null;
  price?: number;
  duration_minutes?: number;
  equipment_type_tags?: string | null;
  btu_min?: number | null;
  btu_max?: number | null;
  service_category?: string | null;
  applies_residential?: boolean;
  applies_commercial?: boolean;
  is_active?: boolean;
  nfse_codigo_tributacao_nacional?: string | null;
  nfse_codigo_nbs?: string | null;
  periodicidade_meses?: number | null;
  preventive_enabled?: boolean;
  preventive_interval_type?: "days" | "months" | "years" | null;
  preventive_interval_value?: number | null;
  product_inputs?: ServiceProductInputPayload[];
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
  if (status === 404) return "Serviço não encontrado.";
  if (status === 409) return "Já existe um serviço com este nome nesta empresa.";
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

export async function listServices(params?: { q?: string; skip?: number; limit?: number }): Promise<ServiceOut[]> {
  const q = params?.q?.trim();
  const skip = params?.skip ?? 0;
  const limit = clampApiLimit(params?.limit, 50);
  const sp = new URLSearchParams();
  sp.set("skip", String(skip));
  sp.set("limit", String(limit));
  if (q) sp.set("q", q);
  const response = await fetch(apiUrl(`/api/v1/services?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar serviços.", response.status));
  }
  return body as ServiceOut[];
}

export async function getService(serviceId: number): Promise<ServiceOut> {
  const response = await fetch(apiUrl(`/api/v1/services/${serviceId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o serviço.", response.status));
  }
  return body as ServiceOut;
}

export async function createService(payload: ServiceCreatePayload): Promise<ServiceOut> {

  const response = await fetch(apiUrl("/api/v1/services"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível criar o serviço.", response.status));
  }
  return body as ServiceOut;
}

export async function updateService(serviceId: number, payload: ServiceUpdatePayload): Promise<ServiceOut> {
  const response = await fetch(apiUrl(`/api/v1/services/${serviceId}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar o serviço.", response.status));
  }
  return body as ServiceOut;
}

export async function deleteService(serviceId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/services/${serviceId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir o serviço.", response.status));
}

export type ServiceImportError = {
  row_number: number;
  name: string | null;
  message: string;
};

export type ServiceImportResult = {
  created_count: number;
  skipped_count: number;
  error_count: number;
  errors: ServiceImportError[];
};

export async function importServicesFile(file: File): Promise<ServiceImportResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(apiUrl("/api/v1/services/import/file"), {
    method: "POST",
    headers: bearer(),
    body: form,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível importar os serviços.", response.status));
  }
  return body as ServiceImportResult;
}
