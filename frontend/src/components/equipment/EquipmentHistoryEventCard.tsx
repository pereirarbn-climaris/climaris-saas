import type { MaintenanceEvent, MaintenanceEventType } from "../v0-ui/clients/PublicEquipmentProfileView v2";
import styles from "./EquipmentHistoryEventCard.module.css";

const eventTypeConfig: Record<
  MaintenanceEventType,
  { label: string; badgeClass: string; dotClass: string }
> = {
  registro: { label: "REGISTRO", badgeClass: styles.badgeRegistro, dotClass: styles.dotRegistro },
  servico: { label: "SERVIÇO", badgeClass: styles.badgeServico, dotClass: styles.dotServico },
  instalacao: { label: "INSTALAÇÃO", badgeClass: styles.badgeInstalacao, dotClass: styles.dotInstalacao },
  garantia: { label: "GARANTIA", badgeClass: styles.badgeGarantia, dotClass: styles.dotGarantia },
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveSummaryLine(event: MaintenanceEvent): string {
  if (event.summaryLine?.trim()) return event.summaryLine.trim();
  if (event.osNumber && event.orderStatus) {
    return `OS #${event.osNumber} — ${event.orderStatus} — ${event.title}`;
  }
  if (event.osNumber) return `OS #${event.osNumber} — ${event.title}`;
  return event.title;
}

type Props = {
  event: MaintenanceEvent;
  isLast: boolean;
};

export function EquipmentHistoryEventCard({ event, isLast }: Props) {
  const config = eventTypeConfig[event.type] ?? eventTypeConfig.registro;
  const summaryLine = resolveSummaryLine(event);

  return (
    <div className={styles.row}>
      <div className={styles.timeline}>
        <span className={`${styles.dot} ${config.dotClass}`} aria-hidden />
        {!isLast ? <span className={styles.line} aria-hidden /> : null}
      </div>
      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <time className={styles.time}>{formatDateTime(event.date)}</time>
          <span className={`${styles.badge} ${config.badgeClass}`}>{config.label}</span>
        </div>
        <h4 className={styles.title}>{summaryLine}</h4>
      </article>
    </div>
  );
}
