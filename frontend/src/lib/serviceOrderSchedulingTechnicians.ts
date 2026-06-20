import type { Tecnico } from "../components/v0-ui/service-orders/ServiceOrderFormView";
import { COMPANY_TECHNICIAN_ID, companyTechnicianLabel } from "./serviceOrderCompanyTechnician";

/** Lista de técnicos para agendamento — inclui a empresa quando não há técnicos cadastrados. */
export function buildSchedulingTechnicians(
  tecnicos: Tecnico[],
  companyName?: string | null,
): Tecnico[] {
  if (tecnicos.length > 0) return tecnicos;
  return [
    {
      id: COMPANY_TECHNICIAN_ID,
      nome: companyTechnicianLabel(companyName),
    },
  ];
}
