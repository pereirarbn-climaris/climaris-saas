import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type CepLookupResult = {
  source: "viacep";
  cep: string;
  address_street: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal_code: string | null;
  address_ibge_code: string | null;
};

function parseError(body: unknown, status: number, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (typeof o.error?.message === "string" && o.error.message.trim()) return o.error.message;
    const d = o.detail;
    if (typeof d === "string" && d.trim()) return d;
  }
  if (status === 404) return "CEP não encontrado.";
  if (status === 422) return "CEP inválido (use 8 dígitos).";
  return fallback;
}

/** Consulta CEP no backend (ViaCEP). Requer sessão. */
export async function fetchCepLookup(digits8: string): Promise<CepLookupResult> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Sessão expirada.");
  }
  const response = await fetch(apiUrl(`/api/v1/cep/${encodeURIComponent(digits8)}`), {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseError(body, response.status, "Não foi possível consultar o CEP."));
  }
  return body as CepLookupResult;
}
