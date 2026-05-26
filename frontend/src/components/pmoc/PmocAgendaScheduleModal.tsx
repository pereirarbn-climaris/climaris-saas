import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getPmocEstimatedTime,
  listPmocPlans,
  type PmocEstimatedTimeOut,
  type PmocPlanOut,
} from "../../api/pmoc";
import { addMinutesToTimeString } from "../../lib/pmocOsSchedule";
import { formatDurationMinutes } from "../../lib/formatDuration";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultTechnicianId?: string;
};

export function PmocAgendaScheduleModal({ open, onClose, defaultTechnicianId }: Props) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PmocPlanOut[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [pmocPlanId, setPmocPlanId] = useState("");
  const [periodInput, setPeriodInput] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dataAgendamento, setDataAgendamento] = useState("");
  const [horaAgendamento, setHoraAgendamento] = useState("09:00");
  const [estimate, setEstimate] = useState<PmocEstimatedTimeOut | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [err, setErr] = useState("");

  const horaTermino = useMemo(() => {
    if (!horaAgendamento || !estimate?.total_minutes) return "";
    return addMinutesToTimeString(horaAgendamento, estimate.total_minutes);
  }, [horaAgendamento, estimate?.total_minutes]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPlans(true);
    void (async () => {
      try {
        const rows = await listPmocPlans({ status: "active", limit: 200 });
        if (!cancelled) setPlans(rows);
      } catch {
        if (!cancelled) setPlans([]);
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !pmocPlanId || !periodInput) {
      setEstimate(null);
      return;
    }
    const [yearRaw, monthRaw] = periodInput.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;

    let cancelled = false;
    setLoadingEstimate(true);
    setErr("");
    void (async () => {
      try {
        const result = await getPmocEstimatedTime(Number(pmocPlanId), { year, month });
        if (!cancelled) setEstimate(result);
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
  }, [open, pmocPlanId, periodInput]);

  if (!open) return null;

  function handleContinue() {
    if (!pmocPlanId || !dataAgendamento || !horaAgendamento) {
      setErr("Selecione o plano PMOC, a data e o horário de início.");
      return;
    }
    const [yearRaw, monthRaw] = periodInput.split("-");
    const local = new Date(`${dataAgendamento}T${horaAgendamento}:00`);
    if (Number.isNaN(local.getTime())) {
      setErr("Data ou horário inválido.");
      return;
    }
    const params = new URLSearchParams();
    params.set("pmoc_id", pmocPlanId);
    params.set("year", yearRaw);
    params.set("month", monthRaw);
    params.set("starts_at", local.toISOString());
    params.set("tipo", "preventiva");
    params.set("from", "agenda");
    if (defaultTechnicianId) params.set("technician_id", defaultTechnicianId);
    navigate(`/app/service-orders/new?${params.toString()}`);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pmoc-agenda-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "var(--color-surface-elevated)",
          borderRadius: "var(--card-radius)",
          padding: "1.25rem",
          boxShadow: "var(--card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pmoc-agenda-modal-title" style={{ margin: "0 0 0.35rem", fontSize: "1.125rem" }}>
          Agendar visita PMOC
        </h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
          O tempo de execução será calculado automaticamente a partir do cronograma do plano.
        </p>

        <div style={{ display: "grid", gap: "0.75rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem" }}>
            Plano PMOC
            <select
              value={pmocPlanId}
              disabled={loadingPlans}
              onChange={(e) => setPmocPlanId(e.target.value)}
              style={{ height: "2.5rem", borderRadius: "var(--input-radius)", border: "1px solid var(--color-border)" }}
            >
              <option value="">{loadingPlans ? "Carregando…" : "Selecione…"}</option>
              {plans.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.title} {p.client?.name ? `— ${p.client.name}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem" }}>
            Mês / ano do cronograma
            <input
              type="month"
              value={periodInput}
              onChange={(e) => setPeriodInput(e.target.value)}
              style={{ height: "2.5rem", padding: "0 0.5rem", borderRadius: "var(--input-radius)", border: "1px solid var(--color-border)" }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem" }}>
              Data da visita
              <input
                type="date"
                value={dataAgendamento}
                onChange={(e) => setDataAgendamento(e.target.value)}
                style={{ height: "2.5rem", padding: "0 0.5rem", borderRadius: "var(--input-radius)", border: "1px solid var(--color-border)" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem" }}>
              Horário de início
              <input
                type="time"
                value={horaAgendamento}
                onChange={(e) => setHoraAgendamento(e.target.value)}
                style={{ height: "2.5rem", padding: "0 0.5rem", borderRadius: "var(--input-radius)", border: "1px solid var(--color-border)" }}
              />
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem" }}>
            Horário de término (estimado)
            <input
              type="time"
              value={horaTermino}
              readOnly
              style={{
                height: "2.5rem",
                padding: "0 0.5rem",
                borderRadius: "var(--input-radius)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-muted)",
              }}
            />
          </label>
        </div>

        {loadingEstimate ? (
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            Calculando tempo estimado…
          </p>
        ) : null}

        {estimate && estimate.total_minutes > 0 ? (
          <p
            title={`Tempo estimado com base nos serviços do cronograma para este mês: ${formatDurationMinutes(estimate.total_minutes)}.`}
            style={{ margin: "0.75rem 0 0", fontSize: "0.875rem", color: "var(--color-primary)", fontWeight: 600 }}
          >
            ⏱ Tempo estimado com base nos serviços do cronograma para este mês:{" "}
            {formatDurationMinutes(estimate.total_minutes)}.
          </p>
        ) : null}

        {err ? <p style={{ margin: "0.75rem 0 0", color: "var(--color-error)", fontSize: "0.875rem" }}>{err}</p> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button type="button" onClick={onClose} style={{ padding: "0.5rem 0.9rem" }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleContinue}
            style={{
              padding: "0.5rem 0.9rem",
              background: "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--btn-radius)",
              fontWeight: 600,
            }}
          >
            Continuar para O.S.
          </button>
        </div>
      </div>
    </div>
  );
}
