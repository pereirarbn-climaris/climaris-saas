import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import {
  demoCreateUnavailability,
  demoDeleteUnavailability,
  demoListTenantHolidays,
  demoListUnavailability,
  demoPatchUnavailability,
  isDemoMode,
} from "../lib/demoMode";

export type WorkWindow = {
  id: number;
  tenant_id: number;
  technician_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type BreakWindow = {
  id: number;
  tenant_id: number;
  technician_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type Unavailability = {
  id: number;
  tenant_id: number;
  technician_id: number;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

export type TenantHoliday = {
  id: number;
  tenant_id: number;
  holiday_date: string;
  description: string | null;
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
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
    if (typeof o.detail === "string" && o.detail) return o.detail;
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

export async function listWorkWindows(technician_id: number): Promise<WorkWindow[]> {
  const sp = new URLSearchParams({ technician_id: String(technician_id), limit: "100" });
  const response = await fetch(apiUrl(`/api/v1/technicians/work-windows?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar jornadas."));
  return body as WorkWindow[];
}

export async function createWorkWindow(payload: {
  technician_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
}): Promise<WorkWindow> {
  const response = await fetch(apiUrl("/api/v1/technicians/work-windows"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar jornada."));
  return body as WorkWindow;
}

export async function updateWorkWindow(
  id: number,
  payload: { weekday: number; start_time: string; end_time: string },
): Promise<WorkWindow> {
  const response = await fetch(apiUrl(`/api/v1/technicians/work-windows/${id}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível atualizar jornada."));
  return body as WorkWindow;
}

export async function deleteWorkWindow(id: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/technicians/work-windows/${id}`), { method: "DELETE", headers: bearer() });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir jornada."));
}

export async function listBreakWindows(technician_id: number): Promise<BreakWindow[]> {
  const sp = new URLSearchParams({ technician_id: String(technician_id), limit: "100" });
  const response = await fetch(apiUrl(`/api/v1/technicians/break-windows?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar horários de pausa."));
  return body as BreakWindow[];
}

export async function createBreakWindow(payload: {
  technician_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
}): Promise<BreakWindow> {
  const response = await fetch(apiUrl("/api/v1/technicians/break-windows"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar pausa."));
  return body as BreakWindow;
}

export async function updateBreakWindow(
  id: number,
  payload: { weekday: number; start_time: string; end_time: string },
): Promise<BreakWindow> {
  const response = await fetch(apiUrl(`/api/v1/technicians/break-windows/${id}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível atualizar pausa."));
  return body as BreakWindow;
}

export async function deleteBreakWindow(id: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/technicians/break-windows/${id}`), { method: "DELETE", headers: bearer() });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir pausa."));
}

export async function listUnavailability(
  technician_id: number,
  params?: { from_at?: string; to_at?: string; limit?: number },
): Promise<Unavailability[]> {
  if (isDemoMode()) {
    return Promise.resolve(demoListUnavailability().filter((item: Unavailability) => item.technician_id === technician_id));
  }
  const sp = new URLSearchParams({
    technician_id: String(technician_id),
    limit: String(params?.limit ?? 100),
  });
  if (params?.from_at) sp.set("from_at", params.from_at);
  if (params?.to_at) sp.set("to_at", params.to_at);
  const response = await fetch(apiUrl(`/api/v1/technicians/unavailability?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar indisponibilidades."));
  return body as Unavailability[];
}

export async function createUnavailability(payload: {
  technician_id: number;
  starts_at: string;
  ends_at: string;
  reason?: string;
}): Promise<Unavailability> {
  if (isDemoMode()) return Promise.resolve(demoCreateUnavailability({ ...payload, reason: payload.reason ?? null }));
  const response = await fetch(apiUrl("/api/v1/technicians/unavailability"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar indisponibilidade."));
  return body as Unavailability;
}

export async function updateUnavailability(
  id: number,
  payload: { starts_at: string; ends_at: string; reason?: string },
): Promise<Unavailability> {
  if (isDemoMode()) return Promise.resolve(demoPatchUnavailability(id, payload));
  const response = await fetch(apiUrl(`/api/v1/technicians/unavailability/${id}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível atualizar indisponibilidade."));
  return body as Unavailability;
}

export async function deleteUnavailability(id: number): Promise<void> {
  if (isDemoMode()) {
    demoDeleteUnavailability(id);
    return Promise.resolve();
  }
  const response = await fetch(apiUrl(`/api/v1/technicians/unavailability/${id}`), { method: "DELETE", headers: bearer() });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir indisponibilidade."));
}

export async function listTenantHolidays(params?: { skip?: number; limit?: number }): Promise<TenantHoliday[]> {
  if (isDemoMode()) return Promise.resolve(demoListTenantHolidays());
  const sp = new URLSearchParams({
    skip: String(params?.skip ?? 0),
    limit: String(params?.limit ?? 100),
  });
  const response = await fetch(apiUrl(`/api/v1/tenant-holidays?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar feriados da empresa."));
  return body as TenantHoliday[];
}
