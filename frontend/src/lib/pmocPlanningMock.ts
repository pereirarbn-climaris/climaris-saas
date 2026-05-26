import type { MockActivityRow, MockEquipment } from "./pmocCreateMockData";

export type PlanningTaskStatus = "pendente" | "agendado" | "concluido";

export type PlanningEquipmentRow = {
  rowKey: string;
  equipmentId: string;
  equipmentName: string;
  activityTitle: string;
  activityId: string;
  serviceId?: number;
  status: PlanningTaskStatus;
  overdue: boolean;
  estimatedMinutes: number;
  dueMonth: number;
  dueYear: number;
};

export type PlanningEquipmentGroup = {
  equipmentId: string;
  title: string;
  tasks: PlanningEquipmentRow[];
  hasOverdue: boolean;
};

export const MOCK_PLANNING_TECHNICIANS = [
  { id: "t1", name: "Carlos Mendes" },
  { id: "t2", name: "Ana Paula Ribeiro" },
  { id: "t3", name: "João Ferreira" },
];

const FALLBACK_SERVICE_MINUTES = 60;

export function resolveActivityDurationMinutes(activity: MockActivityRow): number {
  if (activity.durationMinutes != null && activity.durationMinutes > 0) {
    return activity.durationMinutes;
  }
  return FALLBACK_SERVICE_MINUTES;
}

export function formatPmocEquipmentGroupTitle(equipment: MockEquipment): string {
  const brand = equipment.fabricante?.trim();
  const model = equipment.modelo?.trim();
  const location = equipment.localInstalacao?.trim() || equipment.identificacao?.trim();
  const validBrand = brand && brand !== "—" ? brand : null;
  const validModel = model && model !== "—" ? model : null;

  if (validBrand && validModel && location) return `${validBrand} ${validModel} - ${location}`;
  if (validBrand && validModel) return `${validBrand} ${validModel}`;
  if (validModel && location) return `${validModel} - ${location}`;
  return equipment.identificacao?.trim() || "Equipamento";
}

export function groupPlanningRowsByEquipment(
  rows: PlanningEquipmentRow[],
  equipments: MockEquipment[],
): PlanningEquipmentGroup[] {
  const byEquipment = new Map<string, PlanningEquipmentRow[]>();

  for (const row of rows) {
    const list = byEquipment.get(row.equipmentId) ?? [];
    list.push(row);
    byEquipment.set(row.equipmentId, list);
  }

  const equipmentOrder = new Map(equipments.map((eq, index) => [eq.id, index]));

  return Array.from(byEquipment.entries())
    .map(([equipmentId, tasks]) => {
      const equipment = equipments.find((eq) => eq.id === equipmentId);
      const title = equipment ? formatPmocEquipmentGroupTitle(equipment) : tasks[0]?.equipmentName ?? "Equipamento";
      const sortedTasks = [...tasks].sort((a, b) => a.activityTitle.localeCompare(b.activityTitle, "pt-BR"));
      return {
        equipmentId,
        title,
        tasks: sortedTasks,
        hasOverdue: sortedTasks.some((task) => task.overdue),
      };
    })
    .sort((a, b) => {
      const aOverdue = a.hasOverdue ? 0 : 1;
      const bOverdue = b.hasOverdue ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const aIndex = equipmentOrder.get(a.equipmentId) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = equipmentOrder.get(b.equipmentId) ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.title.localeCompare(b.title, "pt-BR");
    });
}

function isActivityDueInMonth(activity: MockActivityRow, year: number, month: number): boolean {
  const anchor = new Date(activity.scheduledDate);
  if (Number.isNaN(anchor.getTime())) return activity.frequency === "monthly";

  const anchorMonth = anchor.getMonth() + 1;
  const monthDiff = (year - anchor.getFullYear()) * 12 + (month - anchorMonth);

  if (monthDiff < 0) return false;

  switch (activity.frequency) {
    case "monthly":
      return true;
    case "quarterly":
      return monthDiff % 3 === 0;
    case "semiannual":
      return monthDiff % 6 === 0;
    case "annual":
      return monthDiff % 12 === 0;
    default:
      return anchor.getFullYear() === year && anchorMonth === month;
  }
}

