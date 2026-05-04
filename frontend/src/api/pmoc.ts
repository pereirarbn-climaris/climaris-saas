import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import { demoCreatePmocPlan, demoListPmocPlans, demoPatchPmocPlan, isDemoMode } from "../lib/demoMode";

export type PmocPlanStatus = "draft" | "active" | "inactive" | "archived";
export type PmocFrequency = "monthly" | "quarterly" | "semiannual" | "annual" | "custom";
export type PmocExecutionCompletion = "done" | "partial" | "skipped";

export type PmocClientSummaryOut = {
  id: number;
  name: string;
  trade_name: string | null;
  document: string | null;
  address_city: string | null;
  address_state: string | null;
};

export type PmocPlanOut = {
  id: number;
  tenant_id: number;
  client_id: number;
  status: PmocPlanStatus;
  title: string;
  version_label: string;
  establishment_snapshot: Record<string, unknown>;
  law_reference_note: string | null;
  internal_notes: string | null;
  extras: Record<string, string>;
  total_btu_sum: number;
  air_analysis_required: boolean;
  next_air_analysis_due: string | null;
  responsible_name: string | null;
  responsible_council: string | null;
  responsible_registration: string | null;
  art_number: string | null;
  art_issued_at: string | null;
  art_file_url: string | null;
  activated_at: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
  client: PmocClientSummaryOut | null;
};

export type PmocPlanEquipmentOut = {
  id: number;
  pmoc_id: number;
  equipment_id: number;
  sort_order: number;
  ficha_notes: string | null;
  identificacao: string | null;
  modelo: string | null;
  capacidade_btu: number | null;
  local_instalacao: string | null;
};

export type PmocScheduledActivityOut = {
  id: number;
  pmoc_id: number;
  equipment_id: number | null;
  frequency: PmocFrequency;
  task_code: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  is_system_seed: boolean;
};

export type PmocExecutionOut = {
  id: number;
  pmoc_id: number;
  scheduled_activity_id: number | null;
  equipment_id: number | null;
  executed_at: string;
  completion_status: PmocExecutionCompletion;
  notes: string | null;
  performed_by_user_id: number | null;
  service_order_id: number | null;
  created_at: string;
};

export type PmocAirQualityAnalysisOut = {
  id: number;
  pmoc_id: number;
  analysis_date: string;
  lab_name: string | null;
  summary: string | null;
  next_due_date: string | null;
  file_url: string | null;
  created_by_user_id: number | null;
  created_at: string;
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

/** Respostas 4xx/5xx: `error.message` + `error.details` (validação) ou `detail` (clássico / 404). */
function pmocApiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const o = body as { error?: { message?: string; details?: unknown }; detail?: unknown };
  const fromDetails = o.error?.details;
  if (Array.isArray(fromDetails) && fromDetails.length > 0) {
    const row = fromDetails[0] as { msg?: string };
    if (typeof row.msg === "string" && row.msg.trim()) return row.msg.trim();
  }
  if (typeof o.error?.message === "string" && o.error.message.trim()) {
    return o.error.message.trim();
  }
  const d = o.detail;
  if (typeof d === "string") {
    if (d === "Not Found") {
      return "Módulo PMOC não disponível na API. Faça deploy do backend com rotas PMOC, rode as migrações (alembic) e confira VITE_API_URL em produção.";
    }
    return d;
  }
  if (Array.isArray(d) && d.length > 0) {
    const row = d[0] as { msg?: string };
    if (typeof row.msg === "string" && row.msg.trim()) return row.msg.trim();
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

export async function listPmocPlans(params?: {
  status?: PmocPlanStatus;
  client_id?: number;
  q?: string;
  skip?: number;
  limit?: number;
}): Promise<PmocPlanOut[]> {
  if (isDemoMode()) {
    let rows = demoListPmocPlans();
    if (params?.status) rows = rows.filter((item) => item.status === params.status);
    if (params?.client_id) rows = rows.filter((item) => item.client_id === params.client_id);
    if (params?.q?.trim()) {
      const q = params.q.trim().toLowerCase();
      rows = rows.filter((item) => item.title.toLowerCase().includes(q));
    }
    return Promise.resolve(rows);
  }
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.client_id) sp.set("client_id", String(params.client_id));
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.skip != null) sp.set("skip", String(params.skip));
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível listar PMOC."));
  return body as PmocPlanOut[];
}

export async function createPmocPlan(payload: { client_id: number; title: string }): Promise<PmocPlanOut> {
  if (isDemoMode()) return Promise.resolve(demoCreatePmocPlan(payload));
  const response = await fetch(apiUrl("/api/v1/pmoc/plans"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível criar PMOC."));
  return body as PmocPlanOut;
}

export async function getPmocPlan(pmocId: number): Promise<PmocPlanOut> {
  if (isDemoMode()) {
    const row = demoListPmocPlans().find((item) => item.id === pmocId);
    if (!row) throw new Error("PMOC não encontrado.");
    return Promise.resolve(row);
  }
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "PMOC não encontrado."));
  return body as PmocPlanOut;
}

