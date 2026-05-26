import type { TenantStatus as ApiTenantStatus } from "../api/auth";
import type { PlatformTenantDetail, PlatformTenantListItem } from "../api/platformTenants";
import type { SaaSMetrics, Tenant, TenantStatus } from "../components/v0-ui/admin/SaaSAdminDashboardView";

function mapStatus(status: ApiTenantStatus, activePlan: string): TenantStatus {
  if (activePlan === "free_30d" && status === "active") return "trial";
  if (status === "active") return "active";
  return "blocked";
}

function formatDocument(doc: string): string {
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return doc;
}

export function mapPlatformTenantToView(
  row: PlatformTenantListItem,
  detail?: PlatformTenantDetail | null,
  planLabels?: Record<string, string>,
): Tenant {
  const totalLicenses = row.total_user_limit ?? Math.max(row.users_count, row.base_user_limit ?? 1, 1);
  const planKey = row.active_plan;
  const logs = detail?.plan_change_logs ?? [];

  return {
    id: String(row.id),
    fantasyName: row.name,
    legalName: row.name,
    document: formatDocument(row.tax_document),
    ownerEmail: detail?.registration_email ?? detail?.email ?? row.registration_email ?? "—",
    ownerName: row.name,
    plan: planKey,
    status: mapStatus(row.status, row.active_plan),
    usedLicenses: row.users_count,
    totalLicenses,
    createdAt: row.created_at,
    monthlyRevenue: 0,
    billingHistory: [],
    modules: [],
    recentLogs: logs.slice(0, 8).map((log) => ({
      id: String(log.id),
      action: `Plano: ${planLabels?.[log.previous_plan] ?? log.previous_plan} → ${planLabels?.[log.new_plan] ?? log.new_plan}`,
      timestamp: log.changed_at,
      userEmail: log.changed_by_email ?? undefined,
      details: undefined,
    })),
    address:
      detail?.address_city && detail?.address_state
        ? { city: detail.address_city, state: detail.address_state }
        : undefined,
  };
}

export function buildPlatformSaasMetrics(rows: PlatformTenantListItem[]): SaaSMetrics {
  const totalTenants = rows.length;
  const usedLicenses = rows.reduce((sum, row) => sum + row.users_count, 0);
  const totalLicenses = rows.reduce(
    (sum, row) => sum + (row.total_user_limit ?? Math.max(row.users_count, 1)),
    0,
  );
  const activeCount = rows.filter((r) => r.status === "active").length;
  const sparkBase = Math.max(totalTenants, 1);

  return {
    mrr: 0,
    mrrGrowth: 0,
    mrrSparkline: Array.from({ length: 7 }, (_, i) => Math.round(sparkBase * (0.85 + i * 0.025))),
    totalTenants,
    tenantsGrowth: totalTenants > 0 ? Number(((activeCount / totalTenants) * 100).toFixed(1)) : 0,
    tenantsSparkline: Array.from({ length: 7 }, (_, i) => Math.max(0, totalTenants - (6 - i))),
    totalLicenses: Math.max(totalLicenses, usedLicenses, 1),
    usedLicenses,
    licensesGrowth: totalLicenses > 0 ? Number(((usedLicenses / totalLicenses) * 100).toFixed(1)) : 0,
    churnRate: totalTenants > 0 ? Number((((totalTenants - activeCount) / totalTenants) * 100).toFixed(1)) : 0,
    upgradesThisWeek: 0,
    downgradesThisWeek: 0,
  };
}
