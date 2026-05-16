/**
 * Revenue Chart Component
 * 
 * Gráfico de faturamento com suporte a barras e linha de tendência.
 * Usa SVG puro para evitar dependências externas.
 * 
 * @example
 * ```tsx
 * import { RevenueChart, RevenueChartCard } from './revenue-chart';
 * 
 * const data = [
 *   { month: 'Jan', revenue: 45000, target: 50000 },
 *   { month: 'Fev', revenue: 52000, target: 50000 },
 *   { month: 'Mar', revenue: 48000, target: 55000 },
 * ];
 * 
 * // Uso simples
 * <RevenueChart data={data} />
 * 
 * // Com card wrapper
 * <RevenueChartCard 
 *   title="Faturamento Mensal" 
 *   data={data}
 *   totalRevenue={145000}
 *   growthPercent={12.5}
 * />
 * ```
 */

import React, { useMemo, useState } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface RevenueDataPoint {
  /** Label do período (ex: 'Jan', 'Fev', 'Mar') */
  month: string;
  /** Valor do faturamento */
  revenue: number;
  /** Meta opcional para comparação */
  target?: number;
  /** Dados extras para tooltip */
  details?: {
    orders?: number;
    clients?: number;
  };
}

export interface RevenueChartProps {
  /** Dados do gráfico */
  data: RevenueDataPoint[];
  /** Altura do gráfico em pixels */
  height?: number;
  /** Mostrar linha de meta */
  showTarget?: boolean;
  /** Mostrar linha de tendência */
  showTrendLine?: boolean;
  /** Mostrar valores nas barras */
  showValues?: boolean;
  /** Formato de moeda */
  currency?: string;
  /** Locale para formatação */
  locale?: string;
  /** Cor das barras (usa CSS variable) */
  barColor?: 'primary' | 'success' | 'warning';
  /** Callback ao clicar em uma barra */
  onBarClick?: (data: RevenueDataPoint, index: number) => void;
  /** Estado de loading */
  loading?: boolean;
}

export interface RevenueChartCardProps extends RevenueChartProps {
  /** Título do card */
  title?: string;
  /** Subtítulo ou descrição */
  subtitle?: string;
  /** Total do período */
  totalRevenue?: number;
  /** Percentual de crescimento */
  growthPercent?: number;
  /** Período de comparação */
  comparisonPeriod?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(value: number, currency = 'BRL', locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number, currency = 'BRL', locale = 'pt-BR'): string {
  if (value >= 1000000) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  if (value >= 1000) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return formatCurrency(value, currency, locale);
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    width: '100%',
    position: 'relative' as const,
  },
  svg: {
    width: '100%',
    height: '100%',
    overflow: 'visible' as const,
  },
  card: {
    background: 'var(--color-surface-elevated)',
    borderRadius: 'var(--card-radius)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--card-shadow)',
    padding: 'var(--card-padding-lg)',
    transition: 'box-shadow var(--motion-duration) var(--motion-easing)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 'var(--space-6)',
    gap: 'var(--space-4)',
    flexWrap: 'wrap' as const,
  },
  cardTitleGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-1)',
  },
  cardTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-semibold)' as unknown as number,
    color: 'var(--color-text)',
    margin: 0,
    lineHeight: 'var(--line-height-tight)',
  },
  cardSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
  statsGroup: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--space-3)',
    flexWrap: 'wrap' as const,
  },
  totalRevenue: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)' as unknown as number,
    color: 'var(--color-text)',
    lineHeight: 1,
  },
  growthBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: '0.25rem 0.5rem',
    borderRadius: 'var(--badge-radius)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
  },
  legend: {
    display: 'flex',
    gap: 'var(--space-4)',
    marginTop: 'var(--space-4)',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
  },
  legendDot: {
    width: '0.625rem',
    height: '0.625rem',
    borderRadius: '50%',
    flexShrink: 0,
  },
  tooltip: {
    position: 'absolute' as const,
    background: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-3)',
    boxShadow: 'var(--card-shadow-hover)',
    zIndex: 50,
    pointerEvents: 'none' as const,
    minWidth: '140px',
  },
  tooltipTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)' as unknown as number,
    color: 'var(--color-text)',
    marginBottom: 'var(--space-2)',
  },
  tooltipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-muted)',
    marginTop: 'var(--space-1)',
  },
  tooltipValue: {
    fontWeight: 'var(--font-weight-medium)' as unknown as number,
    color: 'var(--color-text)',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
  },
  skeleton: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 'var(--space-2)',
    width: '100%',
    height: '200px',
    padding: '0 var(--space-4)',
  },
  skeletonBar: {
    flex: 1,
    background: 'var(--color-border)',
    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
};

// ============================================================================
// ICONS
// ============================================================================

function TrendUpIcon({ size = 14 }: { size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function TrendDownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  );
}

// ============================================================================
// CHART SKELETON
// ============================================================================

