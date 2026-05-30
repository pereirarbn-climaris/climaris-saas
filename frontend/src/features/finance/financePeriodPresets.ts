/** Atalhos de período para listagem e gráficos do financeiro. */

export type FinancePeriodPreset = 'month' | 'quarter' | 'semester' | 'year';

export type FinancePeriodRange = { inicio: Date; fim: Date };

export const FINANCE_PERIOD_PRESET_LABELS: Record<FinancePeriodPreset, string> = {
  month: 'Mês',
  quarter: 'Trimestral',
  semester: 'Semestral',
  year: 'Anual',
};

export function periodRangeForPreset(
  preset: FinancePeriodPreset,
  reference = new Date(),
): FinancePeriodRange {
  const y = reference.getFullYear();
  const m = reference.getMonth();

  if (preset === 'month') {
    return {
      inicio: new Date(y, m, 1),
      fim: new Date(y, m + 1, 0),
    };
  }

  if (preset === 'quarter') {
    const startMonth = Math.floor(m / 3) * 3;
    return {
      inicio: new Date(y, startMonth, 1),
      fim: new Date(y, startMonth + 3, 0),
    };
  }

  if (preset === 'semester') {
    const startMonth = m < 6 ? 0 : 6;
    return {
      inicio: new Date(y, startMonth, 1),
      fim: new Date(y, startMonth + 6, 0),
    };
  }

  return {
    inicio: new Date(y, 0, 1),
    fim: new Date(y, 11, 31),
  };
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Detecta se o intervalo coincide com um atalho (mês/trimestre/semestre/ano corrente). */
export function detectPeriodPreset(
  inicioIso: string,
  fimIso: string,
  reference = new Date(),
): FinancePeriodPreset | 'custom' {
  for (const preset of ['month', 'quarter', 'semester', 'year'] as const) {
    const { inicio, fim } = periodRangeForPreset(preset, reference);
    if (formatDateOnly(inicio) === inicioIso && formatDateOnly(fim) === fimIso) {
      return preset;
    }
  }
  return 'custom';
}
