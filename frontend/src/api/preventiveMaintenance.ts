import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import type {
  EquipmentPreventiveRuleCreate,
  EquipmentPreventiveRuleOut,
  EquipmentPreventiveRuleUpdate,
  EquipmentServicePreventiveScheduleOut,
  ServicePreventiveIntervalType,
} from "../types/preventive";

export type {
  EquipmentPreventiveRuleCreate,
  EquipmentPreventiveRuleOut,
  EquipmentPreventiveRuleUpdate,
  EquipmentServicePreventiveScheduleOut,
  PreventiveIntervalType,
  ServicePreventiveIntervalType,
} from "../types/preventive";

export type PreventiveModelAutomation = {
  ai_message_enabled: boolean;
  ai_message_fidelity: "faithful" | "balanced";
  auto_schedule_enabled: boolean;
  action_buttons_enabled: boolean;
  button_schedule_enabled: boolean;
  button_schedule_text: string;
  button_custom_enabled: boolean;
  button_more_text: string;
  button_custom_result: "lead" | "reply" | "handoff" | "url";
  button_custom_reply_text: string;
  button_custom_url: string;
  technical_problem_hint: string;
};

export type PreventiveModelAttachment = {
  promo_image_enabled: boolean;
  promo_image_url: string | null;
  promo_image_s3_key?: string | null;
  promo_image_mimetype: string;
  has_banner: boolean;
};

export type PreventiveMessageModel = {
  id: string;
  name: string;
  body: string;
  automation: PreventiveModelAutomation;
  attachment: PreventiveModelAttachment;
};

export type PreventiveSettings = {
  preventive_promo_image_url: string | null;
  preventive_image_url: string | null;
  preventive_has_banner?: boolean;
  preventive_promo_image_mimetype: string | null;
  preventive_promo_image_enabled?: boolean;
  preventive_technical_problem_hint: string | null;
  preventive_button_more_text: string;
  preventive_button_schedule_text: string;
  preventive_message_template: string | null;
  preventive_message_template_first: string | null;
  preventive_message_models?: PreventiveMessageModel[];
  preventive_default_template_model_id?: string;
  preventive_default_template_kind?: "first" | "returning";
  preventive_ai_message_enabled?: boolean;
  preventive_ai_message_fidelity?: "faithful" | "balanced";
  preventive_auto_remind_days_before: number;
  preventive_auto_whatsapp_enabled?: boolean;
  preventive_auto_schedule_enabled?: boolean;
  preventive_action_buttons_enabled?: boolean;
  preventive_button_schedule_enabled?: boolean;
  preventive_button_custom_enabled?: boolean;
  preventive_button_custom_result?: "lead" | "reply" | "handoff" | "url";
  preventive_button_custom_reply_text?: string | null;
  preventive_button_custom_url?: string | null;
  default_message_template?: string | null;
  default_message_template_first?: string | null;
  default_message_template_returning?: string | null;
};

export type PreventiveTemplatePayload = {
  preventive_message_models: PreventiveMessageModel[];
  preventive_default_template_model_id?: string;
};

/** URL para prévia do banner no painel. */
export function preventiveBannerPreviewUrl(settings: PreventiveSettings | null | undefined): string {
  if (!settings?.preventive_has_banner) return "";
  const direct =
    settings.preventive_promo_image_url?.trim() || settings.preventive_image_url?.trim() || "";
  if (direct) return direct;
  return apiUrl("/api/v1/preventive-maintenance/banner-image/file");
}

export type PreventiveTemplateKind = string;

export type PreventiveItem = {
  historico_servico_id: number;
  rule_id?: number | null;
  preventive_schedule_id?: number | null;
  is_manual_reminder?: boolean;
  client_id: number;
  client_name: string;
  service_id: number;
  service_name: string;
  equipment_id?: number | null;
  equipment_identificacao?: string | null;
  equipment_tipo?: string | null;
  interval_value?: number | null;
  interval_type?: "months" | "days" | null;
  periodicidade_meses: number;
  data_ultima_realizacao: string;
  data_proximo_vencimento: string;
  dias_ate_vencimento: number;
  whatsapp_valido: boolean;
  whatsapp_destino: string | null;
  ultimo_whatsapp_status?: string | null;
  ultimo_whatsapp_erro?: string | null;
  ultimo_whatsapp_em?: string | null;
  pending_service_order_id?: number | null;
  status_agenda?: boolean;
  status_mensagem_enviada?: boolean;
  status_lembrete_antecipado?: boolean;
  status_lembrete_vencimento?: boolean;
  status_vencida?: boolean;
  campaign_status?: "agenda" | "mensagem_enviada" | "lembrete_antecipado" | "lembrete_vencimento" | "vencida" | null;
  message_template_kind?: PreventiveTemplateKind | null;
};

