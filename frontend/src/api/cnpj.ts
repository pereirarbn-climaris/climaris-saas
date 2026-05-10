import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type CnpjAddress = {
  street: string | null;
  number: string | null;
  details: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type CnpjLookupResult = {
  source: "open" | "commercial" | "brasilapi";
  tax_id: string;
  company_name: string;
  trade_name: string | null;
  status_text: string | null;
  founded: string | null;
  main_activity: string | null;
  address: CnpjAddress | null;
  optante_mei?: boolean | null;
};

export type CnpjCommercialResult = CnpjLookupResult & {
  full: Record<string, unknown> | null;
};

export type CnpjRegisterLookupResult = {
  already_registered: boolean;
  registered_tenant_name: string | null;
  lookup: CnpjLookupResult | null;
  external_unavailable?: boolean;
  lookup_hint?: string | null;
};

type ApiErrorBody = {
  error?: { message?: unknown };
  detail?: unknown;
};

function parseApiErrorMessage(body: unknown, status: number, fallback: string): string {
  const b = body as ApiErrorBody;
  const m = b?.error?.message;
  if (typeof m === "string" && m.trim()) return m;
  if (Array.isArray(m) && m.length > 0 && typeof m[0] === "object" && m[0] !== null && "msg" in m[0]) {
    const msg = (m[0] as { msg?: string }).msg;
    if (typeof msg === "string") return msg;
  }
  const d = b?.detail;
  if (typeof d === "string") {
    if (status === 404 && (d === "Not Found" || d === "not found")) {
      return "Serviço de consulta não encontrado no servidor. Faça o deploy da API mais recente ou verifique o Nginx (proxy para /api/v1).";
    }
    return d;
  }
  if (status === 404) {
    return "Rota não encontrada (404). Atualize o backend e confira se /api/v1/cnpj/register-lookup está publicado.";
  }
  return fallback;
}

export async function fetchCnpjRegisterLookup(taxIdDigits: string): Promise<CnpjRegisterLookupResult> {
  /** CNPJ no path (`/register-lookup/{tax_id}`). A variante só com `?tax_id=` não bate em rotas antigas. */
  const response = await fetch(apiUrl(`/api/v1/cnpj/register-lookup/${encodeURIComponent(taxIdDigits)}`), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorMessage(body, response.status, "Não foi possível consultar o CNPJ."));
  }
  return body as CnpjRegisterLookupResult;
}

export async function fetchCnpjOpen(taxIdDigits: string): Promise<CnpjLookupResult> {
  const response = await fetch(apiUrl(`/api/v1/cnpj/open/${taxIdDigits}`), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorMessage(body, response.status, "Não foi possível consultar o CNPJ."));
  }
  return body as CnpjLookupResult;
}

/** Consulta comercial (admin + CNPJA_API_KEY no servidor). `full=true` retorna o JSON completo para NF. */
export async function fetchCnpjCommercial(
  taxIdDigits: string,
  full = false,
): Promise<CnpjCommercialResult> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("É necessário estar autenticado.");
  }
  const q = full ? "?full=true" : "";
  const response = await fetch(apiUrl(`/api/v1/cnpj/commercial/${taxIdDigits}${q}`), {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorMessage(body, response.status, "Consulta comercial indisponível."));
  }
  return body as CnpjCommercialResult;
}
