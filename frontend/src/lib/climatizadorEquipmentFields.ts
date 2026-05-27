import type { CategoryFieldDefinition } from "./categoryFieldDefinitions";
import type { EquipmentLabelExtractionOut } from "../api/equipmentCatalogAi";

export function isClimatizadorCategory(name: string | undefined | null): boolean {
  if (!name) return false;
  return name.toLowerCase().includes("climatizador");
}

/** Campos técnicos adicionais para climatizador (além de vazão/fluido/tensão). */
export const CLIMATIZADOR_EXTRA_FIELD_DEFINITIONS: CategoryFieldDefinition[] = [
  {
    key: "tipo_instalacao",
    name: "Tipo de instalação",
    type: "select",
    unit: null,
    required: false,
    is_active: true,
    options: ["Parede", "Teto", "Chão", "Industrial", "Outro"],
  },
  {
    key: "potencia_kw",
    name: "Potência do motor",
    type: "text",
    unit: "kW",
    required: false,
    is_active: true,
    options: [],
  },
  {
    key: "pressao_estatica",
    name: "Pressão estática",
    type: "text",
    unit: null,
    required: false,
    is_active: true,
    options: [],
  },
];

export function mergeClimatizadorFieldDefinitions(
  definitions: CategoryFieldDefinition[],
): CategoryFieldDefinition[] {
  const byKey = new Map<string, CategoryFieldDefinition>();
  for (const def of definitions) {
    byKey.set(def.key, def);
  }
  for (const extra of CLIMATIZADOR_EXTRA_FIELD_DEFINITIONS) {
    if (!byKey.has(extra.key)) {
      byKey.set(extra.key, extra);
    }
  }
  return Array.from(byKey.values());
}

export function mapClimatizadorAiToTechnicalData(
  extraction: EquipmentLabelExtractionOut,
  current: Record<string, string>,
): Record<string, string> {
  const next = { ...current };
  if (extraction.vazao_m3h) next.capacity = extraction.vazao_m3h;
  if (extraction.fluido_refrigerante) next.fluid_type = extraction.fluido_refrigerante;
  if (extraction.tensao) next.voltage = extraction.tensao;
  if (extraction.tipo_instalacao) next.tipo_instalacao = extraction.tipo_instalacao;
  if (extraction.potencia_kw) next.potencia_kw = extraction.potencia_kw;
  if (extraction.pressao_estatica) next.pressao_estatica = extraction.pressao_estatica;
  return next;
}

export function mapClimatizadorAiToFormFields(extraction: EquipmentLabelExtractionOut): {
  marca: string;
  modelEvaporator: string;
  technicalData: Record<string, string>;
} {
  return {
    marca: extraction.marca ?? "",
    modelEvaporator: extraction.modelo ?? "",
    technicalData: mapClimatizadorAiToTechnicalData(extraction, {}),
  };
}
