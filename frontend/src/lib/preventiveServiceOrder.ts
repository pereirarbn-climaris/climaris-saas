import type { ServiceOut } from "../api/services";
import type { PreventiveClientGroup } from "../api/preventiveMaintenance";
import type { ServiceLineDraft } from "../components/v0-ui/service-orders/ServiceOrderFormView";
import { newLocalId } from "./serviceOrderLinesSync";

/** URL para nova OS preventiva com cliente, equipamentos e linhas de serviço do grupo. */
export function buildPreventiveServiceOrderUrl(group: PreventiveClientGroup): string {
  const params = new URLSearchParams();
  params.set("client_id", String(group.client_id));
  params.set("tipo", "preventiva");
  if (group.client_site_id != null && group.client_site_id > 0) {
    params.set("client_site_id", String(group.client_site_id));
  }

  const equipmentIds = new Set<number>();
  const lines: string[] = [];

  for (const item of group.equipments) {
    const serviceId = item.service_id;
    if (item.equipment_id != null && item.equipment_id > 0) {
      equipmentIds.add(item.equipment_id);
      lines.push(`${item.equipment_id}:${serviceId}`);
    } else {
      lines.push(`0:${serviceId}`);
    }
  }

  if (equipmentIds.size > 0) {
    params.set("equipment_ids", [...equipmentIds].join(","));
  }
  if (lines.length > 0) {
    params.set("preventive_lines", lines.join(","));
  }

  return `/app/service-orders/new?${params.toString()}`;
}

/** Monta linhas de serviço a partir de `preventive_lines` (ex.: `21:5,22:5` ou `0:5`). */
export function buildServiceLinesFromPreventiveLines(
  raw: string,
  services: ServiceOut[],
): ServiceLineDraft[] {
  const byServiceId = new Map<string, ServiceLineDraft>();

  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;

    const equipmentRaw = trimmed.slice(0, colon).trim();
    const serviceId = trimmed.slice(colon + 1).trim();
    if (!serviceId) continue;

    const hasEquipment = equipmentRaw !== "" && equipmentRaw !== "0";
    const svc = services.find((s) => String(s.id) === serviceId);

    let line = byServiceId.get(serviceId);
    if (!line) {
      line = {
        localId: newLocalId(),
        serviceId,
        label: svc?.name ?? `Serviço #${serviceId}`,
        quantity: 0,
        unitPrice: Number(svc?.price ?? 0) || 0,
        equipmentIds: [],
      };
      byServiceId.set(serviceId, line);
    }

    if (hasEquipment) {
      if (!line.equipmentIds.includes(equipmentRaw)) {
        line.equipmentIds.push(equipmentRaw);
      }
      line.quantity = line.equipmentIds.length;
    } else {
      line.quantity += 1;
    }
  }

  return [...byServiceId.values()].filter((line) => line.quantity > 0);
}
