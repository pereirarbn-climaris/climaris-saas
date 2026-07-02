import { useCallback, useEffect, useMemo, useState } from "react";

import {

  createDemoScheduleBlock,

  deleteDemoScheduleBlock,

  fetchDemoCalendarMonth,

  listDemoAppointments,

  listDemoScheduleBlocks,

  type DemoAppointmentOut,

  type DemoCalendarDay,

  type DemoScheduleBlockOut,

} from "../../api/platformDemoAgenda";

import {

  demoSlotsForDay,

  isDemoBusinessDay,

  rangesOverlap,

  type DemoSlotBounds,

} from "../../lib/demoScheduling";

import styles from "./DemoAgendaMonthCalendar.module.css";



const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;



type SlotStatus = "available" | "booked" | "blocked" | "past";



type SlotRow = DemoSlotBounds & {

  status: SlotStatus;

  appointment?: DemoAppointmentOut;

  blockIds: number[];

};



type Props = {

  onSelectAppointment?: (row: DemoAppointmentOut) => void;

  onNotify?: (kind: "ok" | "err", text: string) => void;

};



function localDateKey(d: Date): string {

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

}



function addMonths(date: Date, delta: number): Date {

  const d = new Date(date);

  d.setMonth(d.getMonth() + delta);

  return d;

}



function monthGridDates(anchor: Date): Date[] {

  const year = anchor.getFullYear();

  const month = anchor.getMonth();

  const first = new Date(year, month, 1);

  const lastDay = new Date(year, month + 1, 0).getDate();

  const mondayIndex = first.getDay() === 0 ? 6 : first.getDay() - 1;

  const out: Date[] = [];

  for (let i = mondayIndex; i > 0; i--) out.push(new Date(year, month, 1 - i));

  for (let d = 1; d <= lastDay; d++) out.push(new Date(year, month, d));

  while (out.length % 7 !== 0) {

    const tail = out[out.length - 1]!;

    out.push(new Date(tail.getFullYear(), tail.getMonth(), tail.getDate() + 1));

  }

  return out;

}



