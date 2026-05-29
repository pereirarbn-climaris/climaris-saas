import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type Campaign = {
  id: number;
  tenant_id: number;
  name: string;
  message_template: string;
  status: string;
  scheduled_at: string | null;
  segment_kind: "inactive_since" | "manual" | string;
  segment_params: Record<string, unknown>;
  asset_id: number | null;
  asset_url: string | null;
  asset_content_type: string | null;
  total_contacts: number;
  sent_count: number;
  created_at: string;
  updated_at: string;
};

export type CampaignAsset = {
  id: number;
  url: string;
  content_type: string | null;
  s3_key: string | null;
};

export type SendSpeed = "fast" | "medium" | "slow";

export type CampaignExternalLead = {
  id: number;
  name: string;
  phone: string;
  whatsapp_preview: string | null;
};

export type CampaignPreview = {
  total: number;
  clients: Array<{
    id: number;
    name: string;
    whatsapp_ok: boolean;
    whatsapp_preview: string | null;
    data_ultimo_servico: string | null;
    message_preview?: string;
    source?: "client" | "external";
    external_lead_id?: number | null;
  }>;
  selection_mode?: "automatic" | "manual";
  official_count?: number;
  external_count?: number;
  estimated_duration_seconds?: number;
};

export type CampaignLeadInvalidRow = {
  line_no: number;
  name: string;
  phone_raw: string;
  error: string;
};

export type CampaignLeadValidRow = {
  line_no: number;
  name: string;
  phone: string;
  formatted: string;
  whatsapp_preview: string | null;
};

export type CampaignLeadsValidateResult = {
  valid_rows: CampaignLeadValidRow[];
  invalid_rows: CampaignLeadInvalidRow[];
  valid_count: number;
  invalid_count: number;
  skipped_empty: number;
  skipped_duplicate: number;
  requires_review: boolean;
  source_filename: string | null;
  total_rows_parsed?: number | null;
  validation_message?: string | null;
};

export type CampaignDispatchStatus = {
  campaign_id: number;
  status: string;
  sent: number;
  failed: number;
  total: number;
  processed: number;
  progress_pct: number;
  is_running: boolean;
};

export type CampaignRunStarted = {
  campaign: Campaign;
  campaign_id: number;
  total_recipients: number;
  estimated_duration_seconds: number;
  send_speed: string;
  status: string;
  async_dispatch?: boolean;
  scheduled_at?: string | null;
  sent?: number;
  failed?: number;
};

export type CampaignLeadsImportResult = {
  import_batch_id: string;
  imported_count: number;
  skipped_count: number;
  discarded_count?: number;
  errors: string[];
  leads: CampaignExternalLead[];
  summary_message?: string;
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

export async function listCampaigns(): Promise<Campaign[]> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/campaigns"), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar campanhas."));
  return body as Campaign[];
}

export async function uploadCampaignAsset(file: File): Promise<CampaignAsset> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.set("file", file);
  const response = await fetch(apiUrl("/api/v1/whatsapp/campaigns/assets"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível enviar a imagem."));
  return body as CampaignAsset;
}

export async function deleteCampaignAsset(assetId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/campaigns/assets/${assetId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível remover a imagem."));
}

export async function validateCampaignLeadsImport(file: File): Promise<CampaignLeadsValidateResult> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.set("file", file);
  const response = await fetch(apiUrl("/api/v1/whatsapp/campaigns/leads/import/validate"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível validar a lista."));
  return body as CampaignLeadsValidateResult;
}

export async function confirmCampaignLeadsImport(payload: {
  leads: Array<{ name: string; phone: string }>;
  source_filename?: string | null;
  discarded_invalid_count?: number;
}): Promise<CampaignLeadsImportResult> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/campaigns/leads/import/confirm"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível confirmar a importação."));
  return body as CampaignLeadsImportResult;
}

export async function downloadCampaignLeadsTemplate(): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/campaigns/leads/import/template"), {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errorMessage(body, "Não foi possível baixar o modelo."));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-leads-campanha.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

/** @deprecated Prefer validate + confirm flow */
export async function importCampaignLeads(file: File): Promise<CampaignLeadsImportResult> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.set("file", file);
  const response = await fetch(apiUrl("/api/v1/whatsapp/campaigns/leads/import"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível importar a lista."));
  return body as CampaignLeadsImportResult;
}

export async function previewCampaignRecipients(payload: {
  selection_mode: "automatic" | "manual";
  client_ids: number[];
  inactive_days: number | null;
  message_template?: string;
  external_lead_ids?: number[];
  import_batch_id?: string | null;
  send_speed?: SendSpeed;
}): Promise<CampaignPreview> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/campaigns/preview"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({
      selection_mode: payload.selection_mode,
      client_ids: payload.client_ids ?? [],
      inactive_days: payload.inactive_days ?? null,
      message_template: payload.message_template ?? "",
      external_lead_ids: payload.external_lead_ids ?? [],
      import_batch_id: payload.import_batch_id ?? null,
      send_speed: payload.send_speed ?? "fast",
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível gerar a prévia."));
  return body as CampaignPreview;
}

export async function createCampaign(payload: {
  name: string;
  message_template: string;
  segment_kind: "inactive_since";
  segment_params: Record<string, unknown>;
  asset_id?: number | null;
  scheduled_at?: string | null;
  status?: "draft" | "scheduled";
}): Promise<Campaign> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/campaigns"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar a campanha."));
  return body as Campaign;
}

