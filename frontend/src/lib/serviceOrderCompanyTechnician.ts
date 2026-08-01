/** ID virtual no formulário quando a OS usa o expediente da empresa (sem técnico cadastrado). */
export const COMPANY_TECHNICIAN_ID = "company";

/** Valor enviado à API (`technician_id` / `technician_ids`). */
export const COMPANY_TECHNICIAN_API_ID = 0;

export function isCompanyTechnicianId(id: string | null | undefined): boolean {
  return id === COMPANY_TECHNICIAN_ID;
}

export function technicianIdToApi(id: string | null | undefined): number | undefined {
  if (!id) return undefined;
  if (isCompanyTechnicianId(id)) return COMPANY_TECHNICIAN_API_ID;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** IDs para create/approve/reschedule na API. */
export function technicianIdsForApi(id: string | null | undefined): number[] | undefined {
  const apiId = technicianIdToApi(id);
  if (apiId === undefined) return undefined;
  return [apiId];
}

export function technicianIdFromApi(ids: number[] | null | undefined, hasSchedule: boolean): string {
  if (ids?.length && ids[0] > 0) return String(ids[0]);
  if (hasSchedule) return COMPANY_TECHNICIAN_ID;
  return "";
}

function normalizeTechnicianIdsForCompare(ids: number[] | undefined): number[] {
  return ids?.length ? [...ids].sort((a, b) => a - b) : [];
}

/** Indica se o técnico do formulário difere do agendamento salvo na API. */
export function scheduleTechniciansChanged(
  currentIds: number[] | null | undefined,
  tecnicoId: string | null | undefined,
  hasSchedule: boolean,
): boolean {
  const desired = normalizeTechnicianIdsForCompare(technicianIdsForApi(tecnicoId));
  const current = normalizeTechnicianIdsForCompare(
    technicianIdsForApi(technicianIdFromApi(currentIds, hasSchedule)),
  );
  if (desired.length !== current.length) return true;
  return desired.some((id, index) => id !== current[index]);
}

export function companyTechnicianLabel(companyName?: string | null): string {
  const name = (companyName ?? "").trim() || "Empresa";
  return `${name} (expediente da empresa)`;
}
