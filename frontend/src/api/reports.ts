import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type TechnicianEfficiencyOut = {
  technician_id: number;
  technician_name: string;
  orders_count: number;
  estimated_minutes: number;
  actual_minutes: number;
  variance_pct: number;
};

export type ServiceEfficiencyOut = {
  service_id: number;
  service_name: string;
  orders_count: number;
  estimated_minutes: number;
  actual_minutes: number;
  variance_pct: number;
};

export type EfficiencyReportOut = {
  by_technician: TechnicianEfficiencyOut[];
  by_service: ServiceEfficiencyOut[];
};

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export async function fetchEfficiencyReport(): Promise<EfficiencyReportOut> {
  const response = await fetch(apiUrl("/api/v1/reports/efficiency"), { headers: bearer() });
  if (!response.ok) {
    throw new Error("Não foi possível carregar o relatório de eficiência.");
  }
  return (await response.json()) as EfficiencyReportOut;
}
