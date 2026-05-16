import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type TenantAISettings = {
  agent_name: string;
  tone_of_voice: string;
  instructions: string | null;
  model_slug: string | null;
  is_enabled: boolean;
  ai_context_products: boolean;
  ai_context_service_prices: boolean;
  ai_context_services_catalog: boolean;
  ai_tool_billing: boolean;
  ai_tool_cancel: boolean;
  ai_tool_reschedule: boolean;
  ai_tool_agenda_read: boolean;
  ai_allow_direct_schedule: boolean;
  ai_allow_auto_client_create: boolean;
  ai_clarification_instructions: string | null;
  created_at: string;
  updated_at: string;
};

export type AIChatHistoryRow = {
  id: number;
  created_at: string;
  client_whatsapp: string | null;
  user_message: string;
  assistant_response: string;
  used_model: string | null;
};

export type AIToolDefinition = {
  name: string;
  description: string;
};

export type TenantAIPatchPayload = {
  agent_name: string;
  tone_of_voice: string;
  instructions: string | null;
  model_slug: string | null;
  is_enabled: boolean;
  ai_context_products: boolean;
  ai_context_service_prices: boolean;
  ai_context_services_catalog: boolean;
  ai_tool_billing: boolean;
  ai_tool_cancel: boolean;
  ai_tool_reschedule: boolean;
  ai_tool_agenda_read: boolean;
  ai_allow_direct_schedule: boolean;
  ai_allow_auto_client_create: boolean;
  ai_clarification_instructions: string | null;
};

const AI_BASE = "/api/v1/ai";

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
    const o = body as { detail?: unknown; error?: { message?: string } };
    if (typeof o.detail === "string" && o.detail) return o.detail;
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
  }
  return fallback;
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function getAiSettings(): Promise<TenantAISettings> {
  const response = await fetch(apiUrl(`${AI_BASE}/settings`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar as configurações de IA."));
  return body as TenantAISettings;
}

export async function patchAiSettings(payload: TenantAIPatchPayload): Promise<TenantAISettings> {
  const response = await fetch(apiUrl(`${AI_BASE}/settings`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível salvar as configurações de IA."));
  return body as TenantAISettings;
}

export async function resetAiSettings(): Promise<TenantAISettings> {
  const response = await fetch(apiUrl(`${AI_BASE}/settings/reset`), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível restaurar os padrões de IA."));
  return body as TenantAISettings;
}

export async function listAiHistory(params?: { limit?: number }): Promise<AIChatHistoryRow[]> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  const response = await fetch(apiUrl(`${AI_BASE}/history${qs ? `?${qs}` : ""}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar o histórico de IA."));
  return body as AIChatHistoryRow[];
}

export async function listAiTools(): Promise<AIToolDefinition[]> {
  const response = await fetch(apiUrl(`${AI_BASE}/tools`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar as ferramentas de IA."));
  return body as AIToolDefinition[];
}
