import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import {
  demoCreateServiceOrder,
  demoDeleteServiceOrderProductItem,
  demoDeleteServiceOrderServiceItem,
  demoListServiceOrders,
  demoPatchServiceOrderProductItemQuantity,
  demoPatchServiceOrderServiceItemQuantity,
  demoPostServiceOrderProductItem,
  demoPostServiceOrderServiceItem,
  demoUpdateServiceOrder,
  isDemoMode,
} from "../lib/demoMode";

export type OrderStatus = "open" | "approved" | "scheduled" | "in_progress" | "done" | "cancelled";

export type ServiceOrderOut = {
  id: number;
  tenant_id: number;
  client_id: number;
  title: string;
  description: string | null;
  discount_amount?: number;
  status: OrderStatus;
  stock_consumed_at?: string | null;
  assigned_technician_name?: string | null;
  technician_ids?: number[];
  service_items: Array<{
    id: number;
    service_id: number;
    equipment_id?: number | null;
    quantity: number;
    unit_price: number;
    duration_minutes: number;
    service_name?: string | null;
    periodicidade_meses?: number | null;
  }>;
  product_items: Array<{
    id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
  }>;
  schedule: {
    id: number;
    tenant_id: number;
    client_id: number;
    service_order_id: number | null;
    starts_at: string;
    ends_at: string;
    status: string;
    notes: string | null;
  } | null;
};

export type ServiceOrderCreatePayload = {
  client_id: number;
  title: string;
  description?: string | null;
  technician_ids?: number[];
  services: Array<{ service_id: number; quantity: number; equipment_id?: number | null }>;
  products?: Array<{ product_id: number; quantity: number }>;
  discount_amount?: number;
};

export type EquipmentUsageReportRowOut = {
  equipment_id: number;
  identificacao: string;
  tipo: string;
  total_servicos: number;
};

export type TechnicianAvailabilityOut = {
  technician_id: number;
  full_name: string;
  busy_slots: number;
  is_available: boolean;
};

export type TechnicianDayAvailabilityOut = {
  day: string;
  technicians: TechnicianAvailabilityOut[];
};

export type SuggestedSlotOut = {
  technician_id: number;
  starts_at: string;
  ends_at: string;
  shift?: "morning" | "afternoon" | null;
};

export type RescheduleOptionOut = {
  technician_id?: number | null;
  starts_at: string;
  ends_at: string;
  status: "integral" | "fracionado";
  note: string;
  continuation_starts_at?: string | null;
  continuation_ends_at?: string | null;
};

export type ScheduleOut = {
  id: number;
  tenant_id: number;
  client_id: number;
  client_name?: string | null;
  client_phone?: string | null;
  client_whatsapp?: string | null;
  client_address?: string | null;
  service_order_id: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
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

function errorMessage(body: unknown, fallback: string, status: number): string {
  if (body && typeof body === "object") {
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
    if (typeof o.detail === "string" && o.detail) return o.detail;
    if (Array.isArray(o.detail)) {
      const parts = o.detail.map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      });
      if (parts.length > 0) return parts.join("; ");
    }
  }
  if (status === 404) return "Registro não encontrado.";
  if (status === 409) return "Conflito de agenda para o agendamento informado.";
  return `${fallback} (HTTP ${status}).`;
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

export async function getServiceOrder(
  orderId: number,
  opts?: { bustCache?: boolean },
): Promise<ServiceOrderOut> {
  if (isDemoMode()) {
    const row = demoListServiceOrders().find((item) => item.id === orderId);
    if (!row) throw new Error("OS não encontrada.");
    return Promise.resolve(row);
  }
  const suffix = opts?.bustCache ? `?_=${Date.now()}` : "";
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar a OS.", response.status));
  }
  return body as ServiceOrderOut;
}

export async function patchServiceOrderStatus(
  orderId: number,
  status: "in_progress" | "done" | "cancelled",
  opts?: { schedule_notes?: string | null },
) {
  if (isDemoMode()) {
    return Promise.resolve(demoUpdateServiceOrder(orderId, { status, schedule: null }));
  }
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ status, schedule_notes: opts?.schedule_notes ?? undefined }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível atualizar o status da OS.", response.status));
  }
  return body as ServiceOrderOut;
}

