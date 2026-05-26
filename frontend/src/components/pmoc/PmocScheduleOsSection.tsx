import { useEffect, useMemo, useRef, useState } from "react";
import {
  getPmocEstimatedTime,
  listPmocActivities,
  listPmocEquipments,
  listPmocPlans,
  type PmocEstimatedTimeOut,
  type PmocPlanOut,
} from "../../api/pmoc";
import type { ServiceOut } from "../../api/services";
import {
  buildChecklistFromPmocEquipmentMatrix,
  buildPmocEquipmentActivityMatrix,
  buildPmocScheduleDescription,
  buildServicosFromPmocBreakdown,
  monthYearFromDateString,
} from "../../lib/pmocOsSchedule";
import { formatDurationMinutes } from "../../lib/formatDuration";
import type { ChecklistItem, ServiceLineDraft } from "../v0-ui/service-orders/ServiceOrderFormView";

export type PmocScheduleOsApplyPayload = {
  pmocPlanId: string;
  pmocPeriodYear: number;
  pmocPeriodMonth: number;
  pmocEstimatedMinutes: number;
  pmocBreakdown: PmocEstimatedTimeOut["breakdown"];
  servicos: ServiceLineDraft[];
  checklist: ChecklistItem[];
  descricaoProblema: string;
  equipamentosIds: string[];
};

type Props = {
  clientId: string;
  dataAgendamento: string;
  pmocPlanId: string;
  pmocPeriodYear?: number;
  pmocPeriodMonth?: number;
  servicesCatalog: ServiceOut[];
  disabled?: boolean;
  onPlanChange: (planId: string) => void;
  onApply: (payload: PmocScheduleOsApplyPayload) => void;
  onClear: () => void;
};

