import { apiUrl } from "../lib/apiUrl";
import { clampApiLimit } from "../lib/apiPagination";
import { getAccessToken } from "../lib/authStorage";
import { normalizeServiceOrderOut } from "../lib/serviceOrderNormalize";
import type { OrderStatus, ServiceOrderCreatePayload, ServiceOrderMissingRequirement, ServiceOrderOut } from "../types/serviceOrders";

export type {
  OrderStatus,
  ServiceOrderCreatePayload,
  ServiceOrderEquipmentCardOut,
  ServiceOrderEquipmentServiceOut,
  ServiceOrderMissingRequirement,
  ServiceOrderOut,
  ServiceOrderProductItemOut,
  ServiceOrderScheduleOut,
} from "../types/serviceOrders";

export { normalizeServiceOrderOut } from "../lib/serviceOrderNormalize";

export class ServiceOrderComplianceBlockedError extends Error {
  readonly code = "compliance_blocked" as const;
  readonly missingRequirements: ServiceOrderMissingRequirement[];
  readonly digitalWorkOrderId: string | null;

  constructor(params: {
    message: string;
    missingRequirements: ServiceOrderMissingRequirement[];
    digitalWorkOrderId?: string | null;
  }) {
    super(params.message);
    this.name = "ServiceOrderComplianceBlockedError";
    this.missingRequirements = params.missingRequirements;
    this.digitalWorkOrderId = params.digitalWorkOrderId ?? null;
  }
}

export function isServiceOrderComplianceBlockedError(
  error: unknown,
): error is ServiceOrderComplianceBlockedError {
  return error instanceof ServiceOrderComplianceBlockedError;
}

function parseComplianceBlockedError(body: unknown): ServiceOrderComplianceBlockedError | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") return null;

  const payload = detail as Record<string, unknown>;
  if (payload.code !== "compliance_blocked") return null;

  const missingRequirements: ServiceOrderMissingRequirement[] = (Array.isArray(payload.missing_requirements)
    ? payload.missing_requirements
    : []
  )
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      code: String(item.code ?? ""),
      message: String(item.message ?? ""),
      field: item.field != null ? String(item.field) : null,
      blocking: item.blocking !== false,
    }));

  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message
      : missingRequirements
          .map((item) => item.message)
          .filter(Boolean)
          .join("; ") || "Não é possível concluir a OS: requisitos de compliance incompletos.";

  return new ServiceOrderComplianceBlockedError({
    message,
    missingRequirements,
    digitalWorkOrderId:
      typeof payload.digital_work_order_id === "string" ? payload.digital_work_order_id : null,
  });
}

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
  technician_name?: string | null;
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
    const o = body as { error?: { message?: string; details?: unknown }; detail?: unknown };
    const detailsList = o.error?.details;
    if (Array.isArray(detailsList) && detailsList.length > 0) {
      const parts = detailsList.map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      });
      const joined = parts.filter(Boolean).join("; ");
      if (joined) return joined;
    }
    if (typeof o.error?.message === "string" && o.error.message && o.error.message !== "Validation error.") {
      return o.error.message;
    }
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
  const suffix = opts?.bustCache ? `?_=${Date.now()}` : "";
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar a OS.", response.status));
  }
  return normalizeServiceOrderOut(body as ServiceOrderOut);
}

export async function fetchServiceOrderPdf(orderId: number): Promise<Blob> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/pdf`), { headers: bearer() });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errorMessage(body, "Não foi possível gerar o PDF da OS.", response.status));
  }
  return response.blob();
}

export async function cancelServiceOrderSchedule(orderId: number): Promise<ServiceOrderOut> {

  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/cancel-schedule`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível cancelar o agendamento.", response.status));
  }
  return normalizeServiceOrderOut(body as ServiceOrderOut);
}

export async function patchServiceOrderStatus(
  orderId: number,
  status: "in_progress" | "done" | "cancelled",
  opts?: {
    schedule_notes?: string | null;
    cancel_reason?: string | null;
    force_close?: boolean;
  },
) {

  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({
      status,
      schedule_notes: opts?.schedule_notes ?? undefined,
      cancel_reason: opts?.cancel_reason?.trim() || undefined,
      force_close: opts?.force_close === true ? true : undefined,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    if (response.status === 422) {
      const complianceError = parseComplianceBlockedError(body);
      if (complianceError) throw complianceError;
    }
    throw new Error(errorMessage(body, "Não foi possível atualizar o status da OS.", response.status));
  }
  return normalizeServiceOrderOut(body as ServiceOrderOut);
}

export async function listServiceOrders(params?: { status?: OrderStatus; skip?: number; limit?: number }): Promise<ServiceOrderOut[]> {
  const skip = params?.skip ?? 0;
  const limit = clampApiLimit(params?.limit, 100);
  const sp = new URLSearchParams();
  sp.set("skip", String(skip));
  sp.set("limit", String(limit));
  if (params?.status) sp.set("status", params.status);

  const response = await fetch(apiUrl(`/api/v1/service-orders?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar as OS.", response.status));
  }
  return (body as ServiceOrderOut[]).map(normalizeServiceOrderOut);
}

/** Lista todas as OS do tenant (várias requisições se necessário; máx. 200 por página na API). */
export async function listServiceOrdersAll(params?: { status?: OrderStatus }): Promise<ServiceOrderOut[]> {

  const PAGE = 200;
  const MAX_PAGES = 500;
  const all: ServiceOrderOut[] = [];
  for (let skip = 0, i = 0; i < MAX_PAGES; skip += PAGE, i += 1) {
    const page = await listServiceOrders({ ...params, skip, limit: PAGE });
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

export async function patchServiceOrderDetails(
  orderId: number,
  payload: { title?: string; description?: string | null },
): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/details`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar os dados da OS.", response.status));
  }
  return normalizeServiceOrderOut(body as ServiceOrderOut);
}

export type ServiceOrderLaudoPatch = ReturnType<typeof import("../lib/serviceOrderFormViewAdapter").buildLaudoPatchPayload>;

export async function patchServiceOrderLaudo(
  orderId: number,
  payload: ServiceOrderLaudoPatch,
): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/laudo`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar o laudo.", response.status));
  }
  return normalizeServiceOrderOut(body as ServiceOrderOut);
}

export async function fetchServiceOrderLaudoPdf(orderId: number): Promise<Blob> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/laudo/pdf`), { headers: bearer() });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errorMessage(body, "Não foi possível gerar o laudo em PDF.", response.status));
  }
  return response.blob();
}

