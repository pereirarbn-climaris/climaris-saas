import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type TenantGarantiaSettings = {
  defaultMesesGarantia: number;
  prazoGarantiaServico: string;
  notaGarantiaFabrica: string;
  termosGarantia: string;
  servicosCobertos: string;
  condicoesExclusoes: string;
};

export type TenantGarantiaSettingsPatch = Partial<TenantGarantiaSettings>;

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function errorMessage(body: unknown, fallback: string, status?: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length) return String(detail[0]);
  }
  if (status === 403) return "Sem permissão para alterar as configurações de garantia.";
  return fallback;
}

function headers(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(): HeadersInit {
  return { ...headers(), "Content-Type": "application/json" };
}

export async function fetchTenantGarantiaSettings(): Promise<TenantGarantiaSettings> {
  const response = await fetch(apiUrl("/api/v1/tenant/garantia-settings"), { headers: headers() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar as configurações de garantia.", response.status));
  }
  return body as TenantGarantiaSettings;
}

export async function patchTenantGarantiaSettings(
  payload: TenantGarantiaSettingsPatch,
): Promise<TenantGarantiaSettings> {
  const response = await fetch(apiUrl("/api/v1/tenant/garantia-settings"), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar as configurações de garantia.", response.status));
  }
  return body as TenantGarantiaSettings;
}
