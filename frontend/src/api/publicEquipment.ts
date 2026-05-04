import { apiUrl } from "../lib/apiUrl";

export type PublicEquipmentHistoryEntry = {
  occurred_at: string;
  kind: string;
  title: string;
  detail: string | null;
};

export type PublicEquipmentPagePayload = {
  tenant_name: string;
  identificacao: string;
  tipo: string;
  modelo: string | null;
  fabricante: string | null;
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
    throw new Error("Não foi possível carregar a ficha pública deste equipamento.");
  }
  return body as PublicEquipmentPagePayload;
}
