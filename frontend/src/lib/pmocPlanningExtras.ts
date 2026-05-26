export function parsePlanningScheduledRowKeys(extras: Record<string, unknown> | undefined | null): string[] {
  const raw = extras?.planning_scheduled_rows;
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

export function planningScheduledRowKeysToOverrides(rowKeys: string[]): Record<string, "agendado"> {
  const map: Record<string, "agendado"> = {};
  for (const key of rowKeys) map[key] = "agendado";
  return map;
}
