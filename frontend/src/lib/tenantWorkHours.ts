export type WeekdayHourSlice = { start: string; end: string };

type TenantExpedienteLike = {
  weekday_work_hours?: Record<string, WeekdayHourSlice> | null;
  workday_start?: string | null;
  workday_end?: string | null;
  business_days?: string | null;
};

/** Horário por dia da semana: weekday_work_hours ou fallback do expediente da empresa. */
export function resolveTenantWeekdayWorkHours(
  tenant: TenantExpedienteLike | null | undefined,
): Record<string, WeekdayHourSlice> {
  const raw = tenant?.weekday_work_hours;
  if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
    return raw;
  }
  if (!tenant) return {};

  const start = tenant.workday_start?.trim() || "08:00";
  const end = tenant.workday_end?.trim() || "18:00";
  const days: number[] = [];
  for (const part of (tenant.business_days ?? "0,1,2,3,4").split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n >= 0 && n <= 6) days.push(n);
  }
  const unique = [...new Set(days.length ? days : [0, 1, 2, 3, 4])].sort((a, b) => a - b);
  const map: Record<string, WeekdayHourSlice> = {};
  for (const d of unique) {
    map[String(d)] = { start, end };
  }
  return map;
}
