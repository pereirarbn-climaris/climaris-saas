import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import type { TenantStatus } from "./auth";

export type PlatformTenantListItem = {
  id: number;
  name: string;
  tax_id_kind: "cnpj" | "cpf" | "pending";
  tax_document: string;
  status: TenantStatus;
  active_plan: string;
  timezone: string;
  created_at: string;
  registration_email: string | null;
  users_count: number;
  base_user_limit: number | null;
  extra_user_seats: number;
  total_user_limit: number | null;
  clients_count: number;
  service_orders_count: number;
  schedules_count: number;
};

export type PlatformTenantDetail = PlatformTenantListItem & {
  business_days: string;
  workday_start: string;
  workday_end: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_city: string | null;
  address_state: string | null;
  plan_change_logs: Array<{
    id: number;
    previous_plan: string;
    new_plan: string;
    changed_by_user_id: number | null;
    changed_by_email: string | null;
    changed_at: string;
  }>;
};

export type PlatformTenantPlanChangeLog = {
  id: number;
  previous_plan: string;
  new_plan: string;
  changed_by_user_id: number | null;
  changed_by_email: string | null;
  changed_at: string;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function extractError(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    (body as { error: unknown }).error &&
    typeof (body as { error: { message?: unknown } }).error === "object" &&
    typeof (body as { error: { message?: unknown } }).error.message === "string"
  ) {
    return (body as { error: { message: string } }).error.message;
  }
  if (body && typeof body === "object" && "detail" in body && typeof (body as { detail: unknown }).detail === "string") {
    return (body as { detail: string }).detail;
  }
  return fallback;
}

export async function listPlatformTenants(params?: {
  q?: string;
  skip?: number;
  limit?: number;
}): Promise<PlatformTenantListItem[]> {
  const q = params?.q?.trim() ?? "";
  const skip = params?.skip ?? 0;
  const limit = params?.limit ?? 50;
  const qs = new URLSearchParams();
  qs.set("skip", String(skip));
  qs.set("limit", String(limit));
  if (q) qs.set("q", q);
  const response = await fetch(apiUrl(`/api/v1/platform/tenants?${qs.toString()}`), {
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar clientes SaaS."));
  return body as PlatformTenantListItem[];
}

export async function getPlatformTenant(tenantId: number): Promise<PlatformTenantDetail> {
  const response = await fetch(apiUrl(`/api/v1/platform/tenants/${tenantId}`), {
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar o cadastro do cliente."));
  return body as PlatformTenantDetail;
}

export async function deletePlatformTenant(tenantId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/platform/tenants/${tenantId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (response.status === 204) return;
  const body: unknown = await response.json().catch(() => ({}));
  throw new Error(extractError(body, "Não foi possível excluir o cliente SaaS."));
}

export async function updatePlatformTenantPlan(tenantId: number, activePlan: string): Promise<PlatformTenantDetail> {
  const response = await fetch(apiUrl(`/api/v1/platform/tenants/${tenantId}/plan`), {
    method: "PATCH",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ active_plan: activePlan }),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível atualizar o plano do cliente."));
  return body as PlatformTenantDetail;
}

export async function listPlatformTenantPlanChangeLogs(params: {
  tenantId: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<PlatformTenantPlanChangeLog[]> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 200));
  if (params.startDate) qs.set("start_date", params.startDate);
  if (params.endDate) qs.set("end_date", params.endDate);
  const response = await fetch(apiUrl(`/api/v1/platform/tenants/${params.tenantId}/plan-change-logs?${qs.toString()}`), {
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível listar histórico de plano."));
  return body as PlatformTenantPlanChangeLog[];
}

export async function downloadPlatformTenantPlanChangeLogsCsv(params: {
  tenantId: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<Blob> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 1000));
  if (params.startDate) qs.set("start_date", params.startDate);
  if (params.endDate) qs.set("end_date", params.endDate);
  const response = await fetch(apiUrl(`/api/v1/platform/tenants/${params.tenantId}/plan-change-logs.csv?${qs.toString()}`), {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    throw new Error(extractError(body, "Não foi possível exportar histórico de plano."));
  }
  return response.blob();
}
