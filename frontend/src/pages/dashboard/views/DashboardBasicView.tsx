import { DashboardUpgradePreview } from "../../../components/dashboard/management/DashboardUpgradePreview";
import type { DashboardHomeData } from "../useDashboardHomeData";
import { BaseKpisSection, PmocIncidentsStrip, RevenueAndOrdersSection } from "../DashboardCoreSections";
import { formatPeriodLabel } from "../dashboardFormatters";
import styles from "../DashboardHomePage.module.css";

type DashboardBasicViewProps = {
  data: DashboardHomeData;
  userFirstName: string;
  onOpenReports: () => void;
  canUpgrade?: boolean;
};

export function DashboardBasicView({ data, userFirstName, onOpenReports, canUpgrade }: DashboardBasicViewProps) {
  const chartSubtitle = data.revenueChart
    ? `Últimos ${data.revenueChart.months} meses · até ${formatPeriodLabel(data.revenueChart.end_year, data.revenueChart.end_month)}`
    : "Receita consolidada por mês";

  return (
    <>
      <section className={styles.hero} aria-labelledby="dashboard-home-title">
        <div>
          <h2 id="dashboard-home-title" className={styles.heroTitle}>
            Olá, {userFirstName}!
          </h2>
          <p className={styles.heroLead}>
            Resumo essencial da sua operação — ordens, clientes e faturamento.
          </p>
        </div>
        <button type="button" className={styles.heroBtn} onClick={onOpenReports}>
          <span className={styles.heroBtnIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <polyline points="16 6 21 6 21 11" />
              <path d="m21 6-8 8-4-4-6 6" />
            </svg>
          </span>
          Ver relatórios
        </button>
      </section>

      <PmocIncidentsStrip alerts={data.incidentAlerts} />

      {data.error ? (
        <p className={styles.kpiError} role="alert">
          {data.error}
        </p>
      ) : null}

      <BaseKpisSection kpis={data.kpis} isLoading={data.isLoading} />

      <RevenueAndOrdersSection
        revenueData={data.revenueData}
        chartLoading={data.chartLoading}
        chartError={data.chartError}
        chartSubtitle={chartSubtitle}
        totalRevenue={data.totalRevenue}
        growthPercent={data.growthPercent}
        showAdvancedChart={false}
        recentOrders={data.recentOrders}
        ordersLoading={data.ordersLoading}
        ordersError={data.ordersError}
      />

      <DashboardUpgradePreview currentTier="basic" canUpgrade={canUpgrade} />
    </>
  );
}
