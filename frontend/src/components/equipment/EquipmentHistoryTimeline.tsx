import styles from "./EquipmentHistoryTimeline.module.css";

export type EquipmentHistoryTimelineEntry = {
  occurred_at: string;
  kind: string;
  title: string;
  detail?: string | null;
  changed_by_user_name?: string | null;
  order_status_label?: string | null;
  checklist_items?: { descricao: string; status: string }[];
};

type Props = {
  entries: EquipmentHistoryTimelineEntry[];
  emptyMessage?: string;
};

function formatDt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function kindLabel(kind: string): string {
  if (kind === "servico" || kind === "ordem_concluida") return "Serviço";
  if (kind === "registro") return "Registro";
  return "Evento";
}

export function EquipmentHistoryTimeline({
  entries,
  emptyMessage = "Nenhum serviço registrado ainda.",
}: Props) {
  if (!entries.length) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <ol className={styles.timeline}>
      {entries.map((entry, idx) => (
        <li key={`${entry.occurred_at}-${idx}`} className={styles.item}>
          <span className={styles.dot} aria-hidden />
          <div className={styles.card}>
            <div className={styles.cardTop}>
              <time className={styles.when} dateTime={entry.occurred_at}>
                {formatDt(entry.occurred_at)}
              </time>
              <span className={styles.kind}>{kindLabel(entry.kind)}</span>
            </div>
            <p className={styles.title}>{entry.title}</p>
            {entry.detail ? <p className={styles.detail}>{entry.detail}</p> : null}
            {entry.changed_by_user_name ? (
              <p className={styles.detail}>Por: {entry.changed_by_user_name}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
