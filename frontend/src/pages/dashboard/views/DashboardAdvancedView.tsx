import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardUpgradePreview } from "../../../components/dashboard/management/DashboardUpgradePreview";
import { QuickActionsPanel } from "../../../components/dashboard/management/QuickActionsPanel";
import { OrderStatusBreakdownCard } from "../../../components/dashboard/management/OrderStatusBreakdownCard";
import { UpcomingSchedulesCard } from "../../../components/dashboard/management/UpcomingSchedulesCard";
import type { DashboardHomeData } from "../useDashboardHomeData";
import { BaseKpisSection, PmocIncidentsStrip, RevenueAndOrdersSection } from "../DashboardCoreSections";
import { formatPeriodLabel } from "../dashboardFormatters";
import styles from "../DashboardHomePage.module.css";
import mgmtStyles from "../../../components/dashboard/management/DashboardManagement.module.css";

type DashboardAdvancedViewProps = {
  data: DashboardHomeData;
  userFirstName: string;
  onOpenReports: () => void;
  canUpgrade?: boolean;
};

export function DashboardAdvancedView({ data, userFirstName, onOpenReports, canUpgrade }: DashboardAdvancedViewProps) {
  const navigate = useNavigate();

  const chartSubtitle = data.revenueChart
    ? `Últimos ${data.revenueChart.months} meses · metas e tendência · até ${formatPeriodLabel(data.revenueChart.end_year, data.revenueChart.end_month)}`
    : "Receita consolidada com metas mensais";

  const quickActions = useMemo(
    () => [
      { id: "new-os", label: "Nova OS", icon: "📋", onClick: () => navigate("/app/service-orders/new") },
      { id: "new-budget", label: "Novo orçamento", icon: "💰", onClick: () => navigate("/app/budgets/new") },
      { id: "schedule", label: "Agenda", icon: "📅", onClick: () => navigate("/app/agenda") },
      { id: "clients", label: "Clientes", icon: "👥", onClick: () => navigate("/app/clients") },
      { id: "finance", label: "Financeiro", icon: "📊", onClick: () => navigate("/app/finance/dashboard") },
      { id: "pmoc", label: "PMOC", icon: "🛡️", onClick: () => navigate("/app/pmoc") },
    ],
    [navigate],
  );

  return (
    <>
      <section className={styles.hero} aria-labelledby="dashboard-home-title">
        <div>
          <h2 id="dashboard-home-title" className={styles.heroTitle}>
            Painel avançado, {userFirstName}
          </h2>
          <p className={styles.heroLead}>
            Visão ampliada com metas, agenda, orçamentos e distribuição operacional.
          </p>
        </div>
        <button type="button" className={styles.heroBtn} onClick={onOpenReports}>
          <span className={styles.heroBtnIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <polyline points="16 6 21 6 21 11" />
              <path d="m21 6-8 8-4-4-6 6" />
            </svg>
          </span>
          Relatórios detalhados
        </button>
      </section>

      <PmocIncidentsStrip alerts={data.incidentAlerts} />

      {data.error ? (
        <p className={styles.kpiError} role="alert">
          {data.error}
        </p>
      ) : null}

      <BaseKpisSection
        kpis={data.kpis}
        isLoading={data.isLoading || data.extendedLoading}
        showExtendedMetrics
        completedOrders={data.extended?.completed_orders_month}
        pendingBudgets={data.extended?.pending_budgets}
        schedulesToday={data.extended?.schedules_today}
        revenueGrowthPercent={data.extended?.revenue_growth_percent}
      />

      <RevenueAndOrdersSection
        revenueData={data.revenueData}
        chartLoading={data.chartLoading}
        chartError={data.chartError}
        chartSubtitle={chartSubtitle}
        totalRevenue={data.totalRevenue}
        growthPercent={data.growthPercent}
        showAdvancedChart
        recentOrders={data.recentOrders}
        ordersLoading={data.ordersLoading}
        ordersError={data.ordersError}
      />

      <QuickActionsPanel actions={quickActions} />

      <div className={mgmtStyles.managementGrid2}>
        <OrderStatusBreakdownCard
          items={data.orderBreakdown}
          loading={data.extendedLoading}
          onViewAll={() => navigate("/app/service-orders")}
        />
        <UpcomingSchedulesCard
          schedules={data.upcomingSchedules}
          loading={data.extendedLoading}
          onViewAll={() => navigate("/app/agenda")}
        />
      </div>

      <DashboardUpgradePreview currentTier="advanced" canUpgrade={canUpgrade} />
    </>
  );
}
