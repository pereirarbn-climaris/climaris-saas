/** Horários padrão de demonstração (espelha app/demo_scheduling.py). */

export const DEMO_SLOT_HOURS = [9, 10, 11, 14, 15, 16] as const;
export const DEMO_DURATION_MINUTES = 45;
export const DEMO_BUSINESS_WEEKDAYS = new Set([0, 1, 2, 3, 4]); // seg–sex

export type DemoSlotBounds = {
  starts_at: string;
  ends_at: string;
  hour: number;
  label: string;
};

export function isDemoBusinessDay(day: string): boolean {
  const wd = new Date(`${day}T12:00:00-03:00`).getDay();
  return DEMO_BUSINESS_WEEKDAYS.has(wd);
}

export function slotBounds(day: string, hour: number): DemoSlotBounds {
  const hh = String(hour).padStart(2, "0");
  const starts_at = `${day}T${hh}:00:00-03:00`;
  const ends_at = `${day}T${hh}:45:00-03:00`;
  return {
    starts_at,
    ends_at,
    hour,
    label: `${hh}:00`,
  };
}

export function demoSlotsForDay(day: string): DemoSlotBounds[] {
  if (!isDemoBusinessDay(day)) return [];
  return DEMO_SLOT_HOURS.map((hour) => slotBounds(day, hour));
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}
