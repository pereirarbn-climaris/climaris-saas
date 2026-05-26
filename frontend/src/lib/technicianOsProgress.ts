const PREFIX = "climaris:technician-os:";

function key(orderId: number, suffix: string): string {
  return `${PREFIX}${orderId}:${suffix}`;
}

export function loadCompletedServiceItemIds(orderId: number): Set<number> {
  try {
    const raw = localStorage.getItem(key(orderId, "completed-services"));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is number => typeof id === "number"));
  } catch {
    return new Set();
  }
}

export function saveCompletedServiceItemIds(orderId: number, ids: Set<number>): void {
  localStorage.setItem(key(orderId, "completed-services"), JSON.stringify([...ids]));
}

export function toggleCompletedServiceItem(orderId: number, itemId: number, done: boolean): Set<number> {
  const ids = loadCompletedServiceItemIds(orderId);
  if (done) ids.add(itemId);
  else ids.delete(itemId);
  saveCompletedServiceItemIds(orderId, ids);
  return ids;
}
