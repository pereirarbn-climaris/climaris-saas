import type { EquipmentItem } from "../components/v0-ui/clients/ClientEquipmentManager";
import { getCategoryVisual } from "./equipmentCategoryIcons";

export function equipmentDisplayLabel(equipment: EquipmentItem): string {
  const tag = equipment.tag?.trim();
  if (tag) return tag;
  const brandModel = `${equipment.brandName ?? ""} ${equipment.modelName ?? ""}`.trim();
  return brandModel || "este equipamento";
}

export function equipmentConfirmSummaryRows(equipment: EquipmentItem): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const categoryLabel = equipment.categoryName ?? getCategoryVisual(equipment.category).label;
  if (categoryLabel) rows.push({ label: "Categoria", value: categoryLabel });
  const brandModel = `${equipment.brandName ?? ""} ${equipment.modelName ?? ""}`.trim();
  if (brandModel) rows.push({ label: "Marca / modelo", value: brandModel });
  if (equipment.serialNumber?.trim()) rows.push({ label: "Nº de série", value: equipment.serialNumber.trim() });
  if (equipment.siteName?.trim()) rows.push({ label: "Unidade", value: equipment.siteName.trim() });
  else if (equipment.location?.trim()) rows.push({ label: "Local", value: equipment.location.trim() });
  if (equipment.qrcodeCodeId?.trim()) rows.push({ label: "QR", value: equipment.qrcodeCodeId.trim() });
  return rows;
}
