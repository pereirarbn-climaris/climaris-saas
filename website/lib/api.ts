export type LeadPayload = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  job_title?: string;
  technicians_count?: string;
  selected_plan?: string;
  website_url?: string;
  lgpd_consent: boolean;
};

export type LeadResponse = {
  id: number;
  message: string;
};

export type DemoSlot = {
  starts_at: string;
  ends_at: string;
  label: string;
};

export type DemoCalendarDay = {
  date: string;
  status: "available" | "full" | "closed" | "past";
  available_slots: number;
  total_slots: number;
};

export type DemoAppointmentPayload = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  job_title?: string;
  technicians_count?: string;
  selected_plan?: string;
  scheduled_at: string;
  website_url?: string;
  lgpd_consent: boolean;
};

export type DemoAppointmentResponse = {
  id: number;
  scheduled_at: string;
  message: string;
};

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

function friendlyApiError(
  detail: string | null | undefined,
  fallback: string,
): string {
  if (!detail) return fallback;
  const normalized = detail.trim().toLowerCase();
  if (normalized === "not found") {
    return "Serviço de agendamento temporariamente indisponível. Tente novamente em alguns minutos.";
  }
  return detail;
}

export async function submitLead(payload: LeadPayload): Promise<LeadResponse> {
  const response = await fetch(`${apiBase()}/api/v1/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as
    | LeadResponse
    | { detail?: string | { msg?: string }[]; error?: { message?: string } }
    | null;

  if (!response.ok) {
    const detail = data && "detail" in data ? data.detail : null;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail) && detail[0]?.msg) throw new Error(detail[0].msg);
    const apiMsg = data && "error" in data ? data.error?.message : null;
    throw new Error(apiMsg ?? "Não foi possível enviar sua mensagem. Tente novamente.");
  }

  return data as LeadResponse;
}

export async function fetchDemoCalendar(params: {
  year: number;
  month: number;
}): Promise<DemoCalendarDay[]> {
  const qs = new URLSearchParams({
    year: String(params.year),
    month: String(params.month),
  });
  const response = await fetch(`${apiBase()}/api/v1/public/demo-calendar?${qs.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const data = (await response.json().catch(() => null)) as DemoCalendarDay[] | { detail?: string } | null;
  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? data.detail : null;
    throw new Error(
      friendlyApiError(
        typeof detail === "string" ? detail : null,
        "Não foi possível carregar o calendário.",
      ),
    );
  }
  return data as DemoCalendarDay[];
}

export async function fetchDemoSlots(params?: {
  days?: number;
  from?: string;
}): Promise<DemoSlot[]> {
  const qs = new URLSearchParams();
  if (params?.days) qs.set("days", String(params.days));
  if (params?.from) qs.set("from", params.from);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(`${apiBase()}/api/v1/public/demo-slots${suffix}`, {
    headers: { Accept: "application/json" },
  });
  const data = (await response.json().catch(() => null)) as DemoSlot[] | { detail?: string } | null;
  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? data.detail : null;
    throw new Error(
      friendlyApiError(
        typeof detail === "string" ? detail : null,
        "Não foi possível carregar horários.",
      ),
    );
  }
  return data as DemoSlot[];
}

export async function submitDemoAppointment(
  payload: DemoAppointmentPayload,
): Promise<DemoAppointmentResponse> {
  const response = await fetch(`${apiBase()}/api/v1/demo-appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as
    | DemoAppointmentResponse
    | { detail?: string | { msg?: string }[]; error?: { message?: string } }
    | null;

  if (!response.ok) {
    const detail = data && "detail" in data ? data.detail : null;
    if (typeof detail === "string") throw new Error(friendlyApiError(detail, detail));
    if (Array.isArray(detail) && detail[0]?.msg) throw new Error(detail[0].msg);
    const apiMsg = data && "error" in data ? data.error?.message : null;
    throw new Error(
      friendlyApiError(apiMsg, "Não foi possível agendar a demonstração. Tente outro horário."),
    );
  }

  return data as DemoAppointmentResponse;
}
