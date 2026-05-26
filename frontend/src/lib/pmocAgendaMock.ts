/** Compromissos PMOC criados pelo fluxo mock de Planejamento (visíveis na Agenda com tag laranja). */

import type { ScheduleOut } from "../api/serviceOrders";

export type PmocMockAgendaEntry = {
  id: string;
  technician_id: string;
  technician_name: string;
  client_name: string;
  equipment_labels: string[];
  starts_at: string;
  ends_at: string;
  notes: string;
  is_pmoc: true;
};

const STORAGE_KEY = "climaris_pmoc_mock_agenda_v1";

export function listPmocMockAgendaEntries(): PmocMockAgendaEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is PmocMockAgendaEntry =>
        Boolean(row && typeof row === "object" && (row as PmocMockAgendaEntry).is_pmoc === true),
    );
  } catch {
    return [];
  }
}

export function appendPmocMockAgendaEntries(entries: PmocMockAgendaEntry[]): void {
  if (typeof window === "undefined" || entries.length === 0) return;
  const merged = [...listPmocMockAgendaEntries(), ...entries];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

export function isPmocMockScheduleId(scheduleId: number): boolean {
  return scheduleId < 0;
}

export function findPmocMockEntryByScheduleId(scheduleId: number): PmocMockAgendaEntry | null {
  return (
    listPmocMockAgendaEntries().find((entry) => mockAgendaNumericId(`pmoc-mock-${entry.id}`) === scheduleId) ?? null
  );
}

export function removePmocMockAgendaEntryByScheduleId(scheduleId: number): void {
  if (typeof window === "undefined") return;
  const kept = listPmocMockAgendaEntries().filter(
    (entry) => mockAgendaNumericId(`pmoc-mock-${entry.id}`) !== scheduleId,
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
}

export function updatePmocMockAgendaEntryByScheduleId(
  scheduleId: number,
  patch: Partial<Pick<PmocMockAgendaEntry, "starts_at" | "ends_at" | "technician_id" | "technician_name" | "notes">>,
): void {
  if (typeof window === "undefined") return;
  const next = listPmocMockAgendaEntries().map((entry) => {
    if (mockAgendaNumericId(`pmoc-mock-${entry.id}`) !== scheduleId) return entry;
    return { ...entry, ...patch };
  });
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function mockAgendaNumericId(entryId: string): number {
  let hash = 0;
  for (let i = 0; i < entryId.length; i++) {
    hash = (Math.imul(31, hash) + entryId.charCodeAt(i)) | 0;
  }
  return hash >= 0 ? -(hash + 1) : hash;
}

export type PmocAgendaScheduleRow = ScheduleOut & {
  is_pmoc: true;
  pmoc_label: string;
  technician_id: string;
};

export function pmocMockAgendaEntryToScheduleShape(entry: PmocMockAgendaEntry): PmocAgendaScheduleRow {
  return {
    id: mockAgendaNumericId(`pmoc-mock-${entry.id}`),
    tenant_id: 0,
    client_id: 0,
    client_name: entry.client_name,
    client_phone: null,
    client_whatsapp: null,
    client_address: null,
    service_order_id: null,
    starts_at: entry.starts_at,
    ends_at: entry.ends_at,
    status: "confirmed",
    notes: entry.notes,
    is_pmoc: true as const,
    pmoc_label: "PMOC",
    technician_id: entry.technician_id,
  };
}
