import { apiUrl } from "../lib/apiUrl";

export type PublicEquipmentTechnicalSpec = {
  key: string;
  label: string;
  value: string;
};

export type PublicEquipmentHistoryEntry = {
  occurred_at: string;
  kind: string;
  title: string;
  detail: string | null;
};

export type PublicEquipmentPagePayload = {
  equipment_id?: number | null;
  client_id?: number | null;
  qrcode_code_id?: string | null;
  tenant_name: string;
  tenant_cnpj?: string | null;
  tenant_phone?: string | null;
  tenant_email?: string | null;
  tenant_address?: string | null;
  tenant_city?: string | null;
  tenant_state?: string | null;
  tenant_website?: string | null;
  tenant_logo_url?: string | null;
  identificacao: string;
  tipo: string;
  modelo: string | null;
  fabricante: string | null;
  category_name: string | null;
  serial: string | null;
  is_active: boolean;
  equipment_status_label?: string | null;
  technical_specs: PublicEquipmentTechnicalSpec[];
  entries: PublicEquipmentHistoryEntry[];
};

export async function getPublicEquipmentPage(token: string): Promise<PublicEquipmentPagePayload> {
  const response = await fetch(apiUrl(`/api/v1/public/equipment/${encodeURIComponent(token)}`));
  const text = await response.text();
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = {};
    }
  }
  if (!response.ok) {
    let detail = "Etiqueta não encontrada ou inválida.";
    if (body && typeof body === "object") {
      const o = body as { detail?: unknown };
      if (typeof o.detail === "string" && o.detail.trim()) detail = o.detail;
    }
    throw new Error(detail);
  }
  return body as PublicEquipmentPagePayload;
}
