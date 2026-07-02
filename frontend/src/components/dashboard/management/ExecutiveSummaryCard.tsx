import type { DashboardExtendedKpisOut, DashboardFinancialSnapshotOut, DashboardPmocSummaryOut } from "../../../api/dashboard";
import type { DashboardHomeKpisOut } from "../../../api/dashboard";
import { formatBrl, formatGrowthPercent, formatPeriodLabel } from "../../../pages/dashboard/dashboardFormatters";
import styles from "./DashboardManagement.module.css";

type ExecutiveSummaryCardProps = {
  kpis: DashboardHomeKpisOut | null;
  extended: DashboardExtendedKpisOut | null;
  financial: DashboardFinancialSnapshotOut | null;
  pmoc: DashboardPmocSummaryOut | null;
};

export function ExecutiveSummaryCard({ kpis, extended, financial, pmoc }: ExecutiveSummaryCardProps) {
  const period =
    kpis != null ? formatPeriodLabel(kpis.period_year, kpis.period_month) : "mês atual";

  return (
    <article className={styles.card} aria-label="Resumo executivo">
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Resumo executivo</h3>
          <p className={styles.cardSubtitle}>Indicadores consolidados da empresa em {period}</p>
        </div>
      </header>

      <div className={styles.executiveGrid}>
        <div className={styles.executiveItem}>
          <p className={styles.executiveItemLabel}>Faturamento</p>
          <p className={styles.executiveItemValue}>
            {kpis != null ? formatBrl(kpis.monthly_revenue) : "—"}
          </p>
          {extended?.revenue_growth_percent != null ? (
            <p className={styles.executiveItemHint}>
              {formatGrowthPercent(extended.revenue_growth_percent)} vs. mês anterior
            </p>
          ) : null}
        </div>

        <div className={styles.executiveItem}>
          <p className={styles.executiveItemLabel}>OS concluídas</p>
          <p className={styles.executiveItemValue}>{extended?.completed_orders_month ?? "—"}</p>
          <p className={styles.executiveItemHint}>
            {kpis?.active_service_orders ?? 0} ativas no momento
          </p>
        </div>

        <div className={styles.executiveItem}>
          <p className={styles.executiveItemLabel}>Novos clientes</p>
          <p className={styles.executiveItemValue}>{extended?.new_clients_month ?? "—"}</p>
          <p className={styles.executiveItemHint}>
            {kpis?.active_clients ?? 0} clientes ativos no total
          </p>
        </div>

        <div className={styles.executiveItem}>
          <p className={styles.executiveItemLabel}>Conversão orçamentos</p>
          <p className={styles.executiveItemValue}>
            {extended?.budget_conversion_rate != null
              ? `${extended.budget_conversion_rate.toFixed(1)}%`
              : "—"}
          </p>
          <p className={styles.executiveItemHint}>
            {extended?.pending_budgets ?? 0} orçamento(s) aguardando resposta
          </p>
        </div>

        {financial?.finance_enabled ? (
          <div className={styles.executiveItem}>
            <p className={styles.executiveItemLabel}>Saldo projetado</p>
            <p className={styles.executiveItemValue}>{formatBrl(financial.net_cash_position)}</p>
            <p className={styles.executiveItemHint}>Recebíveis menos pagáveis em aberto</p>
          </div>
        ) : null}

        {pmoc ? (
          <div className={styles.executiveItem}>
            <p className={styles.executiveItemLabel}>PMOC</p>
            <p className={styles.executiveItemValue}>{pmoc.active_pmoc_plans}</p>
            <p className={styles.executiveItemHint}>
              {pmoc.open_occurrences} ocorrência(s) aberta(s)
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
