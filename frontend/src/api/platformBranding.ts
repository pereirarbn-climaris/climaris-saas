import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type PlatformBrandingOut = {
  platform_name: string;
  has_logo: boolean;
  has_favicon: boolean;
  logo_url: string | null;
  favicon_url: string | null;
  logo_updated_at: string | null;
  favicon_updated_at: string | null;
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

export function resolvePlatformBrandingAssetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return apiUrl(url);
}

export async function fetchPlatformBranding(): Promise<PlatformBrandingOut> {
  const response = await fetch(apiUrl("/api/v1/platform/branding"));
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar a identidade visual."));
  return body as PlatformBrandingOut;
}

export async function patchPlatformBranding(payload: { platform_name?: string }): Promise<PlatformBrandingOut> {
  const response = await fetch(apiUrl("/api/v1/platform/branding"), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível salvar."));
  return body as PlatformBrandingOut;
}

export async function uploadPlatformLogo(file: File): Promise<PlatformBrandingOut> {
  const fd = new FormData();
  fd.set("file", file);
  const response = await fetch(apiUrl("/api/v1/platform/branding/logo"), {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível enviar o logo."));
  return body as PlatformBrandingOut;
}

export async function deletePlatformLogo(): Promise<PlatformBrandingOut> {
  const response = await fetch(apiUrl("/api/v1/platform/branding/logo"), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível remover o logo."));
  return body as PlatformBrandingOut;
}

export async function uploadPlatformFavicon(file: File): Promise<PlatformBrandingOut> {
  const fd = new FormData();
  fd.set("file", file);
  const response = await fetch(apiUrl("/api/v1/platform/branding/favicon"), {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível enviar o favicon."));
  return body as PlatformBrandingOut;
}

export async function deletePlatformFavicon(): Promise<PlatformBrandingOut> {
  const response = await fetch(apiUrl("/api/v1/platform/branding/favicon"), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível remover o favicon."));
  return body as PlatformBrandingOut;
}
