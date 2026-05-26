import type { ServiceOut } from "../api/services";
import type { ServiceLineDraft } from "../components/v0-ui/service-orders/ServiceOrderFormView";

export function computeEstimatedMinutesFromLines(
  lines: ServiceLineDraft[],
  catalog: ServiceOut[],
): number {
  const byId = new Map(catalog.map((s) => [String(s.id), s]));
  return lines.reduce((sum, line) => {
    const svc = byId.get(line.serviceId);
    const perUnit = Math.max(svc?.duration_minutes ?? 0, 1);
    return sum + Math.max(line.quantity, 1) * perUnit;
  }, 0);
}

export function formatEstimatedDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) {
    return `${total} minuto${total === 1 ? "" : "s"}`;
  }
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (m === 0) {
    return `${h} hora${h === 1 ? "" : "s"}`;
  }
  return `${h} hora${h === 1 ? "" : "s"} e ${m} minuto${m === 1 ? "" : "s"}`;
}