function isOverdueMonth(year: number, month: number, now = new Date()): boolean {
  const currentIndex = now.getFullYear() * 12 + (now.getMonth() + 1);
  const targetIndex = year * 12 + month;
  return targetIndex < currentIndex;
}

export function buildPlanningRowsForMonth(params: {
  year: number;
  month: number;
  activities: MockActivityRow[];
  equipments: MockEquipment[];
  selectedEquipmentIds: string[];
  statusOverrides?: Record<string, PlanningTaskStatus>;
}): PlanningEquipmentRow[] {
  const { year, month, activities, equipments, selectedEquipmentIds, statusOverrides = {} } = params;
  const rows: PlanningEquipmentRow[] = [];
  const selected = equipments.filter((eq) => selectedEquipmentIds.includes(eq.id));
  const overdueMonth = isOverdueMonth(year, month);

  for (const activity of activities) {
    if (!isActivityDueInMonth(activity, year, month)) continue;

    const targets =
      activity.equipment == null
        ? selected
        : selected.filter((eq) => eq.identificacao === activity.equipment);

    for (const eq of targets) {
      const rowKey = `${eq.id}:${activity.id}:${year}-${String(month).padStart(2, "0")}`;
      const defaultStatus: PlanningTaskStatus = overdueMonth ? "pendente" : "pendente";
      const status = statusOverrides[rowKey] ?? defaultStatus;
      rows.push({
        rowKey,
        equipmentId: eq.id,
        equipmentName: eq.identificacao,
        activityTitle: activity.service,
        activityId: activity.id,
        serviceId: activity.serviceId,
        status,
        overdue: overdueMonth && status === "pendente",
        estimatedMinutes: resolveActivityDurationMinutes(activity),
        dueMonth: month,
        dueYear: year,
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.equipmentName.localeCompare(b.equipmentName, "pt-BR");
  });
}

export function formatMonthYearInput(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthYearInput(value: string): { year: number; month: number } | null {
  const [y, m] = value.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

export function sumEstimatedMinutes(rows: PlanningEquipmentRow[]): number {
  return rows.reduce((acc, row) => acc + row.estimatedMinutes, 0);
}

export type MockSuggestedSlot = {
  id: string;
  starts_at: string;
  ends_at: string;
  technician_id: string;
  technician_name: string;
  shift: "morning" | "afternoon";
  score: number;
};

export function buildMockSuggestedSlots(
  technicianId: string,
  technicianName: string,
  durationMinutes: number,
  baseDate = new Date(),
): MockSuggestedSlot[] {
  const slots: MockSuggestedSlot[] = [];

  for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
    const day = new Date(baseDate);
    day.setDate(day.getDate() + dayOffset);
    if (day.getDay() === 0 || day.getDay() === 6) continue;

    const morningStart = new Date(day);
    morningStart.setHours(9, 0, 0, 0);
    const morningEnd = new Date(morningStart.getTime() + durationMinutes * 60_000);

    slots.push({
      id: `slot-m-${dayOffset}`,
      starts_at: morningStart.toISOString(),
      ends_at: morningEnd.toISOString(),
      technician_id: technicianId,
      technician_name: technicianName,
      shift: "morning",
      score: 95 - dayOffset,
    });

    const afternoonStart = new Date(day);
    afternoonStart.setHours(14, 0, 0, 0);
    const afternoonEnd = new Date(afternoonStart.getTime() + durationMinutes * 60_000);
    slots.push({
      id: `slot-a-${dayOffset}`,
      starts_at: afternoonStart.toISOString(),
      ends_at: afternoonEnd.toISOString(),
      technician_id: technicianId,
      technician_name: technicianName,
      shift: "afternoon",
      score: 88 - dayOffset,
    });
  }

  return slots.sort((a, b) => b.score - a.score).slice(0, 6);
}