function formatPhoneBr(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function slotHourFromIso(iso: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
  return parseInt(hour, 10);
}



function buildSlotRows(

  day: string,

  appointments: DemoAppointmentOut[],

  blocks: DemoScheduleBlockOut[],

  dayMeta?: DemoCalendarDay,

): SlotRow[] {

  const slots = demoSlotsForDay(day);

  const bookedByHour = new Map<number, DemoAppointmentOut>();

  for (const row of appointments) {
    if (row.scheduled_at.slice(0, 10) !== day) continue;
    if (row.status === "cancelled") continue;
    bookedByHour.set(slotHourFromIso(row.scheduled_at), row);
  }



  const isPastDay = dayMeta?.status === "past";



  return slots.map((slot) => {

    const booked = bookedByHour.get(slot.hour);

    const overlappingBlocks = blocks.filter((block) =>

      rangesOverlap(slot.starts_at, slot.ends_at, block.starts_at, block.ends_at),

    );

    let status: SlotStatus = "available";

    if (booked) status = "booked";

    else if (overlappingBlocks.length > 0) status = "blocked";

    else if (isPastDay) status = "past";



    return {

      ...slot,

      status,

      appointment: booked,

      blockIds: overlappingBlocks.map((b) => b.id),

    };

  });

}



export function DemoAgendaMonthCalendar({ onSelectAppointment, onNotify }: Props) {

  const [focusedMonth, setFocusedMonth] = useState(() => new Date());

  const [calendarDays, setCalendarDays] = useState<DemoCalendarDay[]>([]);

  const [appointments, setAppointments] = useState<DemoAppointmentOut[]>([]);

  const [blocks, setBlocks] = useState<DemoScheduleBlockOut[]>([]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [busySlot, setBusySlot] = useState<string | null>(null);

  const [blockReason, setBlockReason] = useState("");



  const monthGrid = useMemo(() => monthGridDates(focusedMonth), [focusedMonth]);

  const dayMap = useMemo(() => new Map(calendarDays.map((d) => [d.date, d])), [calendarDays]);

  const currentMonth = focusedMonth.getMonth();



  const refresh = useCallback(async () => {

    setLoading(true);

    try {

      const year = focusedMonth.getFullYear();

      const month = focusedMonth.getMonth() + 1;

      const first = new Date(year, focusedMonth.getMonth(), 1);

      const last = new Date(year, focusedMonth.getMonth() + 1, 0);

      const from = localDateKey(first);

      const to = localDateKey(last);

      const [days, rows, dayBlocks] = await Promise.all([

        fetchDemoCalendarMonth(year, month),

        listDemoAppointments({ from, to, limit: 300 }),

        listDemoScheduleBlocks({ from, to }),

      ]);

      setCalendarDays(days);

      setAppointments(rows);

      setBlocks(dayBlocks);

    } catch (e) {

      onNotify?.("err", e instanceof Error ? e.message : "Erro ao carregar calendário.");

    } finally {

      setLoading(false);

    }

  }, [focusedMonth, onNotify]);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  const appointmentsByDay = useMemo(() => {

    const map = new Map<string, DemoAppointmentOut[]>();

    for (const row of appointments) {

      const key = row.scheduled_at.slice(0, 10);

      const list = map.get(key) ?? [];

      list.push(row);

      map.set(key, list);

    }

    return map;

  }, [appointments]);



  const blocksByDay = useMemo(() => {

    const map = new Map<string, DemoScheduleBlockOut[]>();

    for (const block of blocks) {

      const key = block.starts_at.slice(0, 10);

      const list = map.get(key) ?? [];

      list.push(block);

      map.set(key, list);

    }

    return map;

  }, [blocks]);



  const dayAppointments = selectedDay ? appointmentsByDay.get(selectedDay) ?? [] : [];

  const selectedDayMeta = selectedDay ? dayMap.get(selectedDay) : undefined;

  const selectedDayBlocks = selectedDay ? blocksByDay.get(selectedDay) ?? [] : [];

  const slotRows = selectedDay

    ? buildSlotRows(selectedDay, appointments, selectedDayBlocks, selectedDayMeta)

    : [];



  const blockableSlots = slotRows.filter((s) => s.status === "available");

  const blockedSlots = slotRows.filter((s) => s.status === "blocked");



  async function blockSlot(slot: SlotRow) {

    setBusySlot(slot.label);

    try {

      await createDemoScheduleBlock({

        starts_at: slot.starts_at,

        ends_at: slot.ends_at,

        reason: blockReason.trim() || null,

      });

      onNotify?.("ok", `Horário ${slot.label} bloqueado.`);

      await refresh();

    } catch (e) {

      onNotify?.("err", e instanceof Error ? e.message : "Erro ao bloquear horário.");

    } finally {

      setBusySlot(null);

    }

  }



  async function unblockSlot(slot: SlotRow) {

    if (slot.blockIds.length === 0) return;

    setBusySlot(slot.label);

    try {

      for (const id of slot.blockIds) {

        await deleteDemoScheduleBlock(id);

      }

      onNotify?.("ok", `Horário ${slot.label} liberado.`);

      await refresh();

    } catch (e) {

      onNotify?.("err", e instanceof Error ? e.message : "Erro ao liberar horário.");

    } finally {

      setBusySlot(null);

    }

  }



  async function blockWholeDay() {

    if (!selectedDay || blockableSlots.length === 0) return;

    setBusySlot("__day__");

    try {

      const reason = blockReason.trim() || null;

      for (const slot of blockableSlots) {

        await createDemoScheduleBlock({

          starts_at: slot.starts_at,

          ends_at: slot.ends_at,

          reason,

        });

      }

      onNotify?.("ok", "Dia bloqueado para novos agendamentos.");

      await refresh();

    } catch (e) {

      onNotify?.("err", e instanceof Error ? e.message : "Erro ao bloquear o dia.");

    } finally {

      setBusySlot(null);

    }

  }



  async function unblockWholeDay() {

    if (!selectedDay || blockedSlots.length === 0) return;

    setBusySlot("__day__");

    try {

      const ids = new Set(blockedSlots.flatMap((s) => s.blockIds));

      for (const id of ids) {

        await deleteDemoScheduleBlock(id);

      }

      onNotify?.("ok", "Bloqueios do dia removidos.");

      await refresh();

    } catch (e) {

      onNotify?.("err", e instanceof Error ? e.message : "Erro ao desbloquear o dia.");

    } finally {

      setBusySlot(null);

    }

  }



  return (

    <div className={styles.wrap}>

      <div className={styles.toolbar}>

        <button type="button" className={styles.navBtn} onClick={() => setFocusedMonth((m) => addMonths(m, -1))}>

          ‹

        </button>

        <strong className={styles.monthTitle}>

          {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(focusedMonth)}

        </strong>

        <button type="button" className={styles.navBtn} onClick={() => setFocusedMonth((m) => addMonths(m, 1))}>

          ›

        </button>

        <button type="button" className={styles.todayBtn} onClick={() => setFocusedMonth(new Date())}>

          Hoje

        </button>

        <button type="button" className={styles.todayBtn} disabled={loading} onClick={() => void refresh()}>

          Atualizar

        </button>

      </div>



      <div className={styles.legend}>

        <span><i className={styles.dotAvailable} /> Disponível</span>

        <span><i className={styles.dotBlocked} /> Bloqueado</span>

        <span><i className={styles.dotFull} /> Lotado</span>

        <span><i className={styles.dotDemo} /> Demonstração agendada</span>

      </div>



      <div className={styles.gridHead}>

        {WEEKDAYS.map((wd) => (

          <div key={wd}>{wd}</div>

        ))}

      </div>



      <div className={`${styles.grid} ${loading ? styles.gridLoading : ""}`}>

        {monthGrid.map((cell) => {

          const key = localDateKey(cell);

          const meta = dayMap.get(key);

          const inMonth = cell.getMonth() === currentMonth;

          const demos = appointmentsByDay.get(key) ?? [];

          const dayBlocks = blocksByDay.get(key) ?? [];

          const status = meta?.status ?? "closed";

          const isSelected = selectedDay === key;

          const hasBlocks = dayBlocks.length > 0;

          return (

            <button

              key={key}

              type="button"

              className={`${styles.cell} ${!inMonth ? styles.cellMuted : ""} ${isSelected ? styles.cellSelected : ""} ${styles[`cell_${status}`] ?? ""}`}

              onClick={() => setSelectedDay(key)}

            >

              <span className={styles.dayNum}>{cell.getDate()}</span>

              {meta && meta.available_slots > 0 ? (

                <span className={styles.slotBadge}>{meta.available_slots} livre(s)</span>

              ) : null}

              {hasBlocks && (!meta || meta.available_slots === 0) && isDemoBusinessDay(key) ? (

                <span className={styles.blockedBadge}>bloqueado</span>

              ) : null}

              {demos.slice(0, 2).map((d) => (

                <span key={d.id} className={styles.demoBadge}>

                  {new Date(d.scheduled_at).toLocaleTimeString("pt-BR", {

                    hour: "2-digit",

                    minute: "2-digit",

                    timeZone: "America/Sao_Paulo",

                  })}{" "}

                  {d.name.split(" ")[0]}

                </span>

              ))}

              {demos.length > 2 ? <span className={styles.moreBadge}>+{demos.length - 2}</span> : null}

            </button>

          );

        })}

      </div>



      {selectedDay ? (

        <div className={styles.dayPanel}>

          <div className={styles.dayPanelHead}>

            <h4>

              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", {

                weekday: "long",

                day: "2-digit",

                month: "long",

              })}

            </h4>

            {isDemoBusinessDay(selectedDay) && selectedDayMeta?.status !== "past" ? (

              <div className={styles.dayActions}>

                <button

                  type="button"

                  className={styles.dayActionBtn}

                  disabled={busySlot !== null || blockableSlots.length === 0}

                  onClick={() => void blockWholeDay()}

                >

                  Bloquear dia inteiro

                </button>

                <button

                  type="button"

                  className={styles.dayActionBtnSecondary}

                  disabled={busySlot !== null || blockedSlots.length === 0}

                  onClick={() => void unblockWholeDay()}

                >

                  Desbloquear dia

                </button>

              </div>

            ) : null}

          </div>



          {isDemoBusinessDay(selectedDay) ? (

            <>

              <div className={styles.blockReasonRow}>

                <label htmlFor="demo-block-reason">Motivo do bloqueio (opcional)</label>

                <input

                  id="demo-block-reason"

                  type="text"

                  value={blockReason}

                  onChange={(e) => setBlockReason(e.target.value)}

                  placeholder="Ex.: feriado, reunião interna…"

                  maxLength={200}

                />

              </div>



              <div className={styles.slotsSection}>

                <p className={styles.slotsTitle}>Horários do dia</p>

                <ul className={styles.slotList}>

                  {slotRows.map((slot) => (

                    <li key={slot.label} className={styles.slotItem}>

                      <div className={styles.slotInfo}>

                        <strong>{slot.label}</strong>

                        <span className={styles[`slotStatus_${slot.status}`]}>

                          {slot.status === "available"

                            ? "Livre"

                            : slot.status === "booked"

                              ? "Agendado"

                              : slot.status === "blocked"

                                ? "Bloqueado"

                                : "Indisponível"}

                        </span>

                      </div>

                      <div className={styles.slotActions}>

                        {slot.status === "booked" && slot.appointment ? (

                          <button

                            type="button"

                            className={styles.slotBtn}

                            onClick={() => onSelectAppointment?.(slot.appointment!)}

                          >

                            Ver demonstração

                          </button>

                        ) : null}

                        {slot.status === "available" ? (

                          <button

                            type="button"

                            className={styles.slotBtnDanger}

                            disabled={busySlot !== null}

                            onClick={() => void blockSlot(slot)}

                          >

                            {busySlot === slot.label ? "…" : "Bloquear"}

                          </button>

                        ) : null}

                        {slot.status === "blocked" ? (

                          <button

                            type="button"

                            className={styles.slotBtn}

                            disabled={busySlot !== null}

                            onClick={() => void unblockSlot(slot)}

                          >

                            {busySlot === slot.label ? "…" : "Liberar"}

                          </button>

                        ) : null}

                      </div>

                    </li>

                  ))}

                </ul>

              </div>

            </>

          ) : (

            <p className={styles.empty}>Fim de semana — sem horários de demonstração.</p>

          )}



          {dayAppointments.length > 0 ? (

            <div className={styles.demosSection}>

              <p className={styles.slotsTitle}>Demonstrações agendadas</p>

              <ul className={styles.dayList}>

                {dayAppointments.map((row) => (

                  <li key={row.id}>

                    <button type="button" className={styles.dayItem} onClick={() => onSelectAppointment?.(row)}>

                      <strong>

                        {new Date(row.scheduled_at).toLocaleTimeString("pt-BR", {

                          hour: "2-digit",

                          minute: "2-digit",

                          timeZone: "America/Sao_Paulo",

                        })}{" "}

                        — {row.name}

                      </strong>

                      <span>{row.company ?? row.email}</span>
                      {row.phone ? <span>{formatPhoneBr(row.phone)}</span> : null}

                    </button>

                  </li>

                ))}

              </ul>

            </div>

          ) : isDemoBusinessDay(selectedDay) ? (

            <p className={styles.empty}>Nenhuma demonstração agendada neste dia.</p>

          ) : null}

        </div>

      ) : null}

    </div>

  );

}

