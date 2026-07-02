import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import type { OrderStatus, RevenueDataPoint, ServiceOrder } from "../components/v0-ui/dashboard";

export type DashboardHomeKpisOut = {
  period_year: number;
  period_month: number;
  active_service_orders: number;
  active_clients: number;
  monthly_revenue: number;
  monthly_revenue_from_finance: number;
  monthly_revenue_from_service_orders: number;
  average_service_minutes: number | null;
  average_service_sample_size: number;
};

export type DashboardRevenueChartPointOut = {
  year: number;
  month: number;
  month_label: string;
  revenue: number;
  target: number;
  revenue_from_finance?: number;
  revenue_from_service_orders?: number;
};

export type DashboardRevenueChartOut = {
  months: number;
  end_year: number;
  end_month: number;
  points: DashboardRevenueChartPointOut[];
};

export type DashboardRecentOrderOut = {
  id: number;
  client_name: string;
  technician_name: string | null;
  status: string;
  opened_at: string;
  total_value: number;
  title: string | null;
};

export type DashboardTierOut = {
  tier: "basic" | "advanced" | "complete";
  tier_label: string;
  tier_description: string;
  plan_key: string;
  finance_max_mode: string;
};

export type DashboardExtendedKpisOut = {
  period_year: number;
  period_month: number;
  completed_orders_month: number;
  pending_budgets: number;
  schedules_today: number;
  revenue_growth_percent: number | null;
  previous_month_revenue: number;
  new_clients_month: number;
  budget_conversion_rate: number | null;
};

export type DashboardOrderStatusBreakdownItemOut = {
  status: string;
  label: string;
  count: number;
};

export type DashboardUpcomingScheduleOut = {
  id: number;
  client_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  technician_names: string[];
  service_order_id: number | null;
};

export type DashboardFinancialSnapshotOut = {
  finance_enabled: boolean;
  accounts_receivable: number;
  accounts_payable: number;
  overdue_receivable: number;
  overdue_payable: number;
  overdue_receivable_count: number;
  overdue_payable_count: number;
  net_cash_position: number;
};

export type DashboardPmocSummaryOut = {
  active_pmoc_plans: number;
  open_occurrences: number;
};

export type DashboardTechnicianWorkloadOut = {
  technician_id: number;
  technician_name: string;
  schedules_count: number;
};

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function errorMessage(body: unknown, fallback: string, status: number): string {
  if (body && typeof body === "object") {
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
    if (typeof o.detail === "string") return o.detail;
  }
  if (status === 401) return "Sessão expirada. Faça login novamente.";
  return fallback;
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export async function fetchDashboardHomeKpis(params?: {
  year?: number;
  month?: number;
}): Promise<DashboardHomeKpisOut> {
  const sp = new URLSearchParams();
  if (params?.year != null) sp.set("year", String(params.year));
  if (params?.month != null) sp.set("month", String(params.month));
  const qs = sp.toString();
  const response = await fetch(apiUrl(`/api/v1/dashboard/home-kpis${qs ? `?${qs}` : ""}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar os indicadores do painel.", response.status));
  }
  return body as DashboardHomeKpisOut;
}

export async function fetchDashboardRevenueChart(months = 6): Promise<DashboardRevenueChartOut> {
  const sp = new URLSearchParams({ months: String(months) });
  const response = await fetch(apiUrl(`/api/v1/dashboard/revenue-chart?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o gráfico de faturamento.", response.status));
  }
  return body as DashboardRevenueChartOut;
}

export async function fetchRecentOrders(limit = 5): Promise<DashboardRecentOrderOut[]> {
  const sp = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(apiUrl(`/api/v1/dashboard/recent-orders?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar as ordens recentes.", response.status));
  }
  return body as DashboardRecentOrderOut[];
}

export function mapRevenueChartToDataPoints(chart: DashboardRevenueChartOut): RevenueDataPoint[] {
  return chart.points.map((point) => ({
    month: point.month_label,
    revenue: point.revenue,
    target: point.target,
  }));
}

export async function fetchDashboardTier(): Promise<DashboardTierOut> {
  const response = await fetch(apiUrl("/api/v1/dashboard/tier"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o nível do dashboard.", response.status));
  }
  return body as DashboardTierOut;
}

export async function fetchDashboardExtendedKpis(): Promise<DashboardExtendedKpisOut> {
  const response = await fetch(apiUrl("/api/v1/dashboard/extended-kpis"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar indicadores ampliados.", response.status));
  }
  return body as DashboardExtendedKpisOut;
}

export async function fetchDashboardOrderBreakdown(): Promise<DashboardOrderStatusBreakdownItemOut[]> {
  const response = await fetch(apiUrl("/api/v1/dashboard/order-breakdown"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar distribuição de OS.", response.status));
  }
  return body as DashboardOrderStatusBreakdownItemOut[];
}

export async function fetchDashboardUpcomingSchedules(
  limit = 5,
): Promise<DashboardUpcomingScheduleOut[]> {
  const sp = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(apiUrl(`/api/v1/dashboard/upcoming-schedules?${sp}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar agendamentos.", response.status));
  }
  return body as DashboardUpcomingScheduleOut[];
}

export async function fetchDashboardFinancialSnapshot(): Promise<DashboardFinancialSnapshotOut> {
  const response = await fetch(apiUrl("/api/v1/dashboard/financial-snapshot"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar resumo financeiro.", response.status));
  }
  return body as DashboardFinancialSnapshotOut;
}

export async function fetchDashboardPmocSummary(): Promise<DashboardPmocSummaryOut> {
  const response = await fetch(apiUrl("/api/v1/dashboard/pmoc-summary"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar resumo PMOC.", response.status));
  }
  return body as DashboardPmocSummaryOut;
}

export async function fetchDashboardTechnicianWorkload(): Promise<DashboardTechnicianWorkloadOut[]> {
  const response = await fetch(apiUrl("/api/v1/dashboard/technician-workload"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar carga da equipe.", response.status));
  }
  return body as DashboardTechnicianWorkloadOut[];
}

export function mapRecentOrdersToTableRows(orders: DashboardRecentOrderOut[]): ServiceOrder[] {
  return orders.map((row) => ({
    id: `OS-${row.id}`,
    client: { name: row.client_name },
    technician: row.technician_name ? { name: row.technician_name } : undefined,
    status: row.status as OrderStatus,
    value: row.total_value,
    createdAt: row.opened_at,
    description: row.title ?? undefined,
  }));
}