export type PreventiveClientGroup = {
  client_id: number;
  client_name: string;
  whatsapp_valido: boolean;
  whatsapp_destino: string | null;
  equipments: PreventiveItem[];
};

export type PreventiveItemsList = {
  window_days?: number | null;
  year?: number | null;
  month?: number | null;
  clients: PreventiveClientGroup[];
  items: PreventiveItem[];
};

export type PreventivePreview = {
  message_text: string;
  image_url: string | null;
  image_mimetype: string | null;
  button_more_label: string;
  button_schedule_label: string;
  equipment_count?: number;
  is_grouped?: boolean;
};

export type PreventiveLead = {
  id: number;
  tenant_id: number;
  client_id: number;
  client_name?: string | null;
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
      entry_mode?: "temporary" | "existing";
      client_id: number;
      new_client?: undefined;
      service_id: number;
      data_realizacao: string;
      equipment_id?: number | null;
      equipment_label?: string | null;
      notes?: string | null;
      reminder_send: "none" | "now" | "scheduled";
      reminder_local_date?: string | null;
      reminder_local_time?: string | null;
      promo_image_url?: string | null;
      technical_problem_hint?: string | null;
      message_template_kind?: PreventiveTemplateKind;
    }
  | {
      entry_mode?: "temporary" | "existing";
      client_id?: undefined;
      new_client: { name: string; phone?: string | null; whatsapp?: string | null };
      service_id: number;
      data_realizacao: string;
      equipment_id?: number | null;
      equipment_label?: string | null;
      notes?: string | null;
      reminder_send: "none" | "now" | "scheduled";
      reminder_local_date?: string | null;
      reminder_local_time?: string | null;
      promo_image_url?: string | null;
      technical_problem_hint?: string | null;
      message_template_kind?: PreventiveTemplateKind;
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

export async function patchPreventiveTemplateSettings(
  payload: PreventiveTemplatePayload,
): Promise<PreventiveSettings> {
  return patchPreventiveSettings({
    preventive_message_models: payload.preventive_message_models,
    preventive_default_template_model_id: payload.preventive_default_template_model_id,
  });
}

export async function uploadPreventiveBannerImage(
  file: File,
  modelId: string,
): Promise<PreventiveSettings> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.set("file", file);
  const response = await fetch(
    apiUrl(
      `/api/v1/preventive-maintenance/banner-image?model_id=${encodeURIComponent(modelId)}`,
    ),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    },
  );
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível enviar o banner."));
  return body as PreventiveSettings;
}

export async function deletePreventiveBannerImage(modelId: string): Promise<PreventiveSettings> {
  const response = await fetch(
    apiUrl(
      `/api/v1/preventive-maintenance/banner-image?model_id=${encodeURIComponent(modelId)}`,
    ),
    {
      method: "DELETE",
      headers: bearer(),
    },
  );
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível remover o banner."));
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
  const grouped = await listPreventiveItemsGrouped({ days });
  return grouped.items;
}

