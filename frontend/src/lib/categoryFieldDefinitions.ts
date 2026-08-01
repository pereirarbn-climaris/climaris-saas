import { z } from "zod";
import type {
  CategoryFieldDefinitionIn,
  CategoryFieldDefinitionOut,
  EquipmentCategoryOut,
} from "../api/equipmentCatalog";

export type CategoryFieldType = "text" | "number" | "select";

export type CategoryFieldDefinition = CategoryFieldDefinitionOut;

export type CategoryFieldDraft = {
  localId: string;
  key?: string;
  name: string;
  type: CategoryFieldType;
  unit: string;
  required: boolean;
  is_active: boolean;
  optionsText: string;
};

const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

export function slugifyFieldKey(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let key = normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!key) return "";
  if (!KEY_RE.test(key)) key = `f_${key}`.slice(0, 64);
  return key.slice(0, 64);
}

export function legacyFlagsToDefinitions(
  has_capacity: boolean,
  has_fluid_type: boolean,
  has_voltage: boolean,
): CategoryFieldDefinition[] {
  const defs: CategoryFieldDefinition[] = [];
  if (has_capacity) {
    defs.push({
      key: "capacity",
      name: "Capacidade",
      type: "text",
      unit: null,
      required: false,
      is_active: true,
      options: [],
    });
  }
  if (has_fluid_type) {
    defs.push({
      key: "fluid_type",
      name: "Fluido refrigerante",
      type: "text",
      unit: null,
      required: false,
      is_active: true,
      options: [],
    });
  }
  if (has_voltage) {
    defs.push({
      key: "voltage",
      name: "Tensão",
      type: "text",
      unit: null,
      required: false,
      is_active: true,
      options: [],
    });
  }
  return defs;
}

export function resolveCategoryFieldDefinitions(
  category: Pick<
    EquipmentCategoryOut,
    "field_definitions" | "has_capacity" | "has_fluid_type" | "has_voltage"
  >,
): CategoryFieldDefinition[] {
  if (category.field_definitions?.length) {
    return category.field_definitions.filter((d) => d.is_active);
  }
  return legacyFlagsToDefinitions(
    category.has_capacity,
    category.has_fluid_type,
    category.has_voltage,
  );
}

export function activeFieldDefinitions(definitions: CategoryFieldDefinition[]): CategoryFieldDefinition[] {
  return definitions.filter((d) => d.is_active);
}

export function draftFromDefinition(def: CategoryFieldDefinition, localId?: string): CategoryFieldDraft {
  return {
    localId: localId ?? def.key,
    key: def.key,
    name: def.name,
    type: def.type,
    unit: def.unit ?? "",
    required: def.required,
    is_active: def.is_active,
    optionsText: (def.options ?? []).join("\n"),
  };
}

export function emptyDraft(): CategoryFieldDraft {
  return {
    localId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    type: "text",
    unit: "",
    required: false,
    is_active: true,
    optionsText: "",
  };
}

