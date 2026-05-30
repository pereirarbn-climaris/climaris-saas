/** Utilitários de recorrência no wizard financeiro. */

export type RecurringFrequencyOption = 'none' | 'weekly' | 'monthly';

export type RecurringFormState = {
  frequency: RecurringFrequencyOption;
  dayOfMonth: number;
  weekday: number;
  endDate: string;
  noEnd: boolean;
};

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Segunda-feira' },
  { value: 1, label: 'Terça-feira' },
  { value: 2, label: 'Quarta-feira' },
  { value: 3, label: 'Quinta-feira' },
  { value: 4, label: 'Sexta-feira' },
  { value: 5, label: 'Sábado' },
  { value: 6, label: 'Domingo' },
] as const;

/** Converte Date.getDay() (0=dom) para weekday API (0=seg). */
export function jsDayToWeekday(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function defaultRecurringState(firstDue: Date): RecurringFormState {
  return {
    frequency: 'none',
    dayOfMonth: Math.min(28, Math.max(1, firstDue.getDate())),
    weekday: jsDayToWeekday(firstDue.getDay()),
    endDate: '',
    noEnd: true,
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseIsoDate(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

/** Valida datas da recorrência; retorna mensagem de erro ou null. */
export function validateRecurringForm(
  state: RecurringFormState,
  firstDue: Date,
): string | null {
  if (state.frequency === 'none') return null;
  const today = startOfToday();
  const due = new Date(firstDue);
  due.setHours(0, 0, 0, 0);
  if (due < today) {
    return 'A primeira ocorrência não pode ser em data passada.';
  }
  if (!state.noEnd && state.endDate) {
    const end = parseIsoDate(state.endDate);
    end.setHours(0, 0, 0, 0);
    if (end < today) {
      return 'A data de encerramento não pode ser anterior a hoje.';
    }
    if (end < due) {
      return 'A data de encerramento deve ser igual ou posterior à primeira ocorrência.';
    }
  }
  if (state.frequency === 'monthly' && (state.dayOfMonth < 1 || state.dayOfMonth > 28)) {
    return 'Informe o dia do vencimento entre 1 e 28.';
  }
  return null;
}

export function buildRecurringPreviewMessage(state: RecurringFormState): string | null {
  if (state.frequency === 'none') return null;
  const endPart =
    state.noEnd || !state.endDate
      ? 'sem data de término'
      : `até ${state.endDate.split('-').reverse().join('/')}`;
  if (state.frequency === 'monthly') {
    return `O sistema criará todos os lançamentos no calendário (dia ${state.dayOfMonth} de cada mês) ${endPart}. Eles aparecem na listagem conforme o filtro de período.`;
  }
  const label = WEEKDAY_OPTIONS.find((w) => w.value === state.weekday)?.label ?? 'semana';
  return `O sistema criará todos os lançamentos no calendário (toda ${label}) ${endPart}. Eles aparecem na listagem conforme o filtro de período.`;
}

export function toApiRecurringPayload(state: RecurringFormState):
  | {
      frequency: 'weekly' | 'monthly';
      day_of_month?: number;
      weekday?: number;
      end_date?: string | null;
    }
  | undefined {
  if (state.frequency === 'none') return undefined;
  return {
    frequency: state.frequency,
    day_of_month: state.frequency === 'monthly' ? state.dayOfMonth : undefined,
    weekday: state.frequency === 'weekly' ? state.weekday : undefined,
    end_date: state.noEnd || !state.endDate ? null : state.endDate,
  };
}

export function isRecurringAllowed(opts: {
  osLinkLocked: boolean;
  installmentCount: number;
}): boolean {
  if (opts.osLinkLocked) return false;
  if (opts.installmentCount > 1) return false;
  return true;
}
