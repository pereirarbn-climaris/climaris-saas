import { useCallback, useEffect, useMemo, useState } from "react";
import { createPlatformProject } from "../api/platformProjects";
import {
  DEMO_STATUS_LABELS,
  listDemoAppointments,
  patchDemoAppointment,
  type DemoAppointmentOut,
  type DemoAppointmentStatus,
} from "../api/platformDemoAgenda";
import { sendDemoAppointmentWhatsapp } from "../api/platformWhatsapp";
import { DemoAgendaMonthCalendar } from "../components/platform/DemoAgendaMonthCalendar";
import styles from "./PlatformDemoAgendaPage.module.css";

function formatPhoneBr(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function whatsAppHref(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso;
  }
}

function statusClass(status: DemoAppointmentStatus): string {
  switch (status) {
    case "scheduled":
      return styles.statusScheduled;
    case "confirmed":
      return styles.statusConfirmed;
    case "completed":
      return styles.statusCompleted;
    case "cancelled":
      return styles.statusCancelled;
    case "no_show":
      return styles.statusNoShow;
    default:
      return styles.statusScheduled;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PlatformDemoAgendaPage() {
  const [rows, setRows] = useState<DemoAppointmentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [fromDay, setFromDay] = useState(todayIso);
  const [toDay, setToDay] = useState(addDaysIso(30));
  const [statusFilter, setStatusFilter] = useState<"" | DemoAppointmentStatus>("");
  const [notesModal, setNotesModal] = useState<DemoAppointmentOut | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [whatsappDraft, setWhatsappDraft] = useState("");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await listDemoAppointments({
        from: fromDay || undefined,
        to: toDay || undefined,
        status: statusFilter || undefined,
        limit: 200,
      });
      setRows(data);
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar agenda." });
    } finally {
      setLoading(false);
    }
  }, [fromDay, toDay, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upcomingCount = useMemo(
    () => rows.filter((r) => r.status === "scheduled" || r.status === "confirmed").length,
    [rows],
  );

  async function updateStatus(row: DemoAppointmentOut, status: DemoAppointmentStatus) {
    setBusyId(row.id);
    setMessage(null);
    try {
      const updated = await patchDemoAppointment(row.id, { status, notify_whatsapp: true });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMessage({ kind: "ok", text: `Status atualizado para "${DEMO_STATUS_LABELS[status]}".` });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao atualizar." });
    } finally {
      setBusyId(null);
    }
  }

  async function createProjectFromDemo(row: DemoAppointmentOut) {
    setBusyId(row.id);
    setMessage(null);
    try {
      const deadline = new Date(row.scheduled_at);
      deadline.setDate(deadline.getDate() + 30);
      await createPlatformProject({
        title: `Implantação — ${row.company ?? row.name}`,
        company_name: row.company ?? row.name,
        contact_name: row.name,
        contact_email: row.email,
        contact_phone: row.phone,
        demo_appointment_id: row.id,
        status: "onboarding",
        priority: "normal",
        delivery_deadline: deadline.toISOString().slice(0, 10),
        description: `Projeto criado a partir da demonstração agendada para ${fmtDateTime(row.scheduled_at)}.`,
        use_default_checklist: false,
      });
      setMessage({
        kind: "ok",
        text: "Projeto criado. Abra em Central de projetos para montar o plano de ação.",
      });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao criar projeto." });
    } finally {
      setBusyId(null);
    }
  }

  async function sendWhatsappToDemo(
    row: DemoAppointmentOut,
    payload: { message?: string; template?: "confirmation" },
  ) {
    if (!row.phone) {
      setMessage({ kind: "err", text: "Demonstração sem telefone/WhatsApp." });
      return;
    }
    setBusyId(row.id);
    setMessage(null);
    try {
      await sendDemoAppointmentWhatsapp(row.id, payload);
      setMessage({ kind: "ok", text: "WhatsApp enviado com sucesso." });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao enviar WhatsApp." });
    } finally {
      setBusyId(null);
    }
  }

  async function saveNotes() {
    if (!notesModal) return;
    setBusyId(notesModal.id);
    setMessage(null);
    try {
      const updated = await patchDemoAppointment(notesModal.id, {
        notes: notesDraft.trim() || null,
      });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setNotesModal(null);
      setMessage({ kind: "ok", text: "Notas salvas." });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar notas." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Operação · Comercial</p>
        <h2 className={styles.title}>Agenda de demonstrações</h2>
        <p className={styles.lead}>
          Demonstrações agendadas pelo site institucional. Quando o visitante escolhe data e horário no
          formulário &quot;Agendar Demonstração&quot;, o compromisso aparece aqui automaticamente.
          Clique em um dia no calendário para bloquear horários ou o dia inteiro — visitantes não conseguem
          agendar em horários bloqueados.
          {upcomingCount > 0 ? ` ${upcomingCount} demonstração(ões) pendente(s) no período.` : ""}
        </p>
      </section>

      {message ? (
        <p className={`${styles.message} ${message.kind === "ok" ? styles.messageOk : styles.messageErr}`}>
          {message.text}
        </p>
      ) : null}

      <div className={styles.toolbar}>
        <div className={styles.field}>
          <label htmlFor="demo-view">Visualização</label>
          <select
            id="demo-view"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as "calendar" | "list")}
          >
            <option value="calendar">Calendário</option>
            <option value="list">Lista</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="demo-from">De</label>
          <input id="demo-from" type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="demo-to">Até</label>
          <input id="demo-to" type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="demo-status">Status</label>
          <select
            id="demo-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | DemoAppointmentStatus)}
          >
            <option value="">Todos</option>
            {(Object.keys(DEMO_STATUS_LABELS) as DemoAppointmentStatus[]).map((key) => (
              <option key={key} value={key}>
                {DEMO_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={styles.refreshBtn} disabled={loading} onClick={() => void refresh()}>
          {loading ? "Carregando…" : "Atualizar"}
        </button>
      </div>

      {viewMode === "calendar" ? (
        <DemoAgendaMonthCalendar
          onSelectAppointment={(row) => {
            setNotesModal(row);
            setNotesDraft(row.notes ?? "");
            setWhatsappDraft("");
          }}
          onNotify={(kind, text) => setMessage({ kind, text })}
        />
      ) : null}

      {viewMode === "list" ? (
      <div className={styles.card}>
        {loading ? (
          <p className={styles.empty}>Carregando demonstrações…</p>
        ) : rows.length === 0 ? (
          <p className={styles.empty}>Nenhuma demonstração no período selecionado.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Contato</th>
                <th>Empresa</th>
                <th>Equipe</th>
                <th>Status</th>
                <th>Notas</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{fmtDateTime(row.scheduled_at)}</strong>
                    <br />
                    <span style={{ color: "#64748b", fontSize: "0.8rem" }}>{row.duration_minutes} min</span>
                  </td>
                  <td>
                    <strong>{row.name}</strong>
                    <br />
                    {row.email}
                    {row.phone ? (
                      <>
                        <br />
                        <a href={whatsAppHref(row.phone) ?? undefined} target="_blank" rel="noreferrer">
                          {formatPhoneBr(row.phone)}
                        </a>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {row.company ?? "—"}
                    {row.job_title ? (
                      <>
                        <br />
                        <span style={{ color: "#64748b" }}>{row.job_title}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{row.technicians_count ?? "—"}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${statusClass(row.status)}`}>
                      {DEMO_STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td style={{ maxWidth: "12rem" }}>{row.notes ?? "—"}</td>
                  <td>
                    <div className={styles.actions}>
                      {row.status === "scheduled" ? (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          disabled={busyId === row.id}
                          onClick={() => void updateStatus(row, "confirmed")}
                        >
                          Confirmar
                        </button>
                      ) : null}
                      {(row.status === "scheduled" || row.status === "confirmed") && (
                        <>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            disabled={busyId === row.id}
                            onClick={() => void updateStatus(row, "completed")}
                          >
                            Realizada
                          </button>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            disabled={busyId === row.id}
                            onClick={() => void updateStatus(row, "no_show")}
                          >
                            Faltou
                          </button>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            disabled={busyId === row.id}
                            onClick={() => void updateStatus(row, "cancelled")}
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => {
                          setNotesModal(row);
                          setNotesDraft(row.notes ?? "");
                          setWhatsappDraft("");
                        }}
                      >
                        Notas
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        disabled={busyId === row.id}
                        onClick={() => void createProjectFromDemo(row)}
                      >
                        Projeto
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      ) : null}

      {notesModal ? (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={styles.modal} role="dialog" aria-modal="true">
            <h3>Notas — {notesModal.name}</h3>
            <div className={styles.modalContact}>
              <p>
                <span>E-mail</span>
                <a href={`mailto:${notesModal.email}`}>{notesModal.email}</a>
              </p>
              <p>
                <span>Telefone / WhatsApp</span>
                {notesModal.phone ? (
                  <a href={whatsAppHref(notesModal.phone) ?? undefined} target="_blank" rel="noreferrer">
                    {formatPhoneBr(notesModal.phone)}
                  </a>
                ) : (
                  "—"
                )}
              </p>
              {notesModal.company ? (
                <p>
                  <span>Empresa</span>
                  {notesModal.company}
                </p>
              ) : null}
              <p>
                <span>Horário</span>
                {fmtDateTime(notesModal.scheduled_at)}
              </p>
            </div>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Anotações internas da operação…"
            />
            {notesModal.phone ? (
              <div className={styles.whatsappBox}>
                <p className={styles.whatsappTitle}>WhatsApp</p>
                <textarea
                  value={whatsappDraft}
                  onChange={(e) => setWhatsappDraft(e.target.value)}
                  placeholder="Mensagem personalizada para o lead…"
                  rows={3}
                />
                <div className={styles.whatsappActions}>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    disabled={busyId === notesModal.id}
                    onClick={() => void sendWhatsappToDemo(notesModal, { template: "confirmation" })}
                  >
                    Reenviar confirmação
                  </button>
                  <button
                    type="button"
                    className={styles.refreshBtn}
                    disabled={busyId === notesModal.id || !whatsappDraft.trim()}
                    onClick={() =>
                      void sendWhatsappToDemo(notesModal, { message: whatsappDraft.trim() })
                    }
                  >
                    Enviar mensagem
                  </button>
                </div>
              </div>
            ) : null}
            <div className={styles.modalActions}>
              <button type="button" className={styles.actionBtn} onClick={() => setNotesModal(null)}>
                Fechar
              </button>
              <button
                type="button"
                className={styles.refreshBtn}
                disabled={busyId === notesModal.id}
                onClick={() => void saveNotes()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
