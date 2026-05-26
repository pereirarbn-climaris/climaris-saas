/** Teto global de paginação aceito pela API (Pydantic `le=200` na maioria dos endpoints). */
export const API_MAX_PAGE_LIMIT = 200;

/** Garante `1 <= limit <= max` antes de enviar query params. */
export function clampApiLimit(
  limit: number | undefined | null,
  fallback = 50,
  max = API_MAX_PAGE_LIMIT,
): number {
  const raw = limit ?? fallback;
  if (!Number.isFinite(raw)) return Math.min(fallback, max);
  return Math.min(Math.max(Math.trunc(raw), 1), max);
}
