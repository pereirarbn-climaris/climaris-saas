import type { ScheduleOut } from "./serviceOrders";
import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import { demoCreatePmocPlan, demoListPmocPlans, demoPatchPmocPlan, isDemoMode } from "../lib/demoMode";

export type PmocPlanStatus = "draft" | "active" | "inactive" | "archived";
export type PmocFrequency = "monthly" | "quarterly" | "semiannual" | "annual" | "custom";
export type PmocExecutionCompletion = "done" | "partial" | "skipped";
export type PmocFieldChecklistStatus = "ok" | "not_ok" | "na";

export type PmocFieldChecklistItemIn = {
  id: string;
  title: string;
  status: PmocFieldChecklistStatus;
  photoReference: string | null;
};

export type PmocFieldInspectionPayload = {
  pmocId: number;
  equipmentId?: number | null;
  checklist: PmocFieldChecklistItemIn[];
  generalNotes: string;
  signatureBase64: string | null;
};

export type PmocFieldInspectionOut = {
  id: number;
  pmoc_id: number;
  equipment_id: number | null;
  completion_status: PmocExecutionCompletion;
  created_at: string;
};

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
  client_site_id: number | null;
  establishment_name: string | null;
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

export type PmocActivePlanCheckOut = {
  has_active: boolean;
  active_plan_id: number | null;
  active_plan_title: string | null;
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
  installation_reference: string | null;
};

export type PmocActivityServiceOut = {
  id: number;
  name: string;
  duration_minutes: number;
};

export type PmocScheduledActivityOut = {
  id: number;
  pmoc_id: number;
  equipment_id: number | null;
  service_id: number | null;
  service: PmocActivityServiceOut | null;
  frequency: PmocFrequency;
  task_code: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  is_system_seed: boolean;
};

export type PmocEstimatedTimeOut = {
  total_minutes: number;
  equipment_count: number;
  activities_in_period: number;
  period_year: number;
  period_month: number;
  breakdown: Array<{
    activity_id: number;
    title: string;
    service_name: string | null;
    minutes_per_unit: number;
    occurrences: number;
    total_minutes: number;
  }>;
};

export type PmocPendingTaskOut = {
  equipment_id: number;
  equipment_label: string;
  activity_id: number;
  activity_title: string;
  service_id: number | null;
  service_name: string | null;
  status: "pending";
};

export type PmocPendingTasksOut = {
  period_year: number;
  period_month: number;
  total_pending: number;
  tasks: PmocPendingTaskOut[];
};

export type PmocComplianceTrafficLight = "green" | "yellow" | "red";

export type PmocComplianceIndicatorOut = {
  key: string;
  label: string;
  status: PmocComplianceTrafficLight;
  summary: string;
  detail: string | null;
};

export type PmocComplianceSummaryOut = {
  pmoc_id: number;
  overall_status: PmocComplianceTrafficLight;
  indicators: PmocComplianceIndicatorOut[];
  monthly_execution_pct: number;
  open_occurrences: number;
};

export type PmocOccurrenceOut = {
  id: number;
  pmoc_id: number;
  equipment_id: number | null;
  service_order_id: number | null;
  checklist_item_id: string | null;
  checklist_item_descricao: string;
  failure_description: string;
  status: "open" | "resolved";
  created_by_user_id: number | null;
  resolved_at: string | null;
  created_at: string;
  equipment_label: string | null;
  client_name: string | null;
};

