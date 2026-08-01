import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listTenantUsers } from "../../api/auth";
import {
  getPmocEstimatedTime,
  listPmocActivities,
  type PmocEstimatedTimeOut,
  type PmocPlanEquipmentOut,
  type PmocPlanOut,
} from "../../api/pmoc";
import { approveServiceOrder, createServiceOrder, type SuggestedSlotOut } from "../../api/serviceOrders";
import { listServices, type ServiceOut } from "../../api/services";
import { API_MAX_PAGE_LIMIT } from "../../lib/apiPagination";
import { findBestAvailableSlots, formatSuggestedSlotLine } from "../../lib/findBestAvailableSlots";
import { formatDurationMinutes } from "../../lib/formatDuration";
import {
  buildChecklistFromPmocEquipmentMatrix,
  buildPmocActivitySummaryByEquipment,
  buildPmocEquipmentActivityMatrix,
  buildPmocEquipmentActivityMatrixFromSelection,
  buildPmocEstimateFromActivityMatrix,
  buildPmocRtNotes,
  buildPmocScheduleDescription,
  buildServicosFromPmocEquipmentMatrix,
  PMOC_WORKDAY_MAX_MINUTES,
  suggestPmocSplitDays,
  type PmocPlanningScheduleSelection,
} from "../../lib/pmocOsSchedule";
import { formatEquipmentLocationLabel } from "../../lib/equipmentLocation";
import { mapTechniciansToFormView, viewDataToCreatePayload } from "../../lib/serviceOrderFormViewAdapter";
import { EMPTY_GARANTIA } from "../../lib/serviceOrderGarantia";
import { toast } from "../../lib/toast";
import type { ServiceOrderData } from "../v0-ui/service-orders/ServiceOrderFormView";
import styles from "./PmocScheduleActivitiesModal.module.css";

type ScheduleFocus = {
  equipmentId: number;
  activityId: number;
};

type Props = {
  open: boolean;
  plan: PmocPlanOut;
  equipments: PmocPlanEquipmentOut[];
  focus?: ScheduleFocus | null;
  planningSelection?: PmocPlanningScheduleSelection | null;
  onClose: () => void;
  onScheduled?: () => void;
};

