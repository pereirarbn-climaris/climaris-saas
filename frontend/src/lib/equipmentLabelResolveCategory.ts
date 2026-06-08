import type { EquipmentLabelResolveOut } from "../api/equipmentCatalogAi";
import type { CategoryIconKey } from "./equipmentCategoryIcons";

export type EquipmentCategoryPickerOption = {
  id: string;
  iconKey: CategoryIconKey;
  name: string;
};

export function categoryFromLabelResolve(
  resolved: EquipmentLabelResolveOut,
  categoryOptions?: EquipmentCategoryPickerOption[],
): { category: CategoryIconKey; categoryId: string | null } {
  if (categoryOptions?.length) {
    const byId = categoryOptions.find((c) => c.id === resolved.category_id);
    if (byId) {
      return { category: byId.iconKey, categoryId: byId.id };
    }
    const kind = resolved.equipment_kind;
    const byKind = categoryOptions.find((c) => {
      const name = c.name.toLowerCase();
      if (kind === "climatizador") return name.includes("climatizador");
      return name.includes("condicion") || c.iconKey === "ar_condicionado";
    });
    if (byKind) {
      return { category: byKind.iconKey, categoryId: byKind.id };
    }
  }
  const category: CategoryIconKey =
    resolved.equipment_kind === "climatizador" ? "climatizador" : "ar_condicionado";
  return { category, categoryId: resolved.category_id };
}
