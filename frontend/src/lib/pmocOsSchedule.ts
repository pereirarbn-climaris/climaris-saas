import type { PmocEstimatedTimeOut, PmocScheduledActivityOut } from "../api/pmoc";
import type { ServiceOut } from "../api/services";
import type { ChecklistItem, ServiceLineDraft } from "../components/v0-ui/service-orders/ServiceOrderFormView";
import { equipmentLocationLabelFromRow } from "./equipmentLocation";
import { formatDurationMinutes } from "./formatDuration";

export function addMinutesToTimeString(time: string, minutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return "";
  const base = Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
  if (!Number.isFinite(base)) return "";
  const normalized = ((base + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const min = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function monthYearFromDateString(date: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(date.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export type PmocFrequency = PmocScheduledActivityOut["frequency"];

export function activityDueInMonth(frequency: PmocFrequency, month: number): boolean {
  if (frequency === "monthly") return true;
  if (frequency === "quarterly") return month === 1 || month === 4 || month === 7 || month === 10;
  if (frequency === "semiannual") return month === 1 || month === 7;
  if (frequency === "annual") return month === 1;
  return true;
}

export type PmocEquipmentActivityCell = {
  equipmentId: number;
  equipmentLabel: string;
  activityId: number;
  activityTitle: string;
  serviceId: number;
  serviceName: string;
};

export type PmocEquipmentActivitySummary = {
  equipmentId: number;
  equipmentLabel: string;
  services: string[];
};

export type PmocPlanningScheduleSelection = {
  period: { year: number; month: number };
  tasks: Array<{
    equipmentId: number;
    activityId: number;
    equipmentName: string;
    activityTitle: string;
    estimatedMinutes: number;
  }>;
};

export function buildPmocEquipmentActivityMatrixFromSelection(params: {
  tasks: PmocPlanningScheduleSelection["tasks"];
  equipments: Array<{
    equipment_id: number;
    identificacao?: string | null;
    local_instalacao?: string | null;
    installation_reference?: string | null;
  }>;
  activities: PmocScheduledActivityOut[];
  catalog: ServiceOut[];
}): PmocEquipmentActivityCell[] {
  const { tasks, equipments, activities, catalog } = params;
  const catalogById = new Map(catalog.map((s) => [s.id, s]));
  const actMap = new Map(activities.map((a) => [a.id, a]));
  const cells: PmocEquipmentActivityCell[] = [];

  for (const task of tasks) {
    const act = actMap.get(task.activityId);
    const serviceId = act?.service_id;
    if (!serviceId) continue;
    const svc = catalogById.get(serviceId);
    const equipmentLabel =
      equipmentLocationLabelFromRow(task.equipmentId, equipments) || task.equipmentName;
    cells.push({
      equipmentId: task.equipmentId,
      equipmentLabel,
      activityId: task.activityId,
      activityTitle: task.activityTitle,
      serviceId,
      serviceName: svc?.name ?? act?.title ?? task.activityTitle,
    });
  }

  return cells;
}

export function buildPmocEstimateFromActivityMatrix(
  cells: PmocEquipmentActivityCell[],
  catalog: ServiceOut[],
  period: { year: number; month: number },
): PmocEstimatedTimeOut {
  const catalogById = new Map(catalog.map((s) => [s.id, s]));
  const breakdownMap = new Map<
    number,
    {
      activity_id: number;
      title: string;
      service_name: string | null;
      minutes_per_unit: number;
      occurrences: number;
      total_minutes: number;
    }
  >();

  for (const cell of cells) {
    const svc = catalogById.get(cell.serviceId);
    const minutes = Number(svc?.duration_minutes) || 0;
    const existing = breakdownMap.get(cell.activityId);
    if (existing) {
      existing.occurrences += 1;
      existing.total_minutes += minutes;
    } else {
      breakdownMap.set(cell.activityId, {
        activity_id: cell.activityId,
        title: cell.activityTitle,
        service_name: cell.serviceName,
        minutes_per_unit: minutes,
        occurrences: 1,
        total_minutes: minutes,
      });
    }
  }

  const breakdown = [...breakdownMap.values()];
  return {
    total_minutes: breakdown.reduce((sum, line) => sum + line.total_minutes, 0),
    equipment_count: new Set(cells.map((c) => c.equipmentId)).size,
    activities_in_period: cells.length,
    period_year: period.year,
    period_month: period.month,
    breakdown,
  };
}

/** Cruza equipamentos selecionados com atividades globais ou específicas do cronograma. */
export function buildPmocEquipmentActivityMatrix(params: {
  selectedEquipmentIds: number[];
  equipments: Array<{
    equipment_id: number;
    identificacao?: string | null;
    local_instalacao?: string | null;
    installation_reference?: string | null;
  }>;
  activities: PmocScheduledActivityOut[];
  breakdown: PmocEstimatedTimeOut["breakdown"];
  catalog: ServiceOut[];
  month: number;
}): PmocEquipmentActivityCell[] {
  const { selectedEquipmentIds, equipments, activities, breakdown, catalog, month } = params;
  const breakdownIds = new Set(breakdown.map((line) => line.activity_id));
  const catalogById = new Map(catalog.map((s) => [s.id, s]));
  const actMap = new Map(activities.map((a) => [a.id, a]));
  const cells: PmocEquipmentActivityCell[] = [];

  for (const equipmentId of selectedEquipmentIds) {
    const equipmentLabel = equipmentLocationLabelFromRow(equipmentId, equipments);
    for (const activityId of breakdownIds) {
      const act = actMap.get(activityId);
      if (!act) continue;
      if (!activityDueInMonth(act.frequency, month)) continue;
      if (act.equipment_id != null && act.equipment_id !== equipmentId) continue;
      const serviceId = act.service_id;
      if (!serviceId) continue;
      const svc = catalogById.get(serviceId);
      const serviceName = svc?.name ?? act.service?.name;
      if (!serviceName) continue;
      cells.push({
        equipmentId,
        equipmentLabel,
        activityId: act.id,
        activityTitle: act.title,
        serviceId,
        serviceName,
      });
    }
  }

  return cells;
}

export function buildPmocActivitySummaryByEquipment(
  cells: PmocEquipmentActivityCell[],
): PmocEquipmentActivitySummary[] {
  const byEquipment = new Map<number, PmocEquipmentActivitySummary>();
  for (const cell of cells) {
    let row = byEquipment.get(cell.equipmentId);
    if (!row) {
      row = { equipmentId: cell.equipmentId, equipmentLabel: cell.equipmentLabel, services: [] };
      byEquipment.set(cell.equipmentId, row);
    }
    if (!row.services.includes(cell.serviceName)) {
      row.services.push(cell.serviceName);
    }
  }
  return [...byEquipment.values()];
}

/** Checklist detalhado: [Serviço X] → [Máquina Y]. */
export function buildChecklistFromPmocEquipmentMatrix(cells: PmocEquipmentActivityCell[]): ChecklistItem[] {
  return cells.map((cell, idx) => ({
    id: `pmoc_${cell.activityId}_${cell.equipmentId}_${idx}`,
    descricao: `${cell.serviceName} → ${cell.equipmentLabel}`,
    status: "na" as const,
  }));
}

/** @deprecated Prefer buildChecklistFromPmocEquipmentMatrix para checklist por máquina. */
export function buildChecklistFromPmocBreakdown(
  breakdown: PmocEstimatedTimeOut["breakdown"],
): ChecklistItem[] {
  return breakdown.map((line, idx) => {
    const durationLabel = formatDurationMinutes(line.total_minutes);
    const descricao =
      line.occurrences > 1
        ? `${line.title} — ${line.occurrences}× (${durationLabel})`
        : `${line.title} (${durationLabel})`;
    return {
      id: `pmoc_${line.activity_id}_${idx}`,
      descricao,
      status: "na",
    };
  });
}

export function buildServicosFromPmocEquipmentMatrix(
  cells: PmocEquipmentActivityCell[],
  catalog: ServiceOut[],
): ServiceLineDraft[] {
  const catalogById = new Map(catalog.map((s) => [s.id, s]));
  return cells.map((cell, idx) => ({
    localId: `pmoc-line-${idx + 1}`,
    serviceId: String(cell.serviceId),
    label: cell.serviceName,
    quantity: 1,
    unitPrice: Number(catalogById.get(cell.serviceId)?.price) || 0,
    equipmentIds: [String(cell.equipmentId)],
  }));
}

export function buildServicosFromPmocBreakdown(
  breakdown: PmocEstimatedTimeOut["breakdown"],
  activities: PmocScheduledActivityOut[],
  catalog: ServiceOut[],
  pmocEquipmentIds: number[],
  equipments: Array<{
    equipment_id: number;
    identificacao?: string | null;
    local_instalacao?: string | null;
    installation_reference?: string | null;
  }>,
  month: number,
): ServiceLineDraft[] {
  const matrix = buildPmocEquipmentActivityMatrix({
    selectedEquipmentIds: pmocEquipmentIds,
    equipments,
    activities,
    breakdown,
    catalog,
    month,
  });
  return buildServicosFromPmocEquipmentMatrix(matrix, catalog);
}

export function buildPmocScheduleDescription(
  planTitle: string,
  year: number,
  month: number,
  breakdown: PmocEstimatedTimeOut["breakdown"],
): string {
  const monthNames = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const period = `${monthNames[month - 1] ?? month}/${year}`;
  const items = breakdown.map((line, idx) => `${idx + 1}. ${line.title}`).join("\n");
  return `Manutenção PMOC — ${planTitle}\nPeríodo: ${period}\n\nAtividades previstas:\n${items}`;
}

/** Limite de jornada (8 h) para sugestão de divisão de visita PMOC. */
export const PMOC_WORKDAY_MAX_MINUTES = 8 * 60;

export function buildPmocRtNotes(plan: {
  responsible_name?: string | null;
  responsible_council?: string | null;
  responsible_registration?: string | null;
}): string {
  const parts: string[] = [];
  if (plan.responsible_name?.trim()) parts.push(`RT: ${plan.responsible_name.trim()}`);
  if (plan.responsible_council?.trim()) parts.push(`Conselho: ${plan.responsible_council.trim()}`);
  if (plan.responsible_registration?.trim()) parts.push(`Registro: ${plan.responsible_registration.trim()}`);
  return parts.join(" · ");
}

export function suggestPmocSplitDays(totalMinutes: number): number | null {
  if (totalMinutes <= PMOC_WORKDAY_MAX_MINUTES) return null;
  return 2;
}