export function RevenueChartSkeleton({ height = 200 }: { height?: number }) {
  const barHeights = [60, 80, 45, 90, 70, 85, 55, 75, 65, 80, 50, 95];
  
  return (
    <div style={{ ...styles.skeleton, height }}>
      {barHeights.map((h, i) => (
        <div
          key={i}
          style={{
            ...styles.skeletonBar,
            height: `${h}%`,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// MAIN CHART COMPONENT
// ============================================================================

export function RevenueChart({
  data,
  height = 220,
  showTarget = true,
  showTrendLine = true,
  showValues = false,
  currency = 'BRL',
  locale = 'pt-BR',
  barColor = 'primary',
  onBarClick,
  loading = false,
}: RevenueChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const colorMap = {
    primary: 'var(--color-primary)',
    success: 'var(--color-success-light)',
    warning: 'var(--color-warning-light)',
  };

  const barFill = colorMap[barColor];

  // Calcula valores para o gráfico
  const chartData = useMemo(() => {
    if (!data.length) return { maxValue: 0, points: [], trendPoints: '' };

    const allValues = data.flatMap(d => [d.revenue, d.target || 0]);
    const maxValue = Math.max(...allValues) * 1.15; // 15% de margem

    const padding = { top: 20, right: 20, bottom: 40, left: 20 };
    const chartWidth = 100; // Usamos porcentagem
    const chartHeight = height - padding.top - padding.bottom;
    
    const barWidth = (chartWidth - padding.left - padding.right) / data.length * 0.6;
    const barGap = (chartWidth - padding.left - padding.right) / data.length * 0.4;

    const points = data.map((d, i) => {
      const barHeight = (d.revenue / maxValue) * chartHeight;
      const x = padding.left + i * (barWidth + barGap) + barGap / 2;
      const y = chartHeight - barHeight + padding.top;
      const targetY = d.target ? chartHeight - (d.target / maxValue) * chartHeight + padding.top : 0;
      
      return {
        ...d,
        x,
        y,
        barHeight,
        barWidth,
        targetY,
        centerX: x + barWidth / 2,
      };
    });

    // Linha de tendência (média móvel simples)
    const trendPoints = points
      .map((p) => `${p.centerX},${p.y}`)
      .join(' ');

    return { maxValue, points, trendPoints };
  }, [data, height]);

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 80,
    });
    setHoveredIndex(index);
  };

  if (loading) {
    return <RevenueChartSkeleton height={height} />;
  }

  if (!data.length) {
    return (
      <div style={styles.loadingContainer}>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          Sem dados para exibir
        </span>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, height }}>
      <svg 
        style={styles.svg} 
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = 20 + (height - 60) * (1 - ratio);
          return (
            <line
              key={ratio}
              x1="20"
              y1={y}
              x2="95"
              y2={y}
              stroke="var(--color-border)"
              strokeWidth="0.3"
              strokeDasharray="2,2"
            />
          );
        })}

        {/* Barras */}
        {chartData.points.map((point, index) => (
          <g key={index}>
            {/* Barra de fundo (hover area) */}
            <rect
              x={point.x - 2}
              y={20}
              width={point.barWidth + 4}
              height={height - 60}
              fill="transparent"
              style={{ cursor: onBarClick ? 'pointer' : 'default' }}
              onMouseMove={(e) => handleMouseMove(e as unknown as React.MouseEvent, index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => onBarClick?.(data[index], index)}
            />
            
            {/* Barra principal */}
            <rect
              x={point.x}
              y={point.y}
              width={point.barWidth}
              height={point.barHeight}
              fill={barFill}
              rx="1"
              ry="1"
              opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.5}
              style={{
                transition: 'opacity var(--motion-duration) var(--motion-easing)',
              }}
            />

            {/* Meta (linha pontilhada) */}
            {showTarget && point.target && (
              <line
                x1={point.x - 1}
                y1={point.targetY}
                x2={point.x + point.barWidth + 1}
                y2={point.targetY}
                stroke="var(--color-warning)"
                strokeWidth="0.5"
                strokeDasharray="1,1"
              />
            )}

            {/* Label do mês */}
            <text
              x={point.centerX}
              y={height - 15}
              textAnchor="middle"
              fill="var(--color-text-muted)"
              fontSize="3"
              fontWeight="500"
            >
              {point.month}
            </text>

            {/* Valor na barra */}
            {showValues && (
              <text
                x={point.centerX}
                y={point.y - 3}
                textAnchor="middle"
                fill="var(--color-text-muted)"
                fontSize="2.5"
                fontWeight="500"
              >
                {formatCompactCurrency(point.revenue, currency, locale)}
              </text>
            )}
          </g>
        ))}

        {/* Linha de tendência */}
        {showTrendLine && chartData.trendPoints && (
          <polyline
            points={chartData.trendPoints}
            fill="none"
            stroke="var(--color-primary-light)"
            strokeWidth="0.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.6"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && (
        <div
          style={{
            ...styles.tooltip,
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translateX(-50%)',
          }}
        >
          <div style={styles.tooltipTitle}>{data[hoveredIndex].month}</div>
          <div style={styles.tooltipRow}>
            <span>Faturamento</span>
            <span style={styles.tooltipValue}>
              {formatCurrency(data[hoveredIndex].revenue, currency, locale)}
            </span>
          </div>
          {data[hoveredIndex].target && (
            <div style={styles.tooltipRow}>
              <span>Meta</span>
              <span style={styles.tooltipValue}>
                {formatCurrency(data[hoveredIndex].target, currency, locale)}
              </span>
            </div>
          )}
          {data[hoveredIndex].details?.orders && (
            <div style={styles.tooltipRow}>
              <span>Ordens</span>
              <span style={styles.tooltipValue}>{data[hoveredIndex].details.orders}</span>
            </div>
          )}
          {data[hoveredIndex].details?.clients && (
            <div style={styles.tooltipRow}>
              <span>Clientes</span>
              <span style={styles.tooltipValue}>{data[hoveredIndex].details.clients}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CHART CARD WRAPPER
// ============================================================================

export function RevenueChartCard({
  title = 'Faturamento',
  subtitle,
  totalRevenue,
  growthPercent,
  comparisonPeriod = 'vs. mês anterior',
  data,
  loading,
  ...chartProps
}: RevenueChartCardProps) {
  const isPositiveGrowth = growthPercent !== undefined && growthPercent >= 0;

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitleGroup}>
          <h3 style={styles.cardTitle}>{title}</h3>
          {subtitle && <p style={styles.cardSubtitle}>{subtitle}</p>}
        </div>

        {(totalRevenue !== undefined || growthPercent !== undefined) && (
          <div style={styles.statsGroup}>
            {totalRevenue !== undefined && (
              <span style={styles.totalRevenue}>
                {formatCurrency(totalRevenue, chartProps.currency, chartProps.locale)}
              </span>
            )}
            {growthPercent !== undefined && (
              <span
                style={{
                  ...styles.growthBadge,
                  background: isPositiveGrowth
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                  color: isPositiveGrowth
                    ? 'var(--color-success)'
                    : 'var(--color-error)',
                }}
              >
                {isPositiveGrowth ? <TrendUpIcon /> : <TrendDownIcon />}
                {isPositiveGrowth ? '+' : ''}{growthPercent.toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>

      <RevenueChart data={data} loading={loading} {...chartProps} />

      {/* Legenda */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendDot, background: 'var(--color-primary)' }} />
          <span>Faturamento</span>
        </div>
        {chartProps.showTarget && (
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendDot, background: 'var(--color-warning)' }} />
            <span>Meta</span>
          </div>
        )}
        {chartProps.showTrendLine && (
          <div style={styles.legendItem}>
            <div 
              style={{ 
                width: '1rem', 
                height: '2px', 
                background: 'var(--color-primary-light)',
                opacity: 0.6,
                borderRadius: '1px',
              }} 
            />
            <span>Tendência</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MINI CHART (para uso em cards menores)
// ============================================================================

export interface MiniRevenueChartProps {
  /** Dados simplificados (apenas valores) */
  values: number[];
  /** Cor da linha */
  color?: 'primary' | 'success' | 'warning' | 'error';
  /** Altura do gráfico */
  height?: number;
  /** Largura do gráfico */
  width?: number;
  /** Mostrar área preenchida */
  showArea?: boolean;
}

export function MiniRevenueChart({
  values,
  color = 'primary',
  height = 40,
  width = 100,
  showArea = true,
}: MiniRevenueChartProps) {
  const colorMap = {
    primary: 'var(--color-primary)',
    success: 'var(--color-success-light)',
    warning: 'var(--color-warning-light)',
    error: 'var(--color-error-light)',
  };

  const strokeColor = colorMap[color];

  const points = useMemo(() => {
    if (!values.length) return '';
    
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    
    const padding = 4;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    return values
      .map((v, i) => {
        const x = padding + (i / (values.length - 1)) * chartWidth;
        const y = padding + chartHeight - ((v - min) / range) * chartHeight;
        return `${x},${y}`;
      })
      .join(' ');
  }, [values, width, height]);

  const areaPath = useMemo(() => {
    if (!values.length || !showArea) return '';
    
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    
    const padding = 4;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const pointsArr = values.map((v, i) => {
      const x = padding + (i / (values.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((v - min) / range) * chartHeight;
      return { x, y };
    });

    const startX = padding;
    const endX = padding + chartWidth;
    const bottomY = height - padding;

    return `M${startX},${bottomY} ${pointsArr.map(p => `L${p.x},${p.y}`).join(' ')} L${endX},${bottomY} Z`;
  }, [values, width, height, showArea]);

  if (!values.length) return null;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {/* Área preenchida */}
      {showArea && areaPath && (
        <path
          d={areaPath}
          fill={strokeColor}
          opacity="0.1"
        />
      )}
      
      {/* Linha */}
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Ponto final */}
      {points && (
        <circle
          cx={points.split(' ').pop()?.split(',')[0]}
          cy={points.split(' ').pop()?.split(',')[1]}
          r="3"
          fill={strokeColor}
        />
      )}
    </svg>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default RevenueChart;
