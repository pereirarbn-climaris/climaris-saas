/** Formata minutos de antecedência para exibição (alinhado ao backend). */
export function formatReminderOffsetMinutes(minutes: number): string {
  const m = Math.floor(minutes);
  if (m <= 0) return "—";
  if (m === 15) return "15 min";
  if (m === 30) return "30 min";
  if (m === 60) return "1 h";
  if (m === 24 * 60) return "24 h";
  if (m < 60) return `${m} min`;
  if (m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? "1 h" : `${h} h`;
  }
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} h ${rest} min` : `${h} h`;
}

export function formatReminderOffsetsList(offsets: number[]): string {
  if (!offsets.length) return "nenhum";
  return [...offsets]
    .sort((a, b) => a - b)
    .map(formatReminderOffsetMinutes)
    .join(", ");
}

export type ReminderRulesDraft = {
  offset_15m: boolean;
  offset_30m: boolean;
  offset_1h: boolean;
  offset_1d: boolean;
  custom_enabled: boolean;
  custom_minutes: number | "";
};

const PRESET_MINUTES: { key: keyof Pick<ReminderRulesDraft, "offset_15m" | "offset_30m" | "offset_1h" | "offset_1d">; minutes: number }[] = [
  { key: "offset_15m", minutes: 15 },
  { key: "offset_30m", minutes: 30 },
  { key: "offset_1h", minutes: 60 },
  { key: "offset_1d", minutes: 24 * 60 },
];

/** Espelha `active_offsets_minutes` do backend para o rascunho da UI. */
export function computeDraftActiveOffsets(draft: ReminderRulesDraft): number[] {
  const out: number[] = [];
  for (const { key, minutes } of PRESET_MINUTES) {
    if (draft[key]) out.push(minutes);
  }
  if (draft.custom_enabled && draft.custom_minutes !== "" && Number(draft.custom_minutes) > 0) {
    out.push(Math.floor(Number(draft.custom_minutes)));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function validateReminderRulesDraft(draft: ReminderRulesDraft): { ok: true } | { ok: false; message: string } {
  if (computeDraftActiveOffsets(draft).length > 0) {
    return { ok: true };
  }
  return {
    ok: false,
    message: "Ative ao menos um gatilho de tempo (15 min, 30 min, 1 h, 24 h ou personalizado).",
  };
}
