/**
 * SaaSAdminDashboardView.tsx
 * Dashboard administrativo de alta fidelidade para gerenciamento de tenants/empresas
 * Segue o Design System do Climaris (index.css)
 */

import React, { useState, useMemo } from "react";

// ============================================================================
// TYPES
// ============================================================================

export type PlanType = "starter" | "pro" | "enterprise";
export type TenantStatus = "active" | "blocked" | "trial";

export interface TenantBillingHistory {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  invoiceUrl?: string;
}

export interface TenantModule {
  id: string;
  name: string;
  enabled: boolean;
  enabledAt?: string;
}

export interface TenantLog {
  id: string;
  action: string;
  timestamp: string;
  userEmail?: string;
  details?: string;
}

export interface Tenant {
  id: string;
  fantasyName: string;
  legalName: string;
  document: string; // CNPJ
  ownerEmail: string;
  ownerName: string;
  plan: PlanType;
  status: TenantStatus;
  usedLicenses: number;
  totalLicenses: number;
  createdAt: string;
  lastActivityAt?: string;
  monthlyRevenue: number;
  billingHistory: TenantBillingHistory[];
  modules: TenantModule[];
  recentLogs: TenantLog[];
  address?: {
    city: string;
    state: string;
  };
}

export interface SaaSMetrics {
  mrr: number;
  mrrGrowth: number;
  mrrSparkline: number[];
  totalTenants: number;
  tenantsGrowth: number;
  tenantsSparkline: number[];
  totalLicenses: number;
  usedLicenses: number;
  licensesGrowth: number;
  churnRate: number;
  upgradesThisWeek: number;
  downgradesThisWeek: number;
}

export interface SaaSAdminDashboardViewProps {
  metrics: SaaSMetrics;
  tenants: Tenant[];
  isLoading?: boolean;
  onProvisionTenant: () => void;
  onManagePlan: (tenantId: string) => void;
  onViewLogs: (tenantId: string) => void;
  onBlockTenant: (tenantId: string) => void;
  onUnblockTenant: (tenantId: string) => void;
  onResetAdminPassword: (tenantId: string) => void;
  onDeleteTenant: (tenantId: string) => void;
  onToggleModule: (tenantId: string, moduleId: string, enabled: boolean) => void;
}

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const IconTrendingUp = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const IconTrendingDown = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);

const IconBuilding = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
  </svg>
);

const IconUsers = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconDollarSign = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const IconUserMinus = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </svg>
);

const IconSearch = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconPlus = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconChevronDown = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconSettings = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconFileText = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconMoreVertical = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

const IconX = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconBan = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);

const IconKey = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const IconTrash = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const IconMail = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const IconCalendar = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconCreditCard = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

const IconCheck = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconClock = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconUnlock = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

const IconActivity = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

// ============================================================================
// SPARKLINE COMPONENT
// ============================================================================

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  fillColor?: string;
}

