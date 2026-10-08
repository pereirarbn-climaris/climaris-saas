import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type WhatsappTenantConnection = {
  tenant_id: number;
  instance_name: string;
  status: string | null;
  connected_at: string | null;
  qrcode_base64?: string | null;
  pairing_code?: string | null;
  raw?: Record<string, unknown> | null;
};

export type WhatsappAppointmentMessageSettings = {
  template_body: string;
  confirm_keyword: string;
  reschedule_keyword: string;
  allowed_variables: string[];
};

export type WhatsappReminderRules = {
  offset_15m: boolean;
  offset_30m: boolean;
  offset_1h: boolean;
  offset_1d: boolean;
  custom_enabled: boolean;
  custom_minutes: number | null;
  active_offsets_minutes: number[];
};

export type WhatsappTemplate = {
  key: string;
  description: string;
  variables: string[];
};

export type WhatsappMessageJob = {
  id: number;
  tenant_id: number;
  provider_slug: string;
  template_key: string | null;
  recipient_whatsapp: string;
  rendered_message: string;
  status: string;
  provider_message_id: string | null;
  reference_type: string | null;
  reference_id: number | null;
  error_message: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsappAppointmentReminderSendPayload = {
  recipient_whatsapp: string;
  nome_cliente: string;
  data_hora: string;
  empresa?: string | null;
  reference_id?: number | null;
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

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as { detail?: unknown };
    const d = o.detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

function jsonHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export async function getWhatsappConnection(): Promise<WhatsappTenantConnection> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/connection"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar a conexão WhatsApp."));
  }
  return body as WhatsappTenantConnection;
}

export async function setupWhatsappConnection(instanceName?: string | null): Promise<WhatsappTenantConnection> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/connection/setup"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ instance_name: instanceName?.trim() || null }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível iniciar a conexão."));
  }
  return body as WhatsappTenantConnection;
}

export async function disconnectWhatsapp(): Promise<WhatsappTenantConnection> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/connection/disconnect"), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível desconectar."));
  }
  return body as WhatsappTenantConnection;
}

export async function getWhatsappMessageSettings(): Promise<WhatsappAppointmentMessageSettings> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/message-settings"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar as mensagens."));
  }
  return body as WhatsappAppointmentMessageSettings;
}

export async function patchWhatsappMessageSettings(patch: {
  template_body?: string;
  confirm_keyword?: string;
  reschedule_keyword?: string;
}): Promise<WhatsappAppointmentMessageSettings> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/message-settings"), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar as mensagens."));
  }
  return body as WhatsappAppointmentMessageSettings;
}

export async function getWhatsappReminderRules(): Promise<WhatsappReminderRules> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/reminder-rules"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar as regras."));
  }
  return body as WhatsappReminderRules;
}

export async function patchWhatsappReminderRules(patch: {
  offset_15m?: boolean;
  offset_30m?: boolean;
  offset_1h?: boolean;
  offset_1d?: boolean;
  custom_enabled?: boolean;
  custom_minutes?: number | null;
}): Promise<WhatsappReminderRules> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/reminder-rules"), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar as regras."));
  }
  return body as WhatsappReminderRules;
}

export async function listWhatsappTemplates(): Promise<WhatsappTemplate[]> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/templates"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar templates."));
  }
  return body as WhatsappTemplate[];
}

export async function listWhatsappJobs(params?: { skip?: number; limit?: number }): Promise<WhatsappMessageJob[]> {
  const skip = params?.skip ?? 0;
  const limit = params?.limit ?? 20;
  const sp = new URLSearchParams();
  sp.set("skip", String(skip));
  sp.set("limit", String(limit));
  const response = await fetch(apiUrl(`/api/v1/whatsapp/jobs?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar envios."));
  }
  return body as WhatsappMessageJob[];
}

export async function sendWhatsappAppointmentReminder(
  payload: WhatsappAppointmentReminderSendPayload,
): Promise<WhatsappMessageJob> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/send-appointment-reminder"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível enviar lembrete de agendamento."));
  }
  return body as WhatsappMessageJob;
}
