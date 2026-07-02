const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export type LeadPayload = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
  website_url?: string;
};

export type LeadResponse = {
  id: number;
  message: string;
};

function leadsUrl(): string {
  return `${API_BASE}/api/v1/leads`;
}

export async function submitLead(payload: LeadPayload): Promise<LeadResponse> {
  const response = await fetch(leadsUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
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
