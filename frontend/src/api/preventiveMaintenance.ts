import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type PreventiveSettings = {
  preventive_promo_image_url: string | null;
  preventive_promo_image_mimetype: string | null;
  preventive_technical_problem_hint: string | null;
  preventive_button_more_text: string;
  preventive_button_schedule_text: string;
  preventive_message_template: string | null;
  preventive_auto_remind_days_before: number;
};

export type PreventiveItem = {
  historico_servico_id: number;
  client_id: number;
  client_name: string;
  service_id: number;
  service_name: string;
  periodicidade_meses: number;
  data_ultima_realizacao: string;
  data_proximo_vencimento: string;
  dias_ate_vencimento: number;
  whatsapp_valido: boolean;
  whatsapp_destino: string | null;
  ultimo_whatsapp_status?: string | null;
  ultimo_whatsapp_erro?: string | null;
  ultimo_whatsapp_em?: string | null;
};

export type PreventivePreview = {
  message_text: string;
  image_url: string | null;
  image_mimetype: string | null;
  button_more_label: string;
  button_schedule_label: string;
};

export type PreventiveLead = {
  id: number;
  tenant_id: number;
  client_id: number;
  historico_servico_id: number | null;
  whatsapp_digits: string;
  interest_kind: "more" | "schedule";
  message_text: string | null;
  provider_message_id: string | null;
  created_at: string;
};

export type HistoricoServicoOut = {
  id: number;
  tenant_id: number;
  client_id: number;
  service_id: number;
  data_realizacao: string;
  service_order_id: number | null;
  notes: string | null;
  created_at: string;
};

export type WhatsappMessageJobSummary = {
  id: number;
  tenant_id: number;
  template_key: string | null;
  recipient_whatsapp: string;
  rendered_message: string;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  created_at: string;
};

export type PreventiveRegisterEntryOut = {
  historico: HistoricoServicoOut;
  whatsapp_job: WhatsappMessageJobSummary | null;
};

export type PreventiveRegisterEntryPayload =
  | {
      client_id: number;
      new_client?: undefined;
      service_id: number;
      data_realizacao: string;
      notes?: string | null;
      reminder_send: "none" | "now" | "scheduled";
      reminder_local_date?: string | null;
      reminder_local_time?: string | null;
      promo_image_url?: string | null;
      technical_problem_hint?: string | null;
    }
  | {
      client_id?: undefined;
      new_client: { name: string; phone?: string | null; whatsapp?: string | null };
      service_id: number;
      data_realizacao: string;
      notes?: string | null;
      reminder_send: "none" | "now" | "scheduled";
      reminder_local_date?: string | null;
      reminder_local_time?: string | null;
      promo_image_url?: string | null;
      technical_problem_hint?: string | null;
    };

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

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function detailFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const d = (body as { detail?: unknown }).detail;
  if (typeof d === "string" && d.trim()) {
    const s = d.trim();
    if (s === "Insufficient permissions.") return "Sem permissão para esta ação.";
    return s;
  }
  if (Array.isArray(d) && d.length > 0) {
    const parts: string[] = [];
    for (const item of d) {
      if (typeof item === "string") parts.push(item);
      else if (item && typeof item === "object" && "msg" in item) {
        const msg = (item as { msg?: string }).msg;
        if (typeof msg === "string" && msg.trim()) parts.push(msg);
      }
    }
    if (parts.length) return parts.join(" ");
  }
  return "";
}

function errorMessage(body: unknown, fallback: string): string {
  const fromDetail = detailFromBody(body);
  return fromDetail || fallback;
}

/** Mensagem amigável quando `detail` vem vazio (HTML do proxy, corpo vazio, etc.). */
export function apiFailureMessage(body: unknown, httpStatus: number, fallback: string): string {
  const fromDetail = detailFromBody(body);
  if (fromDetail) return fromDetail;
  if (httpStatus === 401) return "Sessão expirada. Faça login novamente.";
  if (httpStatus === 403) return "Sem permissão para esta ação.";
  if (httpStatus === 404) return "Recurso não encontrado.";
  if (httpStatus === 422) return "Não foi possível processar o pedido. Verifique os dados.";
  if (httpStatus >= 500) return `Erro no servidor (HTTP ${httpStatus}). Tente de novo em instantes.`;
  if (httpStatus > 0) return `Erro na comunicação (HTTP ${httpStatus}).`;
  return fallback;
}

