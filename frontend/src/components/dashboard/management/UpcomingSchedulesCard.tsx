import type { DashboardUpcomingScheduleOut } from "../../../api/dashboard";
import { formatScheduleTime } from "../../../pages/dashboard/dashboardFormatters";
import styles from "./DashboardManagement.module.css";

type UpcomingSchedulesCardProps = {
  schedules: DashboardUpcomingScheduleOut[];
  loading?: boolean;
  onViewAll?: () => void;
};

export function UpcomingSchedulesCard({ schedules, loading, onViewAll }: UpcomingSchedulesCardProps) {
  return (
    <article className={styles.card} aria-label="Próximos agendamentos">
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Próximos agendamentos</h3>
          <p className={styles.cardSubtitle}>Compromissos confirmados e pendentes</p>
        </div>
        {onViewAll ? (
          <button type="button" className={styles.linkBtn} onClick={onViewAll}>
            Ver agenda
          </button>
        ) : null}
      </header>

      {loading ? (
        <div className={styles.skeletonBlock} aria-hidden />
      ) : schedules.length === 0 ? (
        <p className={styles.emptyHint}>Nenhum agendamento futuro no momento.</p>
      ) : (
        <ul className={styles.scheduleList}>
          {schedules.map((schedule) => (
            <li key={schedule.id} className={styles.scheduleItem}>
              <time className={styles.scheduleTime} dateTime={schedule.starts_at}>
                {formatScheduleTime(schedule.starts_at)}
              </time>
              <div className={styles.scheduleBody}>
                <strong>{schedule.client_name}</strong>
                <p className={styles.scheduleMeta}>
                  {schedule.technician_names.length > 0
                    ? schedule.technician_names.join(", ")
                    : "Sem técnico atribuído"}
                  {schedule.service_order_id ? ` · OS #${schedule.service_order_id}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
