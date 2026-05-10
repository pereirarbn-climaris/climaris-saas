import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import { demoCreateService, demoDeleteService, demoListServices, demoUpdateService, isDemoMode } from "../lib/demoMode";

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
  periodicidade_meses: 6 | 12 | null;
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
  periodicidade_meses?: 6 | 12 | null;
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
  periodicidade_meses?: 6 | 12 | null;
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
  if (isDemoMode()) {
    const q = params?.q?.trim().toLowerCase();
    let filtered = demoListServices();
    if (q) {
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(q));
    }
    return Promise.resolve(filtered);
  }
  const q = params?.q?.trim();
  const skip = params?.skip ?? 0;
  const limit = params?.limit ?? 50;
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
  if (isDemoMode()) {
    const row = demoListServices().find((item) => item.id === serviceId);
    if (!row) throw new Error("Serviço não encontrado.");
    return Promise.resolve(row);
  }
  const response = await fetch(apiUrl(`/api/v1/services/${serviceId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o serviço.", response.status));
  }
  return body as ServiceOut;
}

export async function createService(payload: ServiceCreatePayload): Promise<ServiceOut> {
  if (isDemoMode()) {
    return Promise.resolve(
      demoCreateService({
        ...payload,
        description: payload.description ?? null,
        equipment_type_tags: payload.equipment_type_tags ?? null,
        btu_min: payload.btu_min ?? null,
        btu_max: payload.btu_max ?? null,
        service_category: payload.service_category ?? null,
        applies_residential: payload.applies_residential ?? true,
        applies_commercial: payload.applies_commercial ?? true,
        is_active: payload.is_active ?? true,
        nfse_codigo_tributacao_nacional: payload.nfse_codigo_tributacao_nacional ?? null,
        nfse_codigo_nbs: payload.nfse_codigo_nbs ?? null,
        periodicidade_meses: payload.periodicidade_meses ?? null,
        product_inputs: [],
      }),
    );
  }
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
  if (isDemoMode()) return Promise.resolve(demoUpdateService(serviceId, payload as Partial<ServiceOut>));
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
  if (isDemoMode()) {
    demoDeleteService(serviceId);
    return Promise.resolve();
  }
  const response = await fetch(apiUrl(`/api/v1/services/${serviceId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir o serviço.", response.status));
}
