import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import { resolveWebsiteAssetUrl } from "./platformWebsite";

export type WebsitePageSection = {
  key: string;
  title: string;
  description: string;
  bullets: string[];
};

export type WebsitePageImage = {
  slot: string;
  label: string;
  hint: string;
  has_image: boolean;
  url: string | null;
  updated_at: string | null;
};

export type WebsitePageSummary = {
  slug: string;
  label: string;
  path: string;
  sort_order: number;
  is_published: boolean;
  updated_at: string | null;
};

export type WebsitePageOut = {
  slug: string;
  label: string;
  path: string;
  title: string;
  subtitle: string;
  hero_description: string;
  seo_title: string;
  seo_description: string;
  sections: WebsitePageSection[];
  outcomes: string[];
  images: WebsitePageImage[];
  is_published: boolean;
  updated_at: string | null;
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

export function resolveWebsitePageImageUrl(url: string | null | undefined): string | undefined {
  return resolveWebsiteAssetUrl(url);
}

export async function listPlatformWebsitePages(): Promise<WebsitePageSummary[]> {
  const response = await fetch(apiUrl("/api/v1/platform/website/pages"), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível listar as páginas."));
  return body as WebsitePageSummary[];
}

export async function fetchPlatformWebsitePage(slug: string): Promise<WebsitePageOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/website/pages/${slug}`), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar a página."));
  return body as WebsitePageOut;
}

export async function patchPlatformWebsitePage(
  slug: string,
  payload: Partial<{
    title: string;
    subtitle: string;
    hero_description: string;
    seo_title: string;
    seo_description: string;
    sections: WebsitePageSection[];
    outcomes: string[];
    is_published: boolean;
  }>,
): Promise<WebsitePageOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/website/pages/${slug}`), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível salvar a página."));
  return body as WebsitePageOut;
}

export async function uploadWebsitePageImage(slug: string, slot: string, file: File): Promise<WebsitePageOut> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(apiUrl(`/api/v1/platform/website/pages/${slug}/images/${slot}`), {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível enviar a imagem."));
  return body as WebsitePageOut;
}

export async function deleteWebsitePageImage(slug: string, slot: string): Promise<WebsitePageOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/website/pages/${slug}/images/${slot}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível remover a imagem."));
  return body as WebsitePageOut;
}
