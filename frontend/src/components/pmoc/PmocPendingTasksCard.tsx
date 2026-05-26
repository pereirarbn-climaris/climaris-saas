import { useEffect, useMemo, useState } from "react";
import { getPmocPendingTasks, type PmocPendingTaskOut } from "../../api/pmoc";
import styles from "./PmocPendingTasksCard.module.css";

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

type Props = {
  pmocId: number;
  canSchedule: boolean;
  refreshKey?: number;
  onScheduleNow: (task: PmocPendingTaskOut) => void;
};

function taskLabel(task: PmocPendingTaskOut): string {
  const service = task.service_name?.trim() || task.activity_title;
  return `${task.equipment_label}: ${service} (Pendente)`;
}

export function PmocPendingTasksCard({ pmocId, canSchedule, refreshKey = 0, onScheduleNow }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof getPmocPendingTasks>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    void (async () => {
      try {
        const result = await getPmocPendingTasks(pmocId);
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setErr(e instanceof Error ? e.message : "Não foi possível carregar pendências.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pmocId, refreshKey]);

  const periodLabel = useMemo(() => {
    if (!data) return "";
    const monthName = MONTH_NAMES[data.period_month - 1] ?? String(data.period_month);
    return `${monthName} de ${data.period_year}`;
  }, [data]);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Pendências deste mês</h3>
        {periodLabel ? <span className={styles.period}>{periodLabel}</span> : null}
      </div>

      {loading ? <p className={styles.hint}>Carregando pendências…</p> : null}
      {!loading && err ? (
        <p className={styles.error} role="alert">
          {err}
        </p>
      ) : null}

      {!loading && !err && data && data.tasks.length === 0 ? (
        <p className={styles.hint}>Nenhuma pendência de execução para o mês atual. Cronograma em dia.</p>
      ) : null}

      {!loading && !err && data && data.tasks.length > 0 ? (
        <ul className={styles.list}>
          {data.tasks.map((task) => (
            <li key={`${task.equipment_id}-${task.activity_id}`} className={styles.row}>
              <span className={styles.label}>{taskLabel(task)}</span>
              {canSchedule ? (
                <button type="button" className={styles.btnSchedule} onClick={() => onScheduleNow(task)}>
                  Agendar agora
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