export async function patchServiceOrderDiscount(orderId: number, discount_amount: number): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/discount`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ discount_amount }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar o desconto.", response.status));
  }
  return normalizeServiceOrderOut(body as ServiceOrderOut);
}

export async function createServiceOrder(payload: ServiceOrderCreatePayload) {

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
  equipmentIds: number[],
): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/service-items/${serviceItemId}/equipment`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ equipment_ids: equipmentIds }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível atualizar o equipamento do serviço.", response.status));
  }
  return normalizeServiceOrderOut(body as ServiceOrderOut);
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
  return normalizeServiceOrderOut(body as ServiceOrderOut);
}

export async function postServiceOrderServiceItem(
  orderId: number,
  body: {
    service_id: number;
    quantity?: number;
    equipment_id?: number | null;
    unit_price?: number;
  },
): Promise<ServiceOrderOut> {

  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/service-items`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      service_id: body.service_id,
      quantity: body.quantity ?? 1,
      equipment_id: body.equipment_id,
      unit_price: body.unit_price,
    }),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível adicionar o serviço à OS.", response.status));
  }
  return normalizeServiceOrderOut(parsed as ServiceOrderOut);
}

export async function patchServiceOrderServiceItemQuantity(
  orderId: number,
  serviceItemId: number,
  quantity: number,
  unit_price?: number,
): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/service-items/${serviceItemId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ quantity, unit_price }),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível atualizar o serviço na OS.", response.status));
  }
  return normalizeServiceOrderOut(parsed as ServiceOrderOut);
}

export async function deleteServiceOrderServiceItem(orderId: number, serviceItemId: number): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/service-items/${serviceItemId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível remover o serviço da OS.", response.status));
  }
  return normalizeServiceOrderOut(parsed as ServiceOrderOut);
}

export async function postServiceOrderProductItem(
  orderId: number,
  body: { product_id: number; quantity?: number; unit_price?: number },
): Promise<ServiceOrderOut> {

  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/product-items`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      product_id: body.product_id,
      quantity: body.quantity ?? 1,
      unit_price: body.unit_price,
    }),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível adicionar o produto à OS.", response.status));
  }
  return normalizeServiceOrderOut(parsed as ServiceOrderOut);
}

export async function patchServiceOrderProductItemQuantity(
  orderId: number,
  productItemId: number,
  quantity: number,
  unit_price?: number,
): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/product-items/${productItemId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ quantity, unit_price }),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível atualizar o produto na OS.", response.status));
  }
  return normalizeServiceOrderOut(parsed as ServiceOrderOut);
}

export async function deleteServiceOrderProductItem(orderId: number, productItemId: number): Promise<ServiceOrderOut> {
  const response = await fetch(apiUrl(`/api/v1/service-orders/${orderId}/product-items/${productItemId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(parsed, "Não foi possível remover o produto da OS.", response.status));
  }
  return normalizeServiceOrderOut(parsed as ServiceOrderOut);
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
  service_order_id?: number;
  duration_minutes?: number;
  from_at: string;
  technician_id?: number;
  limit?: number;
  allow_overtime?: boolean;
  split_days?: number;
}): Promise<SuggestedSlotOut[]> {
  const sp = new URLSearchParams();
  sp.set("from_at", params.from_at);
  sp.set("limit", String(params.limit ?? 4));
  if (params.service_order_id != null && params.service_order_id > 0) {
    sp.set("service_order_id", String(params.service_order_id));
  }
  if (params.duration_minutes != null && params.duration_minutes > 0) {
    sp.set("duration_minutes", String(params.duration_minutes));
  }
  if (params.technician_id != null) sp.set("technician_id", String(params.technician_id));
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
  const sp = new URLSearchParams();
  sp.set("skip", String(params?.skip ?? 0));
  sp.set("limit", String(clampApiLimit(params?.limit, 100)));
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