export type PmocOccurrenceAlertOut = {
  id: number;
  pmoc_id: number;
  pmoc_title: string;
  client_name: string;
  equipment_label: string | null;
  checklist_item_descricao: string;
  failure_description: string;
  created_at: string;
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
    let rows: PmocPlanOut[] = demoListPmocPlans();
    if (params?.status) rows = rows.filter((item: PmocPlanOut) => item.status === params.status);
    if (params?.client_id) rows = rows.filter((item: PmocPlanOut) => item.client_id === params.client_id);
    if (params?.q?.trim()) {
      const q = params.q.trim().toLowerCase();
      rows = rows.filter((item: PmocPlanOut) => item.title.toLowerCase().includes(q));
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

export async function checkActivePmocForSite(
  clientId: number,
  clientSiteId: number,
): Promise<PmocActivePlanCheckOut> {
  const sp = new URLSearchParams({
    client_id: String(clientId),
    client_site_id: String(clientSiteId),
  });
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/active-for-site?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível verificar PMOC ativo."));
  return body as PmocActivePlanCheckOut;
}

export async function createPmocPlan(payload: {
  client_id: number;
  client_site_id: number;
  title: string;
}): Promise<PmocPlanOut> {
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

export type PmocCreateFullPayload = {
  clientId: number;
  siteId: number;
  title: string;
  equipmentIds: number[];
  activities: Array<{
    serviceId: number;
    frequency: PmocFrequency;
    equipmentId?: number | null;
    title?: string;
    taskCode?: string;
    description?: string;
  }>;
  rtData?: {
    responsibleName?: string;
    responsibleCouncil?: string;
    responsibleRegistration?: string;
    artNumber?: string;
    artIssuedAt?: string;
    nextAirAnalysisDue?: string;
  };
};

export async function createPmocFull(payload: PmocCreateFullPayload): Promise<PmocPlanOut> {
  if (isDemoMode()) {
    const plan = demoCreatePmocPlan({
      client_id: payload.clientId,
      client_site_id: payload.siteId,
      title: payload.title,
    });
    return demoPatchPmocPlan(plan.id, {
      responsible_name: payload.rtData?.responsibleName ?? null,
      responsible_council: payload.rtData?.responsibleCouncil ?? null,
      responsible_registration: payload.rtData?.responsibleRegistration ?? null,
      art_number: payload.rtData?.artNumber ?? null,
      art_issued_at: payload.rtData?.artIssuedAt ?? null,
      next_air_analysis_due: payload.rtData?.nextAirAnalysisDue ?? null,
      total_btu_sum: 0,
    });
  }

  const response = await fetch(apiUrl("/api/v1/pmoc/create"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      clientId: payload.clientId,
      siteId: payload.siteId,
      title: payload.title,
      equipmentIds: payload.equipmentIds,
      activities: payload.activities.map((row) => ({
        serviceId: row.serviceId,
        frequency: row.frequency,
        equipmentId: row.equipmentId ?? null,
        title: row.title,
        taskCode: row.taskCode,
        description: row.description,
      })),
      rtData: payload.rtData
        ? {
            responsibleName: payload.rtData.responsibleName,
            responsibleCouncil: payload.rtData.responsibleCouncil,
            responsibleRegistration: payload.rtData.responsibleRegistration,
            artNumber: payload.rtData.artNumber,
            artIssuedAt: payload.rtData.artIssuedAt || undefined,
            nextAirAnalysisDue: payload.rtData.nextAirAnalysisDue || undefined,
          }
        : undefined,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    const issues = (() => {
      if (!body || typeof body !== "object") return [];
      const detail = (body as { detail?: unknown }).detail;
      if (!detail || typeof detail !== "object") return [];
      const errors = (detail as { errors?: unknown }).errors;
      return Array.isArray(errors) ? errors : [];
    })();
    if (issues.length > 0) {
      const message =
        typeof (body as { detail?: { message?: string } }).detail?.message === "string"
          ? (body as { detail: { message: string } }).detail.message
          : "Corrija os campos obrigatórios antes de salvar o PMOC.";
      const err = new Error(message) as Error & { pmocValidationIssues?: unknown[] };
      err.pmocValidationIssues = issues;
      throw err;
    }
    throw new Error(pmocApiErrorMessage(body, "Não foi possível criar PMOC."));
  }
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

export async function getPmocEstimatedTime(
  pmocId: number,
  params?: { year?: number; month?: number; equipment_ids?: number[] },
): Promise<PmocEstimatedTimeOut> {
  const sp = new URLSearchParams();
  if (params?.year != null) sp.set("year", String(params.year));
  if (params?.month != null) sp.set("month", String(params.month));
  if (params?.equipment_ids?.length) sp.set("equipment_ids", params.equipment_ids.join(","));
  const qs = sp.toString();
  const response = await fetch(
    apiUrl(`/api/v1/pmoc/plans/${pmocId}/estimated-time${qs ? `?${qs}` : ""}`),
    { headers: bearer() },
  );
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível calcular o tempo estimado."));
  return body as PmocEstimatedTimeOut;
}

export async function getPmocPendingTasks(
  pmocId: number,
  params?: { year?: number; month?: number },
): Promise<PmocPendingTasksOut> {
  const sp = new URLSearchParams();
  if (params?.year != null) sp.set("year", String(params.year));
  if (params?.month != null) sp.set("month", String(params.month));
  const qs = sp.toString();
  const response = await fetch(
    apiUrl(`/api/v1/pmoc/plans/${pmocId}/pending-tasks${qs ? `?${qs}` : ""}`),
    { headers: bearer() },
  );
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível carregar pendências do mês."));
  return body as PmocPendingTasksOut;
}

export async function createPmocPlanningSchedule(
  pmocId: number,
  payload: {
    technician_id: number;
    starts_at: string;
    duration_minutes: number;
    period_year: number;
    period_month: number;
    row_keys: string[];
    activity_count: number;
  },
): Promise<ScheduleOut> {
  if (isDemoMode()) {
    return Promise.resolve({
      id: Date.now(),
      tenant_id: 0,
      client_id: 0,
      service_order_id: null,
      starts_at: payload.starts_at,
      ends_at: payload.starts_at,
      status: "confirmed",
      notes: "[PMOC] demo",
    });
  }
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/planning-schedule`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível salvar o agendamento na Agenda."));
  return body as ScheduleOut;
}

export async function getPmocComplianceSummary(pmocId: number): Promise<PmocComplianceSummaryOut> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/compliance-summary`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível carregar o painel de conformidade."));
  return body as PmocComplianceSummaryOut;
}

export async function listPmocOccurrences(
  pmocId: number,
  params?: { status?: "open" | "resolved" },
): Promise<PmocOccurrenceOut[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  const qs = sp.toString();
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/occurrences${qs ? `?${qs}` : ""}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível carregar ocorrências."));
  return body as PmocOccurrenceOut[];
}

export async function createPmocOccurrence(
  pmocId: number,
  payload: {
    equipment_id?: number | null;
    service_order_id?: number | null;
    checklist_item_id?: string | null;
    checklist_item_descricao: string;
    failure_description: string;
  },
): Promise<PmocOccurrenceOut> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/occurrences`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível registrar a ocorrência."));
  return body as PmocOccurrenceOut;
}

export async function listPmocOccurrenceAlerts(limit = 10): Promise<PmocOccurrenceAlertOut[]> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/occurrence-alerts?limit=${limit}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível carregar alertas."));
  return body as PmocOccurrenceAlertOut[];
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
    service_id?: number | null;
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
      service_id: payload.service_id ?? null,
      service: null,
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
    service_id: number | null;
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

/** Checklist de campo — vistoria PMOC com fotos e assinatura digital. */
export async function submitPmocFieldInspection(
  pmocId: number,
  payload: PmocFieldInspectionPayload,
): Promise<PmocFieldInspectionOut> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/execucao/${pmocId}`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Erro ao salvar a vistoria. Tente novamente."));
  return body as PmocFieldInspectionOut;
}

export async function listPmocAirAnalyses(pmocId: number): Promise<PmocAirQualityAnalysisOut[]> {
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/air-analyses`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível carregar análises."));
  return body as PmocAirQualityAnalysisOut[];
}

/** Upload semestral unificado: PDF + data → S3 + histórico. */
export async function uploadPmocAirAnalysisSemestral(
  pmocId: number,
  file: File,
  analiseDate: string,
): Promise<PmocAirQualityAnalysisOut> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("analise_date", analiseDate);
  const response = await fetch(apiUrl(`/api/v1/pmoc/${pmocId}/analise-ar`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(pmocApiErrorMessage(body, "Não foi possível enviar a análise de ar."));
  return body as PmocAirQualityAnalysisOut;
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
  const response = await fetch(apiUrl(`/api/v1/pmoc/${pmocId}/upload-art`), {
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

/**
 * Gera e baixa o Relatório PMOC Oficial em PDF.
 * Endpoint esperado: GET /api/v1/pmoc/plans/{pmocId}/report  (Content-Type: application/pdf)
 */
export async function fetchPmocReportPdf(pmocId: number): Promise<Blob> {
  if (isDemoMode()) {
    throw new Error("Geração de relatório PDF não disponível no modo demonstração.");
  }
  const response = await fetch(apiUrl(`/api/v1/pmoc/plans/${pmocId}/report`), { headers: bearer() });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(pmocApiErrorMessage(body, "Não foi possível gerar o relatório PDF do PMOC."));
  }
  return response.blob();
}
