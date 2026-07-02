import { useNavigate } from "react-router-dom";
import { PmocOccurrencesPanel } from "../../components/pmoc/PmocOccurrencesPanel";
import type { PmocOccurrenceAlertOut } from "../../api/pmoc";
import type { DashboardHomeKpisOut } from "../../api/dashboard";
import {
  MetricCard,
  MetricCardSkeleton,
  MetricGrid,
  MetricIconClients,
  MetricIconGrowth,
  MetricIconOrders,
  MetricIconRevenue,
  MetricIconTime,
  RecentOrdersCard,
  RevenueChartCard,
  type RevenueDataPoint,
  type ServiceOrder,
} from "../../components/v0-ui/dashboard";
import {
  formatAverageServiceMinutes,
  formatBrl,
  formatGrowthPercent,
  formatPeriodLabel,
} from "./dashboardFormatters";
import styles from "./DashboardHomePage.module.css";

type BaseKpisSectionProps = {
  kpis: DashboardHomeKpisOut | null;
  isLoading: boolean;
  showExtendedMetrics?: boolean;
  completedOrders?: number;
  pendingBudgets?: number;
  schedulesToday?: number;
  revenueGrowthPercent?: number | null;
};

export function BaseKpisSection({
  kpis,
  isLoading,
  showExtendedMetrics,
  completedOrders,
  pendingBudgets,
  schedulesToday,
  revenueGrowthPercent,
}: BaseKpisSectionProps) {
  const navigate = useNavigate();
  const periodSubtitle = kpis
    ? formatPeriodLabel(kpis.period_year, kpis.period_month)
    : "mês atual";

  const columns = showExtendedMetrics ? 4 : 4;
  const metricCount = showExtendedMetrics ? 8 : 4;

  return (
    <section aria-label="Indicadores principais">
      <MetricGrid columns={columns as 4}>
        {isLoading ? (
          Array.from({ length: metricCount }, (_, i) => <MetricCardSkeleton key={i} />)
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
              change={formatGrowthPercent(revenueGrowthPercent)}
              trend={
                revenueGrowthPercent == null
                  ? "neutral"
                  : revenueGrowthPercent >= 0
                    ? "up"
                    : "down"
              }
              onClick={() => navigate("/app/finance/dashboard")}
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
            {showExtendedMetrics ? (
              <>
                <MetricCard
                  title="OS concluídas"
                  value={completedOrders ?? "—"}
                  icon={<MetricIconOrders />}
                  variant="success"
                  subtitle={`no período · ${periodSubtitle}`}
                  onClick={() => navigate("/app/service-orders")}
                />
                <MetricCard
                  title="Orçamentos pendentes"
                  value={pendingBudgets ?? "—"}
                  icon={<MetricIconGrowth />}
                  variant="warning"
                  subtitle="aguardando aprovação do cliente"
                  onClick={() => navigate("/app/budgets")}
                />
                <MetricCard
                  title="Agendamentos hoje"
                  value={schedulesToday ?? "—"}
                  icon={<MetricIconTime />}
                  variant="primary"
                  subtitle="visitas programadas para hoje"
                  onClick={() => navigate("/app/agenda")}
                />
                <MetricCard
                  title="Crescimento mensal"
                  value={formatGrowthPercent(revenueGrowthPercent) ?? "—"}
                  icon={<MetricIconGrowth />}
                  variant="default"
                  subtitle="faturamento vs. mês anterior"
                  trend={
                    revenueGrowthPercent == null
                      ? "neutral"
                      : revenueGrowthPercent >= 0
                        ? "up"
                        : "down"
                  }
                />
              </>
            ) : null}
          </>
        )}
      </MetricGrid>
    </section>
  );
}

type RevenueAndOrdersSectionProps = {
  revenueData: RevenueDataPoint[];
  chartLoading: boolean;
  chartError: string | null;
  chartSubtitle: string;
  totalRevenue: number;
  growthPercent: number | undefined;
  showAdvancedChart: boolean;
  recentOrders: ServiceOrder[];
  ordersLoading: boolean;
  ordersError: string | null;
  maxOrders?: number;
};

export function RevenueAndOrdersSection({
  revenueData,
  chartLoading,
  chartError,
  chartSubtitle,
  totalRevenue,
  growthPercent,
  showAdvancedChart,
  recentOrders,
  ordersLoading,
  ordersError,
  maxOrders = 5,
}: RevenueAndOrdersSectionProps) {
  const navigate = useNavigate();

  return (
    <section className={styles.contentGrid} aria-label="Faturamento e ordens recentes">
      <div className={styles.contentGridChart}>
        {chartError && !chartLoading ? (
          <p className={styles.kpiError} role="alert">
            {chartError}
          </p>
        ) : null}
        <div className={styles.contentGridCard}>
          <RevenueChartCard
            title="Faturamento mensal"
            subtitle={chartSubtitle}
            data={revenueData}
            loading={chartLoading}
            totalRevenue={chartLoading ? undefined : totalRevenue}
            growthPercent={chartLoading ? undefined : growthPercent}
            comparisonPeriod="vs. mês anterior"
            showTarget={showAdvancedChart}
            showTrendLine={showAdvancedChart}
            height={showAdvancedChart ? 260 : 240}
          />
        </div>
      </div>
      <div className={styles.contentGridTable}>
        {ordersError && !ordersLoading ? (
          <p className={styles.kpiError} role="alert">
            {ordersError}
          </p>
        ) : null}
        <div className={styles.contentGridCard}>
          <RecentOrdersCard
            title="Ordens recentes"
            subtitle="Últimas movimentações da operação"
            orders={recentOrders}
            loading={ordersLoading}
            maxItems={maxOrders}
            onViewAll={() => navigate("/app/service-orders")}
            onOrderClick={() => navigate("/app/service-orders")}
          />
        </div>
      </div>
    </section>
  );
}

type PmocIncidentsStripProps = {
  alerts: PmocOccurrenceAlertOut[];
};

export function PmocIncidentsStrip({ alerts }: PmocIncidentsStripProps) {
  if (alerts.length === 0) return null;
  return (
    <section className={styles.incidentsStrip} aria-label="Incidentes PMOC abertos">
      <h3 className={styles.incidentsTitle}>Incidentes PMOC — ação necessária</h3>
      <PmocOccurrencesPanel alerts={alerts} />
    </section>
  );
}