export async function listServiceOrders(params?: { status?: OrderStatus; skip?: number; limit?: number }): Promise<ServiceOrderOut[]> {
  const skip = params?.skip ?? 0;
  const limit = params?.limit ?? 100;
  if (isDemoMode()) {
    let rows = demoListServiceOrders();
    if (params?.status) rows = rows.filter((o) => o.status === params.status);
    return Promise.resolve(rows.slice(skip, skip + limit));
  }
  const sp = new URLSearchParams();
  sp.set("skip", String(skip));
  sp.set("limit", String(limit));
  if (params?.status) sp.set("status", params.status);

  const response = await fetch(apiUrl(`/api/v1/service-orders?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar as OS.", response.status));
  }
  return body as ServiceOrderOut[];
}

export async function patchServiceOrderDiscount(orderId: number, discount_amount: number): Promise<ServiceOrderOut> {
  if (isDemoMode()) return Promise.resolve(demoUpdateServiceOrder(orderId, { discount_amount }));
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/discount`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ discount_amount }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar o desconto.", response.status));
  }
  return body as ServiceOrderOut;
}

export async function createServiceOrder(payload: ServiceOrderCreatePayload) {
  if (isDemoMode()) return Promise.resolve(demoCreateServiceOrder(payload));
  const response = await fetch(apiUrl("/api/v1/service-orders"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível criar a OS.", response.status));
  }
  return body as { id: number; status: OrderStatus };
}

export async function updateServiceOrderItemEquipment(
  orderId: number,
  serviceItemId: number,
  equipmentId: number | null,
): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/service-items/${serviceItemId}/equipment`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ equipment_id: equipmentId }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível atualizar o equipamento do serviço.", response.status));
  }
  return body as ServiceOrderOut;
}

/** Divide um item com quantidade > 1 em várias linhas com quantidade 1 (um equipamento por linha). */
export async function splitServiceOrderServiceItem(
  orderId: number,
  serviceItemId: number,
): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/service-items/${serviceItemId}/split`), {
    method: "POST",
    headers: jsonHeaders(),
    body: "{}",
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível fracionar o serviço na OS.", response.status));
  }
  return body as ServiceOrderOut;
}

export async function postServiceOrderServiceItem(
  orderId: number,
  body: { service_id: number; quantity?: number; equipment_id?: number | null },
): Promise<ServiceOrderOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoPostServiceOrderServiceItem(orderId, { service_id: body.service_id, quantity: body.quantity ?? 1 }));
  }
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/service-items`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      service_id: body.service_id,
      quantity: body.quantity ?? 1,
      equipment_id: body.equipment_id,
    }),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível adicionar o serviço à OS.", response.status));
  }
  return parsed as ServiceOrderOut;
}

export async function patchServiceOrderServiceItemQuantity(
  orderId: number,
  serviceItemId: number,
  quantity: number,
): Promise<ServiceOrderOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoPatchServiceOrderServiceItemQuantity(orderId, serviceItemId, quantity));
  }
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/service-items/${serviceItemId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ quantity }),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível atualizar a quantidade do serviço.", response.status));
  }
  return parsed as ServiceOrderOut;
}

export async function deleteServiceOrderServiceItem(orderId: number, serviceItemId: number): Promise<ServiceOrderOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoDeleteServiceOrderServiceItem(orderId, serviceItemId));
  }
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/service-items/${serviceItemId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível remover o serviço da OS.", response.status));
  }
  return parsed as ServiceOrderOut;
}

export async function postServiceOrderProductItem(
  orderId: number,
  body: { product_id: number; quantity?: number },
): Promise<ServiceOrderOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoPostServiceOrderProductItem(orderId, { product_id: body.product_id, quantity: body.quantity ?? 1 }));
  }
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/product-items`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ product_id: body.product_id, quantity: body.quantity ?? 1 }),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível adicionar o produto à OS.", response.status));
  }
  return parsed as ServiceOrderOut;
}

export async function patchServiceOrderProductItemQuantity(
  orderId: number,
  productItemId: number,
  quantity: number,
): Promise<ServiceOrderOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoPatchServiceOrderProductItemQuantity(orderId, productItemId, quantity));
  }
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/product-items/${productItemId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ quantity }),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível atualizar a quantidade do produto.", response.status));
  }
  return parsed as ServiceOrderOut;
}

export async function deleteServiceOrderProductItem(orderId: number, productItemId: number): Promise<ServiceOrderOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoDeleteServiceOrderProductItem(orderId, productItemId));
  }
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/product-items/${productItemId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível remover o produto da OS.", response.status));
  }
  return parsed as ServiceOrderOut;
}

export async function getEquipmentUsageReport(clientId?: number): Promise<EquipmentUsageReportRowOut[]> {
  const sp = new URLSearchParams();
  if (clientId) sp.set("client_id", String(clientId));
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/service-orders/reports/equipment-usage${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar relatório de equipamentos.", response.status));
  }
  return body as EquipmentUsageReportRowOut[];
}

