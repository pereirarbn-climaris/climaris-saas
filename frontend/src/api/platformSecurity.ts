import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type PlatformLoginAttempt = {
  id: number;
  email: string;
  tenant_id: number | null;
  user_id: number | null;
  ip_address: string | null;
  user_agent: string | null;
  device_fingerprint: string | null;
  outcome: string;
  reason: string | null;
  created_at: string;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function extractError(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    (body as { error: unknown }).error &&
    typeof (body as { error: { message?: unknown } }).error === "object" &&
    typeof (body as { error: { message?: unknown } }).error.message === "string"
  ) {
    return (body as { error: { message: string } }).error.message;
  }
  if (body && typeof body === "object" && "detail" in body && typeof (body as { detail: unknown }).detail === "string") {
    return (body as { detail: string }).detail;
  }
  return fallback;
}

export async function listPlatformLoginAttempts(params?: {
  email?: string;
  outcome?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<PlatformLoginAttempt[]> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params?.limit ?? 200));
  if (params?.email?.trim()) qs.set("email", params.email.trim());
  if (params?.outcome?.trim()) qs.set("outcome", params.outcome.trim());
  if (params?.startDate) qs.set("start_date", params.startDate);
  if (params?.endDate) qs.set("end_date", params.endDate);
  const response = await fetch(apiUrl(`/api/v1/platform/security/login-attempts?${qs.toString()}`), {
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar auditoria de login."));
  return body as PlatformLoginAttempt[];
}

export async function downloadPlatformLoginAttemptsCsv(params?: {
  email?: string;
  outcome?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<Blob> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params?.limit ?? 1000));
  if (params?.email?.trim()) qs.set("email", params.email.trim());
  if (params?.outcome?.trim()) qs.set("outcome", params.outcome.trim());
  if (params?.startDate) qs.set("start_date", params.startDate);
  if (params?.endDate) qs.set("end_date", params.endDate);
  const response = await fetch(apiUrl(`/api/v1/platform/security/login-attempts.csv?${qs.toString()}`), {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    throw new Error(extractError(body, "Não foi possível exportar auditoria de login."));
  }
  return response.blob();
}
