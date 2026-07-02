import type { DashboardTechnicianWorkloadOut } from "../../../api/dashboard";
import styles from "./DashboardManagement.module.css";

type TechnicianWorkloadCardProps = {
  items: DashboardTechnicianWorkloadOut[];
  loading?: boolean;
};

export function TechnicianWorkloadCard({ items, loading }: TechnicianWorkloadCardProps) {
  return (
    <article className={styles.card} aria-label="Carga da equipe hoje">
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Equipe em campo</h3>
          <p className={styles.cardSubtitle}>Agendamentos por técnico hoje</p>
        </div>
      </header>

      {loading ? (
        <div className={styles.skeletonBlock} aria-hidden />
      ) : items.length === 0 ? (
        <p className={styles.emptyHint}>Nenhum técnico ativo ou sem agendamentos hoje.</p>
      ) : (
        <ul className={styles.workloadList}>
          {items.map((item) => (
            <li key={item.technician_id} className={styles.workloadItem}>
              <span className={styles.workloadName}>{item.technician_name}</span>
              <span className={styles.workloadCount}>
                {item.schedules_count} {item.schedules_count === 1 ? "visita" : "visitas"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
