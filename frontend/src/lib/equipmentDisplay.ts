import type { ServiceOrderEquipmentCardOut } from "../types/serviceOrders";

export function equipmentCardTitle(card: ServiceOrderEquipmentCardOut): string {
  if (card.equipment_identificacao?.trim()) return card.equipment_identificacao.trim();
  const parts = [card.equipment_tipo, card.equipment_modelo].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  if (card.equipment_id != null) return `Equipamento #${card.equipment_id}`;
  return "Equipamento não vinculado";
}
