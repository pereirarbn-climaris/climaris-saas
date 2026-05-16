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
