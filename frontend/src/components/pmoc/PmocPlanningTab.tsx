import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "../ui/button";
import type { MockActivityRow, MockEquipment } from "../../lib/pmocCreateMockData";
import {
  buildPlanningRowsForMonth,
  formatMonthYearInput,
  groupPlanningRowsByEquipment,
  parseMonthYearInput,
  sumEstimatedMinutes,
  type PlanningTaskStatus,
} from "../../lib/pmocPlanningMock";
import type { PmocPlanningScheduleSelection } from "../../lib/pmocOsSchedule";
import { formatDurationMinutes } from "../../lib/formatDuration";
import {
  planningScheduledRowKeysToOverrides,
} from "../../lib/pmocPlanningExtras";
import { PmocPlanningScheduleModal } from "./PmocPlanningScheduleModal";
import styles from "./PmocPlanningTab.module.css";

type Props = {
  pmocId?: number;
  clientName: string;
  planTitle: string;
  activities: MockActivityRow[];
  equipments: MockEquipment[];
  selectedEquipmentIds: string[];
  artIssuedAt: string;
  nextAirAnalysisDue: string;
  requireSaveBeforeSchedule?: boolean;
  planningScheduledRowKeys?: string[];
  onScheduleSuccess?: () => void;
  onScheduleActivities?: (selection: PmocPlanningScheduleSelection) => void;
};

const STATUS_LABEL: Record<PlanningTaskStatus, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  concluido: "Concluído",
};

function formatDueDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export function PmocPlanningTab({
  pmocId,
  clientName,
  planTitle,
  activities,
  equipments,
  selectedEquipmentIds,
  artIssuedAt,
  nextAirAnalysisDue,
  requireSaveBeforeSchedule = false,
  planningScheduledRowKeys = [],
  onScheduleSuccess,
  onScheduleActivities,
}: Props) {
  const now = new Date();
  const [periodInput, setPeriodInput] = useState(formatMonthYearInput(now.getFullYear(), now.getMonth() + 1));
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, PlanningTaskStatus>>({});
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    setStatusOverrides(planningScheduledRowKeysToOverrides(planningScheduledRowKeys));
  }, [planningScheduledRowKeys]);

  const period = useMemo(() => parseMonthYearInput(periodInput), [periodInput]);

  const rows = useMemo(() => {
    if (!period) return [];
    return buildPlanningRowsForMonth({
      year: period.year,
      month: period.month,
      activities,
      equipments,
      selectedEquipmentIds,
      statusOverrides,
    });
  }, [period, activities, equipments, selectedEquipmentIds, statusOverrides]);

  const equipmentGroups = useMemo(
    () => groupPlanningRowsByEquipment(rows, equipments),
    [rows, equipments],
  );

  const selectableRows = useMemo(
    () => rows.filter((row) => row.status === "pendente"),
    [rows],
  );

  const selectedRows = useMemo(
    () => selectableRows.filter((row) => selectedRowKeys.includes(row.rowKey)),
    [selectableRows, selectedRowKeys],
  );

  const totalMinutes = useMemo(() => sumEstimatedMinutes(selectedRows), [selectedRows]);

  const plannedCount = rows.length;
  const executedCount = rows.filter((r) => r.status === "concluido").length;

  const artDueDisplay = useMemo(() => {
    if (!artIssuedAt) return "ART não informada";
    const issued = new Date(artIssuedAt);
    if (Number.isNaN(issued.getTime())) return "ART — data inválida";
    const expires = new Date(issued);
    expires.setFullYear(expires.getFullYear() + 1);
    return expires.toLocaleDateString("pt-BR");
  }, [artIssuedAt]);

  function toggleRow(rowKey: string, status: PlanningTaskStatus) {
    if (status === "agendado" || status === "concluido") return;
    setSelectedRowKeys((prev) => (prev.includes(rowKey) ? prev.filter((k) => k !== rowKey) : [...prev, rowKey]));
  }

  function handlePeriodChange(value: string) {
    setPeriodInput(value);
    setSelectedRowKeys([]);
  }

  function handleScheduled(rowKeys: string[]) {
    setStatusOverrides((prev) => {
      const next = { ...prev };
      for (const key of rowKeys) next[key] = "agendado";
      return next;
    });
    setSelectedRowKeys([]);
    setScheduleOpen(false);
    onScheduleSuccess?.();
  }

  const periodLabel = period
    ? new Date(period.year, period.month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : "";
  const periodShortLabel = period ? `${String(period.month).padStart(2, "0")}/${period.year}` : "";

  return (
    <div className={styles.wrap}>
      <div className={styles.monthFilter}>
        <label>
          Mês / ano
          <input type="month" value={periodInput} onChange={(e) => handlePeriodChange(e.target.value)} />
        </label>
        <p className={styles.emptyHint} style={{ margin: 0, alignSelf: "flex-end" }}>
          Lista atualizada automaticamente ao mudar o período.
        </p>
      </div>

      <div className={styles.statusCard}>
        <div className={styles.statusMetric}>
          <p className={styles.statusMetricLabel}>Status mensal</p>
          <p className={styles.statusMetricValue}>
            {executedCount}/{plannedCount}
          </p>
          <p className={styles.statusMetricHint}>Equipamentos executados vs. planejados no mês</p>
        </div>
        <div className={styles.statusMetric}>
          <p className={styles.statusMetricLabel}>Vencimento ART (estimado)</p>
          <p className={styles.statusMetricValue}>{artDueDisplay}</p>
          <p className={styles.statusMetricHint}>Com base na emissão informada na aba Ar & ART</p>
        </div>
        <div className={styles.statusMetric}>
          <p className={styles.statusMetricLabel}>Próxima análise de ar</p>
          <p className={styles.statusMetricValue}>{formatDueDate(nextAirAnalysisDue)}</p>
          <p className={styles.statusMetricHint}>Planejamento de conformidade ambiental</p>
        </div>
      </div>

      {selectedEquipmentIds.length === 0 ? (
        <p className={styles.emptyHint}>
          Selecione equipamentos na aba <strong>Identificação do Cliente</strong> para montar o planejamento mensal.
        </p>
      ) : (
        <div className={styles.dashboard}>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>Ativos com manutenção no mês</h3>
            <p className={styles.panelLead}>
              {periodLabel || "Período"} — marque os equipamentos que entrarão na visita.
            </p>

            {rows.length === 0 ? (
              <p className={styles.emptyHint}>Nenhuma atividade prevista para este mês com os equipamentos selecionados.</p>
            ) : (
              <div className={styles.equipmentGroups}>
                {equipmentGroups.map((group) => (
                  <article key={group.equipmentId} className={styles.equipmentCard}>
                    <header className={styles.equipmentCardHeader}>
                      <p className={styles.equipmentCardTitle}>{group.title}</p>
                      {group.hasOverdue ? <span className={styles.overdueBadge}>Manutenção atrasada</span> : null}
                    </header>
                    <ul className={styles.taskList}>
                      {group.tasks.map((row) => {
                        const checked = selectedRowKeys.includes(row.rowKey);
                        const statusClass =
                          row.status === "concluido"
                            ? styles.statusConcluido
                            : row.status === "agendado"
                              ? styles.statusAgendado
                              : styles.statusPendente;
                        const isLocked = row.status === "concluido" || row.status === "agendado";
                        return (
                          <li key={row.rowKey}>
                            <label
                              className={`${styles.taskRow} ${checked ? styles.taskRowSelected : ""} ${row.overdue ? styles.taskRowOverdue : ""} ${isLocked ? styles.taskRowLocked : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isLocked}
                                onChange={() => toggleRow(row.rowKey, row.status)}
                                aria-label={`Selecionar ${row.activityTitle}`}
                              />
                              <span className={styles.taskLabel}>
                                <span className={styles.taskName}>{row.activityTitle}</span>
                                <span className={styles.taskDuration}>{formatDurationMinutes(row.estimatedMinutes)}</span>
                              </span>
                              <span className={`${styles.statusPill} ${statusClass}`}>{STATUS_LABEL[row.status]}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>
              <CalendarClock size={18} style={{ verticalAlign: "middle", marginRight: "0.35rem" }} aria-hidden />
              Logística de agendamento
            </h3>
            <p className={styles.panelLead}>Selecione os ativos à esquerda e confirme a visita na agenda.</p>

            <div className={styles.logisticsSummary}>
              Total de horas estimadas: <strong>{formatDurationMinutes(totalMinutes)}</strong>
            </div>

            {selectedRows.length > 0 ? (
              <ul className={styles.selectedList}>
                {selectedRows.map((row) => (
                  <li key={row.rowKey}>
                    {row.equipmentName} — {row.activityTitle}
                    <span className={styles.selectedDuration}> ({formatDurationMinutes(row.estimatedMinutes)})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyHint}>Nenhum equipamento selecionado para agendar.</p>
            )}

            <div style={{ marginTop: "1rem" }}>
              {requireSaveBeforeSchedule ? (
                <p className={styles.emptyHint}>
                  Salve o PMOC para liberar o agendamento com o plano persistido e integração com a agenda.
                </p>
              ) : (
                <Button
                  type="button"
                  disabled={selectedRows.length === 0}
                  onClick={() => {
                    if (!period || selectedRows.length === 0) return;
                    if (onScheduleActivities) {
                      onScheduleActivities({
                        period: { year: period.year, month: period.month },
                        tasks: selectedRows.map((row) => ({
                          equipmentId: Number.parseInt(row.equipmentId, 10),
                          activityId: Number.parseInt(row.activityId, 10),
                          equipmentName: row.equipmentName,
                          activityTitle: row.activityTitle,
                          estimatedMinutes: row.estimatedMinutes,
                        })),
                      });
                    } else {
                      setScheduleOpen(true);
                    }
                  }}
                >
                  Agendar Atividades
                </Button>
              )}
            </div>

            {!requireSaveBeforeSchedule ? (
              <p className={styles.agendaNote}>
              Compromissos gerados aqui aparecem na <strong>Agenda</strong> com a tag{" "}
              <span className={styles.agendaTagPreview}>PMOC</span> em laranja.
            </p>
            ) : null}
          </section>
        </div>
      )}

      {!onScheduleActivities ? (
        <PmocPlanningScheduleModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          pmocId={pmocId}
          clientName={clientName}
          planTitle={planTitle || "Novo PMOC"}
          periodLabel={periodShortLabel}
          periodYear={period?.year ?? new Date().getFullYear()}
          periodMonth={period?.month ?? new Date().getMonth() + 1}
          selectedRows={selectedRows}
          onScheduled={handleScheduled}
        />
      ) : null}
    </div>
  );
}