export async function fetchPreventiveSettings(): Promise<PreventiveSettings> {
  const response = await fetch(apiUrl("/api/v1/preventive-maintenance/settings"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar configurações."));
  return body as PreventiveSettings;
}

export async function patchPreventiveSettings(payload: Partial<PreventiveSettings>): Promise<PreventiveSettings> {
  const response = await fetch(apiUrl("/api/v1/preventive-maintenance/settings"), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível salvar."));
  return body as PreventiveSettings;
}

export async function listPreventiveItems(days: number): Promise<PreventiveItem[]> {
  const sp = new URLSearchParams();
  sp.set("days", String(days));
  const response = await fetch(apiUrl(`/api/v1/preventive-maintenance/items?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar."));
  return body as PreventiveItem[];
}

export async function fetchPreventivePreview(historicoServicoId: number): Promise<PreventivePreview> {
  const sp = new URLSearchParams();
  sp.set("historico_servico_id", String(historicoServicoId));
  const response = await fetch(apiUrl(`/api/v1/preventive-maintenance/preview?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível gerar pré-visualização."));
  return body as PreventivePreview;
}

export async function registerPreventiveFromServiceOrder(
  serviceOrderId: number,
  payload?: { data_realizacao?: string | null; notes?: string | null },
): Promise<HistoricoServicoOut[]> {
  const response = await fetch(
    apiUrl(`/api/v1/preventive-maintenance/historico/from-service-order/${serviceOrderId}`),
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        data_realizacao: payload?.data_realizacao ?? null,
        notes: payload?.notes?.trim() ? payload.notes.trim() : null,
      }),
    },
  );
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(
      apiFailureMessage(body, response.status, "Não foi possível registrar a manutenção preventiva."),
    );
  }
  return body as HistoricoServicoOut[];
}

export async function registerPreventiveEntry(payload: PreventiveRegisterEntryPayload): Promise<PreventiveRegisterEntryOut> {
  const response = await fetch(apiUrl("/api/v1/preventive-maintenance/register-entry"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(apiFailureMessage(body, response.status, "Não foi possível registrar."));
  }
  return body as PreventiveRegisterEntryOut;
}

export type PreventiveSendReminderResult = {
  whatsapp_job?: unknown;
  processing_in_background?: boolean;
};

export async function sendPreventiveReminder(payload: {
  historico_servico_id: number;
  promo_image_url?: string | null;
  promo_image_base64?: string | null;
  promo_image_mimetype?: string | null;
  technical_problem_hint?: string | null;
}): Promise<PreventiveSendReminderResult> {
  const response = await fetch(apiUrl("/api/v1/preventive-maintenance/send-reminder"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(apiFailureMessage(body, response.status, "Não foi possível enviar."));
  }
  return body as PreventiveSendReminderResult;
}

export async function sendPreventiveRemindersBulk(payload: {
  historico_servico_ids?: number[];
  window_days_if_empty?: number;
  promo_image_url?: string | null;
}): Promise<{
  attempted: number;
  sent: number;
  failed: number;
  errors: Array<{ historico_servico_id?: number; detail?: string }>;
  processing_in_background?: boolean;
}> {
  const response = await fetch(apiUrl("/api/v1/preventive-maintenance/send-reminders-bulk"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(apiFailureMessage(body, response.status, "Não foi possível enviar em lote."));
  }
  return body as {
    attempted: number;
    sent: number;
    failed: number;
    errors: Array<{ historico_servico_id?: number; detail?: string }>;
    processing_in_background?: boolean;
  };
}

export async function listPreventiveLeads(limit = 100): Promise<PreventiveLead[]> {
  const sp = new URLSearchParams();
  sp.set("limit", String(limit));
  const response = await fetch(apiUrl(`/api/v1/preventive-maintenance/leads?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar interessados."));
  return body as PreventiveLead[];
}
