import { apiUrl } from "../lib/apiUrl";

export type PublicPmocConservationStatus = "ok" | "attention" | "critical" | "pending";
export type PublicPmocTrafficLight = "green" | "yellow" | "red";

export type PublicPmocValidationIndicator = {
  key: string;
  label: string;
  status: PublicPmocTrafficLight;
  summary: string;
  detail?: string | null;
};

export type PublicPmocValidationEquipment = {
  label: string;
  model?: string | null;
  location?: string | null;
  conservation_status: PublicPmocConservationStatus;
  last_inspection_at?: string | null;
};

export type PublicPmocValidationPayload = {
  pmoc_id: number;
  plan_title: string;
  plan_status: string;
  client_name: string;
  establishment_label?: string | null;
  establishment_city?: string | null;
  establishment_state?: string | null;
  responsible_name?: string | null;
  art_number?: string | null;
  art_valid_until?: string | null;
  overall_status: PublicPmocTrafficLight;
  indicators: PublicPmocValidationIndicator[];
  last_maintenance_at?: string | null;
  next_maintenance_expected?: string | null;
  equipments: PublicPmocValidationEquipment[];
  validated_at: string;
  validation_url: string;
};

export async function getPublicPmocValidation(pmocId: number): Promise<PublicPmocValidationPayload> {
  const response = await fetch(apiUrl(`/api/v1/public/pmoc-validation/${pmocId}`));
  const body = await response.text();
  let parsed: unknown = {};
  if (body.trim()) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = {};
    }
  }
  if (!response.ok) {
    const detail =
      typeof parsed === "object" && parsed && "detail" in parsed
        ? String((parsed as { detail?: unknown }).detail)
        : "Não foi possível validar este PMOC.";
    throw new Error(detail);
  }
  return parsed as PublicPmocValidationPayload;
}
