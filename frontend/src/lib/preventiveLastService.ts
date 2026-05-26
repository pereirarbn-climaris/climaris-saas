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

/** Ex.: "14 mai. de 2026" */
export function formatFriendlyDatePt(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  const month = MONTHS_PT[d.getMonth()] ?? "";
  const year = d.getFullYear();
  return `${day} ${month}. de ${year}`;
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