export async function previewCampaign(campaignId: number): Promise<CampaignPreview> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/campaigns/${campaignId}/preview`), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível gerar prévia."));
  return body as CampaignPreview;
}

export async function runCampaign(
  campaignId: number,
  payload: {
    selection_mode: "automatic" | "manual";
    client_ids?: number[];
    inactive_days?: number | null;
    external_lead_ids?: number[];
    import_batch_id?: string | null;
    send_speed?: SendSpeed;
    run_async?: boolean;
    scheduled_at?: string | null;
  },
): Promise<CampaignRunStarted> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/campaigns/${campaignId}/run`), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({
      ...payload,
      external_lead_ids: payload.external_lead_ids ?? [],
      import_batch_id: payload.import_batch_id ?? null,
      send_speed: payload.send_speed ?? "fast",
      run_async: payload.run_async ?? true,
      scheduled_at: payload.scheduled_at ?? null,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível disparar a campanha."));
  return body as CampaignRunStarted;
}

export async function fetchCampaignDispatchStatus(campaignId: number): Promise<CampaignDispatchStatus> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/campaigns/${campaignId}/dispatch-status`), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível consultar o progresso do disparo."));
  return body as CampaignDispatchStatus;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Inicia disparo assíncrono e aguarda conclusão via polling do progresso real. */
export async function runCampaignAndWait(
  campaignId: number,
  payload: Parameters<typeof runCampaign>[1],
  onProgress?: (status: CampaignDispatchStatus) => void,
): Promise<{ started: CampaignRunStarted; final: CampaignDispatchStatus }> {
  const started = await runCampaign(campaignId, { ...payload, run_async: true });
  const dispatchId = started.campaign_id ?? started.campaign.id;

  if (started.status === "scheduled") {
    const final: CampaignDispatchStatus = {
      campaign_id: dispatchId,
      status: "scheduled",
      sent: 0,
      failed: 0,
      total: started.total_recipients ?? 0,
      processed: 0,
      progress_pct: 0,
      is_running: false,
    };
    onProgress?.(final);
    return { started, final };
  }

  if (started.async_dispatch === false) {
    const final: CampaignDispatchStatus = {
      campaign_id: dispatchId,
      status: started.status,
      sent: started.sent ?? 0,
      failed: started.failed ?? 0,
      total: started.total_recipients ?? 0,
      processed: (started.sent ?? 0) + (started.failed ?? 0),
      progress_pct: 100,
      is_running: false,
    };
    onProgress?.(final);
    return { started, final };
  }

  let final = await fetchCampaignDispatchStatus(dispatchId);
  onProgress?.(final);
  while (final.is_running) {
    await sleep(1500);
    final = await fetchCampaignDispatchStatus(dispatchId);
    onProgress?.(final);
  }
  return { started, final };
}

export async function previewClientSegmentation(inactiveDays: number): Promise<CampaignPreview> {
  const qs = new URLSearchParams({
    inactive_days: String(inactiveDays),
    respect_opt_out: "true",
    limit: "20",
  });
  const response = await fetch(apiUrl(`/api/v1/clients/segmentation?${qs.toString()}`), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível segmentar clientes."));
  return body as CampaignPreview;
}

export type CampaignAnalytics = {
  campaign_id: number;
  campaign_name: string;
  campaign_created_at: string;
  total_enviados: number;
  total_lidos: number;
  total_orcamentos: number;
  total_os_fechadas: number;
  conversion_rate: number;
  conversion_window_days: number;
  clientes_convertidos: Array<{
    client_id: number;
    client_name: string;
    interaction_type: string;
    interaction_at: string;
    service_order_id: number | null;
    service_order_title: string | null;
  }>;
  funnel?: { sent: number; delivered: number; read: number; os_closed: number };
  total_sent?: number;
  total_delivered?: number;
  total_read?: number;
  total_conversion?: number;
  total_budgets?: number;
  converted_clients?: Array<{
    client_id: number;
    client_name: string;
    service_order_id: number;
    service_order_title: string;
    closed_at: string | null;
  }>;
};

export type CampaignCompareItem = {
  campaign_id: number;
  campaign_name: string;
  conversion_rate: number;
  total_sent: number;
  total_conversion: number;
};

export async function fetchCampaignAnalytics(campaignId: number): Promise<CampaignAnalytics> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/campaigns/${campaignId}/analytics`), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar o relatório."));
  return body as CampaignAnalytics;
}

export async function fetchCampaignsCompare(campaignIds?: number[]): Promise<CampaignCompareItem[]> {
  const qs = new URLSearchParams();
  if (campaignIds?.length) qs.set("campaign_ids", campaignIds.join(","));
  qs.set("limit", "8");
  const response = await fetch(apiUrl(`/api/v1/whatsapp/campaigns/analytics/compare?${qs.toString()}`), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível comparar campanhas."));
  return body as CampaignCompareItem[];
}

export async function listCampaignSelectableClients(q = "", limit = 200): Promise<CampaignPreview> {
  const qs = new URLSearchParams({
    q,
    limit: String(limit),
    status: "active",
  });
  const response = await fetch(apiUrl(`/api/v1/clients?${qs.toString()}`), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar clientes."));
  const rows = body as Array<{ id: number; name: string; whatsapp?: string | null; phone?: string | null }>;
  return {
    total: rows.length,
    clients: rows.map((c) => ({
      id: c.id,
      name: c.name,
      whatsapp_ok: Boolean(c.whatsapp || c.phone),
      whatsapp_preview: c.whatsapp || c.phone || null,
      data_ultimo_servico: null,
    })),
  };
}