export function currentPreventiveMonthValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export function parsePreventiveMonthValue(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function listPreventiveItemsGrouped(
  params: { year: number; month: number } | { days: number },
): Promise<PreventiveItemsList> {
  const sp = new URLSearchParams();
  if ("year" in params) {
    sp.set("year", String(params.year));
    sp.set("month", String(params.month));
  } else {
    sp.set("days", String(params.days));
  }
  const response = await fetch(apiUrl(`/api/v1/preventive-maintenance/items?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar."));
  if (Array.isArray(body)) {
    return { clients: [], items: body as PreventiveItem[] };
  }
  return body as PreventiveItemsList;
}

export async function fetchPreventivePreview(payload: {
  historico_servico_id?: number;
  rule_id?: number;
  window_days?: number;
}): Promise<PreventivePreview> {
  const sp = new URLSearchParams();
  if (payload.historico_servico_id != null && payload.historico_servico_id > 0) {
    sp.set("historico_servico_id", String(payload.historico_servico_id));
  }
  if (payload.rule_id != null && payload.rule_id > 0) {
    sp.set("rule_id", String(payload.rule_id));
  }
  if (payload.window_days != null) {
    sp.set("window_days", String(payload.window_days));
  }
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

export type PreventiveManualReminderDetail = {
  preventive_schedule_id: number;
  client_id: number;
  client_name: string;
  service_id: number;
  equipment_id: number;
  equipment_label: string;
  data_realizacao: string | null;
  notes: string | null;
  historico_servico_id: number | null;
  reminder_send: "none" | "now" | "scheduled";
  reminder_local_date: string | null;
  reminder_local_time: string | null;
  is_temporary_equipment: boolean;
  message_template_kind?: PreventiveTemplateKind | null;
};

export async function fetchManualPreventiveReminder(scheduleId: number): Promise<PreventiveManualReminderDetail> {
  const response = await fetch(apiUrl(`/api/v1/preventive-maintenance/manual-reminders/${scheduleId}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(apiFailureMessage(body, response.status, "Não foi possível carregar o lembrete."));
  }
  return body as PreventiveManualReminderDetail;
}

export async function updateManualPreventiveReminder(
  scheduleId: number,
  payload: {
    service_id: number;
    data_realizacao: string;
    equipment_label?: string | null;
    notes?: string | null;
    message_template_kind?: PreventiveTemplateKind | null;
  },
): Promise<PreventiveManualReminderDetail> {
  const response = await fetch(apiUrl(`/api/v1/preventive-maintenance/manual-reminders/${scheduleId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(apiFailureMessage(body, response.status, "Não foi possível atualizar o lembrete."));
  }
  return body as PreventiveManualReminderDetail;
}

export async function deleteManualPreventiveReminder(scheduleId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/preventive-maintenance/manual-reminders/${scheduleId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(apiFailureMessage(body, response.status, "Não foi possível excluir o lembrete."));
  }
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
  historico_servico_id?: number;
  rule_id?: number;
  client_id?: number;
  year?: number;
  month?: number;
  window_days?: number;
  promo_image_url?: string | null;
  promo_image_base64?: string | null;
  promo_image_mimetype?: string | null;
  technical_problem_hint?: string | null;
  message_template_kind?: PreventiveTemplateKind;
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

export async function getPreventiveRuleByEquipment(
  equipmentId: number,
): Promise<EquipmentPreventiveRuleOut | null> {
  const response = await fetch(
    apiUrl(`/api/v1/preventive-maintenance/rules/equipment/${equipmentId}`),
    { headers: bearer() },
  );
  if (response.status === 404) return null;
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(
      apiFailureMessage(body, response.status, "Não foi possível carregar a regra preventiva."),
    );
  }
  return body as EquipmentPreventiveRuleOut;
}

export async function upsertPreventiveRule(
  data: EquipmentPreventiveRuleCreate,
): Promise<EquipmentPreventiveRuleOut> {
  const response = await fetch(apiUrl("/api/v1/preventive-maintenance/rules"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(
      apiFailureMessage(body, response.status, "Não foi possível salvar a regra preventiva."),
    );
  }
  return body as EquipmentPreventiveRuleOut;
}

export async function updatePreventiveRule(
  ruleId: number,
  data: EquipmentPreventiveRuleUpdate,
): Promise<EquipmentPreventiveRuleOut> {
  const response = await fetch(apiUrl(`/api/v1/preventive-maintenance/rules/${ruleId}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(
      apiFailureMessage(body, response.status, "Não foi possível atualizar a regra preventiva."),
    );
  }
  return body as EquipmentPreventiveRuleOut;
}

export async function deletePreventiveRule(ruleId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/preventive-maintenance/rules/${ruleId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(
      apiFailureMessage(body, response.status, "Não foi possível remover a regra preventiva."),
    );
  }
}

export async function listEquipmentServicePreventiveSchedules(
  equipmentId: number,
): Promise<EquipmentServicePreventiveScheduleOut[]> {
  const response = await fetch(
    apiUrl(`/api/v1/preventive-maintenance/equipment/${equipmentId}/service-schedules`),
    { headers: bearer() },
  );
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(
      apiFailureMessage(body, response.status, "Não foi possível carregar a gestão preventiva."),
    );
  }
  return (body as { items: EquipmentServicePreventiveScheduleOut[] }).items ?? [];
}

export async function upsertEquipmentServicePreventiveSchedule(
  equipmentId: number,
  serviceId: number,
  payload: { interval_value: number; interval_type: ServicePreventiveIntervalType },
): Promise<EquipmentServicePreventiveScheduleOut> {
  const response = await fetch(
    apiUrl(`/api/v1/preventive-maintenance/equipment/${equipmentId}/service-schedules/${serviceId}`),
    {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(
      apiFailureMessage(body, response.status, "Não foi possível salvar a validade preventiva."),
    );
  }
  return body as EquipmentServicePreventiveScheduleOut;
}

export async function resetEquipmentServicePreventiveScheduleOverride(
  equipmentId: number,
  serviceId: number,
): Promise<EquipmentServicePreventiveScheduleOut> {
  const response = await fetch(
    apiUrl(`/api/v1/preventive-maintenance/equipment/${equipmentId}/service-schedules/${serviceId}`),
    {
      method: "DELETE",
      headers: bearer(),
    },
  );
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(
      apiFailureMessage(body, response.status, "Não foi possível restaurar o padrão do serviço."),
    );
  }
  return body as EquipmentServicePreventiveScheduleOut;
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