export async function updatePmocPlan(
  pmocId: number,
  payload: Partial<{
    title: string;
    version_label: string;
    law_reference_note: string | null;
    internal_notes: string | null;
    extras: Record<string, string>;
    responsible_name: string | null;
    responsible_council: string | null;
    responsible_registration: string | null;
    art_number: string | null;
    art_issued_at: string | null;
    next_air_analysis_due: string | null;
  }>,
): Promise<PmocPlanOut> {
  if (isDemoMode()) return Promise.resolve(demoPatchPmocPlan(pmocId, payload as Partial<PmocPlanOut>));
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível salvar PMOC."));
  return body as PmocPlanOut;
}

export async function activatePmocPlan(pmocId: number): Promise<PmocPlanOut> {
  if (isDemoMode()) return Promise.resolve(demoPatchPmocPlan(pmocId, { status: "active", activated_at: new Date().toISOString() }));
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/activate`), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível ativar PMOC."));
  return body as PmocPlanOut;
}

export async function deactivatePmocPlan(pmocId: number): Promise<PmocPlanOut> {
  if (isDemoMode()) return Promise.resolve(demoPatchPmocPlan(pmocId, { status: "inactive", deactivated_at: new Date().toISOString() }));
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/deactivate`), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível inativar PMOC."));
  return body as PmocPlanOut;
}

export async function archivePmocPlan(pmocId: number): Promise<PmocPlanOut> {
  if (isDemoMode()) return Promise.resolve(demoPatchPmocPlan(pmocId, { status: "archived" }));
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/archive`), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível arquivar PMOC."));
  return body as PmocPlanOut;
}

export async function listPmocEquipments(pmocId: number): Promise<PmocPlanEquipmentOut[]> {
  if (isDemoMode()) return Promise.resolve([]);
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/equipments`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível listar equipamentos do PMOC."));
  return body as PmocPlanEquipmentOut[];
}

export async function replacePmocEquipments(pmocId: number, equipment_ids: number[]): Promise<PmocPlanEquipmentOut[]> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/equipments`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ equipment_ids }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível atualizar equipamentos do PMOC."));
  return body as PmocPlanEquipmentOut[];
}

export async function listPmocActivities(pmocId: number): Promise<PmocScheduledActivityOut[]> {
  if (isDemoMode()) return Promise.resolve([]);
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/activities`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível carregar atividades."));
  return body as PmocScheduledActivityOut[];
}

export async function createPmocActivity(
  pmocId: number,
  payload: {
    equipment_id?: number | null;
    frequency: PmocFrequency;
    task_code?: string | null;
    title: string;
    description?: string | null;
    sort_order?: number;
  },
): Promise<PmocScheduledActivityOut> {
  if (isDemoMode()) {
    return Promise.resolve({
      id: Date.now(),
      pmoc_id: pmocId,
      equipment_id: payload.equipment_id ?? null,
      frequency: payload.frequency,
      task_code: payload.task_code ?? null,
      title: payload.title,
      description: payload.description ?? null,
      sort_order: payload.sort_order ?? 1,
      is_system_seed: false,
    });
  }
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/activities`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível criar atividade."));
  return body as PmocScheduledActivityOut;
}

export async function updatePmocActivity(
  pmocId: number,
  activityId: number,
  payload: Partial<{
    equipment_id: number | null;
    frequency: PmocFrequency;
    task_code: string | null;
    title: string;
    description: string | null;
    sort_order: number;
  }>,
): Promise<PmocScheduledActivityOut> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/activities/${activityId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível salvar atividade."));
  return body as PmocScheduledActivityOut;
}

export async function deletePmocActivity(pmocId: number, activityId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/activities/${activityId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(pmocApiErrorMessage(body, "Não foi possível excluir atividade."));
}

export async function listPmocExecutions(pmocId: number, limit = 100): Promise<PmocExecutionOut[]> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/executions?limit=${limit}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível carregar execuções."));
  return body as PmocExecutionOut[];
}

export async function createPmocExecution(
  pmocId: number,
  payload: {
    scheduled_activity_id?: number | null;
    equipment_id?: number | null;
    executed_at?: string | null;
    completion_status?: PmocExecutionCompletion;
    notes?: string | null;
    service_order_id?: number | null;
  },
): Promise<PmocExecutionOut> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/executions`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível registrar execução."));
  return body as PmocExecutionOut;
}

export async function listPmocAirAnalyses(pmocId: number): Promise<PmocAirQualityAnalysisOut[]> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/air-analyses`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível carregar análises."));
  return body as PmocAirQualityAnalysisOut[];
}

export async function createPmocAirAnalysis(
  pmocId: number,
  payload: { analysis_date: string; lab_name?: string | null; summary?: string | null; next_due_date?: string | null },
): Promise<PmocAirQualityAnalysisOut> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/air-analyses`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível criar registro de análise."));
  return body as PmocAirQualityAnalysisOut;
}

export async function uploadPmocArt(pmocId: number, file: File): Promise<PmocPlanOut> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.append("file", file);
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/art`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível enviar ART."));
  return body as PmocPlanOut;
}

export async function deletePmocArt(pmocId: number): Promise<PmocPlanOut> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/art`), {
    method: "DELETE",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível remover ART."));
  return body as PmocPlanOut;
}

export async function uploadPmocAirAnalysisFile(pmocId: number, analysisId: number, file: File): Promise<PmocAirQualityAnalysisOut> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.append("file", file);
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/air-analyses/${analysisId}/file`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível enviar arquivo da análise."));
  return body as PmocAirQualityAnalysisOut;
}
