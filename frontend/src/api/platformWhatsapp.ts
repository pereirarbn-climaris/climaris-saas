import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type PlatformWhatsappProvider = "evolution" | "official";

export type PlatformWhatsappConnection = {
  provider: PlatformWhatsappProvider;
  instance_name: string;
  status: string | null;
  provider_configured: boolean;
  evolution_configured: boolean;
  official_configured: boolean;
  qrcode_base64?: string | null;
  pairing_code?: string | null;
  raw?: Record<string, unknown> | null;
};

export type PlatformWhatsappSettings = {
  default_provider: PlatformWhatsappProvider;
  available_providers: PlatformWhatsappProvider[];
  operator_whatsapp: string | null;
  operator_whatsapp_source: string;
  evolution_instance_name: string;
  evolution_configured: boolean;
  official_configured: boolean;
  demo_client_message_preview: string;
  demo_operator_message_preview: string;
};

export type PlatformWhatsappSendResult = {
  provider: PlatformWhatsappProvider;
  ok: boolean;
  provider_message_id: string | null;
  recipient_whatsapp: string;
  message: string;
  sent_at: string;
};

export type PlatformDemoWhatsappTemplate =
  | "confirmation"
  | "status_confirmed"
  | "status_cancelled"
  | "status_completed"
  | "status_no_show";

export type PlatformDemoWhatsappSendResult = {
  ok: boolean;
  recipient_whatsapp: string | null;
  message: string;
  provider_message_id: string | null;
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
    const o = body as {
      detail?: string | Array<{ msg?: string }> | { message?: string };
      error?: { message?: string };
      _raw?: string;
    };
    if (typeof o.detail === "string" && o.detail.trim()) return o.detail;
    if (Array.isArray(o.detail) && o.detail.length > 0) {
      const first = o.detail[0];
      if (first && typeof first === "object" && typeof first.msg === "string" && first.msg.trim()) return first.msg;
    }
    const detailObj =
      o.detail && !Array.isArray(o.detail) && typeof o.detail === "object" ? o.detail : undefined;
    if (typeof detailObj?.message === "string" && detailObj.message.trim()) {
      return detailObj.message;
    }
    if (typeof o.error?.message === "string" && o.error.message.trim()) return o.error.message;
    if (typeof o._raw === "string" && o._raw.trim()) return o._raw;
  }
  return fallback;
}

export async function getPlatformWhatsappConnection(
  provider?: PlatformWhatsappProvider,
): Promise<PlatformWhatsappConnection> {
  const params = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const response = await fetch(apiUrl(`/api/v1/platform/whatsapp/connection${params}`), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar a conexão WhatsApp."));
  return body as PlatformWhatsappConnection;
}

export async function setupPlatformWhatsappConnection(
  provider: PlatformWhatsappProvider,
  instanceName?: string | null,
): Promise<PlatformWhatsappConnection> {
  const response = await fetch(apiUrl("/api/v1/platform/whatsapp/connection/setup"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ provider, instance_name: instanceName?.trim() || null }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível conectar o WhatsApp."));
  return body as PlatformWhatsappConnection;
}

export async function disconnectPlatformWhatsappConnection(
  provider: PlatformWhatsappProvider,
): Promise<PlatformWhatsappConnection> {
  const response = await fetch(
    apiUrl(`/api/v1/platform/whatsapp/connection/disconnect?provider=${encodeURIComponent(provider)}`),
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível desconectar o WhatsApp."));
  return body as PlatformWhatsappConnection;
}

export async function getPlatformWhatsappSettings(): Promise<PlatformWhatsappSettings> {
  const response = await fetch(apiUrl("/api/v1/platform/whatsapp/settings"), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar as configurações."));
  return body as PlatformWhatsappSettings;
}

export async function sendPlatformWhatsappText(payload: {
  provider: PlatformWhatsappProvider;
  recipient_whatsapp: string;
  message: string;
}): Promise<PlatformWhatsappSendResult> {
  const response = await fetch(apiUrl("/api/v1/platform/whatsapp/send-text"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível enviar a mensagem."));
  return body as PlatformWhatsappSendResult;
}

export async function sendDemoAppointmentWhatsapp(
  appointmentId: number,
  payload: { message?: string; template?: PlatformDemoWhatsappTemplate },
): Promise<PlatformDemoWhatsappSendResult> {
  const response = await fetch(apiUrl(`/api/v1/platform/whatsapp/demo-appointments/${appointmentId}/send`), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível enviar o WhatsApp."));
  return body as PlatformDemoWhatsappSendResult;
}
