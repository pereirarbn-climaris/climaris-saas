import type { MonthlyDRE } from './financeCalculator';

export type MonthlyDREApi = {
  month: number;
  year: number;
  receita_bruta: number;
  custos_variaveis: number;
  margem_contribuicao: number;
  custos_fixos: number;
  lucro_liquido: number;
};

export type FinanceDREReportApi = {
  month: number;
  year: number;
  current: MonthlyDREApi;
  history: MonthlyDREApi[];
};

export function mapMonthlyDREFromApi(row: MonthlyDREApi): MonthlyDRE {
  return {
    month: row.month,
    year: row.year,
    receitaBruta: row.receita_bruta,
    custosVariaveis: row.custos_variaveis,
    margemContribuicao: row.margem_contribuicao,
    custosFixos: row.custos_fixos,
    lucroLiquido: row.lucro_liquido,
  };
}

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export function dreMonthLabel(month: number, year: number): string {
  return `${MONTH_LABELS[month - 1] ?? month}/${String(year).slice(-2)}`;
}

export function downloadDRECsv(report: FinanceDREReportApi): void {
  const header =
    'mes;ano;receita_bruta;custos_variaveis;margem_contribuicao;custos_fixos;lucro_liquido';
  const lines = report.history.map(
    (r) =>
      `${r.month};${r.year};${r.receita_bruta};${r.custos_variaveis};${r.margem_contribuicao};${r.custos_fixos};${r.lucro_liquido}`,
  );
  const blob = new Blob([`\uFEFF${header}\n${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dre-${report.year}-${String(report.month).padStart(2, '0')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