export function PmocScheduleActivitiesModal({
  open,
  plan,
  equipments,
  focus = null,
  planningSelection = null,
  onClose,
  onScheduled,
}: Props) {
  const navigate = useNavigate();
  const [selectedEquipIds, setSelectedEquipIds] = useState<number[]>([]);
  const [periodInput, setPeriodInput] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dataAgendamento, setDataAgendamento] = useState("");
  const [horaAgendamento, setHoraAgendamento] = useState("09:00");
  const [technicianId, setTechnicianId] = useState("");
  const [splitTwoDays, setSplitTwoDays] = useState(false);
  const [estimate, setEstimate] = useState<PmocEstimatedTimeOut | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [technicians, setTechnicians] = useState<{ id: string; nome: string }[]>([]);
  const [servicesCatalog, setServicesCatalog] = useState<ServiceOut[]>([]);
  const [activities, setActivities] = useState<Awaited<ReturnType<typeof listPmocActivities>>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedSlotOut[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (planningSelection) {
      const ids = [...new Set(planningSelection.tasks.map((t) => t.equipmentId))];
      setSelectedEquipIds(ids);
      const pad = (n: number) => String(n).padStart(2, "0");
      setPeriodInput(`${planningSelection.period.year}-${pad(planningSelection.period.month)}`);
    } else if (focus) {
      setSelectedEquipIds([focus.equipmentId]);
    } else {
      setSelectedEquipIds(equipments.map((e) => e.equipment_id));
    }
    setErr("");
    setSplitTwoDays(false);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    if (!planningSelection) {
      setPeriodInput(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
    }
    setDataAgendamento(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  }, [open, equipments, focus, planningSelection]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [users, services, acts] = await Promise.all([
          listTenantUsers({ limit: API_MAX_PAGE_LIMIT }),
          listServices({ limit: API_MAX_PAGE_LIMIT, context: "pmoc" }),
          listPmocActivities(plan.id),
        ]);
        if (cancelled) return;
        setTechnicians(mapTechniciansToFormView(users));
        setServicesCatalog(services.filter((s) => s.is_active));
        setActivities(acts);
      } catch {
        if (!cancelled) {
          setTechnicians([]);
          setServicesCatalog([]);
          setActivities([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, plan.id]);

  const period = useMemo(() => {
    const [y, m] = periodInput.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
    return { year: y, month: m };
  }, [periodInput]);

  useEffect(() => {
    if (!open || !period || selectedEquipIds.length === 0) {
      setEstimate(null);
      return;
    }
    if (planningSelection) {
      if (activities.length === 0 || servicesCatalog.length === 0) {
        setLoadingEstimate(true);
        return;
      }
      const matrix = buildPmocEquipmentActivityMatrixFromSelection({
        tasks: planningSelection.tasks,
        equipments,
        activities,
        catalog: servicesCatalog,
      });
      const localEstimate = buildPmocEstimateFromActivityMatrix(matrix, servicesCatalog, period);
      setEstimate(localEstimate);
      setSplitTwoDays(suggestPmocSplitDays(localEstimate.total_minutes) === 2);
      setLoadingEstimate(false);
      return;
    }
    let cancelled = false;
    setLoadingEstimate(true);
    setErr("");
    void (async () => {
      try {
        const result = await getPmocEstimatedTime(plan.id, {
          year: period.year,
          month: period.month,
          equipment_ids: selectedEquipIds,
        });
        if (!cancelled) {
          setEstimate(result);
          const split = suggestPmocSplitDays(result.total_minutes);
          setSplitTwoDays(split === 2);
        }
      } catch (e) {
        if (!cancelled) {
          setEstimate(null);
          setErr(e instanceof Error ? e.message : "Falha ao calcular tempo estimado.");
        }
      } finally {
        if (!cancelled) setLoadingEstimate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, plan.id, period, selectedEquipIds, planningSelection, activities, servicesCatalog, equipments]);

  const suggestSplit = (estimate?.total_minutes ?? 0) > PMOC_WORKDAY_MAX_MINUTES;

  const activityMatrix = useMemo(() => {
    if (!period || selectedEquipIds.length === 0 || activities.length === 0) return [];
    if (planningSelection) {
      if (servicesCatalog.length === 0) return [];
      return buildPmocEquipmentActivityMatrixFromSelection({
        tasks: planningSelection.tasks,
        equipments,
        activities,
        catalog: servicesCatalog,
      });
    }
    if (!estimate) return [];
    const matrix = buildPmocEquipmentActivityMatrix({
      selectedEquipmentIds: selectedEquipIds,
      equipments,
      activities,
      breakdown: estimate.breakdown,
      catalog: servicesCatalog,
      month: period.month,
    });
    if (!focus) return matrix;
    return matrix.filter(
      (cell) => cell.equipmentId === focus.equipmentId && cell.activityId === focus.activityId,
    );
  }, [estimate, period, selectedEquipIds, equipments, activities, servicesCatalog, focus, planningSelection]);

  const activitySummary = useMemo(
    () => buildPmocActivitySummaryByEquipment(activityMatrix),
    [activityMatrix],
  );

  function toggleEquip(id: number) {
    setSelectedEquipIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const suggestMinutes = useMemo(() => {
    if (activityMatrix.length > 0) {
      return activityMatrix.reduce((sum, cell) => {
        const svc = servicesCatalog.find((s) => s.id === cell.serviceId);
        return sum + (Number(svc?.duration_minutes) || 0);
      }, 0);
    }
    return estimate?.total_minutes ?? 0;
  }, [activityMatrix, servicesCatalog, estimate?.total_minutes]);

  async function handleSuggest() {
    if (suggestMinutes < 1) {
      setErr("Selecione equipamentos com atividades para estimar a duração.");
      return;
    }
    setLoadingSuggest(true);
    setErr("");
    setSuggestions([]);
    try {
      const slots = await findBestAvailableSlots(
        technicianId || undefined,
        dataAgendamento || undefined,
        suggestMinutes,
      );
      setSuggestions(slots);
      if (slots.length === 0) {
        setErr("Nenhuma janela livre encontrada para os critérios informados.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível sugerir horários.");
    } finally {
      setLoadingSuggest(false);
    }
  }

  function applySlot(slot: SuggestedSlotOut) {
    const d = new Date(slot.starts_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    setDataAgendamento(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setHoraAgendamento(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    if (slot.technician_id) setTechnicianId(String(slot.technician_id));
  }

  async function handleConfirm() {
    if (!period || selectedEquipIds.length === 0) {
      setErr("Selecione ao menos um equipamento.");
      return;
    }
    if (!dataAgendamento || !horaAgendamento) {
      setErr("Informe data e horário de início.");
      return;
    }
    if (!technicianId) {
      setErr("Selecione o técnico responsável pela visita.");
      return;
    }
    if (!estimate || activityMatrix.length === 0) {
      setErr("Não há atividades com tempo estimado para o período selecionado.");
      return;
    }

    const local = new Date(`${dataAgendamento}T${horaAgendamento}:00`);
    if (Number.isNaN(local.getTime())) {
      setErr("Data ou horário inválido.");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      const clientName = plan.client?.name ?? `Cliente #${plan.client_id}`;
      const matrix = activityMatrix;
      const servicos = buildServicosFromPmocEquipmentMatrix(matrix, servicesCatalog);
      if (servicos.length === 0) {
        setErr("Nenhum serviço do catálogo pôde ser vinculado às atividades do cronograma.");
        return;
      }

      const focusedMinutes = matrix.reduce((sum, cell) => {
        const svc = servicesCatalog.find((s) => s.id === cell.serviceId);
        return sum + (Number(svc?.duration_minutes) || 0);
      }, 0);
      const estimatedMinutes = planningSelection || focus ? focusedMinutes : estimate.total_minutes;

      const viewData: ServiceOrderData = {
        clienteId: String(plan.client_id),
        tecnicoId: technicianId,
        status: "pendente",
        tipoServico: "preventiva",
        dataAgendamento,
        horaAgendamento,
        pmocPlanId: String(plan.id),
        pmocPeriodYear: period.year,
        pmocPeriodMonth: period.month,
        pmocEstimatedMinutes: estimatedMinutes,
        pmocBreakdown: estimate.breakdown,
        equipamentosIds: selectedEquipIds.map(String),
        servicos,
        pecas: [],
        descricaoProblema: buildPmocScheduleDescription(plan.title, period.year, period.month, estimate.breakdown),
        diagnosticoTecnico: "",
        checklist: buildChecklistFromPmocEquipmentMatrix(matrix),
        valorPecas: 0,
        valorMaoDeObra: servicos.reduce((s, l) => s + Math.max(l.quantity, 1) * l.unitPrice, 0),
        observacoesInternas: buildPmocRtNotes(plan),
        garantia: EMPTY_GARANTIA,
      };

      const payload = viewDataToCreatePayload(viewData, {
        clientName,
        services: servicesCatalog,
        products: [],
      });
      const created = await createServiceOrder(payload);
      await approveServiceOrder(created.id, {
        starts_at: local.toISOString(),
        technician_ids: [Number(technicianId)],
        notes: viewData.observacoesInternas?.trim() || undefined,
        split_days: splitTwoDays ? 2 : undefined,
      });

      toast.success(
        splitTwoDays
          ? `O.S. #${created.id} criada e agendada em 2 dias (visita dividida).`
          : `O.S. #${created.id} criada e agendada com sucesso.`,
      );
      onScheduled?.();
      onClose();
      navigate(`/app/service-orders/${created.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível criar a ordem de serviço.";
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className={styles.backdrop} role="presentation" onClick={() => !busy && onClose()}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pmoc-schedule-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pmoc-schedule-modal-title" className={styles.title}>
          {planningSelection
            ? "Agendar atividades selecionadas"
            : focus
              ? "Agendar atividade pendente"
              : "Novo agendamento PMOC"}
        </h2>
        <p className={styles.lead}>
          {planningSelection
            ? `${plan.title} — ${planningSelection.tasks.length} tarefa(s) marcada(s) na aba Planejamento.`
            : focus
              ? `${plan.title} — agendamento focado em uma máquina e serviço do cronograma.`
              : `${plan.title} — selecione os equipamentos e confirme para gerar a ordem de serviço automaticamente.`}
        </p>

        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>Mês / ano do cronograma</span>
            <input
              type="month"
              className={styles.input}
              value={periodInput}
              disabled={busy || Boolean(planningSelection)}
              onChange={(e) => setPeriodInput(e.target.value)}
            />
          </label>

          <div className={styles.fieldFull}>
            <span className={styles.label}>
              {planningSelection || focus ? "Equipamentos da visita" : "Equipamentos incluídos na visita"}
            </span>
            {equipments.length === 0 ? (
              <p className={styles.hint}>Nenhum equipamento vinculado ao plano. Configure na aba Equipamentos.</p>
            ) : (
              <ul className={styles.equipList}>
                {(planningSelection
                  ? equipments.filter((eq) =>
                      planningSelection.tasks.some((t) => t.equipmentId === eq.equipment_id),
                    )
                  : focus
                    ? equipments.filter((eq) => eq.equipment_id === focus.equipmentId)
                    : equipments
                ).map((eq) => (
                  <li key={eq.equipment_id}>
                    <label className={styles.equipRow}>
                      <input
                        type="checkbox"
                        checked={selectedEquipIds.includes(eq.equipment_id)}
                        disabled={busy || Boolean(focus) || Boolean(planningSelection)}
                        onChange={() => toggleEquip(eq.equipment_id)}
                      />
                      <span>
                        {formatEquipmentLocationLabel({
                          identificacao: eq.identificacao ?? `#${eq.equipment_id}`,
                          localInstalacao: eq.local_instalacao,
                          installationReference: eq.installation_reference,
                          equipmentId: eq.equipment_id,
                        })}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {loadingEstimate ? (
            <p className={styles.hint}>Calculando tempo estimado…</p>
          ) : activityMatrix.length > 0 ? (
            <p className={styles.estimateBanner}>
              Tempo total estimado:{" "}
              <strong>{formatDurationMinutes(suggestMinutes)}</strong>
              {" · "}
              {activityMatrix.length} atividade(s)
            </p>
          ) : estimate ? (
            <p className={styles.hint}>Nenhuma atividade prevista para este mês com os equipamentos selecionados.</p>
          ) : null}

          {planningSelection ? (
            <div className={styles.summaryBox}>
              <span className={styles.label}>Atividades selecionadas no planejamento</span>
              <ul className={styles.summaryList}>
                {planningSelection.tasks.map((task) => (
                  <li key={`${task.equipmentId}-${task.activityId}-${task.activityTitle}`}>
                    <strong>{task.equipmentName}:</strong> {task.activityTitle}
                    {" "}
                    <span className={styles.hint}>({formatDurationMinutes(task.estimatedMinutes)})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : activitySummary.length > 0 ? (
            <div className={styles.summaryBox}>
              <span className={styles.label}>Resumo das atividades</span>
              <ul className={styles.summaryList}>
                {activitySummary.map((row) => (
                  <li key={row.equipmentId}>
                    <strong>{row.equipmentLabel}:</strong> {row.services.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {suggestSplit ? (
            <div className={styles.splitAlert} role="status">
              <p>
                A carga estimada ultrapassa <strong>8 horas</strong>. Recomendamos dividir a visita em{" "}
                <strong>dois dias</strong> para facilitar a logística.
              </p>
              <label className={styles.splitCheck}>
                <input
                  type="checkbox"
                  checked={splitTwoDays}
                  disabled={busy}
                  onChange={(e) => setSplitTwoDays(e.target.checked)}
                />
                Dividir agendamento em 2 dias consecutivos
              </label>
            </div>
          ) : null}

          <div className={styles.row2}>
            <label className={styles.field}>
              <span className={styles.label}>Data da visita</span>
              <input
                type="date"
                className={styles.input}
                value={dataAgendamento}
                disabled={busy}
                onChange={(e) => setDataAgendamento(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Horário de início</span>
              <input
                type="time"
                className={styles.input}
                value={horaAgendamento}
                disabled={busy}
                onChange={(e) => setHoraAgendamento(e.target.value)}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Técnico</span>
            <select
              className={styles.input}
              value={technicianId}
              disabled={busy}
              onChange={(e) => setTechnicianId(e.target.value)}
            >
              <option value="">Qualquer técnico disponível</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.fieldFull}>
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={busy || loadingSuggest || suggestMinutes < 1}
              onClick={() => void handleSuggest()}
            >
              {loadingSuggest ? "Buscando horários…" : "Sugerir Horário"}
            </button>
          </div>

          {suggestions.length > 0 ? (
            <div className={styles.summaryBox}>
              <span className={styles.label}>Horários sugeridos</span>
              <ul className={styles.summaryList}>
                {suggestions.map((slot, idx) => (
                  <li key={`${slot.starts_at}-${slot.technician_id ?? idx}`}>
                    <button
                      type="button"
                      className={styles.input}
                      style={{ width: "100%", textAlign: "left", cursor: "pointer", marginBottom: "0.35rem" }}
                      onClick={() => applySlot(slot)}
                    >
                      {formatSuggestedSlotLine(slot)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.responsible_name ? (
            <p className={styles.hint}>
              RT do plano: <strong>{plan.responsible_name}</strong>
              {plan.responsible_registration ? ` (${plan.responsible_registration})` : ""}
            </p>
          ) : null}
        </div>

        {err ? (
          <p className={styles.error} role="alert">
            {err}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={busy || equipments.length === 0 || selectedEquipIds.length === 0}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Agendando…" : "Confirmar agendamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
