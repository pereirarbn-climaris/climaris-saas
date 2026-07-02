import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type DemoAppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type DemoCalendarDay = {
  date: string;
  status: "available" | "full" | "closed" | "past";
  available_slots: number;
  total_slots: number;
};

export type DemoScheduleBlockOut = {
  id: number;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
};

export type DemoAppointmentOut = {
  id: number;
  website_lead_id: number | null;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  technicians_count: string | null;
  selected_plan: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: DemoAppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

export async function fetchDemoCalendarMonth(year: number, month: number): Promise<DemoCalendarDay[]> {
  const qs = new URLSearchParams({ year: String(year), month: String(month) });
  const response = await fetch(apiUrl(`/api/v1/platform/demo-appointments/calendar?${qs.toString()}`), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar o calendário."));
  return body as DemoCalendarDay[];
}

export async function listDemoScheduleBlocks(params?: {
  from?: string;
  to?: string;
}): Promise<DemoScheduleBlockOut[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/platform/demo-appointments/blocks${suffix}`), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar bloqueios."));
  return body as DemoScheduleBlockOut[];
}

export async function createDemoScheduleBlock(payload: {
  starts_at: string;
  ends_at: string;
  reason?: string | null;
}): Promise<DemoScheduleBlockOut> {
  const response = await fetch(apiUrl("/api/v1/platform/demo-appointments/blocks"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível bloquear o horário."));
  return body as DemoScheduleBlockOut;
}

export async function deleteDemoScheduleBlock(blockId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/platform/demo-appointments/blocks/${blockId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errMessage(body, "Não foi possível remover o bloqueio."));
  }
}

export async function listDemoAppointments(params?: {
  from?: string;
  to?: string;
  status?: DemoAppointmentStatus;
  limit?: number;
}): Promise<DemoAppointmentOut[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.status) qs.set("status", params.status);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/platform/demo-appointments${suffix}`), {
    headers: authHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível carregar a agenda."));
  return body as DemoAppointmentOut[];
}

export async function patchDemoAppointment(
  id: number,
  payload: Partial<{
    status: DemoAppointmentStatus;
    notes: string | null;
    scheduled_at: string;
    notify_whatsapp: boolean;
  }>,
): Promise<DemoAppointmentOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/demo-appointments/${id}`), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMessage(body, "Não foi possível atualizar a demonstração."));
  return body as DemoAppointmentOut;
}

export const DEMO_STATUS_LABELS: Record<DemoAppointmentStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};
