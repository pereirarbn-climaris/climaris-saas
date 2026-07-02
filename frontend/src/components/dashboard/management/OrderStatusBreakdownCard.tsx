import type { DashboardOrderStatusBreakdownItemOut } from "../../../api/dashboard";
import styles from "./DashboardManagement.module.css";

type OrderStatusBreakdownCardProps = {
  items: DashboardOrderStatusBreakdownItemOut[];
  loading?: boolean;
  onViewAll?: () => void;
};

export function OrderStatusBreakdownCard({ items, loading, onViewAll }: OrderStatusBreakdownCardProps) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <article className={styles.card} aria-label="Distribuição de ordens de serviço">
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Distribuição de OS</h3>
          <p className={styles.cardSubtitle}>Visão geral por status na operação</p>
        </div>
        {onViewAll ? (
          <button type="button" className={styles.linkBtn} onClick={onViewAll}>
            Ver todas
          </button>
        ) : null}
      </header>

      {loading ? (
        <div className={styles.skeletonBlock} aria-hidden />
      ) : items.length === 0 ? (
        <p className={styles.emptyHint}>Nenhuma ordem de serviço cadastrada.</p>
      ) : (
        <ul className={styles.breakdownList}>
          {items.map((item) => {
            const pct = total > 0 ? (item.count / total) * 100 : 0;
            return (
              <li key={item.status} className={styles.breakdownItem}>
                <span className={styles.breakdownLabel}>{item.label}</span>
                <span className={styles.breakdownCount}>{item.count}</span>
                <div className={styles.breakdownBarTrack}>
                  <div
                    className={styles.breakdownBarFill}
                    style={{ width: `${Math.max(pct, item.count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
