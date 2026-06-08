import type { FinanceCategoryOut } from '../../api/finance';

export function normalizeFinanceCategoryValue(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v || v.toLowerCase() === 'sem categoria') return '';
  return v;
}

export function resolveCategoryIdByName(
  categoria: string,
  categories: FinanceCategoryOut[],
): number | null {
  const name = normalizeFinanceCategoryValue(categoria).toLowerCase();
  if (!name) return null;
  const found = categories.find((c) => c.name.trim().toLowerCase() === name);
  return found?.id ?? null;
}