export function PmocScheduleOsSection({
  clientId,
  dataAgendamento,
  pmocPlanId,
  pmocPeriodYear,
  pmocPeriodMonth,
  servicesCatalog,
  disabled = false,
  onPlanChange,
  onApply,
  onClear,
}: Props) {
  const [plans, setPlans] = useState<PmocPlanOut[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimateErr, setEstimateErr] = useState("");
  const [estimate, setEstimate] = useState<PmocEstimatedTimeOut | null>(null);
  const [periodInput, setPeriodInput] = useState("");
  const lastAppliedRef = useRef("");

  const clientNumeric = Number(clientId);
  const planNumeric = pmocPlanId ? Number(pmocPlanId) : NaN;

  const activePlans = useMemo(
    () => plans.filter((p) => p.status === "active" && p.client_id === clientNumeric),
    [plans, clientNumeric],
  );

  useEffect(() => {
    if (!Number.isFinite(clientNumeric) || clientNumeric < 1) {
      setPlans([]);
      return;
    }
    let cancelled = false;
    setLoadingPlans(true);
    void (async () => {
      try {
        const rows = await listPmocPlans({ client_id: clientNumeric, limit: 100 });
        if (!cancelled) setPlans(rows.filter((p) => p.status === "active"));
      } catch {
        if (!cancelled) setPlans([]);
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientNumeric]);

  useEffect(() => {
    if (pmocPeriodYear && pmocPeriodMonth) {
      setPeriodInput(`${pmocPeriodYear}-${String(pmocPeriodMonth).padStart(2, "0")}`);
      return;
    }
    const fromDate = monthYearFromDateString(dataAgendamento);
    if (fromDate) {
      setPeriodInput(`${fromDate.year}-${String(fromDate.month).padStart(2, "0")}`);
    }
  }, [dataAgendamento, pmocPeriodYear, pmocPeriodMonth]);

  useEffect(() => {
    if (!Number.isFinite(planNumeric) || planNumeric < 1) {
      setEstimate(null);
      setEstimateErr("");
      lastAppliedRef.current = "";
      onClear();
      return;
    }

    const period = monthYearFromDateString(`${periodInput}-01`) ?? monthYearFromDateString(dataAgendamento);
    if (!period) {
      setEstimate(null);
      setEstimateErr("Informe o mês/ano de referência do cronograma.");
      return;
    }

    const sig = `${planNumeric}:${period.year}:${period.month}`;
    if (lastAppliedRef.current === sig) return;

    let cancelled = false;
    setLoadingEstimate(true);
    setEstimateErr("");

    void (async () => {
      try {
        const [estimated, activities, equipments] = await Promise.all([
          getPmocEstimatedTime(planNumeric, { year: period.year, month: period.month }),
          listPmocActivities(planNumeric),
          listPmocEquipments(planNumeric),
        ]);
        if (cancelled) return;

        setEstimate(estimated);
        lastAppliedRef.current = sig;

        const plan = activePlans.find((p) => p.id === planNumeric) ?? plans.find((p) => p.id === planNumeric);
        const equipmentIds = equipments.map((e) => e.equipment_id);
        onApply({
          pmocPlanId: String(planNumeric),
          pmocPeriodYear: period.year,
          pmocPeriodMonth: period.month,
          pmocEstimatedMinutes: estimated.total_minutes,
          pmocBreakdown: estimated.breakdown,
          servicos: buildServicosFromPmocBreakdown(
            estimated.breakdown,
            activities,
            servicesCatalog,
            equipmentIds,
            equipments,
            period.month,
          ),
          checklist: buildChecklistFromPmocEquipmentMatrix(
            buildPmocEquipmentActivityMatrix({
              selectedEquipmentIds: equipmentIds,
              equipments,
              activities,
              breakdown: estimated.breakdown,
              catalog: servicesCatalog,
              month: period.month,
            }),
          ),
          descricaoProblema: buildPmocScheduleDescription(
            plan?.title ?? `PMOC #${planNumeric}`,
            period.year,
            period.month,
            estimated.breakdown,
          ),
          equipamentosIds: equipmentIds.map(String),
        });
      } catch (e) {
        if (cancelled) return;
        setEstimate(null);
        lastAppliedRef.current = "";
        setEstimateErr(e instanceof Error ? e.message : "Não foi possível calcular o tempo estimado.");
        onClear();
      } finally {
        if (!cancelled) setLoadingEstimate(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activePlans,
    dataAgendamento,
    onApply,
    onClear,
    periodInput,
    planNumeric,
    plans,
    servicesCatalog,
  ]);

  return (
    <div
      style={{
        padding: "0.85rem 1rem",
        borderRadius: "var(--input-radius)",
        border: "1px solid rgba(2, 132, 199, 0.25)",
        background: "rgba(2, 132, 199, 0.04)",
        marginBottom: "1rem",
      }}
    >
      <p style={{ margin: "0 0 0.75rem", fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
        Cronograma PMOC
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "var(--font-size-sm)" }}>
          Plano PMOC
          <select
            value={pmocPlanId}
            disabled={disabled || loadingPlans || !Number.isFinite(clientNumeric)}
            onChange={(e) => onPlanChange(e.target.value)}
            style={{ height: "2.5rem", borderRadius: "var(--input-radius)", border: "1px solid var(--color-border)" }}
          >
            <option value="">Selecione o plano…</option>
            {activePlans.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.title}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "var(--font-size-sm)" }}>
          Mês / ano (cronograma)
          <input
            type="month"
            value={periodInput}
            disabled={disabled || !pmocPlanId}
            onChange={(e) => setPeriodInput(e.target.value)}
            style={{ height: "2.5rem", padding: "0 0.5rem", borderRadius: "var(--input-radius)", border: "1px solid var(--color-border)" }}
          />
        </label>
      </div>

      {!Number.isFinite(clientNumeric) ? (
        <p style={{ margin: "0.75rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          Selecione um cliente para listar os planos PMOC ativos.
        </p>
      ) : null}

      {loadingEstimate ? (
        <p style={{ margin: "0.75rem 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
          Calculando tempo estimado…
        </p>
      ) : null}

      {estimateErr ? (
        <p style={{ margin: "0.75rem 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-error)" }}>{estimateErr}</p>
      ) : null}

      {estimate && estimate.total_minutes > 0 ? (
        <p style={{ margin: "0.75rem 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-primary)", fontWeight: 600 }}>
          Tempo total do período: {formatDurationMinutes(estimate.total_minutes)} · {estimate.activities_in_period}{" "}
          atividade(s) · {estimate.equipment_count} equipamento(s)
        </p>
      ) : null}

      {estimate && estimate.total_minutes === 0 ? (
        <p style={{ margin: "0.75rem 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
          Nenhuma atividade com serviço vinculado prevista para este mês.
        </p>
      ) : null}
    </div>
  );
}
