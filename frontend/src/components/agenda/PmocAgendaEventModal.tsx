import { useEffect, useMemo, useState } from "react";
import {
  cancelSchedule,
  getRescheduleOptions,
  rescheduleSchedule,
  type ScheduleOut,
  type SuggestedSlotOut,
} from "../../api/serviceOrders";
import { listTenantUsers } from "../../api/auth";
import { findBestAvailableSlots, formatSuggestedSlotLine } from "../../lib/findBestAvailableSlots";
import {
  findPmocMockEntryByScheduleId,
  isPmocMockScheduleId,
  removePmocMockAgendaEntryByScheduleId,
  updatePmocMockAgendaEntryByScheduleId,
} from "../../lib/pmocAgendaMock";
import { toast } from "../../lib/toast";
import modalStyles from "../pmoc/PmocScheduleActivitiesModal.module.css";

export type PmocAgendaEventSchedule = ScheduleOut & {
  is_pmoc?: boolean;
  technician_id?: string;
};

type Props = {
  open: boolean;
  schedule: PmocAgendaEventSchedule | null;
  onClose: () => void;
  onChanged: () => void;
  canManage?: boolean;
};

function formatDateTimeBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatHourRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(s.getHours())}:${pad(s.getMinutes())} – ${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parsePmocNotes(notes: string | null | undefined): { title: string; detail: string } {
  const raw = (notes ?? "").replace(/^\[PMOC\]\s*/i, "").trim();
  if (!raw) return { title: "Visita PMOC planejada", detail: "" };
  const parts = raw.split(" — ").map((p) => p.trim()).filter(Boolean);
  return {
    title: parts[0] || "Visita PMOC planejada",
    detail: parts.slice(1).join(" · "),
  };
}

export function PmocAgendaEventModal({ open, schedule, onClose, onChanged, canManage = true }: Props) {
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [technicianId, setTechnicianId] = useState("");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedSlotOut[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  const isMock = schedule ? isPmocMockScheduleId(schedule.id) : false;
  const parsedNotes = useMemo(() => parsePmocNotes(schedule?.notes), [schedule?.notes]);
  const durationMinutes = useMemo(() => {
    if (!schedule) return 60;
    const start = new Date(schedule.starts_at).getTime();
    const end = new Date(schedule.ends_at).getTime();
    const diff = Math.round((end - start) / 60000);
    return diff > 0 ? diff : 60;
  }, [schedule]);

  useEffect(() => {
    if (!open || !schedule) return;
    setMode("view");
    setConfirmDelete(false);
    setErr("");
    setSuggestions([]);
    setStartsAtLocal(toLocalDatetimeInput(schedule.starts_at));
    setEndsAtLocal(toLocalDatetimeInput(schedule.ends_at));
    const mockEntry = isPmocMockScheduleId(schedule.id) ? findPmocMockEntryByScheduleId(schedule.id) : null;
    setTechnicianId(mockEntry?.technician_id ?? schedule.technician_id ?? "");
  }, [open, schedule]);

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

  if (!open || !schedule) return null;

  async function handleSuggestSlots() {
    setLoadingSuggest(true);
    setErr("");
    setSuggestions([]);
    try {
      const dateOnly = startsAtLocal ? startsAtLocal.slice(0, 10) : undefined;
      const slots = await findBestAvailableSlots(technicianId || undefined, dateOnly, durationMinutes);
      setSuggestions(slots);
      if (slots.length === 0) setErr("Nenhuma janela livre encontrada para os critérios informados.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível sugerir horários.");
    } finally {
      setLoadingSuggest(false);
    }
  }

  function applySlot(slot: SuggestedSlotOut) {
    setStartsAtLocal(toLocalDatetimeInput(slot.starts_at));
    setEndsAtLocal(toLocalDatetimeInput(slot.ends_at));
    if (slot.technician_id) setTechnicianId(String(slot.technician_id));
  }

  async function handleReschedule() {
    if (!startsAtLocal || !endsAtLocal) {
      setErr("Informe início e fim do compromisso.");
      return;
    }
    const startsAt = new Date(startsAtLocal);
    const endsAt = new Date(endsAtLocal);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      setErr("Horário de término deve ser após o início.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      if (isMock) {
        const techName = technicians.find((t) => t.id === technicianId)?.name ?? "";
        updatePmocMockAgendaEntryByScheduleId(schedule!.id, {
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          technician_id: technicianId,
          technician_name: techName,
        });
        toast.success("Compromisso PMOC remarcado.");
      } else {
        await getRescheduleOptions(schedule!.id);
        await rescheduleSchedule(schedule!.id, {
          starts_at: startsAt.toISOString(),
          technician_ids: technicianId ? [Number(technicianId)] : undefined,
        });
        toast.success("Compromisso PMOC remarcado.");
      }
      onChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível remarcar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setErr("");
    try {
      if (isMock) {
        removePmocMockAgendaEntryByScheduleId(schedule!.id);
      } else {
        await cancelSchedule(schedule!.id, { reason: "Excluído pela agenda (PMOC planejamento)" });
      }
      toast.success("Compromisso PMOC excluído.");
      onChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const technicianLabel =
    technicians.find((t) => t.id === technicianId)?.name ||
    findPmocMockEntryByScheduleId(schedule.id)?.technician_name ||
    (technicianId ? `Técnico #${technicianId}` : "—");

  return (
    <div
      className={modalStyles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={modalStyles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pmoc-agenda-event-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pmoc-agenda-event-title" className={modalStyles.title}>
          Compromisso PMOC
        </h2>
        <p className={modalStyles.lead}>
          {parsedNotes.title}
          {parsedNotes.detail ? ` · ${parsedNotes.detail}` : ""}
        </p>

        {mode === "view" ? (
          <div className={modalStyles.grid}>
            <div className={modalStyles.summaryBox}>
              <p>
                <strong>Horário:</strong> {formatHourRange(schedule.starts_at, schedule.ends_at)}
              </p>
              <p>
                <strong>Data:</strong> {formatDateTimeBr(schedule.starts_at)}
              </p>
              <p>
                <strong>Técnico:</strong> {technicianLabel}
              </p>
              <p>
                <strong>Cliente:</strong>{" "}
                {schedule.client_name?.trim() || (schedule.client_id ? `#${schedule.client_id}` : "—")}
              </p>
              {schedule.client_whatsapp?.trim() ? (
                <p>
                  <strong>WhatsApp:</strong> {schedule.client_whatsapp}
                </p>
              ) : null}
              {schedule.client_address?.trim() ? (
                <p>
                  <strong>Endereço:</strong> {schedule.client_address}
                </p>
              ) : null}
              {schedule.notes?.trim() ? (
                <p>
                  <strong>Observações:</strong> {schedule.notes}
                </p>
              ) : null}
              {isMock ? (
                <p className={modalStyles.hint}>Este compromisso está salvo localmente (modo demonstração).</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className={modalStyles.grid}>
            <label className={modalStyles.field}>
              <span className={modalStyles.label}>Técnico</span>
              <select
                className={modalStyles.input}
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
              >
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={modalStyles.row2}>
              <label className={modalStyles.field}>
                <span className={modalStyles.label}>Início</span>
                <input
                  className={modalStyles.input}
                  type="datetime-local"
                  value={startsAtLocal}
                  onChange={(e) => setStartsAtLocal(e.target.value)}
                />
              </label>
              <label className={modalStyles.field}>
                <span className={modalStyles.label}>Fim</span>
                <input
                  className={modalStyles.input}
                  type="datetime-local"
                  value={endsAtLocal}
                  onChange={(e) => setEndsAtLocal(e.target.value)}
                />
              </label>
            </div>
            <button className={modalStyles.btnSecondary} type="button" onClick={() => void handleSuggestSlots()} disabled={loadingSuggest}>
              {loadingSuggest ? "Buscando…" : "Sugerir horários livres"}
            </button>
            {suggestions.length > 0 ? (
              <ul className={modalStyles.equipList}>
                {suggestions.slice(0, 8).map((slot, idx) => (
                  <li key={`${slot.starts_at}-${idx}`}>
                    <button type="button" className={modalStyles.equipRow} onClick={() => applySlot(slot)}>
                      {formatSuggestedSlotLine(slot)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {err ? <p className={modalStyles.error}>{err}</p> : null}

        {confirmDelete ? (
          <p className={modalStyles.hint}>Confirma excluir este compromisso PMOC da agenda?</p>
        ) : null}

        <div className={modalStyles.actions}>
          {mode === "reschedule" ? (
            <>
              <button className={modalStyles.btnSecondary} type="button" onClick={() => setMode("view")} disabled={busy}>
                Voltar
              </button>
              <button className={modalStyles.btnPrimary} type="button" onClick={() => void handleReschedule()} disabled={busy}>
                {busy ? "Salvando…" : "Salvar remarcação"}
              </button>
            </>
          ) : confirmDelete ? (
            <>
              <button className={modalStyles.btnSecondary} type="button" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Cancelar
              </button>
              <button
                className={modalStyles.btnPrimary}
                type="button"
                style={{ background: "var(--color-error, #dc2626)" }}
                onClick={() => void handleDelete()}
                disabled={busy}
              >
                {busy ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            </>
          ) : (
            <>
              <button className={modalStyles.btnSecondary} type="button" onClick={onClose} disabled={busy}>
                Fechar
              </button>
              {canManage ? (
                <>
                  <button
                    className={modalStyles.btnSecondary}
                    type="button"
                    onClick={() => setMode("reschedule")}
                    disabled={busy}
                  >
                    Remarcar
                  </button>
                  <button
                    className={modalStyles.btnPrimary}
                    type="button"
                    style={{ background: "var(--color-error, #dc2626)" }}
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                  >
                    Excluir
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
