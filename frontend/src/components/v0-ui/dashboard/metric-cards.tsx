/**
 * MetricCards - Componentes modulares para exibir KPIs no Dashboard
 * 
 * Utiliza o design system definido em index.css com CSS variables.
 * Suporta diferentes variantes, tendencias e animacoes.
 */

import { type ReactNode, type CSSProperties } from "react";

/* ============================================================================
   TIPOS
============================================================================ */

type MetricVariant = "default" | "success" | "warning" | "error" | "primary";
type MetricTrend = "up" | "down" | "neutral";
type MetricSize = "sm" | "md" | "lg";

interface MetricCardProps {
  /** Titulo do card (ex: "Ordens de Servico Ativas") */
  title: string;
  /** Valor principal do KPI */
  value: string | number;
  /** Icone do card */
  icon?: ReactNode;
  /** Variante de cor */
  variant?: MetricVariant;
  /** Texto de variacao/tendencia (ex: "+12%") */
  change?: string;
  /** Direcao da tendencia */
  trend?: MetricTrend;
  /** Texto auxiliar (ex: "vs mes anterior") */
  subtitle?: string;
  /** Tamanho do card */
  size?: MetricSize;
  /** Acao ao clicar */
  onClick?: () => void;
  /** Classes CSS adicionais */
  className?: string;
}

interface MetricGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

interface MetricIconWrapperProps {
  children: ReactNode;
  variant?: MetricVariant;
}

/* ============================================================================
   UTILITARIOS DE COR
============================================================================ */

const variantColors: Record<MetricVariant, { bg: string; text: string; iconBg: string }> = {
  default: {
    bg: "var(--color-surface-elevated)",
    text: "var(--color-text)",
    iconBg: "var(--color-surface)",
  },
  primary: {
    bg: "var(--color-surface-elevated)",
    text: "var(--color-primary)",
    iconBg: "rgba(14, 165, 233, 0.1)",
  },
  success: {
    bg: "var(--color-surface-elevated)",
    text: "var(--color-success)",
    iconBg: "rgba(34, 197, 94, 0.1)",
  },
  warning: {
    bg: "var(--color-surface-elevated)",
    text: "var(--color-warning)",
    iconBg: "rgba(245, 158, 11, 0.1)",
  },
  error: {
    bg: "var(--color-surface-elevated)",
    text: "var(--color-error)",
    iconBg: "rgba(239, 68, 68, 0.1)",
  },
};

const trendColors: Record<MetricTrend, string> = {
  up: "var(--color-success)",
  down: "var(--color-error)",
  neutral: "var(--color-text-muted)",
};

const sizeStyles: Record<MetricSize, { padding: string; valueSize: string; titleSize: string }> = {
  sm: {
    padding: "var(--space-4)",
    valueSize: "var(--font-size-xl)",
    titleSize: "var(--font-size-xs)",
  },
  md: {
    padding: "var(--card-padding)",
    valueSize: "var(--font-size-3xl)",
    titleSize: "var(--font-size-sm)",
  },
  lg: {
    padding: "var(--card-padding-lg)",
    valueSize: "var(--font-size-4xl)",
    titleSize: "var(--font-size-base)",
  },
};

/* ============================================================================
   ICONES DE TENDENCIA
============================================================================ */

function TrendUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function TrendDownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  );
}

function TrendNeutralIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ============================================================================
   ICONES PADRAO PARA METRICAS
============================================================================ */

export function MetricIconOrders() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="var(--icon-stroke)"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

export function MetricIconClients() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="var(--icon-stroke)"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function MetricIconRevenue() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="var(--icon-stroke)"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function MetricIconGrowth() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="var(--icon-stroke)"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

export function MetricIconTime() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="var(--icon-stroke)"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function MetricIconCheck() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="var(--icon-stroke)"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

/* ============================================================================
   METRIC ICON WRAPPER
============================================================================ */

function MetricIconWrapper({ children, variant = "default" }: MetricIconWrapperProps) {
  const colors = variantColors[variant];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "var(--stat-card-icon-size)",
        height: "var(--stat-card-icon-size)",
        background: colors.iconBg,
        borderRadius: "var(--stat-card-icon-radius)",
        color: colors.text,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

/* ============================================================================
   METRIC CARD
============================================================================ */

function MetricCard({
  title,
  value,
  icon,
  variant = "default",
  change,
  trend = "neutral",
  subtitle,
  size = "md",
  onClick,
  className = "",
}: MetricCardProps) {
  const colors = variantColors[variant];
  const sizes = sizeStyles[size];
  const isClickable = !!onClick;

  const cardStyles: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-4)",
    padding: sizes.padding,
    background: colors.bg,
    borderRadius: "var(--card-radius)",
    border: "1px solid var(--color-border)",
    boxShadow: "var(--card-shadow)",
    transition: "box-shadow var(--motion-duration) var(--motion-easing), transform var(--motion-duration) var(--motion-easing)",
    cursor: isClickable ? "pointer" : "default",
  };

  const TrendIcon = trend === "up" ? TrendUpIcon : trend === "down" ? TrendDownIcon : TrendNeutralIcon;

  const content = (
    <>
      {/* Header com icone e titulo */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: sizes.titleSize,
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-text-muted)",
              lineHeight: "var(--line-height-tight)",
              textTransform: "uppercase",
              letterSpacing: "0.025em",
            }}
          >
            {title}
          </p>
        </div>
        {icon && <MetricIconWrapper variant={variant}>{icon}</MetricIconWrapper>}
      </div>

      {/* Valor principal */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: sizes.valueSize,
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-text)",
            lineHeight: "var(--line-height-tight)",
            letterSpacing: "-0.025em",
          }}
        >
          {value}
        </span>

        {/* Badge de variacao */}
        {change && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
              padding: "var(--space-1) var(--space-2)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              color: trendColors[trend],
              background: trend === "up"
                ? "rgba(34, 197, 94, 0.1)"
                : trend === "down"
                ? "rgba(239, 68, 68, 0.1)"
                : "var(--color-surface)",
              borderRadius: "var(--badge-radius)",
            }}
          >
            <TrendIcon />
            {change}
          </span>
        )}
      </div>

      {/* Subtitulo */}
      {subtitle && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text-subtle)",
            lineHeight: "var(--line-height-normal)",
          }}
        >
          {subtitle}
        </p>
      )}
    </>
  );

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`metric-card metric-card--clickable ${className}`}
        style={{
          ...cardStyles,
          textAlign: "left",
          border: "1px solid var(--color-border)",
        }}
      >
        {content}
        <style>{`
          .metric-card--clickable:hover {
            box-shadow: var(--card-shadow-hover) !important;
            transform: translateY(-2px);
          }
          .metric-card--clickable:focus-visible {
            outline: 2px solid var(--color-primary);
            outline-offset: 2px;
          }
        `}</style>
      </button>
    );
  }

  return (
    <article className={`metric-card ${className}`} style={cardStyles}>
      {content}
    </article>
  );
}

