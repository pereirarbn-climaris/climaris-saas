import { useEffect, useState } from "react";
import { listTenantUsers } from "../../api/auth";
import {
  createUnavailability,
  deleteUnavailability,
  updateUnavailability,
  type Unavailability,
} from "../../api/technicianCalendar";
import { toast } from "../../lib/toast";
import modalStyles from "../pmoc/PmocScheduleActivitiesModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultTechnicianId?: string;
  editBlock?: Unavailability | null;
  /** Pré-preenche início/fim ao abrir por arraste no calendário */
  initialStartsAt?: string;
  initialEndsAt?: string;
  canManage: boolean;
};

function toLocalInput(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AgendaBlockTimeModal({
  open,
  onClose,
  onSaved,
  defaultTechnicianId,
  editBlock,
  initialStartsAt,
  initialEndsAt,
  canManage,
}: Props) {
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [technicianId, setTechnicianId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = Boolean(editBlock?.id);

  useEffect(() => {
    if (!open) return;
    setErr("");
    setConfirmDelete(false);
    if (editBlock) {
      setTechnicianId(String(editBlock.technician_id));
      setStartsAt(toLocalInput(editBlock.starts_at));
      setEndsAt(toLocalInput(editBlock.ends_at));
      setReason(editBlock.reason ?? "");
    } else {
      setTechnicianId(defaultTechnicianId ?? "");
      setStartsAt(initialStartsAt ?? "");
      setEndsAt(initialEndsAt ?? "");
      setReason("");
    }
  }, [open, editBlock, defaultTechnicianId, initialStartsAt, initialEndsAt]);

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
        setTechnicianId((prev) => prev || defaultTechnicianId || mapped[0]?.id || "");
      } catch {
        if (!cancelled) setTechnicians([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, defaultTechnicianId]);

  if (!open) return null;

  async function handleSave() {
    if (!canManage) return;
    if (!technicianId || !startsAt || !endsAt) {
      setErr("Informe técnico, início e fim do bloqueio.");
      return;
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setErr("O horário de término deve ser após o início.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const payload = {
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        reason: reason.trim() || undefined,
      };
      if (isEdit && editBlock) {
        await updateUnavailability(editBlock.id, payload);
        toast.success("Bloqueio atualizado.");
      } else {
        await createUnavailability({
          technician_id: Number(technicianId),
          ...payload,
        });
        toast.success("Horário bloqueado na agenda.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar o bloqueio.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!canManage || !editBlock) return;
    setBusy(true);
    setErr("");
    try {
      await deleteUnavailability(editBlock.id);
      toast.success("Bloqueio removido.");
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível excluir o bloqueio.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

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
        aria-labelledby="agenda-block-time-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="agenda-block-time-title" className={modalStyles.title}>
          {isEdit ? "Editar bloqueio de horário" : "Bloquear horário na agenda"}
        </h2>
        <p className={modalStyles.lead}>
          O técnico não poderá receber agendamentos neste intervalo (ex.: folga, treinamento, compromisso externo).
        </p>

        <div className={modalStyles.grid}>
          <label className={modalStyles.field}>
            <span className={modalStyles.label}>Técnico</span>
            <select
              className={modalStyles.input}
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
              disabled={!canManage || isEdit}
            >
              <option value="">Selecione…</option>
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
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                disabled={!canManage}
              />
            </label>
            <label className={modalStyles.field}>
              <span className={modalStyles.label}>Fim</span>
              <input
                className={modalStyles.input}
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                disabled={!canManage}
              />
            </label>
          </div>
          <label className={modalStyles.fieldFull}>
            <span className={modalStyles.label}>Motivo (opcional)</span>
            <input
              className={modalStyles.input}
              type="text"
              placeholder="Ex.: consulta médica, folga"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!canManage}
            />
          </label>
        </div>

        {err ? <p className={modalStyles.error}>{err}</p> : null}
        {confirmDelete ? (
          <p className={modalStyles.hint}>Confirma remover este bloqueio da agenda?</p>
        ) : null}

        <div className={modalStyles.actions}>
          <button className={modalStyles.btnSecondary} type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          {isEdit && canManage ? (
            <button
              className={modalStyles.btnSecondary}
              type="button"
              style={{ color: "var(--color-error, #dc2626)" }}
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              Excluir bloqueio
            </button>
          ) : null}
          {canManage ? (
            confirmDelete ? (
              <button
                className={modalStyles.btnPrimary}
                type="button"
                style={{ background: "var(--color-error, #dc2626)" }}
                onClick={() => void handleDelete()}
                disabled={busy}
              >
                {busy ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            ) : (
              <button className={modalStyles.btnPrimary} type="button" onClick={() => void handleSave()} disabled={busy}>
                {busy ? "Salvando…" : isEdit ? "Salvar" : "Bloquear horário"}
              </button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
