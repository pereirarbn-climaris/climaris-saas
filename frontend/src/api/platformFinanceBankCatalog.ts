import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type PlatformFinanceBankCatalogRow = {
  id: number;
  slug: string;
  bank_name: string;
  display_label: string;
  sort_order: number;
  is_active: boolean;
  logo_external_url: string | null;
  logo_url: string | null;
  has_uploaded_logo: boolean;
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

export async function listPlatformFinanceBankCatalog(): Promise<PlatformFinanceBankCatalogRow[]> {
  const response = await fetch(apiUrl("/api/v1/platform/finance-bank-catalog"), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar o catálogo de bancos."));
  return body as PlatformFinanceBankCatalogRow[];
}

export async function patchPlatformFinanceBankCatalog(
  id: number,
  payload: { display_label?: string; is_active?: boolean; sort_order?: number; logo_external_url?: string | null },
): Promise<PlatformFinanceBankCatalogRow> {
  const response = await fetch(apiUrl(`/api/v1/platform/finance-bank-catalog/${id}`), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível atualizar."));
  return body as PlatformFinanceBankCatalogRow;
}

export async function uploadPlatformFinanceBankLogo(id: number, file: File): Promise<PlatformFinanceBankCatalogRow> {
  const fd = new FormData();
  fd.set("file", file);
  const response = await fetch(apiUrl(`/api/v1/platform/finance-bank-catalog/${id}/logo`), {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível enviar a imagem."));
  return body as PlatformFinanceBankCatalogRow;
}

export async function deletePlatformFinanceBankLogo(id: number): Promise<PlatformFinanceBankCatalogRow> {
  const response = await fetch(apiUrl(`/api/v1/platform/finance-bank-catalog/${id}/logo`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível remover a imagem."));
  return body as PlatformFinanceBankCatalogRow;
}