/* ============================================================================
   METRIC GRID
============================================================================ */

function MetricGrid({ children, columns = 4, className = "" }: MetricGridProps) {
  const gridTemplateColumns = {
    1: "1fr",
    2: "repeat(2, 1fr)",
    3: "repeat(3, 1fr)",
    4: "repeat(4, 1fr)",
  };

  return (
    <div
      className={`metric-grid ${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: gridTemplateColumns[columns],
        gap: "var(--space-4)",
      }}
    >
      {children}
      <style>{`
        @media (max-width: 1024px) {
          .metric-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          .metric-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ============================================================================
   METRIC CARD SKELETON (LOADING STATE)
============================================================================ */

interface MetricCardSkeletonProps {
  size?: MetricSize;
}

function MetricCardSkeleton({ size = "md" }: MetricCardSkeletonProps) {
  const sizes = sizeStyles[size];

  return (
    <div
      className="metric-card-skeleton"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        padding: sizes.padding,
        background: "var(--color-surface-elevated)",
        borderRadius: "var(--card-radius)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header skeleton */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div
          className="skeleton-pulse"
          style={{
            width: "60%",
            height: "0.875rem",
            background: "var(--color-surface)",
            borderRadius: "var(--radius-sm)",
          }}
        />
        <div
          className="skeleton-pulse"
          style={{
            width: "var(--stat-card-icon-size)",
            height: "var(--stat-card-icon-size)",
            background: "var(--color-surface)",
            borderRadius: "var(--stat-card-icon-radius)",
          }}
        />
      </div>

      {/* Value skeleton */}
      <div
        className="skeleton-pulse"
        style={{
          width: "40%",
          height: "2rem",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-sm)",
        }}
      />

      {/* Subtitle skeleton */}
      <div
        className="skeleton-pulse"
        style={{
          width: "50%",
          height: "0.75rem",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-sm)",
        }}
      />

      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .skeleton-pulse {
          animation: skeleton-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

/* ============================================================================
   MINI METRIC CARD (VERSAO COMPACTA)
============================================================================ */

interface MiniMetricCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  variant?: MetricVariant;
}

function MiniMetricCard({ label, value, icon, variant = "default" }: MiniMetricCardProps) {
  const colors = variantColors[variant];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: colors.bg,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border)",
      }}
    >
      {icon && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "2rem",
            height: "2rem",
            background: colors.iconBg,
            borderRadius: "var(--radius-md)",
            color: colors.text,
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text-muted)",
            lineHeight: "var(--line-height-tight)",
          }}
        >
          {label}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-lg)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            lineHeight: "var(--line-height-tight)",
          }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
   EXPORTS
============================================================================ */

export {
  MetricCard,
  MetricGrid,
  MetricCardSkeleton,
  MiniMetricCard,
  MetricIconWrapper,
};

export type {
  MetricCardProps,
  MetricGridProps,
  MetricVariant,
  MetricTrend,
  MetricSize,
};

/* ============================================================================
   EXEMPLO DE USO
============================================================================ */

/**
 * Exemplo de como usar os componentes:
 * 
 * import {
 *   MetricCard,
 *   MetricGrid,
 *   MetricIconOrders,
 *   MetricIconClients,
 *   MetricIconRevenue,
 * } from "./metric-cards";
 * 
 * function DashboardKPIs() {
 *   return (
 *     <MetricGrid columns={4}>
 *       <MetricCard
 *         title="Ordens de Servico Ativas"
 *         value="127"
 *         icon={<MetricIconOrders />}
 *         variant="primary"
 *         change="+12%"
 *         trend="up"
 *         subtitle="vs mes anterior"
 *       />
 *       <MetricCard
 *         title="Clientes Atendidos"
 *         value="1.284"
 *         icon={<MetricIconClients />}
 *         variant="success"
 *         change="+8%"
 *         trend="up"
 *         subtitle="este mes"
 *       />
 *       <MetricCard
 *         title="Faturamento"
 *         value="R$ 45.230"
 *         icon={<MetricIconRevenue />}
 *         variant="default"
 *         change="-3%"
 *         trend="down"
 *         subtitle="vs mes anterior"
 *       />
 *       <MetricCard
 *         title="Tempo Medio"
 *         value="2h 15min"
 *         icon={<MetricIconTime />}
 *         variant="warning"
 *         change="0%"
 *         trend="neutral"
 *         subtitle="por ordem"
 *       />
 *     </MetricGrid>
 *   );
 * }
 */
