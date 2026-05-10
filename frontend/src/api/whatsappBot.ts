import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type WhatsappBotSettings = {
  id: number;
  tenant_id: number;
  enabled: boolean;
  welcome_message: string;
  fallback_message: string;
  handoff_message: string;
  handoff_keywords: string[];
  handoff_pause_minutes: number;
  business_hours: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WhatsappBotStep = {
  id: number;
  flow_id: number;
  step_key: string;
  kind: "message" | "question" | "menu" | "action" | "handoff" | "end" | string;
  message_template: string;
  options: Array<Record<string, unknown>>;
  validation: Record<string, unknown>;
  actions: Record<string, unknown>;
  next_step_key: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type WhatsappBotFlow = {
  id: number;
  tenant_id: number;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger_type: "keyword" | "menu_option" | "system_event" | "manual" | string;
  trigger_keywords: string[];
  system_event: string | null;
  priority: number;
  steps: WhatsappBotStep[];
  created_at: string;
  updated_at: string;
};

export type WhatsappBotTestResponse = {
  matched: boolean;
  reply_text: string | null;
  flow_id: number | null;
  flow_name: string | null;
  step_key: string | null;
  ended: boolean;
  handoff: boolean;
  paused_until: string | null;
  context: Record<string, unknown>;
};

function authHeaders(json = false): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return json ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { Authorization: `Bearer ${token}` };
}

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
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export async function getWhatsappBotSettings(): Promise<WhatsappBotSettings> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/bot/settings"), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar o bot."));
  return body as WhatsappBotSettings;
}

export async function patchWhatsappBotSettings(patch: Partial<{
  enabled: boolean;
  welcome_message: string;
  fallback_message: string;
  handoff_message: string;
  handoff_keywords: string[];
  handoff_pause_minutes: number;
  business_hours: Record<string, unknown>;
}>): Promise<WhatsappBotSettings> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/bot/settings"), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(patch),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível salvar o bot."));
  return body as WhatsappBotSettings;
}

export async function listWhatsappBotFlows(): Promise<WhatsappBotFlow[]> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/bot/flows"), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar os fluxos."));
  return body as WhatsappBotFlow[];
}

export async function createWhatsappBotFlow(payload: {
  slug: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  trigger_type: string;
  trigger_keywords: string[];
  system_event?: string | null;
  priority?: number;
  steps?: Array<{
    step_key: string;
    kind: string;
    message_template: string;
    options?: Array<Record<string, unknown>>;
    validation?: Record<string, unknown>;
    actions?: Record<string, unknown>;
    next_step_key?: string | null;
    sort_order?: number;
  }>;
}): Promise<WhatsappBotFlow> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/bot/flows"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar o fluxo."));
  return body as WhatsappBotFlow;
}

export async function patchWhatsappBotFlow(
  flowId: number,
  patch: Partial<{
    slug: string;
    name: string;
    description: string | null;
    enabled: boolean;
    trigger_type: string;
    trigger_keywords: string[];
    system_event: string | null;
    priority: number;
  }>,
): Promise<WhatsappBotFlow> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/bot/flows/${flowId}`), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(patch),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível atualizar o fluxo."));
  return body as WhatsappBotFlow;
}

export async function deleteWhatsappBotFlow(flowId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/bot/flows/${flowId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível excluir o fluxo."));
}

export async function createWhatsappBotStep(
  flowId: number,
  payload: {
    step_key: string;
    kind: string;
    message_template: string;
    options?: Array<Record<string, unknown>>;
    validation?: Record<string, unknown>;
    actions?: Record<string, unknown>;
    next_step_key?: string | null;
    sort_order?: number;
  },
): Promise<WhatsappBotStep> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/bot/flows/${flowId}/steps`), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar o passo."));
  return body as WhatsappBotStep;
}

export async function patchWhatsappBotStep(
  flowId: number,
  stepId: number,
  patch: Partial<{
    step_key: string;
    kind: string;
    message_template: string;
    options: Array<Record<string, unknown>>;
    validation: Record<string, unknown>;
    actions: Record<string, unknown>;
    next_step_key: string | null;
    sort_order: number;
  }>,
): Promise<WhatsappBotStep> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/bot/flows/${flowId}/steps/${stepId}`), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(patch),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível salvar o passo."));
  return body as WhatsappBotStep;
}

export async function deleteWhatsappBotStep(flowId: number, stepId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/bot/flows/${flowId}/steps/${stepId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível excluir o passo."));
}

export async function testWhatsappBotMessage(payload: {
  message_text: string;
  client_whatsapp?: string | null;
  context?: Record<string, unknown>;
  reset_session?: boolean;
}): Promise<WhatsappBotTestResponse> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/bot/test"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível testar o bot."));
  return body as WhatsappBotTestResponse;
}
