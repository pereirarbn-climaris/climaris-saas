import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type MercadoLivreStatus = {
  oauth_app_configured: boolean;
  entitlement_active: boolean;
  connected: boolean;
  nickname: string | null;
  ml_user_id: string | null;
  site_id: string | null;
  access_expires_at: string | null;
};

export type MercadoLivreListing = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  ml_item_id: string | null;
  permalink: string | null;
  ml_category_id: string | null;
  listing_type_id: string | null;
  sync_status: string;
  last_sync_at: string | null;
  last_error: string | null;
  ml_item_status: string | null;
};

export type DomainDiscoveryRow = {
  domain_id: string | null;
  domain_name: string | null;
  category_id: string | null;
  category_name: string | null;
};

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(): HeadersInit {
  return { ...bearer(), "Content-Type": "application/json" };
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body && typeof (body as { detail: unknown }).detail === "string") {
    return (body as { detail: string }).detail;
  }
  return fallback;
}

export async function getMercadoLivreStatus(): Promise<MercadoLivreStatus> {
  const response = await fetch(apiUrl("/api/v1/integrations/mercado-livre/status"), { headers: bearer() });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar o status."));
  return body as MercadoLivreStatus;
}

export async function getMercadoLivreOAuthUrl(): Promise<{ authorization_url: string; redirect_uri: string }> {
  const response = await fetch(apiUrl("/api/v1/integrations/mercado-livre/oauth-url"), { headers: bearer() });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível iniciar o login."));
  return body as { authorization_url: string; redirect_uri: string };
}

export async function completeMercadoLivreOAuth(code: string): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/integrations/mercado-livre/oauth-complete"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ code }),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível concluir a autorização."));
}

export async function disconnectMercadoLivre(): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/integrations/mercado-livre/disconnect"), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body: unknown = await response.json().catch(() => ({}));
  throw new Error(extractError(body, "Não foi possível desconectar."));
}

export async function searchMercadoLivreCategories(q: string): Promise<DomainDiscoveryRow[]> {
  const qs = new URLSearchParams({ q: q.trim(), limit: "16" });
  const response = await fetch(apiUrl(`/api/v1/integrations/mercado-livre/domain-discovery?${qs.toString()}`), {
    headers: bearer(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Busca indisponível."));
  return body as DomainDiscoveryRow[];
}

export async function listMercadoLivreListings(): Promise<MercadoLivreListing[]> {
  const response = await fetch(apiUrl("/api/v1/integrations/mercado-livre/listings"), { headers: bearer() });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar anúncios."));
  return body as MercadoLivreListing[];
}

export async function getMercadoLivreProductLink(productId: number): Promise<MercadoLivreListing | null> {
  const response = await fetch(apiUrl(`/api/v1/integrations/mercado-livre/products/${productId}/link`), {
    headers: bearer(),
  });
  if (response.status === 404) return null;
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar o vínculo."));
  return body as MercadoLivreListing;
}

export async function upsertMercadoLivreLink(
  productId: number,
  payload: { ml_category_id?: string | null; listing_type_id?: string | null },
): Promise<MercadoLivreListing> {
  const response = await fetch(apiUrl(`/api/v1/integrations/mercado-livre/products/${productId}/link`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível salvar a vinculação."));
  return body as MercadoLivreListing;
}

export async function publishMercadoLivreProduct(
  productId: number,
  payload?: { ml_category_id?: string | null; listing_type_id?: string | null },
): Promise<MercadoLivreListing> {
  const response = await fetch(apiUrl(`/api/v1/integrations/mercado-livre/products/${productId}/publish`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload ?? {}),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Publicação falhou."));
  return body as MercadoLivreListing;
}

export async function syncMercadoLivreStock(productId: number): Promise<MercadoLivreListing> {
  const response = await fetch(apiUrl(`/api/v1/integrations/mercado-livre/products/${productId}/sync-stock`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Sincronização falhou."));
  return body as MercadoLivreListing;
}
