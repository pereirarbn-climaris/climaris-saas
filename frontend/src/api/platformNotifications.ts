import { apiUrl } from "../lib/apiUrl";
import { clampApiLimit } from "../lib/apiPagination";
import { getAccessToken } from "../lib/authStorage";

export type PlatformNotificationBroadcastOut = {
  id: number;
  title: string;
  body: string;
  link_path: string | null;
  audience: PlatformBroadcastAudience;
  audience_label: string | null;
  recipients_count: number;
  tenant_count: number;
  created_by_user_id: number | null;
  created_by_name: string | null;
  created_at: string;
};

export type PlatformBroadcastAudience =
  | "all"
  | "new_tenants"
  | "trial"
  | "trial_expiring"
  | "unpaid"
  | "paid";

export type PlatformNotificationBroadcastCreate = {
  title: string;
  body: string;
  link_path?: string | null;
  audience?: PlatformBroadcastAudience;
};

export type PlatformNotificationAudiencePreviewOut = {
  audience: PlatformBroadcastAudience;
  audience_label: string;
  user_count: number;
  tenant_count: number;
};

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function errorMessage(body: unknown, fallback: string, status: number): string {
  if (body && typeof body === "object") {
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
    if (typeof o.detail === "string") return o.detail;
  }
  if (status === 401) return "Sessão expirada. Faça login novamente.";
  if (status === 403) return "Acesso restrito a operadores da plataforma.";
  return fallback;
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export async function fetchPlatformBroadcastAudiences(): Promise<Record<string, string>> {
  const response = await fetch(apiUrl("/api/v1/platform/notifications/audiences"), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar os públicos de aviso.", response.status));
  }
  return body as Record<string, string>;
}

export async function fetchPlatformBroadcastAudiencePreview(
  audience: PlatformBroadcastAudience,
): Promise<PlatformNotificationAudiencePreviewOut> {
  const sp = new URLSearchParams({ audience });
  const response = await fetch(apiUrl(`/api/v1/platform/notifications/audience-preview?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível calcular o público do aviso.", response.status));
  }
  return body as PlatformNotificationAudiencePreviewOut;
}

export async function listPlatformNotificationBroadcasts(params?: {
  limit?: number;
  offset?: number;
}): Promise<PlatformNotificationBroadcastOut[]> {
  const sp = new URLSearchParams();
  sp.set("limit", String(clampApiLimit(params?.limit, 30)));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const response = await fetch(apiUrl(`/api/v1/platform/notifications/broadcasts?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o histórico de avisos.", response.status));
  }
  return body as PlatformNotificationBroadcastOut[];
}

export async function postPlatformNotificationBroadcast(
  payload: PlatformNotificationBroadcastCreate,
): Promise<PlatformNotificationBroadcastOut> {
  const response = await fetch(apiUrl("/api/v1/platform/notifications/broadcast"), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.title,
      body: payload.body,
      link_path: payload.link_path?.trim() || null,
      audience: payload.audience ?? "all",
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível enviar o aviso.", response.status));
  }
  return body as PlatformNotificationBroadcastOut;
}
