import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import type { CnpjLookupResult } from "./cnpj";

export type WebsiteScreenshotSlot = "hero" | "dashboard" | "finance" | "orders";

export type WebsiteScreenshotOut = {
  slot: WebsiteScreenshotSlot;
  has_image: boolean;
  url: string | null;
  updated_at: string | null;
};

export type PlatformWebsiteSettingsOut = {
  hero_title: string;
  hero_subtitle: string;
  seo_title: string;
  seo_description: string;
  contact_email: string;
  contact_phone: string | null;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  is_verified_cnpj: boolean;
  cnpj_verified_at: string | null;
  dpo_name: string | null;
  dpo_email: string | null;
  address_street: string;
  address_city: string;
  address_state: string;
  address_postal: string;
  services: string[];
  screenshots: WebsiteScreenshotOut[];
  updated_at: string;
};

export type WebsiteLeadOut = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  technicians_count: string | null;
  selected_plan: string | null;
  message: string;
  source: string;
  status: string;
  created_at: string;
};

function authHeaders(json = false): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return json
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { Authorization: `Bearer ${token}` };
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function errMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as { detail?: string };
    if (typeof o.detail === "string") return o.detail;
  }
  return fallback;
}

export function resolveWebsiteAssetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return apiUrl(url);
}

export async function fetchPlatformWebsiteSettings(): Promise<PlatformWebsiteSettingsOut> {
  const response = await fetch(apiUrl("/api/v1/platform/website"), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar as configurações do site."));
  return body as PlatformWebsiteSettingsOut;
}

export async function patchPlatformWebsiteSettings(
  payload: Partial<{
    hero_title: string;
    hero_subtitle: string;
    seo_title: string;
    seo_description: string;
    contact_email: string;
    contact_phone: string | null;
    legal_name: string;
    trade_name: string | null;
    cnpj: string | null;
    is_verified_cnpj?: boolean;
    dpo_name: string | null;
    dpo_email: string | null;
    address_street: string;
    address_city: string;
    address_state: string;
    address_postal: string;
    services: string[];
  }>,
): Promise<PlatformWebsiteSettingsOut> {
  const response = await fetch(apiUrl("/api/v1/platform/website"), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível salvar."));
  return body as PlatformWebsiteSettingsOut;
}

export async function lookupPlatformWebsiteCnpj(cnpj: string): Promise<CnpjLookupResult> {
  const response = await fetch(apiUrl("/api/v1/platform/website/cnpj-lookup"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ cnpj }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível consultar o CNPJ."));
  return body as CnpjLookupResult;
}

export async function uploadWebsiteScreenshot(
  slot: WebsiteScreenshotSlot,
  file: File,
): Promise<PlatformWebsiteSettingsOut> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(apiUrl(`/api/v1/platform/website/screenshots/${slot}`), {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível enviar a imagem."));
  return body as PlatformWebsiteSettingsOut;
}

export async function deleteWebsiteScreenshot(slot: WebsiteScreenshotSlot): Promise<PlatformWebsiteSettingsOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/website/screenshots/${slot}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível remover a imagem."));
  return body as PlatformWebsiteSettingsOut;
}

export async function listWebsiteLeads(params?: { limit?: number; status?: string }): Promise<WebsiteLeadOut[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/leads${suffix}`), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar os leads."));
  return body as WebsiteLeadOut[];
}
