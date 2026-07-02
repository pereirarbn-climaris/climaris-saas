export type BudgetTextPreset = {
  id: string;
  name: string;
  text: string;
  is_default: boolean;
};

function newPresetId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function normalizePresets(presets: BudgetTextPreset[]): BudgetTextPreset[] {
  if (!presets.length) return [];
  const seen = new Set<string>();
  const normalized = presets.map((preset) => {
    let id = preset.id.trim() || newPresetId();
    while (seen.has(id)) id = newPresetId();
    seen.add(id);
    return {
      id,
      name: preset.name.trim() || "Modelo",
      text: preset.text,
      is_default: false,
    };
  });
  const defaultId =
    normalized.find((p) => presets.find((x) => x.id === p.id)?.is_default)?.id ??
    normalized.find((p) => presets.some((x) => x.is_default && x.id === p.id))?.id ??
    normalized[0].id;
  return normalized.map((p) => ({ ...p, is_default: p.id === defaultId }));
}

export function defaultTextFromPresets(presets: BudgetTextPreset[]): string {
  const marked = presets.find((p) => p.is_default && p.text.trim());
  if (marked) return marked.text.trim();
  const first = presets.find((p) => p.text.trim());
  return first?.text.trim() ?? "";
}

export function createEmptyPreset(name = "Novo modelo"): BudgetTextPreset {
  return { id: newPresetId(), name, text: "", is_default: false };
}

export function addPreset(presets: BudgetTextPreset[], preset: BudgetTextPreset): BudgetTextPreset[] {
  const next = normalizePresets([...presets, preset]);
  if (next.length === 1) {
    return next.map((p) => ({ ...p, is_default: true }));
  }
  return next;
}

export function updatePreset(
  presets: BudgetTextPreset[],
  id: string,
  patch: Partial<Pick<BudgetTextPreset, "name" | "text">>,
): BudgetTextPreset[] {
  return normalizePresets(
    presets.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  );
}

export function removePreset(presets: BudgetTextPreset[], id: string): BudgetTextPreset[] {
  return normalizePresets(presets.filter((p) => p.id !== id));
}

export function setDefaultPreset(presets: BudgetTextPreset[], id: string): BudgetTextPreset[] {
  return normalizePresets(
    presets.map((p) => ({ ...p, is_default: p.id === id })),
  );
}

export function ensureAtLeastOnePreset(
  presets: BudgetTextPreset[],
  fallbackName: string,
): BudgetTextPreset[] {
  if (presets.length) return normalizePresets(presets);
  return [{ id: newPresetId(), name: fallbackName, text: "", is_default: true }];
}
