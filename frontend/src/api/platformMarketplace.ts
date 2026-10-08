import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type PlatformMarketplaceApp = {
  id: number;
  slug: string;
  display_name: string;
  short_description: string;
  long_description: string | null;
  monthly_price_brl: number;
  setup_fee_brl: number;
  feature_flag_key: string;
  allow_quantity: boolean;
  unit_label: string | null;
  user_seats_per_unit: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type PlatformMarketplaceEntitlement = {
  id: number;
  tenant_id: number;
  tenant_name: string;
  marketplace_app_id: number;
  app_slug: string;
  app_display_name: string;
  status: string;
  quantity: number;
  requested_at: string;
  activated_at: string | null;
  tenant_notes: string | null;
  internal_notes: string | null;
  updated_at: string;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body && typeof (body as { detail: unknown }).detail === "string") {
    return (body as { detail: string }).detail;
  }
  return fallback;
}

export async function listPlatformMarketplaceApps(params?: { include_inactive?: boolean }): Promise<PlatformMarketplaceApp[]> {
  const qs = new URLSearchParams();
  qs.set("include_inactive", params?.include_inactive === false ? "false" : "true");
  const response = await fetch(apiUrl(`/api/v1/platform/marketplace/apps?${qs.toString()}`), {
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar os apps."));
  return body as PlatformMarketplaceApp[];
}

export async function createPlatformMarketplaceApp(payload: {
  slug: string;
  display_name: string;
  short_description: string;
  long_description?: string | null;
  monthly_price_brl: number;
  setup_fee_brl?: number;
  feature_flag_key: string;
  allow_quantity?: boolean;
  unit_label?: string | null;
  user_seats_per_unit?: number;
  sort_order?: number;
  is_active?: boolean;
}): Promise<PlatformMarketplaceApp> {
  const response = await fetch(apiUrl("/api/v1/platform/marketplace/apps"), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível criar o app."));
  return body as PlatformMarketplaceApp;
}

export async function patchPlatformMarketplaceApp(
  appId: number,
  payload: Partial<{
    display_name: string;
    short_description: string;
    long_description: string | null;
    monthly_price_brl: number;
    setup_fee_brl: number;
    feature_flag_key: string;
    allow_quantity: boolean;
    unit_label: string | null;
    user_seats_per_unit: number;
    sort_order: number;
    is_active: boolean;
  }>,
): Promise<PlatformMarketplaceApp> {
  const response = await fetch(apiUrl(`/api/v1/platform/marketplace/apps/${appId}`), {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível atualizar o app."));
  return body as PlatformMarketplaceApp;
}

export async function listPlatformMarketplaceEntitlements(params?: {
  tenant_id?: number;
  status?: string;
  skip?: number;
  limit?: number;
}): Promise<PlatformMarketplaceEntitlement[]> {
  const qs = new URLSearchParams();
  if (params?.tenant_id != null) qs.set("tenant_id", String(params.tenant_id));
  if (params?.status) qs.set("status", params.status);
  qs.set("skip", String(params?.skip ?? 0));
  qs.set("limit", String(params?.limit ?? 100));
  const response = await fetch(apiUrl(`/api/v1/platform/marketplace/entitlements?${qs.toString()}`), {
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar solicitações."));
  return body as PlatformMarketplaceEntitlement[];
}

export async function patchPlatformMarketplaceEntitlement(
  entitlementId: number,
  payload: {
    status: "requested" | "active" | "suspended" | "cancelled";
    quantity?: number;
    internal_notes?: string | null;
  },
): Promise<PlatformMarketplaceEntitlement> {
  const response = await fetch(apiUrl(`/api/v1/platform/marketplace/entitlements/${entitlementId}`), {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível atualizar o status."));
  return body as PlatformMarketplaceEntitlement;
}

export async function bootstrapFinanceMarketplaceApps(): Promise<PlatformMarketplaceApp[]> {
  const response = await fetch(apiUrl("/api/v1/platform/marketplace/bootstrap-finance-apps"), {
    method: "POST",
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível criar os apps financeiros padrão."));
  return body as PlatformMarketplaceApp[];
}
