import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type TenantAISettings = {
  id: number;
  tenant_id: number;
  agent_name: string;
  tone_of_voice: string;
  instructions: string | null;
  model_slug: string;
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
  tenant_id: number;
  client_whatsapp: string | null;
  user_message: string;
  assistant_response: string;
  used_model: string | null;
  used_tools_json: string | null;
  is_mock: boolean;
  created_at: string;
};

export type AIToolDefinition = {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
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
    const o = body as {
      detail?: unknown;
      error?: { message?: unknown; details?: unknown };
    };
    if (typeof o.detail === "string") return o.detail;
    if (Array.isArray(o.detail) && o.detail[0] && typeof o.detail[0] === "object") {
      const row = o.detail[0] as { msg?: unknown };
      if (typeof row.msg === "string") return row.msg;
    }
    const details = o.error?.details;
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0] as { msg?: unknown; loc?: unknown };
      if (typeof first.msg === "string") return first.msg;
    }
    const nested = o.error?.message;
    if (typeof nested === "string") return nested;
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

export async function getAiSettings(): Promise<TenantAISettings> {
  const response = await fetch(apiUrl("/api/v1/ai/settings"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar as configurações do assistente."));
  }
  return body as TenantAISettings;
}

export async function patchAiSettings(patch: {
  agent_name?: string;
  tone_of_voice?: string;
  instructions?: string | null;
  model_slug?: string | null;
  is_enabled?: boolean;
  ai_context_products?: boolean;
  ai_context_service_prices?: boolean;
  ai_context_services_catalog?: boolean;
  ai_tool_billing?: boolean;
  ai_tool_cancel?: boolean;
  ai_tool_reschedule?: boolean;
  ai_tool_agenda_read?: boolean;
  ai_allow_direct_schedule?: boolean;
  ai_allow_auto_client_create?: boolean;
  ai_clarification_instructions?: string | null;
}): Promise<TenantAISettings> {
  const response = await fetch(apiUrl("/api/v1/ai/settings"), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar as configurações."));
  }
  return body as TenantAISettings;
}

export async function resetAiSettings(): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/ai/settings"), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível restaurar os padrões."));
}

export async function listAiHistory(params?: { limit?: number; skip?: number }): Promise<AIChatHistoryRow[]> {
  const limit = params?.limit ?? 40;
  const skip = params?.skip ?? 0;
  const q = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  const response = await fetch(apiUrl(`/api/v1/ai/history?${q}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o histórico."));
  }
  return body as AIChatHistoryRow[];
}

export async function listAiTools(): Promise<AIToolDefinition[]> {
  const response = await fetch(apiUrl("/api/v1/ai/tools"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar as ferramentas."));
  }
  return body as AIToolDefinition[];
}
