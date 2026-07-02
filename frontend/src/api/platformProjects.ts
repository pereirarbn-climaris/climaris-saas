import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type PlatformProjectStatus =
  | "lead"
  | "onboarding"
  | "implementation"
  | "delivered"
  | "on_hold"
  | "cancelled";

export type PlatformProjectPriority = "low" | "normal" | "high" | "urgent";

export type PlatformProjectTaskStatus = "pending" | "in_progress" | "done" | "blocked";

export type PlatformProjectTaskOut = {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: PlatformProjectTaskStatus;
  due_date: string | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformProjectOut = {
  id: number;
  title: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tenant_id: number | null;
  demo_appointment_id: number | null;
  status: PlatformProjectStatus;
  priority: PlatformProjectPriority;
  delivery_deadline: string | null;
  description: string | null;
  notes: string | null;
  progress_percent: number;
  created_at: string;
  updated_at: string;
  tasks: PlatformProjectTaskOut[];
};

function authHeaders(json = false): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return json
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { Authorization: `Bearer ${token}` };
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function errMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as { detail?: string };
    if (typeof o.detail === "string") return o.detail;
  }
  return fallback;
}

export const PROJECT_STATUS_LABELS: Record<PlatformProjectStatus, string> = {
  lead: "Lead",
  onboarding: "Onboarding",
  implementation: "Implantação",
  delivered: "Entregue",
  on_hold: "Em pausa",
  cancelled: "Cancelado",
};

export const PROJECT_PRIORITY_LABELS: Record<PlatformProjectPriority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const TASK_STATUS_LABELS: Record<PlatformProjectTaskStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  done: "Concluída",
  blocked: "Bloqueada",
};

export async function listPlatformProjects(params?: {
  status?: PlatformProjectStatus;
  limit?: number;
}): Promise<PlatformProjectOut[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/platform/projects${suffix}`), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar os projetos."));
  return body as PlatformProjectOut[];
}

export async function getPlatformProject(id: number): Promise<PlatformProjectOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/projects/${id}`), { headers: authHeaders() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Projeto não encontrado."));
  return body as PlatformProjectOut;
}

export async function createPlatformProject(payload: {
  title: string;
  company_name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  tenant_id?: number | null;
  demo_appointment_id?: number | null;
  status?: PlatformProjectStatus;
  priority?: PlatformProjectPriority;
  delivery_deadline?: string | null;
  description?: string | null;
  notes?: string | null;
  use_default_checklist?: boolean;
  initial_tasks?: string[];
}): Promise<PlatformProjectOut> {
  const response = await fetch(apiUrl("/api/v1/platform/projects"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível criar o projeto."));
  return body as PlatformProjectOut;
}

export async function patchPlatformProject(
  id: number,
  payload: Partial<{
    title: string;
    company_name: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    status: PlatformProjectStatus;
    priority: PlatformProjectPriority;
    delivery_deadline: string | null;
    description: string | null;
    notes: string | null;
    progress_percent: number;
  }>,
): Promise<PlatformProjectOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/projects/${id}`), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível atualizar o projeto."));
  return body as PlatformProjectOut;
}

export async function createPlatformProjectTask(
  projectId: number,
  payload: {
    title: string;
    description?: string | null;
    status?: PlatformProjectTaskStatus;
    due_date?: string | null;
    sort_order?: number;
  },
): Promise<PlatformProjectTaskOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/projects/${projectId}/tasks`), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível criar a tarefa."));
  return body as PlatformProjectTaskOut;
}

export async function deletePlatformProjectTask(projectId: number, taskId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/platform/projects/${projectId}/tasks/${taskId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errMessage(body, "Não foi possível excluir a tarefa."));
  }
}

export async function patchPlatformProjectTask(
  projectId: number,
  taskId: number,
  payload: Partial<{
    title: string;
    description: string | null;
    status: PlatformProjectTaskStatus;
    due_date: string | null;
  }>,
): Promise<PlatformProjectTaskOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/projects/${projectId}/tasks/${taskId}`), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível atualizar a tarefa."));
  return body as PlatformProjectTaskOut;
}