export async function approveServiceOrder(
  orderId: number,
  payload: { starts_at: string; notes?: string; technician_ids?: number[]; allow_overtime?: boolean; split_days?: number },
) {
  if (isDemoMode()) {
    const updated = demoUpdateServiceOrder(orderId, {
      status: "approved",
      schedule: {
        id: orderId + 1000,
        tenant_id: 1,
        client_id: 1,
        service_order_id: orderId,
        starts_at: payload.starts_at,
        ends_at: new Date(Date.parse(payload.starts_at) + 60 * 60 * 1000).toISOString(),
        status: "confirmed",
        notes: payload.notes ?? null,
      },
    });
    return Promise.resolve({
      service_order_id: orderId,
      schedule_id: updated.schedule?.id ?? orderId + 1000,
      duration_minutes: 60,
    });
  }
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/approve`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível aprovar e agendar a OS.", response.status));
  }
  return body as { service_order_id: number; schedule_id: number; schedule_ids?: number[]; duration_minutes: number; split_days?: number };
}

export async function getTechniciansAvailability(day: string): Promise<TechnicianDayAvailabilityOut> {
  const sp = new URLSearchParams();
  sp.set("day", day);
  const response = await fetch(apiUrl(`/api/v1/technicians/availability?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar disponibilidade dos técnicos.", response.status));
  }
  return body as TechnicianDayAvailabilityOut;
}

export async function getTechnicianNextSlots(params: {
  service_order_id: number;
  from_at: string;
  technician_id?: number;
  limit?: number;
  allow_overtime?: boolean;
  split_days?: number;
}): Promise<SuggestedSlotOut[]> {
  const sp = new URLSearchParams();
  sp.set("service_order_id", String(params.service_order_id));
  sp.set("from_at", params.from_at);
  sp.set("limit", String(params.limit ?? 4));
  if (params.technician_id) sp.set("technician_id", String(params.technician_id));
  if (params.allow_overtime) sp.set("allow_overtime", "true");
  if (params.split_days && params.split_days > 1) sp.set("split_days", String(params.split_days));

  const response = await fetch(apiUrl(`/api/v1/technicians/next-slots?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível sugerir os próximos horários.", response.status));
  }
  return body as SuggestedSlotOut[];
}

export async function listSchedules(params?: {
  status?: string;
  technician_id?: number;
  skip?: number;
  limit?: number;
  /** YYYY-MM-DD inclusive (tenant local day) */
  from_day?: string;
  /** YYYY-MM-DD inclusive (tenant local day) */
  to_day?: string;
}): Promise<ScheduleOut[]> {
  if (isDemoMode()) {
    let rows: ScheduleOut[] = demoListServiceOrders()
      .filter((item) => item.schedule)
      .map((item) => item.schedule as ScheduleOut);
    if (params?.status) rows = rows.filter((row: ScheduleOut) => row.status === params.status);
    return Promise.resolve(rows);
  }
  const sp = new URLSearchParams();
  sp.set("skip", String(params?.skip ?? 0));
  sp.set("limit", String(params?.limit ?? 100));
  if (params?.status) sp.set("status", params.status);
  if (params?.technician_id) sp.set("technician_id", String(params.technician_id));
  if (params?.from_day) sp.set("from_day", params.from_day);
  if (params?.to_day) sp.set("to_day", params.to_day);
  const response = await fetch(apiUrl(`/api/v1/schedules?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar agendamentos.", response.status));
  }
  return body as ScheduleOut[];
}

export async function rescheduleSchedule(
  scheduleId: number,
  payload: { starts_at: string; notes?: string; technician_ids?: number[] },
): Promise<ScheduleOut> {
  const response = await fetch(apiUrl(`/api/v1/schedules/${scheduleId}/reschedule`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível remarcar o agendamento.", response.status));
  }
  return body as ScheduleOut;
}

export async function getRescheduleOptions(scheduleId: number, params?: { from_day?: string }): Promise<RescheduleOptionOut[]> {
  const sp = new URLSearchParams();
  if (params?.from_day) sp.set("from_day", params.from_day);
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/schedules/${scheduleId}/reschedule-options${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar opções de remarcação.", response.status));
  }
  return body as RescheduleOptionOut[];
}

export async function cancelSchedule(scheduleId: number, payload?: { reason?: string }): Promise<ScheduleOut> {
  const response = await fetch(apiUrl(`/api/v1/schedules/${scheduleId}/cancel`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload ?? {}),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível cancelar o agendamento.", response.status));
  }
  return body as ScheduleOut;
}