export function draftsToPayload(drafts: CategoryFieldDraft[]): CategoryFieldDefinitionIn[] {
  const out: CategoryFieldDefinitionIn[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const name = draft.name.trim();
    if (!name) continue;
    const key = (draft.key?.trim() || slugifyFieldKey(name)) || slugifyFieldKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const options =
      draft.type === "select"
        ? draft.optionsText
            .split(/[\n,;]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    out.push({
      key,
      name,
      type: draft.type,
      unit: draft.unit.trim() || null,
      required: draft.required,
      is_active: draft.is_active,
      options,
    });
  }
  return out;
}

export function definitionsFromRow(row: EquipmentCategoryOut): CategoryFieldDraft[] {
  const defs = row.field_definitions?.length
    ? row.field_definitions
    : legacyFlagsToDefinitions(row.has_capacity, row.has_fluid_type, row.has_voltage);
  return defs.map((d) => draftFromDefinition(d));
}

export function technicalDataFromCatalog(item: {
  technical_data?: Record<string, unknown>;
  capacity?: string | null;
  fluid_type?: string | null;
  voltage?: string | null;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = item.technical_data ?? {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) continue;
    out[k] = String(v);
  }
  if (item.capacity && !out.capacity) out.capacity = item.capacity;
  if (item.fluid_type && !out.fluid_type) out.fluid_type = item.fluid_type;
  if (item.voltage && !out.voltage) out.voltage = item.voltage;
  return out;
}

export function formatFieldValue(def: CategoryFieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  if (def.unit?.trim()) return `${text} ${def.unit.trim()}`;
  return text;
}

export type TechnicalSpecRow = {
  key: string;
  label: string;
  value: string;
};

export function buildTechnicalSpecRows(
  definitions: CategoryFieldDefinition[],
  data: Record<string, unknown>,
): TechnicalSpecRow[] {
  const active = activeFieldDefinitions(definitions);
  const rows: TechnicalSpecRow[] = [];
  const seen = new Set<string>();
  for (const def of active) {
    const val = data[def.key];
    if (val === null || val === undefined || val === "") continue;
    const formatted = formatFieldValue(def, val);
    if (!formatted || formatted === "—") continue;
    rows.push({ key: def.key, label: def.name, value: formatted });
    seen.add(def.key);
  }
  for (const [key, val] of Object.entries(data)) {
    if (seen.has(key) || val === null || val === undefined || val === "") continue;
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    rows.push({ key, label, value: String(val).trim() });
  }
  return rows;
}

export function formatTechnicalSummary(
  definitions: CategoryFieldDefinition[],
  data: Record<string, string | number | unknown>,
): string {
  const active = activeFieldDefinitions(definitions);
  if (!active.length) return "—";
  const parts: string[] = [];
  for (const def of active) {
    const val = data[def.key];
    if (val === null || val === undefined || val === "") continue;
    parts.push(`${def.name}: ${formatFieldValue(def, val)}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

export function buildTechnicalDataZodSchema(definitions: CategoryFieldDefinition[]) {
  const active = activeFieldDefinitions(definitions);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of active) {
    let base: z.ZodTypeAny =
      def.type === "number"
        ? z.union([z.string(), z.number()])
        : z.string();
    if (!def.required) {
      base = base.optional();
    } else if (def.type === "number") {
      base = z.union([z.string().min(1, `"${def.name}" é obrigatório.`), z.number()]);
    } else {
      base = z.string().min(1, `"${def.name}" é obrigatório.`);
    }
    shape[def.key] = base;
  }
  return z.object(shape);
}

export function validateTechnicalDataForm(
  definitions: CategoryFieldDefinition[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const def of activeFieldDefinitions(definitions)) {
    const raw = values[def.key] ?? "";
    const trimmed = String(raw).trim();
    if (!trimmed) {
      if (def.required) errors[def.key] = `"${def.name}" é obrigatório.`;
      continue;
    }
    if (def.type === "number") {
      const normalized = trimmed.replace(",", ".");
      if (Number.isNaN(Number(normalized))) {
        errors[def.key] = `"${def.name}" deve ser numérico.`;
      }
    }
    if (def.type === "select" && def.options?.length && !def.options.includes(trimmed)) {
      errors[def.key] = `Selecione uma opção válida para "${def.name}".`;
    }
  }
  return errors;
}

export function serializeTechnicalDataForApi(
  definitions: CategoryFieldDefinition[],
  values: Record<string, string>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const active = activeFieldDefinitions(definitions);
  const known = new Set(active.map((d) => d.key));
  for (const def of active) {
    const raw = values[def.key];
    if (raw === undefined || raw === null) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    if (def.type === "number") {
      const normalized = trimmed.replace(",", ".");
      out[def.key] = Number(normalized);
    } else {
      out[def.key] = trimmed;
    }
  }
  // Preserva especificações livres extraídas do manual (fora das definições da categoria).
  for (const [key, raw] of Object.entries(values)) {
    if (known.has(key)) continue;
    const trimmed = String(raw ?? "").trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}
