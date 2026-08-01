import type { ServiceOrderOut } from "../types/serviceOrders";

const MONTHS_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

/** Ex.: "14 mai. de 2026" — interpreta YYYY-MM-DD como data civil (sem deslocar por fuso). */
export function formatFriendlyDatePt(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      const day = Number(match[3]);
      if (
        Number.isFinite(year) &&
        monthIndex >= 0 &&
        monthIndex <= 11 &&
        day >= 1 &&
        day <= 31
      ) {
        const month = MONTHS_PT[monthIndex] ?? "";
        return `${day} ${month}. de ${year}`;
      }
    }
  }
  const local = toLocalCalendarDate(value);
  if (!local) return null;
  const day = local.getDate();
  const month = MONTHS_PT[local.getMonth()] ?? "";
  const year = local.getFullYear();
  return `${day} ${month}. de ${year}`;
}

function addCalendarMonths(d: Date, months: number): Date {
  if (months <= 0) return new Date(d);
  const day = d.getDate();
  let monthIndex = d.getMonth() + months;
  const year = d.getFullYear() + Math.floor(monthIndex / 12);
  monthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDay), d.getHours(), d.getMinutes(), d.getSeconds());
}

/** Normaliza ISO/API para data civil local (evita deslocar dia por fuso). */
export function toLocalCalendarDate(value: Date | string): Date | null {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      const day = Number(match[3]);
      if (
        Number.isFinite(year) &&
        monthIndex >= 0 &&
        monthIndex <= 11 &&
        day >= 1 &&
        day <= 31
      ) {
        return new Date(year, monthIndex, day);
      }
    }
  }
  const parsed = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** Calcula próxima validade a partir da última OS + intervalo (meses/dias/anos). */
export function computePreventiveNextDue(
  lastPerformedAt: string | null | undefined,
  intervalValue: number,
  intervalType: "days" | "months" | "years",
): Date | null {
  if (!lastPerformedAt) return null;
  const last = toLocalCalendarDate(lastPerformedAt);
  if (!last) return null;
  const value = Math.max(1, Math.floor(intervalValue));
  if (intervalType === "days") {
    const next = new Date(last);
    next.setDate(next.getDate() + value);
    return next;
  }
  if (intervalType === "years") {
    return addCalendarMonths(last, value * 12);
  }
  return addCalendarMonths(last, value);
}

/** Próximo vencimento exibido no cadastro do cliente (prioriza última OS / última realização). */
export function formatClientPreventiveNextDue(params: {
  lastServiceAt: string | null | undefined;
  lastPerformedFromRule: string | null | undefined;
  intervalValue: number;
  intervalType: "days" | "months" | "years";
  ruleNextDueDate: string | null | undefined;
}): string | null {
  const lastAt = params.lastServiceAt ?? params.lastPerformedFromRule ?? null;
  if (lastAt) {
    const computed = computePreventiveNextDue(
      lastAt,
      params.intervalValue,
      params.intervalType,
    );
    if (computed) return formatFriendlyDatePt(computed);
  }
  if (params.ruleNextDueDate) {
    return formatFriendlyDatePt(params.ruleNextDueDate);
  }
  return null;
}

function collectEquipmentIdsFromOrder(order: ServiceOrderOut): number[] {
  const ids = new Set<number>();
  const lineItems = order.equipment_services?.length
    ? order.equipment_services
    : order.service_items ?? [];
  for (const item of lineItems) {
    if (item.equipment_id != null && item.equipment_id > 0) {
      ids.add(item.equipment_id);
    }
  }
  for (const card of order.equipment_cards ?? []) {
    if (card.equipment_id != null && card.equipment_id > 0) {
      ids.add(card.equipment_id);
    }
  }
  return [...ids];
}

function orderCompletionInstant(order: ServiceOrderOut): Date | null {
  const raw =
    order.stock_consumed_at ??
    order.schedule?.ends_at ??
    order.schedule?.starts_at ??
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Última data de OS concluída (`done`) em que o equipamento consta nos serviços. */
export function buildLastDoneServiceDateByEquipment(
  orders: ServiceOrderOut[],
): Map<number, Date> {
  const map = new Map<number, Date>();
  for (const order of orders) {
    if (order.status !== "done") continue;
    const completedAt = orderCompletionInstant(order);
    if (!completedAt) continue;
    for (const equipmentId of collectEquipmentIdsFromOrder(order)) {
      const prev = map.get(equipmentId);
      if (!prev || completedAt > prev) {
        map.set(equipmentId, completedAt);
      }
    }
  }
  return map;
}
