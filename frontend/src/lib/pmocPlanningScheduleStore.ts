import type { PlanningTaskStatus } from "./pmocPlanningMock";

const STORAGE_KEY = "climaris_pmoc_planning_status_v1";

type StoredPlanningStatus = {
  pmocId: number;
  rowKey: string;
  status: PlanningTaskStatus;
  updatedAt: string;
};

function readAll(): StoredPlanningStatus[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is StoredPlanningStatus =>
        Boolean(
          row &&
            typeof row === "object" &&
            typeof (row as StoredPlanningStatus).pmocId === "number" &&
            typeof (row as StoredPlanningStatus).rowKey === "string" &&
            typeof (row as StoredPlanningStatus).status === "string",
        ),
    );
  } catch {
    return [];
  }
}

function writeAll(rows: StoredPlanningStatus[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function loadPlanningStatusOverrides(pmocId: number): Record<string, PlanningTaskStatus> {
  const map: Record<string, PlanningTaskStatus> = {};
  for (const row of readAll()) {
    if (row.pmocId === pmocId) map[row.rowKey] = row.status;
  }
  return map;
}

export function markPlanningRowsScheduled(pmocId: number, rowKeys: string[]): void {
  if (rowKeys.length === 0) return;
  const scheduled = new Set(rowKeys);
  const kept = readAll().filter((row) => !(row.pmocId === pmocId && scheduled.has(row.rowKey)));
  const now = new Date().toISOString();
  for (const rowKey of rowKeys) {
    kept.push({ pmocId, rowKey, status: "agendado", updatedAt: now });
  }
  writeAll(kept);
}
