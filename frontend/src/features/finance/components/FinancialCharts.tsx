import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Transacao } from '../transaction.types';
import {
  buildDailyCashFlowChart,
  buildFinancialChartsSummary,
  buildRoiTrend,
  CHART_COLORS,
  type ChartTooltipItem,
  type DailyCashFlowPoint,
} from '../financialChartsData';
import styles from './FinancialCharts.module.css';

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

function formatAxisValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

type TooltipPayload = {
  payload?: DailyCashFlowPoint;
};

function CashFlowTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const items = point.tooltipItems.slice(0, 6);
  const hasMore = point.tooltipItems.length > 6;

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipDate}>{point.label}</p>
      <p style={{ margin: '0 0 0.35rem', color: '#64748b' }}>
        A receber: <strong style={{ color: CHART_COLORS.previsto }}>{money(point.previsto)}</strong>
        {' · '}
        Recebido: <strong style={{ color: CHART_COLORS.recebido }}>{money(point.recebido)}</strong>
      </p>
      {items.map((item, idx) => (
        <TooltipItemRow key={`${item.descricao}-${idx}`} item={item} />
      ))}
      {hasMore ? (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
          +{point.tooltipItems.length - 6} lançamento(s)…
        </p>
      ) : null}
    </div>
  );
}

function TooltipItemRow({ item }: { item: ChartTooltipItem }) {
  return (
    <div className={styles.tooltipRow}>
      <span
        className={`${styles.tooltipType} ${
          item.tipo === 'previsto' ? styles.tooltipTypePrevisto : styles.tooltipTypeRecebido
        }`}
      >
        {item.tipo === 'previsto' ? 'A receber' : 'Recebido'}
      </span>
      <div>{item.descricao}</div>
      <div>
        Bruto: <strong>{money(item.valorBruto)}</strong> · Taxa: <strong>{item.taxaAplicada}%</strong>
      </div>
      <div>
        Líquido: <strong>{money(item.valorLiquido)}</strong>
      </div>
    </div>
  );
}

export type FinancialChartsProps = {
  entries: Transacao[] | undefined;
  isLoading?: boolean;
};

export function FinancialCharts({ entries, isLoading }: FinancialChartsProps) {
  const chartData = useMemo(() => buildDailyCashFlowChart(entries), [entries]);
  const summary = useMemo(() => buildFinancialChartsSummary(entries), [entries]);
  const roiTrend = useMemo(() => buildRoiTrend(entries), [entries]);

  const hasChartValues = chartData.some((d) => d.previsto > 0 || d.recebido > 0);

  return (
    <section className={styles.wrap} aria-label="Gráficos e saúde financeira">
      <div className={styles.chartsLayout}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Fluxo de caixa — próximos 30 dias</h2>
            <p className={styles.chartSubtitle}>
              Valores líquidos por data prevista de liquidação (settlement_date).
            </p>
          </div>

          {isLoading ? (
            <div className={styles.emptyChart}>Carregando gráfico…</div>
          ) : !hasChartValues ? (
            <div className={styles.emptyChart}>
              Sem recebimentos previstos ou liquidados nesta janela.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatAxisValue}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<CashFlowTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }} />
                <Bar
                  dataKey="previsto"
                  name="A receber"
                  fill={CHART_COLORS.previsto}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="recebido"
                  name="Recebido"
                  fill={CHART_COLORS.recebido}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}

          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: CHART_COLORS.previsto }} />
              A receber (previsto)
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: CHART_COLORS.recebido }} />
              Já recebido (pago)
            </span>
          </div>
        </div>

        <div className={styles.sidebar}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Total previsto (30 dias)</span>
            <span className={styles.summaryValueBlue}>{money(summary.totalPrevisto)}</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Total disponível</span>
            <span className={styles.summaryValueGreen}>{money(summary.totalDisponivel)}</span>
          </div>

          <div className={styles.roiCard}>
            <span className={styles.summaryLabel}>Margem ROI (OS)</span>
            <p className={styles.roiValue}>{summary.margemRoiPercent}</p>
            <p className={styles.roiHint}>
              (Recebido OS {money(summary.totalRecebidoOs)} − Insumos {money(summary.totalInsumosOs)})
              / Recebido OS
            </p>
            {roiTrend.some((p) => p.margem > 0) ? (
              <div className={styles.roiChart}>
                <ResponsiveContainer width="100%" height={56}>
                  <LineChart data={roiTrend}>
                    <Line
                      type="monotone"
                      dataKey="margem"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
