import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ExecutiveSummaryCard } from "../../../components/dashboard/management/ExecutiveSummaryCard";
import { FinancialSnapshotCard } from "../../../components/dashboard/management/FinancialSnapshotCard";
import { OrderStatusBreakdownCard } from "../../../components/dashboard/management/OrderStatusBreakdownCard";
import { QuickActionsPanel } from "../../../components/dashboard/management/QuickActionsPanel";
import { TechnicianWorkloadCard } from "../../../components/dashboard/management/TechnicianWorkloadCard";
import { UpcomingSchedulesCard } from "../../../components/dashboard/management/UpcomingSchedulesCard";
import type { DashboardHomeData } from "../useDashboardHomeData";
import { BaseKpisSection, PmocIncidentsStrip, RevenueAndOrdersSection } from "../DashboardCoreSections";
import { formatPeriodLabel } from "../dashboardFormatters";
import styles from "../DashboardHomePage.module.css";
import mgmtStyles from "../../../components/dashboard/management/DashboardManagement.module.css";

type DashboardCompleteViewProps = {
  data: DashboardHomeData;
  userFirstName: string;
  onOpenReports: () => void;
};

export function DashboardCompleteView({ data, userFirstName, onOpenReports }: DashboardCompleteViewProps) {
  const navigate = useNavigate();

  const chartSubtitle = data.revenueChart
    ? `Últimos ${data.revenueChart.months} meses · visão executiva · até ${formatPeriodLabel(data.revenueChart.end_year, data.revenueChart.end_month)}`
    : "Receita consolidada com metas e tendência";

  const quickActions = useMemo(
    () => [
      { id: "executive-finance", label: "DRE / Financeiro", icon: "📈", onClick: () => navigate("/app/finance/dashboard") },
      { id: "new-os", label: "Nova OS", icon: "📋", onClick: () => navigate("/app/service-orders/new") },
      { id: "new-budget", label: "Orçamentos", icon: "💰", onClick: () => navigate("/app/budgets") },
      { id: "schedule", label: "Agenda", icon: "📅", onClick: () => navigate("/app/agenda") },
      { id: "pmoc", label: "Conformidade PMOC", icon: "🛡️", onClick: () => navigate("/app/pmoc") },
      { id: "admin", label: "Gestão empresa", icon: "🏢", onClick: () => navigate("/app/admin?tab=empresa") },
    ],
    [navigate],
  );

  return (
    <>
      <section className={styles.hero} aria-labelledby="dashboard-home-title">
        <div>
          <h2 id="dashboard-home-title" className={styles.heroTitle}>
            Painel executivo, {userFirstName}
          </h2>
          <p className={styles.heroLead}>
            Gestão completa da empresa — operação, financeiro, equipe e conformidade PMOC.
          </p>
        </div>
        <button type="button" className={styles.heroBtn} onClick={onOpenReports}>
          <span className={styles.heroBtnIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <polyline points="16 6 21 6 21 11" />
              <path d="m21 6-8 8-4-4-6 6" />
            </svg>
          </span>
          Central de relatórios
        </button>
      </section>

      <ExecutiveSummaryCard
        kpis={data.kpis}
        extended={data.extended}
        financial={data.financialSnapshot}
        pmoc={data.pmocSummary}
      />

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

      <FinancialSnapshotCard
        snapshot={data.financialSnapshot}
        loading={data.extendedLoading}
        onOpenFinance={() => navigate("/app/finance/dashboard")}
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
        maxOrders={8}
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

      <TechnicianWorkloadCard items={data.technicianWorkload} loading={data.extendedLoading} />
    </>
  );
}
