import type { CatalogEquipment, NewCatalogEquipmentData } from "../components/v0-ui/admin/AdminEquipmentCatalogView";
/** Mesma regra do backend (`build_catalog_display_model`). */
export function buildCatalogDisplayModel(
  modelEvaporator: string,
  modelCondenser: string,
  fallback = "",
): string {
  const evap = modelEvaporator.trim();
  const cond = modelCondenser.trim();
  if (evap && cond) return `${evap} + ${cond}`;
  if (evap) return evap;
  if (cond) return cond;
  const fb = fallback.trim();
  return fb || "—";
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve chave de duplicata alinhada ao backend (marca + categoria + modelo exibido).
 * Para split AC com só evaporadora, compara também pelo campo evaporadora isolado.
 */
export function findDuplicateCatalogEntry(
  data: NewCatalogEquipmentData,
  items: CatalogEquipment[],
  editingId?: string,
): CatalogEquipment | null {
  const categoryId = data.categoryId;
  const brandKey = normalizeKey(data.marca);
  if (!categoryId || !brandKey) return null;

  const displayModel = buildCatalogDisplayModel(
    data.modelEvaporator,
    data.modelCondenser,
    data.modelo,
  );
  const displayKey = normalizeKey(displayModel);
  const evapKey = normalizeKey(data.modelEvaporator);
  const condKey = normalizeKey(data.modelCondenser);

  for (const item of items) {
    if (editingId && item.id === editingId) continue;
    if (item.categoryId !== categoryId) continue;
    if (normalizeKey(item.marca) !== brandKey) continue;

    const itemDisplay = normalizeKey(
      item.modelo || buildCatalogDisplayModel(item.modelEvaporator, item.modelCondenser),
    );
    if (displayKey && displayKey !== "—" && itemDisplay === displayKey) {
      return item;
    }

    const itemEvap = normalizeKey(item.modelEvaporator);
    const itemCond = normalizeKey(item.modelCondenser);
    if (evapKey && (itemEvap === evapKey || itemDisplay === evapKey)) {
      if (!condKey || itemCond === condKey || !itemCond) return item;
    }
    if (condKey && !evapKey && itemCond === condKey) {
      return item;
    }
  }

  return null;
}

export function formatDuplicateCatalogMessage(item: CatalogEquipment, categoryName?: string): string {
  const cat = categoryName?.trim() || item.categoryName;
  const modelLabel =
    item.modelo || buildCatalogDisplayModel(item.modelEvaporator, item.modelCondenser);
  return `Este equipamento já está cadastrado no catálogo: ${item.marca} ${modelLabel}${cat ? ` (${cat})` : ""}. Não cadastre novamente — edite o registro existente se precisar atualizar.`;
}