const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 80,
  height = 24,
  strokeColor = "var(--color-primary)",
  fillColor = "var(--color-primary)",
}) => {
  if (!data || data.length < 2) return null;

  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((value - min) / range) * chartHeight;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const areaD = `${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sparkline-gradient-${data.join("-")}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={fillColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaD}
        fill={`url(#sparkline-gradient-${data.join("-")})`}
      />
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ============================================================================
// METRIC CARD COMPONENT
// ============================================================================

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  growth?: number;
  sparklineData?: number[];
  icon: React.ReactNode;
  iconBgColor: string;
  iconColor: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  growth,
  sparklineData,
  icon,
  iconBgColor,
  iconColor,
}) => {
  const isPositive = growth !== undefined && growth >= 0;

  return (
    <div
      style={{
        background: "var(--color-surface-elevated)",
        borderRadius: "var(--card-radius)",
        padding: "var(--card-padding)",
        boxShadow: "var(--card-shadow)",
        border: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        transition: "box-shadow var(--motion-duration) var(--motion-easing)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div
          style={{
            width: "var(--stat-card-icon-size)",
            height: "var(--stat-card-icon-size)",
            borderRadius: "var(--stat-card-icon-radius)",
            background: iconBgColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
          }}
        >
          {icon}
        </div>
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline
            data={sparklineData}
            strokeColor={isPositive ? "var(--color-success-light)" : "var(--color-error-light)"}
            fillColor={isPositive ? "var(--color-success-light)" : "var(--color-error-light)"}
          />
        )}
      </div>

      <div>
        <p
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-muted)",
            margin: 0,
            fontWeight: "var(--font-weight-medium)",
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontSize: "var(--font-size-3xl)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-text)",
            margin: "var(--space-1) 0 0 0",
            lineHeight: "var(--line-height-tight)",
          }}
        >
          {value}
        </p>
        {(subtitle || growth !== undefined) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              marginTop: "var(--space-2)",
            }}
          >
            {growth !== undefined && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: isPositive ? "var(--color-success)" : "var(--color-error)",
                }}
              >
                {isPositive ? (
                  <IconTrendingUp style={{ width: "14px", height: "14px" }} />
                ) : (
                  <IconTrendingDown style={{ width: "14px", height: "14px" }} />
                )}
                {isPositive ? "+" : ""}
                {growth.toFixed(1)}%
              </span>
            )}
            {subtitle && (
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-subtle)" }}>
                {subtitle}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// PLAN BADGE COMPONENT
// ============================================================================

const planStyles: Record<PlanType, { bg: string; text: string; label: string }> = {
  starter: { bg: "rgba(59, 130, 246, 0.12)", text: "#2563eb", label: "Starter" },
  pro: { bg: "rgba(139, 92, 246, 0.12)", text: "#7c3aed", label: "Pro" },
  enterprise: { bg: "rgba(245, 158, 11, 0.12)", text: "#d97706", label: "Enterprise" },
};

const PlanBadge: React.FC<{ plan: PlanType }> = ({ plan }) => {
  const style = planStyles[plan];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: "var(--badge-height)",
        padding: `0 var(--badge-padding-x)`,
        borderRadius: "var(--badge-radius)",
        fontSize: "var(--badge-font-size)",
        fontWeight: "var(--font-weight-semibold)",
        background: style.bg,
        color: style.text,
        textTransform: "uppercase",
        letterSpacing: "0.025em",
      }}
    >
      {style.label}
    </span>
  );
};

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

const statusStyles: Record<TenantStatus, { bg: string; text: string; label: string }> = {
  active: { bg: "rgba(34, 197, 94, 0.12)", text: "var(--color-success)", label: "Ativo" },
  blocked: { bg: "rgba(239, 68, 68, 0.12)", text: "var(--color-error)", label: "Inadimplente" },
  trial: { bg: "rgba(245, 158, 11, 0.12)", text: "var(--color-warning)", label: "Teste" },
};

const StatusBadge: React.FC<{ status: TenantStatus }> = ({ status }) => {
  const style = statusStyles[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        height: "var(--badge-height)",
        padding: `0 var(--badge-padding-x)`,
        borderRadius: "var(--badge-radius)",
        fontSize: "var(--badge-font-size)",
        fontWeight: "var(--font-weight-semibold)",
        background: style.bg,
        color: style.text,
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "currentColor",
        }}
      />
      {style.label}
    </span>
  );
};

// ============================================================================
// LICENSE PROGRESS BAR COMPONENT
// ============================================================================

const LicenseProgress: React.FC<{ used: number; total: number }> = ({ used, total }) => {
  const percentage = total > 0 ? (used / total) * 100 : 0;
  const isHigh = percentage >= 80;
  const isMedium = percentage >= 60 && percentage < 80;

  let barColor = "var(--color-primary)";
  if (isHigh) barColor = "var(--color-error-light)";
  else if (isMedium) barColor = "var(--color-warning-light)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
          {used}/{total}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "6px",
          borderRadius: "3px",
          background: "var(--color-border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(percentage, 100)}%`,
            height: "100%",
            borderRadius: "3px",
            background: barColor,
            transition: "width var(--motion-duration-slow) var(--motion-easing)",
          }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// DROPDOWN MENU COMPONENT
// ============================================================================

interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: "default" | "danger";
    disabled?: boolean;
  }[];
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, items }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        style={{
          background: "transparent",
          border: "none",
          padding: "var(--space-2)",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-muted)",
          transition: "background var(--motion-duration) var(--motion-easing)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {trigger}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "var(--space-1)",
            minWidth: "180px",
            background: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--card-shadow-hover)",
            padding: "var(--space-1)",
            zIndex: 50,
          }}
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  setIsOpen(false);
                }
              }}
              disabled={item.disabled}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-3)",
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: item.variant === "danger" ? "var(--color-error)" : "var(--color-text)",
                cursor: item.disabled ? "not-allowed" : "pointer",
                opacity: item.disabled ? 0.5 : 1,
                textAlign: "left",
                transition: "background var(--motion-duration) var(--motion-easing)",
              }}
              onMouseEnter={(e) => {
                if (!item.disabled) {
                  e.currentTarget.style.background = item.variant === "danger"
                    ? "rgba(239, 68, 68, 0.08)"
                    : "var(--color-surface)";
                }
              }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {item.icon && (
                <span style={{ width: "16px", height: "16px", display: "flex" }}>{item.icon}</span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TENANT DETAIL DRAWER COMPONENT
// ============================================================================

interface TenantDetailDrawerProps {
  tenant: Tenant | null;
  isOpen: boolean;
  onClose: () => void;
  onManagePlan: (tenantId: string) => void;
  onToggleModule: (tenantId: string, moduleId: string, enabled: boolean) => void;
}

const TenantDetailDrawer: React.FC<TenantDetailDrawerProps> = ({
  tenant,
  isOpen,
  onClose,
  onManagePlan,
  onToggleModule,
}) => {
  if (!tenant) return null;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.4)",
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? "visible" : "hidden",
          transition: "opacity var(--motion-duration-slow) var(--motion-easing)",
          zIndex: 100,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(480px, 100vw - 32px)",
          background: "var(--color-surface-elevated)",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.12)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform var(--motion-duration-slow) var(--motion-easing)",
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "var(--space-5)",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "var(--font-size-xl)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
              }}
            >
              {tenant.fantasyName}
            </h2>
            <p
              style={{
                margin: "var(--space-1) 0 0 0",
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text-muted)",
              }}
            >
              {tenant.legalName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              padding: "var(--space-2)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              color: "var(--color-text-muted)",
            }}
          >
            <IconX style={{ width: "20px", height: "20px" }} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--space-5)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          {/* Status and Plan */}
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
            <StatusBadge status={tenant.status} />
            <PlanBadge plan={tenant.plan} />
            <button
              onClick={() => onManagePlan(tenant.id)}
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-1)",
                padding: "var(--space-1) var(--space-3)",
                background: "transparent",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--btn-radius)",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-text)",
                cursor: "pointer",
              }}
            >
              <IconSettings style={{ width: "14px", height: "14px" }} />
              Gerenciar Plano
            </button>
          </div>

          {/* Fiscal Data */}
          <section>
            <h3
              style={{
                margin: "0 0 var(--space-3) 0",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Dados Fiscais
            </h3>
            <div
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-4)",
                display: "grid",
                gap: "var(--space-3)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                  CNPJ
                </span>
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                  {tenant.document}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                  E-mail Proprietario
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-medium)",
                  }}
                >
                  <IconMail style={{ width: "14px", height: "14px", color: "var(--color-text-muted)" }} />
                  {tenant.ownerEmail}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                  Data de Adesao
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-medium)",
                  }}
                >
                  <IconCalendar style={{ width: "14px", height: "14px", color: "var(--color-text-muted)" }} />
                  {formatDate(tenant.createdAt)}
                </span>
              </div>
              {tenant.address && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                    Localizacao
                  </span>
                  <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                    {tenant.address.city}, {tenant.address.state}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Licenses */}
          <section>
            <h3
              style={{
                margin: "0 0 var(--space-3) 0",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Uso de Licencas
            </h3>
            <div
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-4)",
              }}
            >
              <LicenseProgress used={tenant.usedLicenses} total={tenant.totalLicenses} />
              <p
                style={{
                  margin: "var(--space-2) 0 0 0",
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-text-subtle)",
                }}
              >
                {tenant.totalLicenses - tenant.usedLicenses} licencas disponiveis
              </p>
            </div>
          </section>

          {/* Billing History */}
          <section>
            <h3
              style={{
                margin: "0 0 var(--space-3) 0",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Historico de Faturamento
            </h3>
            <div
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
              }}
            >
              {tenant.billingHistory.slice(0, 5).map((bill) => (
                <div
                  key={bill.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "var(--space-3) var(--space-4)",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "var(--radius-md)",
                        background:
                          bill.status === "paid"
                            ? "rgba(34, 197, 94, 0.12)"
                            : bill.status === "pending"
                            ? "rgba(245, 158, 11, 0.12)"
                            : "rgba(239, 68, 68, 0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {bill.status === "paid" ? (
                        <IconCheck
                          style={{ width: "16px", height: "16px", color: "var(--color-success)" }}
                        />
                      ) : bill.status === "pending" ? (
                        <IconClock
                          style={{ width: "16px", height: "16px", color: "var(--color-warning)" }}
                        />
                      ) : (
                        <IconX
                          style={{ width: "16px", height: "16px", color: "var(--color-error)" }}
                        />
                      )}
                    </div>
                    <div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "var(--font-size-sm)",
                          fontWeight: "var(--font-weight-medium)",
                        }}
                      >
                        {formatCurrency(bill.amount)}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "var(--font-size-xs)",
                          color: "var(--color-text-subtle)",
                        }}
                      >
                        {formatDate(bill.date)}
                      </p>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      fontWeight: "var(--font-weight-medium)",
                      color:
                        bill.status === "paid"
                          ? "var(--color-success)"
                          : bill.status === "pending"
                          ? "var(--color-warning)"
                          : "var(--color-error)",
                    }}
                  >
                    {bill.status === "paid" ? "Pago" : bill.status === "pending" ? "Pendente" : "Falhou"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Modules */}
          <section>
            <h3
              style={{
                margin: "0 0 var(--space-3) 0",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Modulos Adicionais
            </h3>
            <div
              style={{
                display: "grid",
                gap: "var(--space-2)",
              }}
            >
              {tenant.modules.map((module) => (
                <div
                  key={module.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "var(--space-3) var(--space-4)",
                    background: "var(--color-surface)",
                    borderRadius: "var(--radius-lg)",
                  }}
                >
                  <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                    {module.name}
                  </span>
                  <button
                    onClick={() => onToggleModule(tenant.id, module.id, !module.enabled)}
                    style={{
                      width: "44px",
                      height: "24px",
                      borderRadius: "12px",
                      border: "none",
                      background: module.enabled ? "var(--color-primary)" : "var(--color-border)",
                      cursor: "pointer",
                      position: "relative",
                      transition: "background var(--motion-duration) var(--motion-easing)",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "2px",
                        left: module.enabled ? "22px" : "2px",
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "white",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        transition: "left var(--motion-duration) var(--motion-easing)",
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Logs */}
          <section>
            <h3
              style={{
                margin: "0 0 var(--space-3) 0",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Logs Recentes
            </h3>
            <div
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
              }}
            >
              {tenant.recentLogs.slice(0, 5).map((log) => (
                <div
                  key={log.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--color-primary)",
                      marginTop: "6px",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "var(--font-size-sm)",
                        fontWeight: "var(--font-weight-medium)",
                      }}
                    >
                      {log.action}
                    </p>
                    <p
                      style={{
                        margin: "var(--space-1) 0 0 0",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--color-text-subtle)",
                      }}
                    >
                      {log.userEmail && `${log.userEmail} • `}
                      {formatDateTime(log.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
};

// ============================================================================
// SELECT DROPDOWN COMPONENT
// ============================================================================

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

const Select: React.FC<SelectProps> = ({ value, onChange, options, placeholder }) => {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          height: "var(--toolbar-control-height)",
          minWidth: "140px",
          padding: "0 var(--space-8) 0 var(--space-3)",
          background: "var(--color-surface-elevated)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--input-radius)",
          fontSize: "var(--font-size-sm)",
          fontWeight: "var(--font-weight-medium)",
          color: value ? "var(--color-text)" : "var(--color-text-muted)",
          cursor: "pointer",
        }}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <IconChevronDown
        style={{
          position: "absolute",
          right: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          width: "16px",
          height: "16px",
          color: "var(--color-text-muted)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

// ============================================================================
// SKELETON COMPONENTS
// ============================================================================

const SkeletonPulse: React.FC<{ width?: string; height?: string; borderRadius?: string }> = ({
  width = "100%",
  height = "20px",
  borderRadius = "var(--radius-md)",
}) => (
  <div
    style={{
      width,
      height,
      borderRadius,
      background: "linear-gradient(90deg, var(--color-border) 25%, var(--color-surface) 50%, var(--color-border) 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
    }}
  />
);

const TableSkeleton: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          padding: "var(--space-4)",
          background: "var(--color-surface-elevated)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <SkeletonPulse width="200px" height="40px" />
        <SkeletonPulse width="120px" height="20px" />
        <SkeletonPulse width="80px" height="24px" borderRadius="var(--badge-radius)" />
        <SkeletonPulse width="100px" height="24px" />
        <SkeletonPulse width="80px" height="24px" borderRadius="var(--badge-radius)" />
        <SkeletonPulse width="100px" height="20px" />
      </div>
    ))}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SaaSAdminDashboardView: React.FC<SaaSAdminDashboardViewProps> = ({
  metrics,
  tenants,
  isLoading = false,
  onProvisionTenant,
  onManagePlan,
  onViewLogs,
  onBlockTenant,
  onUnblockTenant,
  onResetAdminPassword,
  onDeleteTenant,
  onToggleModule,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      const matchesSearch =
        !searchQuery ||
        tenant.fantasyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.legalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.document.includes(searchQuery) ||
        tenant.ownerEmail.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPlan = !planFilter || tenant.plan === planFilter;
      const matchesStatus = !statusFilter || tenant.status === statusFilter;

      return matchesSearch && matchesPlan && matchesStatus;
    });
  }, [tenants, searchQuery, planFilter, statusFilter]);

  const handleRowClick = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedTenant(null), 300);
  };

  return (
    <>
      <style>
        {`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}
      </style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
          padding: "var(--space-page)",
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--font-size-2xl)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
            }}
          >
            Painel Administrativo
          </h1>
          <p
            style={{
              margin: "var(--space-1) 0 0 0",
              fontSize: "var(--font-size-base)",
              color: "var(--color-text-muted)",
            }}
          >
            Gerencie tenants, planos e monitore metricas da plataforma
          </p>
        </div>

        {/* Metrics Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <MetricCard
            title="Faturamento Mensal (MRR)"
            value={formatCurrency(metrics.mrr)}
            growth={metrics.mrrGrowth}
            sparklineData={metrics.mrrSparkline}
            subtitle="vs. mes anterior"
            icon={<IconDollarSign style={{ width: "20px", height: "20px" }} />}
            iconBgColor="rgba(34, 197, 94, 0.12)"
            iconColor="var(--color-success)"
          />
          <MetricCard
            title="Total de Tenants"
            value={metrics.totalTenants.toLocaleString("pt-BR")}
            growth={metrics.tenantsGrowth}
            sparklineData={metrics.tenantsSparkline}
            subtitle="empresas ativas"
            icon={<IconBuilding style={{ width: "20px", height: "20px" }} />}
            iconBgColor="rgba(14, 165, 233, 0.12)"
            iconColor="var(--color-primary)"
          />
          <MetricCard
            title="Licencas Alocadas"
            value={`${metrics.usedLicenses}/${metrics.totalLicenses}`}
            growth={metrics.licensesGrowth}
            subtitle="usuarios ativos"
            icon={<IconUsers style={{ width: "20px", height: "20px" }} />}
            iconBgColor="rgba(139, 92, 246, 0.12)"
            iconColor="#7c3aed"
          />
          <MetricCard
            title="Churn / Upgrades"
            value={`${metrics.churnRate.toFixed(1)}%`}
            subtitle={`+${metrics.upgradesThisWeek} upgrades / -${metrics.downgradesThisWeek} downgrades`}
            icon={<IconUserMinus style={{ width: "20px", height: "20px" }} />}
            iconBgColor="rgba(245, 158, 11, 0.12)"
            iconColor="var(--color-warning)"
          />
        </div>

        {/* Filters Bar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-3)",
            alignItems: "center",
            padding: "var(--space-4)",
            background: "var(--color-surface-elevated)",
            borderRadius: "var(--card-radius)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 280px", minWidth: "200px" }}>
            <IconSearch
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "var(--icon-size-sm)",
                height: "var(--icon-size-sm)",
                color: "var(--color-text-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Buscar por empresa, CNPJ ou e-mail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: "var(--toolbar-control-height)",
                padding: "0 var(--space-3) 0 var(--space-10)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--input-radius)",
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text)",
                outline: "none",
              }}
            />
          </div>

          {/* Plan Filter */}
          <Select
            value={planFilter}
            onChange={setPlanFilter}
            placeholder="Todos os Planos"
            options={[
              { value: "", label: "Todos os Planos" },
              { value: "starter", label: "Starter" },
              { value: "pro", label: "Pro" },
              { value: "enterprise", label: "Enterprise" },
            ]}
          />

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Todos os Status"
            options={[
              { value: "", label: "Todos os Status" },
              { value: "active", label: "Ativo" },
              { value: "blocked", label: "Inadimplente" },
              { value: "trial", label: "Em Teste" },
            ]}
          />

          {/* Provision Button */}
          <button
            onClick={onProvisionTenant}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              height: "var(--toolbar-control-height)",
              padding: "0 var(--btn-padding-md)",
              background: "var(--color-primary)",
              color: "white",
              border: "none",
              borderRadius: "var(--btn-radius)",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: "pointer",
              transition: "background var(--motion-duration) var(--motion-easing)",
              marginLeft: "auto",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-primary)")}
          >
            <IconPlus style={{ width: "16px", height: "16px" }} />
            Provisionar Nova Empresa
          </button>
        </div>

        {/* Tenants Table */}
        <div
          style={{
            background: "var(--color-surface-elevated)",
            borderRadius: "var(--card-radius)",
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          {isLoading ? (
            <div style={{ padding: "var(--space-4)" }}>
              <TableSkeleton />
            </div>
          ) : filteredTenants.length === 0 ? (
            <div
              style={{
                padding: "var(--space-12)",
                textAlign: "center",
              }}
            >
              <IconBuilding
                style={{
                  width: "48px",
                  height: "48px",
                  color: "var(--color-text-subtle)",
                  margin: "0 auto var(--space-4)",
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-base)",
                  fontWeight: "var(--font-weight-medium)",
                  color: "var(--color-text)",
                }}
              >
                Nenhum tenant encontrado
              </p>
              <p
                style={{
                  margin: "var(--space-1) 0 0 0",
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-text-muted)",
                }}
              >
                Ajuste os filtros ou provisione uma nova empresa
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "900px",
                }}
              >
                <thead>
                  <tr style={{ background: "var(--table-header-bg)" }}>
                    <th
                      style={{
                        padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                        textAlign: "left",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Empresa
                    </th>
                    <th
                      style={{
                        padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                        textAlign: "left",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      CNPJ
                    </th>
                    <th
                      style={{
                        padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                        textAlign: "left",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Plano
                    </th>
                    <th
                      style={{
                        padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                        textAlign: "left",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Licencas
                    </th>
                    <th
                      style={{
                        padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                        textAlign: "left",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Status
                    </th>
                    <th
                      style={{
                        padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                        textAlign: "left",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Adesao
                    </th>
                    <th
                      style={{
                        padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                        textAlign: "right",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTenants.map((tenant) => (
                    <tr
                      key={tenant.id}
                      onClick={() => handleRowClick(tenant)}
                      style={{
                        cursor: "pointer",
                        transition: "background var(--motion-duration) var(--motion-easing)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--color-surface)")
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td
                        style={{
                          padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        <div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: "var(--font-size-sm)",
                              fontWeight: "var(--font-weight-semibold)",
                              color: "var(--color-text)",
                            }}
                          >
                            {tenant.fantasyName}
                          </p>
                          <p
                            style={{
                              margin: "2px 0 0 0",
                              fontSize: "var(--font-size-xs)",
                              color: "var(--color-text-subtle)",
                            }}
                          >
                            {tenant.legalName}
                          </p>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                          borderBottom: "1px solid var(--color-border)",
                          fontSize: "var(--font-size-sm)",
                          color: "var(--color-text-muted)",
                          fontFamily: "monospace",
                        }}
                      >
                        {tenant.document}
                      </td>
                      <td
                        style={{
                          padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        <PlanBadge plan={tenant.plan} />
                      </td>
                      <td
                        style={{
                          padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                          borderBottom: "1px solid var(--color-border)",
                          width: "120px",
                        }}
                      >
                        <LicenseProgress used={tenant.usedLicenses} total={tenant.totalLicenses} />
                      </td>
                      <td
                        style={{
                          padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        <StatusBadge status={tenant.status} />
                      </td>
                      <td
                        style={{
                          padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                          borderBottom: "1px solid var(--color-border)",
                          fontSize: "var(--font-size-sm)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {formatDate(tenant.createdAt)}
                      </td>
                      <td
                        style={{
                          padding: "var(--table-cell-padding-y) var(--table-cell-padding-x)",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            gap: "var(--space-1)",
                          }}
                        >
                          <button
                            onClick={() => onManagePlan(tenant.id)}
                            title="Gerenciar Plano"
                            style={{
                              background: "transparent",
                              border: "none",
                              padding: "var(--space-2)",
                              borderRadius: "var(--radius-md)",
                              cursor: "pointer",
                              color: "var(--color-text-muted)",
                              transition: "all var(--motion-duration) var(--motion-easing)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--color-surface)";
                              e.currentTarget.style.color = "var(--color-primary)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--color-text-muted)";
                            }}
                          >
                            <IconSettings style={{ width: "18px", height: "18px" }} />
                          </button>
                          <button
                            onClick={() => onViewLogs(tenant.id)}
                            title="Visualizar Logs"
                            style={{
                              background: "transparent",
                              border: "none",
                              padding: "var(--space-2)",
                              borderRadius: "var(--radius-md)",
                              cursor: "pointer",
                              color: "var(--color-text-muted)",
                              transition: "all var(--motion-duration) var(--motion-easing)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--color-surface)";
                              e.currentTarget.style.color = "var(--color-primary)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--color-text-muted)";
                            }}
                          >
                            <IconFileText style={{ width: "18px", height: "18px" }} />
                          </button>
                          <DropdownMenu
                            trigger={<IconMoreVertical style={{ width: "18px", height: "18px" }} />}
                            items={[
                              {
                                label: tenant.status === "blocked" ? "Desbloquear Acesso" : "Bloquear Acesso",
                                icon: tenant.status === "blocked" ? (
                                  <IconUnlock style={{ width: "16px", height: "16px" }} />
                                ) : (
                                  <IconBan style={{ width: "16px", height: "16px" }} />
                                ),
                                onClick: () =>
                                  tenant.status === "blocked"
                                    ? onUnblockTenant(tenant.id)
                                    : onBlockTenant(tenant.id),
                              },
                              {
                                label: "Resetar Senha Admin",
                                icon: <IconKey style={{ width: "16px", height: "16px" }} />,
                                onClick: () => onResetAdminPassword(tenant.id),
                              },
                              {
                                label: "Deletar Tenant",
                                icon: <IconTrash style={{ width: "16px", height: "16px" }} />,
                                onClick: () => onDeleteTenant(tenant.id),
                                variant: "danger",
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Results Count */}
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-muted)",
            textAlign: "center",
          }}
        >
          Exibindo {filteredTenants.length} de {tenants.length} empresas
        </p>
      </div>

      {/* Tenant Detail Drawer */}
      <TenantDetailDrawer
        tenant={selectedTenant}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onManagePlan={onManagePlan}
        onToggleModule={onToggleModule}
      />
    </>
  );
};

// ============================================================================
// MOCK DATA FOR TESTING
// ============================================================================

export const mockMetrics: SaaSMetrics = {
  mrr: 47850.0,
  mrrGrowth: 12.5,
  mrrSparkline: [35000, 38000, 41000, 39500, 43000, 45200, 47850],
  totalTenants: 127,
  tenantsGrowth: 8.3,
  tenantsSparkline: [98, 105, 110, 115, 118, 122, 127],
  totalLicenses: 500,
  usedLicenses: 423,
  licensesGrowth: 5.2,
  churnRate: 2.1,
  upgradesThisWeek: 8,
  downgradesThisWeek: 2,
};

export const mockTenants: Tenant[] = [
  {
    id: "1",
    fantasyName: "Frio Norte Climatizacao",
    legalName: "Frio Norte Servicos de Climatizacao LTDA",
    document: "12.345.678/0001-90",
    ownerEmail: "contato@frionorte.com.br",
    ownerName: "Carlos Silva",
    plan: "pro",
    status: "active",
    usedLicenses: 4,
    totalLicenses: 5,
    createdAt: "2024-01-15",
    lastActivityAt: "2025-05-15T14:30:00",
    monthlyRevenue: 299.0,
    billingHistory: [
      { id: "b1", date: "2025-05-01", amount: 299.0, status: "paid" },
      { id: "b2", date: "2025-04-01", amount: 299.0, status: "paid" },
      { id: "b3", date: "2025-03-01", amount: 299.0, status: "paid" },
    ],
    modules: [
      { id: "m1", name: "Integracao WhatsApp", enabled: true, enabledAt: "2024-06-01" },
      { id: "m2", name: "NFSe Automatica", enabled: true, enabledAt: "2024-03-15" },
      { id: "m3", name: "Relatorios Avancados", enabled: false },
    ],
    recentLogs: [
      { id: "l1", action: "Login realizado", timestamp: "2025-05-15T14:30:00", userEmail: "carlos@frionorte.com.br" },
      { id: "l2", action: "OS #1234 criada", timestamp: "2025-05-15T11:20:00", userEmail: "tecnico@frionorte.com.br" },
      { id: "l3", action: "Cliente cadastrado", timestamp: "2025-05-14T16:45:00", userEmail: "carlos@frionorte.com.br" },
    ],
    address: { city: "Sao Paulo", state: "SP" },
  },
  {
    id: "2",
    fantasyName: "Gelo Sul Refrigeracao",
    legalName: "Gelo Sul Comercio e Servicos EIRELI",
    document: "98.765.432/0001-10",
    ownerEmail: "admin@gelosul.com.br",
    ownerName: "Maria Oliveira",
    plan: "starter",
    status: "trial",
    usedLicenses: 2,
    totalLicenses: 3,
    createdAt: "2025-05-01",
    monthlyRevenue: 0,
    billingHistory: [],
    modules: [
      { id: "m1", name: "Integracao WhatsApp", enabled: false },
      { id: "m2", name: "NFSe Automatica", enabled: false },
    ],
    recentLogs: [
      { id: "l1", action: "Conta criada", timestamp: "2025-05-01T10:00:00", userEmail: "admin@gelosul.com.br" },
    ],
    address: { city: "Porto Alegre", state: "RS" },
  },
  {
    id: "3",
    fantasyName: "ArctiCool Services",
    legalName: "ArctiCool Manutencao Industrial S.A.",
    document: "11.222.333/0001-44",
    ownerEmail: "diretor@arcticool.com.br",
    ownerName: "Roberto Santos",
    plan: "enterprise",
    status: "active",
    usedLicenses: 18,
    totalLicenses: 25,
    createdAt: "2023-06-20",
    lastActivityAt: "2025-05-16T09:15:00",
    monthlyRevenue: 899.0,
    billingHistory: [
      { id: "b1", date: "2025-05-01", amount: 899.0, status: "paid" },
      { id: "b2", date: "2025-04-01", amount: 899.0, status: "paid" },
    ],
    modules: [
      { id: "m1", name: "Integracao WhatsApp", enabled: true },
      { id: "m2", name: "NFSe Automatica", enabled: true },
      { id: "m3", name: "Relatorios Avancados", enabled: true },
      { id: "m4", name: "API Externa", enabled: true },
    ],
    recentLogs: [
      { id: "l1", action: "Relatorio exportado", timestamp: "2025-05-16T09:15:00", userEmail: "financeiro@arcticool.com.br" },
    ],
    address: { city: "Rio de Janeiro", state: "RJ" },
  },
  {
    id: "4",
    fantasyName: "Clima Certo",
    legalName: "Clima Certo Assistencia Tecnica LTDA",
    document: "55.666.777/0001-88",
    ownerEmail: "suporte@climacerto.com.br",
    ownerName: "Ana Costa",
    plan: "pro",
    status: "blocked",
    usedLicenses: 3,
    totalLicenses: 5,
    createdAt: "2024-08-10",
    monthlyRevenue: 299.0,
    billingHistory: [
      { id: "b1", date: "2025-05-01", amount: 299.0, status: "failed" },
      { id: "b2", date: "2025-04-01", amount: 299.0, status: "paid" },
    ],
    modules: [
      { id: "m1", name: "Integracao WhatsApp", enabled: true },
      { id: "m2", name: "NFSe Automatica", enabled: false },
    ],
    recentLogs: [
      { id: "l1", action: "Acesso bloqueado por inadimplencia", timestamp: "2025-05-05T00:00:00" },
    ],
    address: { city: "Belo Horizonte", state: "MG" },
  },
];

export default SaaSAdminDashboardView;
