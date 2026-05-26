import type { CategoryFieldDefinition } from "./categoryFieldDefinitions";
import type { EquipmentLabelExtractionOut } from "../api/equipmentCatalogAi";

export function isAirConditioningCategory(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes("ar-condicionado") || n.includes("ar condicionado") || n.includes("split");
}

/** Campos técnicos adicionais para AC (além dos legados capacity/fluid/voltage). */
export const AC_EXTRA_FIELD_DEFINITIONS: CategoryFieldDefinition[] = [
  {
    key: "tipo_equipamento",
    name: "Tipo de equipamento",
    type: "select",
    unit: null,
    required: false,
    is_active: true,
    options: ["Hi-Wall", "Piso Teto", "Cassete", "Duto", "Janela", "Chiller", "VRF", "Outro"],
  },
  {
    key: "tecnologia",
    name: "Tecnologia",
    type: "select",
    unit: null,
    required: false,
    is_active: true,
    options: ["Inverter", "On-Off"],
  },
];

export function mergeAcFieldDefinitions(definitions: CategoryFieldDefinition[]): CategoryFieldDefinition[] {
  const byKey = new Map<string, CategoryFieldDefinition>();
  for (const def of definitions) {
    byKey.set(def.key, def);
  }
  for (const extra of AC_EXTRA_FIELD_DEFINITIONS) {
    if (!byKey.has(extra.key)) {
      byKey.set(extra.key, extra);
    }
  }
  return Array.from(byKey.values());
}

export function mapAiExtractionToTechnicalData(
  extraction: EquipmentLabelExtractionOut,
  current: Record<string, string>,
): Record<string, string> {
  const next = { ...current };
  if (extraction.capacidade_btus) next.capacity = extraction.capacidade_btus;
  if (extraction.fluido_refrigerante) next.fluid_type = extraction.fluido_refrigerante;
  if (extraction.tensao) next.voltage = extraction.tensao;
  if (extraction.tipo_equipamento) next.tipo_equipamento = extraction.tipo_equipamento;
  if (extraction.tecnologia) next.tecnologia = extraction.tecnologia;
  return next;
}

export function mapAiExtractionToFormFields(extraction: EquipmentLabelExtractionOut): {
  marca: string;
  modelEvaporator: string;
  modelCondenser: string;
  technicalData: Record<string, string>;
} {
  return {
    marca: extraction.marca ?? "",
    modelEvaporator: extraction.modelo_evaporadora ?? "",
    modelCondenser: extraction.modelo_condensadora ?? "",
    technicalData: mapAiExtractionToTechnicalData(extraction, {}),
  };
}
