import type {
  ServiceOrderEquipmentCardOut,
  ServiceOrderEquipmentServiceOut,
  ServiceOrderOut,
} from "../types/serviceOrders";

/** Normaliza resposta da API com equipment_cards e total_duration_minutes. */
export function normalizeServiceOrderOut(raw: ServiceOrderOut): ServiceOrderOut {
  const equipment_services = raw.equipment_services?.length ? raw.equipment_services : raw.service_items;
  const total_duration_minutes =
    raw.total_duration_minutes ??
    equipment_services.reduce(
      (sum, item) => sum + Math.max(item.quantity, 1) * Math.max(item.duration_minutes, 1),
      0,
    );
  const equipment_cards =
    raw.equipment_cards?.length ? raw.equipment_cards : buildEquipmentCardsFromServices(equipment_services);
  return {
    ...raw,
    equipment_services,
    equipment_cards,
    total_duration_minutes,
    service_items: equipment_services,
  };
}

export function buildEquipmentCardsFromServices(
  items: ServiceOrderEquipmentServiceOut[],
): ServiceOrderEquipmentCardOut[] {
  const byEquipment = new Map<number | null, ServiceOrderEquipmentServiceOut[]>();
  for (const item of items) {
    const key = item.equipment_id ?? null;
    const list = byEquipment.get(key) ?? [];
    list.push(item);
    byEquipment.set(key, list);
  }
  return [...byEquipment.entries()]
    .sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    })
    .map(([equipment_id, services]) => ({
      equipment_id,
      equipment_identificacao: null,
      equipment_tipo: null,
      equipment_modelo: null,
      services,
      total_duration_minutes: services.reduce(
        (sum, s) => sum + Math.max(s.quantity, 1) * Math.max(s.duration_minutes, 1),
        0,
      ),
    }));
}
