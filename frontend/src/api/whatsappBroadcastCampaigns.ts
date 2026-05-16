import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type WhatsappBroadcastCampaign = {
  id: number;
  tenant_id: number;
  slug: string;
  name: string;
  message_template: string;
  segment_kind: "inactive_no_os_recent" | "open_budgets" | string;
  segment_params: Record<string, unknown>;
  enabled: boolean;
  max_recipients_per_run: number;
  cooldown_days: number;
  last_run_at: string | null;
  last_run_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type WhatsappBroadcastCampaignPreview = {
  estimated_total: number;
  sample: Array<{
    client_id: number;
    name: string;
    whatsapp_ok: boolean;
    destination_preview: string | null;
    message_preview: string;
  }>;
};

export type WhatsappBroadcastCampaignRun = {
  id: number;
  campaign_id: number;
  tenant_id: number;
  created_by_user_id: number | null;
  status: string;
  planned: number;
  sent_ok: number;
  sent_failed: number;
  skipped_cooldown: number;
  skipped_no_phone: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
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

export async function listWhatsappBroadcastCampaigns(): Promise<WhatsappBroadcastCampaign[]> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/broadcast-campaigns"), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar campanhas."));
  return body as WhatsappBroadcastCampaign[];
}

export async function createWhatsappBroadcastCampaign(payload: {
  name: string;
  slug?: string | null;
  message_template: string;
  segment_kind: string;
  segment_params?: Record<string, unknown>;
  enabled?: boolean;
  max_recipients_per_run?: number;
  cooldown_days?: number;
}): Promise<WhatsappBroadcastCampaign> {
  const response = await fetch(apiUrl("/api/v1/whatsapp/broadcast-campaigns"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar a campanha."));
  return body as WhatsappBroadcastCampaign;
}

export async function patchWhatsappBroadcastCampaign(
  campaignId: number,
  patch: Partial<{
    name: string;
    slug: string | null;
    message_template: string;
    segment_kind: string;
    segment_params: Record<string, unknown>;
    enabled: boolean;
    max_recipients_per_run: number;
    cooldown_days: number;
  }>,
): Promise<WhatsappBroadcastCampaign> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/broadcast-campaigns/${campaignId}`), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(patch),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível salvar a campanha."));
  return body as WhatsappBroadcastCampaign;
}

export async function deleteWhatsappBroadcastCampaign(campaignId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/broadcast-campaigns/${campaignId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível excluir a campanha."));
}

export async function previewWhatsappBroadcastCampaign(
  campaignId: number,
  sampleLimit?: number,
): Promise<WhatsappBroadcastCampaignPreview> {
  const q = sampleLimit != null ? `?sample_limit=${sampleLimit}` : "";
  const response = await fetch(apiUrl(`/api/v1/whatsapp/broadcast-campaigns/${campaignId}/preview${q}`), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível pré-visualizar."));
  return body as WhatsappBroadcastCampaignPreview;
}

export async function runWhatsappBroadcastCampaign(campaignId: number): Promise<{
  campaign: WhatsappBroadcastCampaign;
  run: WhatsappBroadcastCampaignRun;
}> {
  const response = await fetch(apiUrl(`/api/v1/whatsapp/broadcast-campaigns/${campaignId}/run`), {
    method: "POST",
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível executar o envio."));
  return body as { campaign: WhatsappBroadcastCampaign; run: WhatsappBroadcastCampaignRun };
}

export async function listWhatsappBroadcastCampaignRuns(campaignId: number, limit?: number): Promise<WhatsappBroadcastCampaignRun[]> {
  const q = limit != null ? `?limit=${limit}` : "";
  const response = await fetch(apiUrl(`/api/v1/whatsapp/broadcast-campaigns/${campaignId}/runs${q}`), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar histórico de envios."));
  return body as WhatsappBroadcastCampaignRun[];
}
