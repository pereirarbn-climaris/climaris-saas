import type { DashboardFinancialSnapshotOut } from "../../../api/dashboard";
import { formatBrlDetailed } from "../../../pages/dashboard/dashboardFormatters";
import styles from "./DashboardManagement.module.css";

type FinancialSnapshotCardProps = {
  snapshot: DashboardFinancialSnapshotOut | null;
  loading?: boolean;
  onOpenFinance?: () => void;
};

export function FinancialSnapshotCard({ snapshot, loading, onOpenFinance }: FinancialSnapshotCardProps) {
  return (
    <article className={styles.card} aria-label="Resumo financeiro">
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Posição financeira</h3>
          <p className={styles.cardSubtitle}>Contas a receber, pagar e inadimplência</p>
        </div>
        {onOpenFinance ? (
          <button type="button" className={styles.linkBtn} onClick={onOpenFinance}>
            Abrir financeiro
          </button>
        ) : null}
      </header>

      {loading ? (
        <div className={styles.skeletonBlock} aria-hidden />
      ) : !snapshot?.finance_enabled ? (
        <p className={styles.emptyHint}>
          Ative o módulo financeiro para acompanhar recebíveis e pagamentos no painel.
        </p>
      ) : (
        <div className={styles.financeGrid}>
          <div className={styles.financeMetric}>
            <p className={styles.financeMetricLabel}>A receber</p>
            <p className={`${styles.financeMetricValue} ${styles.financeMetricValuePositive}`}>
              {formatBrlDetailed(snapshot.accounts_receivable)}
            </p>
          </div>
          <div className={styles.financeMetric}>
            <p className={styles.financeMetricLabel}>A pagar</p>
            <p className={`${styles.financeMetricValue} ${styles.financeMetricValueNegative}`}>
              {formatBrlDetailed(snapshot.accounts_payable)}
            </p>
          </div>
          <div className={styles.financeMetric}>
            <p className={styles.financeMetricLabel}>Saldo projetado</p>
            <p
              className={`${styles.financeMetricValue} ${
                snapshot.net_cash_position >= 0
                  ? styles.financeMetricValuePositive
                  : styles.financeMetricValueNegative
              }`}
            >
              {formatBrlDetailed(snapshot.net_cash_position)}
            </p>
          </div>
          <div className={styles.financeMetric}>
            <p className={styles.financeMetricLabel}>Em atraso</p>
            <p className={`${styles.financeMetricValue} ${styles.financeMetricValueWarning}`}>
              {formatBrlDetailed(snapshot.overdue_receivable + snapshot.overdue_payable)}
            </p>
            <p className={styles.executiveItemHint}>
              {snapshot.overdue_receivable_count + snapshot.overdue_payable_count} lançamento(s)
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
