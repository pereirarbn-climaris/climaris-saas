import { useEffect, useMemo, useState } from "react";
import { listTenantUsers } from "../../api/auth";
import { createPmocPlanningSchedule } from "../../api/pmoc";
import type { SuggestedSlotOut } from "../../api/serviceOrders";
import { findBestAvailableSlots, formatSuggestedSlotLine } from "../../lib/findBestAvailableSlots";
import { appendPmocMockAgendaEntries, type PmocMockAgendaEntry } from "../../lib/pmocAgendaMock";
import { isDemoMode } from "../../lib/demoMode";
import type { PlanningEquipmentRow } from "../../lib/pmocPlanningMock";
import { formatDurationMinutes } from "../../lib/formatDuration";
import { toast } from "../../lib/toast";
import loginStyles from "../../pages/LoginPage.module.css";
import modalStyles from "./PmocScheduleActivitiesModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  pmocId?: number;
  clientName: string;
  planTitle: string;
  periodLabel: string;
  periodYear: number;
  periodMonth: number;
  selectedRows: PlanningEquipmentRow[];
  onScheduled: (rowKeys: string[]) => void;
};

export function PmocPlanningScheduleModal({
  open,
  onClose,
  pmocId,
  clientName,
  planTitle,
  periodLabel,
  periodYear,
  periodMonth,
  selectedRows,
  onScheduled,
}: Props) {
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [technicianId, setTechnicianId] = useState("");
  const [dataAgendamento, setDataAgendamento] = useState("");
  const [horaAgendamento, setHoraAgendamento] = useState("09:00");
  const [suggestions, setSuggestions] = useState<SuggestedSlotOut[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const totalMinutes = useMemo(
    () => selectedRows.reduce((acc, row) => acc + row.estimatedMinutes, 0),
    [selectedRows],
  );

  const technicianName = useMemo(
    () => technicians.find((t) => t.id === technicianId)?.name ?? "",
    [technicians, technicianId],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const users = await listTenantUsers({ limit: 100 });
        if (cancelled) return;
        const mapped = users
          .filter((u) => u.is_active && u.role === "technician")
          .map((u) => ({ id: String(u.id), name: u.full_name?.trim() || `Técnico #${u.id}` }));
        setTechnicians(mapped);
        setTechnicianId((prev) => prev || mapped[0]?.id || "");
      } catch {
        if (!cancelled) setTechnicians([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  async function handleSuggest() {
    if (totalMinutes < 1) {
      setErr("Selecione equipamentos com atividades pendentes.");
      return;
    }
    setLoadingSuggest(true);
    setErr("");
    setSuggestions([]);
    try {
      const slots = await findBestAvailableSlots(
        technicianId || undefined,
        dataAgendamento || undefined,
        totalMinutes,
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

  function handleConfirm() {
    const resolvedTechnicianId = technicianId || technicians[0]?.id || "";

    if (!resolvedTechnicianId || !dataAgendamento || !horaAgendamento) {
      setErr("Informe técnico, data e horário — ou use “Sugerir Horário”.");
      return;
    }
    const start = new Date(`${dataAgendamento}T${horaAgendamento}:00`);
    if (Number.isNaN(start.getTime())) {
      setErr("Data ou horário inválido.");
      return;
    }
    const rowKeys = selectedRows.map((r) => r.rowKey);

    setBusy(true);
    setErr("");
    void (async () => {
      try {
        if (pmocId != null && !isDemoMode()) {
          await createPmocPlanningSchedule(pmocId, {
            technician_id: Number(resolvedTechnicianId),
            starts_at: start.toISOString(),
            duration_minutes: totalMinutes,
            period_year: periodYear,
            period_month: periodMonth,
            row_keys: rowKeys,
            activity_count: selectedRows.length,
          });
        } else {
          const end = new Date(start.getTime() + totalMinutes * 60_000);
          const resolvedTechnicianName =
            technicians.find((t) => t.id === resolvedTechnicianId)?.name ?? technicianName;
          const entry: PmocMockAgendaEntry = {
            id: `mock-${Date.now()}`,
            technician_id: resolvedTechnicianId,
            technician_name: resolvedTechnicianName,
            client_name: clientName,
            equipment_labels: selectedRows.map((r) => `${r.equipmentName} — ${r.activityTitle}`),
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            notes: `[PMOC] ${planTitle} — ${periodLabel} — ${selectedRows.length} atividade(s) — ${formatDurationMinutes(totalMinutes)}`,
            is_pmoc: true,
          };
          appendPmocMockAgendaEntries([entry]);
        }
        onScheduled(rowKeys);
        toast.success("Atividades agendadas. Visível na Agenda com tag PMOC (laranja).");
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Não foi possível salvar na Agenda.");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className={modalStyles.backdrop} role="presentation" onClick={() => !busy && onClose()}>
      <div
        className={modalStyles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pmoc-planning-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pmoc-planning-modal-title" className={modalStyles.title}>
          Agendar atividades PMOC
        </h2>
        <p className={modalStyles.lead}>
          {planTitle} — {periodLabel}. O compromisso aparecerá na Agenda com a tag{" "}
          <strong>PMOC</strong> em laranja (sem abrir ordem de serviço).
        </p>

        <p className={modalStyles.estimateBanner}>
          Tempo total estimado: <strong>{formatDurationMinutes(totalMinutes)}</strong>
          {" · "}
          {selectedRows.length} equipamento(s)/atividade(s)
        </p>

        <ul className={modalStyles.summaryList}>
          {selectedRows.map((row) => (
            <li key={row.rowKey}>
              <strong>{row.equipmentName}:</strong> {row.activityTitle}
            </li>
          ))}
        </ul>

        <div className={modalStyles.grid}>
          <label className={modalStyles.field}>
            <span className={modalStyles.label}>Técnico responsável</span>
            <select
              className={modalStyles.input}
              value={technicianId}
              disabled={busy}
              onChange={(e) => setTechnicianId(e.target.value)}
            >
              <option value="">Qualquer técnico disponível</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <div className={modalStyles.row2}>
            <label className={modalStyles.field}>
              <span className={modalStyles.label}>Data preferencial (opcional)</span>
              <input
                type="date"
                className={modalStyles.input}
                value={dataAgendamento}
                disabled={busy}
                onChange={(e) => setDataAgendamento(e.target.value)}
              />
            </label>
            <label className={modalStyles.field}>
              <span className={modalStyles.label}>Horário de início</span>
              <input
                type="time"
                className={modalStyles.input}
                value={horaAgendamento}
                disabled={busy}
                onChange={(e) => setHoraAgendamento(e.target.value)}
              />
            </label>
          </div>

          <div className={modalStyles.fieldFull}>
            <button
              type="button"
              className={modalStyles.btnSecondary}
              disabled={busy || loadingSuggest}
              onClick={() => void handleSuggest()}
            >
              {loadingSuggest ? "Buscando horários…" : "Sugerir Horário"}
            </button>
          </div>

          {suggestions.length > 0 ? (
            <div className={modalStyles.summaryBox}>
              <span className={modalStyles.label}>Horários sugeridos</span>
              <ul className={modalStyles.summaryList}>
                {suggestions.map((slot, idx) => (
                  <li key={`${slot.starts_at}-${slot.technician_id ?? idx}`}>
                    <button
                      type="button"
                      className={loginStyles.input}
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
        </div>

        {err ? (
          <p className={modalStyles.error} role="alert">
            {err}
          </p>
        ) : null}

        <div className={modalStyles.actions}>
          <button type="button" className={modalStyles.btnSecondary} disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={modalStyles.btnPrimary} disabled={busy} onClick={handleConfirm}>
            {busy ? "Salvando…" : "Salvar na Agenda"}
          </button>
        </div>
      </div>
    </div>
  );
}
