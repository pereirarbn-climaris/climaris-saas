import type { PmocComplianceSummaryOut, PmocPendingTaskOut, PmocPlanOut } from "../../api/pmoc";
import { Button } from "../ui/button";
import { PmocPendingTasksCard } from "./PmocPendingTasksCard";
import styles from "./PmocPlanningTab.module.css";

type Props = {
  plan: PmocPlanOut;
  complianceSummary: PmocComplianceSummaryOut | null;
  pmocId: number;
  canSchedule: boolean;
  refreshKey: number;
  onScheduleNow: (task: PmocPendingTaskOut) => void;
  onScheduleBulk: () => void;
};

function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function artDueFromIssued(iso: string | null | undefined): string {
  if (!iso) return "ART não informada";
  const issued = new Date(iso);
  if (Number.isNaN(issued.getTime())) return "ART — data inválida";
  const expires = new Date(issued);
  expires.setFullYear(expires.getFullYear() + 1);
  return expires.toLocaleDateString("pt-BR");
}

export function PmocDetailPlanningTab({
  plan,
  complianceSummary,
  pmocId,
  canSchedule,
  refreshKey,
  onScheduleNow,
  onScheduleBulk,
}: Props) {
  const executionPct = Math.round(complianceSummary?.monthly_execution_pct ?? 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.statusCard}>
        <div className={styles.statusMetric}>
          <p className={styles.statusMetricLabel}>Status mensal</p>
          <p className={styles.statusMetricValue}>{executionPct}%</p>
          <p className={styles.statusMetricHint}>Execução do cronograma no mês corrente</p>
        </div>
        <div className={styles.statusMetric}>
          <p className={styles.statusMetricLabel}>Vencimento ART (estimado)</p>
          <p className={styles.statusMetricValue}>{artDueFromIssued(plan.art_issued_at)}</p>
          <p className={styles.statusMetricHint}>Com base na emissão informada na aba Ar & ART</p>
        </div>
        <div className={styles.statusMetric}>
          <p className={styles.statusMetricLabel}>Próxima análise de ar</p>
          <p className={styles.statusMetricValue}>{formatDueDate(plan.next_air_analysis_due)}</p>
          <p className={styles.statusMetricHint}>Planejamento de conformidade ambiental</p>
        </div>
      </div>

      <PmocPendingTasksCard
        pmocId={pmocId}
        canSchedule={canSchedule}
        refreshKey={refreshKey}
        onScheduleNow={onScheduleNow}
      />

      {canSchedule && (plan.status === "active" || plan.status === "draft") ? (
        <div style={{ marginTop: "1rem" }}>
          <Button type="button" onClick={onScheduleBulk}>
            Agendar Atividades
          </Button>
          <p className={styles.agendaNote}>
            Compromissos gerados aparecem na <strong>Agenda</strong> com a tag{" "}
            <span className={styles.agendaTagPreview}>PMOC</span> em laranja.
          </p>
        </div>
      ) : null}
    </div>
  );
}
