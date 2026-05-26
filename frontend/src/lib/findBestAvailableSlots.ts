import { getTechnicianNextSlots, type SuggestedSlotOut } from "../api/serviceOrders";
import { sortSuggestedSlotsChronologically } from "./sortSuggestedSlots";

const LUNCH_START_MINUTES = 12 * 60;
const LUNCH_END_MINUTES = 13 * 60;

export type FindBestSlotsMode = "any" | "technician" | "date" | "technician_date";

function localDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function minutesFromMidnight(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** Exclui horários dentro da janela de almoço (12:00–13:00). */
export function isSlotDuringLunchBreak(startsAt: string): boolean {
  const minutes = minutesFromMidnight(startsAt);
  if (minutes == null) return false;
  return minutes >= LUNCH_START_MINUTES && minutes < LUNCH_END_MINUTES;
}

function filterLunchSlots(slots: SuggestedSlotOut[]): SuggestedSlotOut[] {
  return slots.filter((slot) => !isSlotDuringLunchBreak(slot.starts_at));
}

function parseTechnicianId(technicianId?: string): number | undefined {
  const trimmed = technicianId?.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveMode(technicianId?: string, startDate?: string): FindBestSlotsMode {
  const hasTech = parseTechnicianId(technicianId) != null;
  const hasDate = Boolean(startDate?.trim());
  if (hasTech && hasDate) return "technician_date";
  if (hasTech) return "technician";
  if (hasDate) return "date";
  return "any";
}

function resolveFromAt(startDate?: string): string {
  const now = new Date();
  const trimmed = startDate?.trim();
  if (!trimmed) return now.toISOString();

  const dayStart = new Date(`${trimmed}T08:00:00`);
  if (Number.isNaN(dayStart.getTime())) return now.toISOString();
  return dayStart > now ? dayStart.toISOString() : now.toISOString();
}

function resolveLimit(mode: FindBestSlotsMode): number {
  switch (mode) {
    case "technician_date":
      return 6;
    case "technician":
    case "date":
      return 8;
    default:
      return 12;
  }
}

/**
 * Service Scheduling Engine — sugere horários livres conforme técnico e/ou data informados.
 *
 * - Ambos vazios: qualquer técnico, do dia mais próximo ao mais distante (manhã/tarde).
 * - Apenas técnico: agenda exclusiva do técnico.
 * - Apenas data: a partir da data escolhida, qualquer técnico, ordem cronológica.
 * - Técnico + data: slots livres do técnico na data informada (manhã/tarde).
 */
export async function findBestAvailableSlots(
  technicianId?: string,
  startDate?: string,
  durationMinutes = 60,
): Promise<SuggestedSlotOut[]> {
  const mode = resolveMode(technicianId, startDate);
  const techId = parseTechnicianId(technicianId);
  const fromAt = resolveFromAt(mode === "any" || mode === "technician" ? undefined : startDate);
  const limit = resolveLimit(mode);
  const safeDuration = Math.max(1, Math.round(durationMinutes));

  const raw = await getTechnicianNextSlots({
    duration_minutes: safeDuration,
    from_at: fromAt,
    technician_id: techId,
    limit,
  });

  let slots = filterLunchSlots(raw);

  if (mode === "technician_date" && startDate?.trim()) {
    const dayKey = startDate.trim().slice(0, 10);
    slots = slots.filter((slot) => localDateKey(slot.starts_at) === dayKey);
  }

  return sortSuggestedSlotsChronologically(slots);
}

export function shiftLabel(shift: SuggestedSlotOut["shift"]): string {
  if (shift === "morning") return "Manhã";
  if (shift === "afternoon") return "Tarde";
  return "Horário";
}

export function formatSuggestedSlotTime(startsAt: string): string {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return startsAt;
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSuggestedSlotLine(slot: SuggestedSlotOut): string {
  const shift = shiftLabel(slot.shift);
  const time = formatSuggestedSlotTime(slot.starts_at);
  const tech = slot.technician_name?.trim();
  return tech ? `${shift}: ${time} · ${tech}` : `${shift}: ${time}`;
}
