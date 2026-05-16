import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import { isDemoMode } from "../lib/demoMode";

export type MercadoLivreStatusOut = {
  oauth_app_configured: boolean;
  entitlement_active: boolean;
  connected: boolean;
  nickname: string | null;
  ml_user_id: string | null;
  site_id: string | null;
  access_expires_at: string | null;
};

export type MercadoLivreProductLinkOut = {
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

const ML_BASE = "/api/v1/integrations/mercado-livre";

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
    const o = body as { detail?: unknown; error?: { message?: string } };
    if (typeof o.detail === "string" && o.detail) return o.detail;
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
  }
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

export async function getMercadoLivreStatus(): Promise<MercadoLivreStatusOut> {
  if (isDemoMode()) {
    return Promise.resolve({
      oauth_app_configured: true,
      entitlement_active: false,
      connected: false,
      nickname: null,
      ml_user_id: null,
      site_id: "MLB",
      access_expires_at: null,
    });
  }
  const response = await fetch(apiUrl(`${ML_BASE}/status`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar o status do Mercado Livre."));
  return body as MercadoLivreStatusOut;
}

/** URL para iniciar OAuth no Mercado Livre (redireciona o navegador). */
export async function getMercadoLivreOAuthAuthorizeUrl(): Promise<string> {
  if (isDemoMode()) {
    return Promise.resolve("https://auth.mercadolivre.com.br/authorization?demo=1");
  }
  const response = await fetch(apiUrl(`${ML_BASE}/oauth/authorize-url`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível obter URL de autorização."));
  const url = (body as { url?: string }).url;
  if (!url?.trim()) throw new Error("Resposta sem URL de autorização.");
  return url.trim();
}

export async function completeMercadoLivreOAuth(code: string): Promise<void> {
  if (isDemoMode()) return Promise.resolve();
  const response = await fetch(apiUrl(`${ML_BASE}/oauth/complete`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ code }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Falha ao conectar Mercado Livre."));
}

export async function getMercadoLivreProductLink(productId: number): Promise<MercadoLivreProductLinkOut | null> {
  if (isDemoMode()) return Promise.resolve(null);
  const response = await fetch(apiUrl(`${ML_BASE}/products/${productId}/link`), { headers: bearer() });
  if (response.status === 404) return null;
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar o vínculo do produto."));
  return body as MercadoLivreProductLinkOut;
}

export async function upsertMercadoLivreLink(
  productId: number,
  payload: { ml_category_id: string | null; listing_type_id: string | null },
): Promise<MercadoLivreProductLinkOut> {
  if (isDemoMode()) {
    throw new Error("Mercado Livre não está disponível no modo demonstração.");
  }
  const response = await fetch(apiUrl(`${ML_BASE}/products/${productId}/link`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível salvar o vínculo."));
  return body as MercadoLivreProductLinkOut;
}

export async function publishMercadoLivreProduct(
  productId: number,
  payload: { ml_category_id?: string; listing_type_id?: string },
): Promise<MercadoLivreProductLinkOut> {
  if (isDemoMode()) {
    throw new Error("Mercado Livre não está disponível no modo demonstração.");
  }
  const response = await fetch(apiUrl(`${ML_BASE}/products/${productId}/publish`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível publicar no Mercado Livre."));
  return body as MercadoLivreProductLinkOut;
}
