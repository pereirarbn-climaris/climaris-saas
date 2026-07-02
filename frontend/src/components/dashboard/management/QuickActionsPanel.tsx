import styles from "./DashboardManagement.module.css";

type QuickAction = {
  id: string;
  label: string;
  icon: string;
  onClick: () => void;
};

type QuickActionsPanelProps = {
  actions: QuickAction[];
};

export function QuickActionsPanel({ actions }: QuickActionsPanelProps) {
  return (
    <article className={styles.card} aria-label="Ações rápidas">
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Ações rápidas</h3>
          <p className={styles.cardSubtitle}>Atalhos para as rotinas mais usadas</p>
        </div>
      </header>
      <div className={styles.quickActions}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={styles.quickActionBtn}
            onClick={action.onClick}
          >
            <span className={styles.quickActionIcon} aria-hidden>
              {action.icon}
            </span>
            <span className={styles.quickActionLabel}>{action.label}</span>
          </button>
        ))}
      </div>
    </article>
  );
}
