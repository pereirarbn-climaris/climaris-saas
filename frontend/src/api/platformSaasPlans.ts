import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type FinanceModeCap = "basic" | "intermediate" | "management";

export type SaasPlanCatalogRow = {
  plan_key: string;
  display_name: string;
  description: string;
  footnote: string;
  finance_max_mode: FinanceModeCap;
  max_users: number | null;
  sort_order: number;
  is_beta_internal: boolean;
  can_contract: boolean;
  is_selectable_for_tenants: boolean;
  show_in_matrix: boolean;
  created_at: string;
  updated_at: string;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body && typeof (body as { detail: unknown }).detail === "string") {
    return (body as { detail: string }).detail;
  }
  return fallback;
}

export async function listPlatformSaasPlans(params?: {
  for_matrix?: boolean;
  for_tenant_select?: boolean;
}): Promise<SaasPlanCatalogRow[]> {
  const sp = new URLSearchParams();
  if (params?.for_matrix) sp.set("for_matrix", "true");
  if (params?.for_tenant_select) sp.set("for_tenant_select", "true");
  const qs = sp.toString();
  const response = await fetch(apiUrl(`/api/v1/platform/saas-plans${qs ? `?${qs}` : ""}`), {
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar os planos."));
  return body as SaasPlanCatalogRow[];
}

export type SaasPlanCatalogCreate = {
  plan_key: string;
  display_name: string;
  description?: string;
  footnote?: string;
  finance_max_mode?: FinanceModeCap;
  max_users?: number | null;
  sort_order?: number;
  is_beta_internal?: boolean;
  can_contract?: boolean;
  is_selectable_for_tenants?: boolean;
  show_in_matrix?: boolean;
};

export async function createPlatformSaasPlan(payload: SaasPlanCatalogCreate): Promise<SaasPlanCatalogRow> {
  const response = await fetch(apiUrl("/api/v1/platform/saas-plans"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível criar o plano."));
  return body as SaasPlanCatalogRow;
}

export type SaasPlanCatalogPatch = Partial<{
  display_name: string;
  description: string;
  footnote: string;
  finance_max_mode: FinanceModeCap;
  max_users: number | null;
  sort_order: number;
  is_beta_internal: boolean;
  can_contract: boolean;
  is_selectable_for_tenants: boolean;
  show_in_matrix: boolean;
}>;

export async function patchPlatformSaasPlan(planKey: string, payload: SaasPlanCatalogPatch): Promise<SaasPlanCatalogRow> {
  const response = await fetch(apiUrl(`/api/v1/platform/saas-plans/${encodeURIComponent(planKey)}`), {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível salvar o plano."));
  return body as SaasPlanCatalogRow;
}

export async function deletePlatformSaasPlan(planKey: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const response = await fetch(apiUrl(`/api/v1/platform/saas-plans/${encodeURIComponent(planKey)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 204) return;
  const body: unknown = await response.json().catch(() => null);
  throw new Error(extractError(body, "Não foi possível excluir o plano."));
}
