import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  fetchDashboardHomeKpis,
  fetchDashboardRevenueChart,
  fetchRecentOrders,
  mapRecentOrdersToTableRows,
  mapRevenueChartToDataPoints,
  type DashboardHomeKpisOut,
  type DashboardRevenueChartOut,
} from "../../api/dashboard";
import type { DashboardOutletContext } from "../dashboardContext";
import {
  MetricCard,
  MetricCardSkeleton,
  MetricGrid,
  MetricIconClients,
  MetricIconOrders,
  MetricIconRevenue,
  MetricIconTime,
  RevenueChartCard,
  RecentOrdersCard,
  type RevenueDataPoint,
  type ServiceOrder,
} from "../../components/v0-ui/dashboard";
import styles from "./DashboardHomePage.module.css";

function greetingByHour(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

function formatPeriodLabel(year: number, month: number): string {
  const name = MONTH_NAMES[month - 1] ?? String(month);
  return `${name} de ${year}`;
}

function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAverageServiceMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

function computeGrowthPercent(data: RevenueDataPoint[]): number | undefined {
  if (data.length < 2) return undefined;
  const last = data[data.length - 1]!.revenue;
  const prev = data[data.length - 2]!.revenue;
  if (prev <= 0) return undefined;
  return ((last - prev) / prev) * 100;
}

export function DashboardHomePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState(() => greetingByHour(new Date()));
  const [kpis, setKpis] = useState<DashboardHomeKpisOut | null>(null);
  const [revenueChart, setRevenueChart] = useState<DashboardRevenueChartOut | null>(null);
  const [recentOrders, setRecentOrders] = useState<ServiceOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const revenueData = useMemo(
    () => (revenueChart ? mapRevenueChartToDataPoints(revenueChart) : []),
    [revenueChart],
  );

  const totalRevenue = useMemo(
    () => revenueData.reduce((sum, point) => sum + point.revenue, 0),
    [revenueData],
  );

  const growthPercent = useMemo(() => computeGrowthPercent(revenueData), [revenueData]);

  const periodSubtitle = kpis
    ? formatPeriodLabel(kpis.period_year, kpis.period_month)
    : "mês atual";

  const chartSubtitle = revenueChart
    ? `Últimos ${revenueChart.months} meses · até ${formatPeriodLabel(revenueChart.end_year, revenueChart.end_month)}`
    : "Receita consolidada por mês";

  useEffect(() => {
    const t = window.setInterval(() => setGreeting(greetingByHour(new Date())), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setChartLoading(true);
    setOrdersLoading(true);
    setError(null);
    setChartError(null);
    setOrdersError(null);

    void (async () => {
      const [kpisResult, chartResult, ordersResult] = await Promise.allSettled([
        fetchDashboardHomeKpis(),
        fetchDashboardRevenueChart(6),
        fetchRecentOrders(5),
      ]);

      if (cancelled) return;

      if (kpisResult.status === "fulfilled") {
        setKpis(kpisResult.value);
      } else {
        setKpis(null);
        setError(
          kpisResult.reason instanceof Error
            ? kpisResult.reason.message
            : "Não foi possível carregar os indicadores.",
        );
      }
      setIsLoading(false);

      if (chartResult.status === "fulfilled") {
        setRevenueChart(chartResult.value);
        setChartError(null);
      } else {
        setRevenueChart(null);
        setChartError(
          chartResult.reason instanceof Error
            ? chartResult.reason.message
            : "Não foi possível carregar o gráfico.",
        );
      }
      setChartLoading(false);

      if (ordersResult.status === "fulfilled") {
        setRecentOrders(mapRecentOrdersToTableRows(ordersResult.value));
        setOrdersError(null);
      } else {
        setRecentOrders([]);
        setOrdersError(
          ordersResult.reason instanceof Error
            ? ordersResult.reason.message
            : "Não foi possível carregar as ordens recentes.",
        );
      }
      setOrdersLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.panel}>
      <section className={styles.hero} aria-labelledby="dashboard-home-title">
        <div>
          <h2 id="dashboard-home-title" className={styles.heroTitle}>
            {greeting}, {ctx?.user.full_name?.split(" ")[0] ?? "usuário"}!
          </h2>
          <p className={styles.heroLead}>Aqui está o resumo das suas operações.</p>
        </div>
        <button type="button" className={styles.heroBtn} onClick={() => navigate("/app/finance")}>
          <span className={styles.heroBtnIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <polyline points="16 6 21 6 21 11" />
              <path d="m21 6-8 8-4-4-6 6" />
            </svg>
          </span>
          Ver relatórios
        </button>
      </section>

      {error ? (
        <p className={styles.kpiError} role="alert">
          {error}
        </p>
      ) : null}

      <section aria-label="Indicadores principais">
        <MetricGrid columns={4}>
          {isLoading ? (
            <>
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
            </>
          ) : (
            <>
              <MetricCard
                title="Ordens ativas"
                value={kpis?.active_service_orders ?? "—"}
                icon={<MetricIconOrders />}
                variant="primary"
                subtitle="exceto concluídas e canceladas"
                onClick={() => navigate("/app/service-orders")}
              />
              <MetricCard
                title="Clientes ativos"
                value={kpis?.active_clients ?? "—"}
                icon={<MetricIconClients />}
                variant="success"
                subtitle="cadastros ativos no workspace"
                onClick={() => navigate("/app/clients")}
              />
              <MetricCard
                title="Faturamento do mês"
                value={kpis != null ? formatBrl(kpis.monthly_revenue) : "—"}
                icon={<MetricIconRevenue />}
                variant="default"
                subtitle={periodSubtitle}
                onClick={() => navigate("/app/finance")}
              />
              <MetricCard
                title="Tempo médio de atendimento"
                value={formatAverageServiceMinutes(kpis?.average_service_minutes ?? null)}
                icon={<MetricIconTime />}
                variant="default"
                subtitle={
                  kpis && kpis.average_service_sample_size > 0
                    ? `${kpis.average_service_sample_size} OS no período · ${periodSubtitle}`
                    : `sem amostra em ${periodSubtitle}`
                }
              />
            </>
          )}
        </MetricGrid>
      </section>

      <section className={styles.contentGrid} aria-label="Faturamento e ordens recentes">
        <div className={styles.contentGridChart}>
          {chartError && !chartLoading ? (
            <p className={styles.kpiError} role="alert">
              {chartError}
            </p>
          ) : null}
          <RevenueChartCard
            title="Faturamento mensal"
            subtitle={chartSubtitle}
            data={revenueData}
            loading={chartLoading}
            totalRevenue={chartLoading ? undefined : totalRevenue}
            growthPercent={chartLoading ? undefined : growthPercent}
            comparisonPeriod="vs. mês anterior"
            showTarget
            showTrendLine
            height={240}
          />
        </div>
        <div className={styles.contentGridTable}>
          {ordersError && !ordersLoading ? (
            <p className={styles.kpiError} role="alert">
              {ordersError}
            </p>
          ) : null}
          <RecentOrdersCard
            title="Ordens recentes"
            subtitle="Últimas movimentações da operação"
            orders={recentOrders}
            loading={ordersLoading}
            maxItems={5}
            onViewAll={() => navigate("/app/service-orders")}
            onOrderClick={() => navigate("/app/service-orders")}
          />
        </div>
      </section>
    </div>
  );
}
