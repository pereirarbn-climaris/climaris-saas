import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type MarketplaceCatalogItem = {
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
  entitlement_status: string | null;
  entitlement_id: number | null;
  entitlement_quantity: number | null;
};

export type MarketplaceMyEntitlement = {
  id: number;
  marketplace_app_id: number;
  slug: string;
  display_name: string;
  status: string;
  quantity: number;
  requested_at: string;
  activated_at: string | null;
  tenant_notes: string | null;
};

export type MarketplaceRequestOut = {
  id: number;
  marketplace_app_id: number;
  slug: string;
  status: string;
  quantity: number;
  requested_at: string;
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

export async function fetchMarketplaceCatalog(): Promise<MarketplaceCatalogItem[]> {
  const response = await fetch(apiUrl("/api/v1/marketplace/catalog"), { headers: authHeaders() });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar a loja."));
  return body as MarketplaceCatalogItem[];
}

export async function fetchMyMarketplaceEntitlements(): Promise<MarketplaceMyEntitlement[]> {
  const response = await fetch(apiUrl("/api/v1/marketplace/my"), { headers: authHeaders() });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar suas integrações."));
  return body as MarketplaceMyEntitlement[];
}

export async function requestMarketplaceApp(payload: {
  slug: string;
  quantity?: number;
  tenant_notes?: string | null;
}): Promise<MarketplaceRequestOut> {
  const response = await fetch(apiUrl("/api/v1/marketplace/request"), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: payload.slug,
      quantity: Math.max(1, Math.floor(payload.quantity ?? 1)),
      tenant_notes: payload.tenant_notes?.trim() || null,
    }),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível enviar a solicitação."));
  return body as MarketplaceRequestOut;
}

export async function cancelMarketplaceRequest(entitlementId: number): Promise<MarketplaceRequestOut> {
  const response = await fetch(apiUrl(`/api/v1/marketplace/${entitlementId}/cancel`), {
    method: "POST",
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível cancelar a solicitação."));
  return body as MarketplaceRequestOut;
}
