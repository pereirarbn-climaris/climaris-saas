import { useCallback, useMemo, useState } from "react";
import type { SuggestedSlotOut } from "../../../api/serviceOrders";
import type { Tecnico } from "./ServiceOrderFormView";
import { formatEstimatedDuration } from "../../../lib/serviceOrderEstimatedTime";
import { sortSuggestedSlotsChronologically } from "../../../lib/sortSuggestedSlots";

export interface ServiceOrderSchedulingPanelProps {
  tecnicoId: string;
  dataAgendamento: string;
  horaAgendamento: string;
  horaTermino?: string;
  onTecnicoChange: (id: string) => void;
  onDataChange: (date: string) => void;
  onHoraChange: (time: string) => void;
  tecnicos: Tecnico[];
  estimatedMinutes: number;
  pmocDurationHint?: string;
  schedulingEnabled: boolean;
  canEditScheduling: boolean;
  orderId?: number;
  onSuggestSlots: (params: {
    orderId?: number;
    durationMinutes: number;
    technicianId?: number;
  }) => Promise<SuggestedSlotOut[]>;
  errors?: { tecnicoId?: string; dataAgendamento?: string; horaAgendamento?: string };
}

function shiftLabel(shift: SuggestedSlotOut["shift"]): string {
  if (shift === "morning") return "Manhã";
  if (shift === "afternoon") return "Tarde";
  return "";
}

function formatSlotWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ServiceOrderSchedulingPanel({
  tecnicoId,
  dataAgendamento,
  horaAgendamento,
  horaTermino = "",
  onTecnicoChange,
  onDataChange,
  onHoraChange,
  tecnicos,
  estimatedMinutes,
  pmocDurationHint,
  schedulingEnabled,
  canEditScheduling,
  orderId,
  onSuggestSlots,
  errors = {},
}: ServiceOrderSchedulingPanelProps) {
  const [suggestions, setSuggestions] = useState<SuggestedSlotOut[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [suggestErr, setSuggestErr] = useState("");

  const disabled = !canEditScheduling || !schedulingEnabled;

  const tecnicoOptions = useMemo(
    () => tecnicos.map((t) => ({ value: t.id, label: t.nome })),
    [tecnicos],
  );

  const tecnicoNameById = useMemo(() => new Map(tecnicos.map((t) => [t.id, t.nome])), [tecnicos]);

  const handleSuggest = useCallback(async () => {
    if (!schedulingEnabled || estimatedMinutes < 1) return;
    setLoadingSuggest(true);
    setSuggestErr("");
    try {
      const slots = await onSuggestSlots({
        orderId,
        durationMinutes: estimatedMinutes,
        technicianId: tecnicoId ? Number(tecnicoId) : undefined,
      });
      setSuggestions(sortSuggestedSlotsChronologically(slots));
      if (slots.length === 0) {
        setSuggestErr("Nenhuma janela livre encontrada nos próximos dias úteis.");
      }
    } catch (e) {
      setSuggestions([]);
      setSuggestErr(e instanceof Error ? e.message : "Falha ao buscar horários.");
    } finally {
      setLoadingSuggest(false);
    }
  }, [schedulingEnabled, estimatedMinutes, onSuggestSlots, orderId, tecnicoId]);

  const applySlot = useCallback(
    (slot: SuggestedSlotOut) => {
      const d = new Date(slot.starts_at);
      if (Number.isNaN(d.getTime())) return;
      const pad = (n: number) => String(n).padStart(2, "0");
      onDataChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      onHoraChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      onTecnicoChange(String(slot.technician_id));
    },
    [onDataChange, onHoraChange, onTecnicoChange],
  );

  return (
    <section
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        borderRadius: "var(--card-radius)",
        padding: "var(--card-padding-lg)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <h3 style={{ margin: "0 0 0.35rem", fontSize: "var(--font-size-lg)" }}>Agendamento</h3>
      <p style={{ margin: "0 0 1rem", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
        Adicione ao menos um serviço para liberar data, hora e sugestões inteligentes de agenda.
      </p>

      <p
        style={{
          margin: "0 0 1rem",
          padding: "0.65rem 0.85rem",
          background: "rgba(2, 132, 199, 0.08)",
          borderRadius: "var(--input-radius)",
          fontSize: "var(--font-size-sm)",
          fontWeight: 600,
          color: "var(--color-primary)",
        }}
      >
        Tempo total estimado de atendimento: {formatEstimatedDuration(estimatedMinutes)}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--form-grid-column-gap)",
          marginBottom: "1rem",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "var(--font-size-sm)" }}>
          Técnico responsável
          <select
            value={tecnicoId}
            onChange={(e) => onTecnicoChange(e.target.value)}
            disabled={disabled}
            style={{ height: "2.5rem", borderRadius: "var(--input-radius)", border: "1px solid var(--color-border)" }}
          >
            <option value="">Selecione…</option>
            {tecnicoOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {errors.tecnicoId ? <span style={{ color: "var(--color-error)" }}>{errors.tecnicoId}</span> : null}
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "var(--font-size-sm)" }}>
          Data
          <input
            type="date"
            value={dataAgendamento}
            onChange={(e) => onDataChange(e.target.value)}
            disabled={disabled}
            style={{ height: "2.5rem", padding: "0 0.5rem", borderRadius: "var(--input-radius)", border: "1px solid var(--color-border)" }}
          />
          {errors.dataAgendamento ? (
            <span style={{ color: "var(--color-error)" }}>{errors.dataAgendamento}</span>
          ) : null}
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "var(--font-size-sm)" }}>
          Hora de início
          <input
            type="time"
            value={horaAgendamento}
            onChange={(e) => onHoraChange(e.target.value)}
            disabled={disabled}
            style={{ height: "2.5rem", padding: "0 0.5rem", borderRadius: "var(--input-radius)", border: "1px solid var(--color-border)" }}
          />
          {pmocDurationHint ? (
            <span
              title={pmocDurationHint}
              style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}
            >
              {pmocDurationHint}
            </span>
          ) : null}
          {errors.horaAgendamento ? (
            <span style={{ color: "var(--color-error)" }}>{errors.horaAgendamento}</span>
          ) : null}
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "var(--font-size-sm)" }}>
          Hora de término (estimada)
          <input
            type="time"
            value={horaTermino}
            readOnly
            disabled={disabled}
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
        <button
          type="button"
          onClick={() => void handleSuggest()}
          disabled={disabled || loadingSuggest || estimatedMinutes < 1}
          style={{
            height: "2.5rem",
            padding: "0 1rem",
            borderRadius: "var(--btn-radius)",
            border: "none",
            background: disabled ? "var(--color-border)" : "var(--color-primary)",
            color: "#fff",
            fontWeight: 600,
            cursor: disabled || loadingSuggest ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {loadingSuggest ? "Buscando…" : "Sugerir horários disponíveis"}
        </button>
        {!schedulingEnabled ? (
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
            Selecione serviços acima para habilitar.
          </span>
        ) : null}
      </div>

      {suggestErr ? <p style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>{suggestErr}</p> : null}

      {suggestions.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {suggestions.map((slot, idx) => {
            const techName =
              slot.technician_name ?? tecnicoNameById.get(String(slot.technician_id)) ?? `Técnico #${slot.technician_id}`;
            return (
              <button
                key={`${slot.technician_id}-${slot.starts_at}-${idx}`}
                type="button"
                onClick={() => applySlot(slot)}
                disabled={disabled}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "999px",
                  border: "1px solid var(--color-primary)",
                  background: "#fff",
                  color: "var(--color-primary)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: 600,
                  cursor: disabled ? "not-allowed" : "pointer",
                  textAlign: "left",
                }}
              >
                {shiftLabel(slot.shift)} · {formatSlotWhen(slot.starts_at)}
                <br />
                <span style={{ fontWeight: 500 }}>{techName}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
