import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyDRE } from '../financeCalculator';
import { dreMonthLabel } from '../dreReportUtils';
import styles from './DREStackedBarChart.module.css';

const COLORS = {
  receita: '#16a34a',
  custoVariavel: '#ca8a04',
  custoFixo: '#dc2626',
};

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

function formatAxisValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

type ChartPoint = {
  label: string;
  receita: number;
  custoVariavel: number;
  custoFixo: number;
  lucro: number;
};

export type DREStackedBarChartProps = {
  history: MonthlyDRE[];
};

export function DREStackedBarChart({ history }: DREStackedBarChartProps) {
  const data = useMemo<ChartPoint[]>(
    () =>
      history.map((row) => ({
        label: dreMonthLabel(row.month, row.year),
        receita: row.receitaBruta,
        custoVariavel: row.custosVariaveis,
        custoFixo: row.custosFixos,
        lucro: row.lucroLiquido,
      })),
    [history],
  );

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatAxisValue} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number, name: string) => [money(value), name]}
            labelFormatter={(label) => `Período: ${label}`}
            contentStyle={{ fontSize: '0.8125rem' }}
          />
          <Legend />
          <Bar
            dataKey="receita"
            name="Receita"
            stackId="dre"
            fill={COLORS.receita}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="custoVariavel"
            name="Custo variável"
            stackId="dre"
            fill={COLORS.custoVariavel}
          />
          <Bar
            dataKey="custoFixo"
            name="Custo fixo"
            stackId="dre"
            fill={COLORS.custoFixo}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className={styles.hint}>
        Barras empilhadas dos últimos meses (lançamentos pagos). Lucro líquido = receita − custos.
      </p>
    </div>
  );
}
