import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Navigate, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  createBreakWindow,
  createUnavailability,
  createWorkWindow,
  deleteBreakWindow,
  deleteUnavailability,
  deleteWorkWindow,
  listBreakWindows,
  listTenantHolidays,
  listUnavailability,
  listWorkWindows,
  updateBreakWindow,
  updateUnavailability,
  updateWorkWindow,
  type BreakWindow,
  type TenantHoliday,
  type Unavailability,
  type WorkWindow,
} from "../../api/technicianCalendar";
import { listTenantUsers, type UserOut } from "../../api/auth";
import { listSchedules, type ScheduleOut } from "../../api/serviceOrders";
import { getWhatsappModuleStatus, sendScheduleWhatsappReminder } from "../../api/whatsapp";
import { AgendaBlockTimeModal } from "../../components/agenda/AgendaBlockTimeModal";
import { PmocAgendaEventModal, type PmocAgendaEventSchedule } from "../../components/agenda/PmocAgendaEventModal";
import { listPmocMockAgendaEntries, pmocMockAgendaEntryToScheduleShape } from "../../lib/pmocAgendaMock";
import { resolveTenantWeekdayWorkHours, type WeekdayHourSlice } from "../../lib/tenantWorkHours";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./TechnicianSchedulePage.module.css";

const MOBILE_BREAKPOINT = "(max-width: 768px)";

type AgendaVisualSchedule = ScheduleOut & {
  is_pmoc?: boolean;
  pmoc_label?: string;
  technician_id?: string;
};

function countOsPerDay(schedulesByDay: Map<string, AgendaVisualSchedule[]>, dayKey: string): number {
  const list = schedulesByDay.get(dayKey) ?? [];
  const ids = new Set<number>();
  for (const s of list) {
    if (s.service_order_id != null) ids.add(s.service_order_id);
  }
  return ids.size;
}

function countBlocksPerDay(blocks: Unavailability[], dayKey: string): number {
  return blocks.filter((b) => blockOverlapsDayKey(b, dayKey)).length;
}

function serviceOrderPath(role: string | undefined, serviceOrderId: number): string {
  return role === "technician" ? `/app/tecnico/os/${serviceOrderId}` : `/app/service-orders/${serviceOrderId}`;
}

function scheduleAllowsWhatsappReminder(schedule: ScheduleOut): boolean {
  const status = String(schedule.status || "").toLowerCase();
  if (status !== "pending" && status !== "confirmed") return false;
  return Boolean(schedule.client_whatsapp?.trim() || schedule.client_phone?.trim());
}

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"] as const;

function toLocalInput(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}

/** Monday-first month grid including leading/trailing days from adjacent months */
function monthGridDates(anchor: Date): Date[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const mondayIndex = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const out: Date[] = [];
  for (let i = mondayIndex; i > 0; i--) {
    out.push(addDays(first, -i));
  }
  for (let d = 0; d < lastDay; d++) {
    out.push(addDays(first, d));
  }
  const tail = out[out.length - 1]!;
  let step = 1;
  while (out.length % 7 !== 0) {
    out.push(addDays(tail, step));
    step++;
  }
  return out;
}

function formatMonthYearTitle(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

function wazeSearchUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address.trim())}`;
}

function formatDayHeader(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function formatDayHeaderFull(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatHourRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(s.getHours())}:${pad(s.getMinutes())} - ${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

function formatPhoneBr(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 10) {
    const ddd = digits.slice(0, 2);
    const n1 = digits.slice(2, 6);
    const n2 = digits.slice(6, 10);
    return n2 ? `(${ddd}) ${n1}-${n2}` : `(${ddd}) ${n1}`;
  }
  const ddd = digits.slice(0, 2);
  const n1 = digits.slice(2, 7);
  const n2 = digits.slice(7, 11);
  return n2 ? `(${ddd}) ${n1}-${n2}` : `(${ddd}) ${n1}`;
}

function ellipsis(value: string | null | undefined, max = 34): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function parseHmToMinutes(value: string, fallback: number): number {
  const parts = value.split(":");
  if (parts.length !== 2) return fallback;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
  return hh * 60 + mm;
}

function formatMinutesLabel(totalMinutes: number): string {
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTenantWeekday(date: Date): number {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

function outsideExpedienteSegments(
  weekdayRule: WeekdayHourSlice | undefined,
  gridStartMinutes: number,
  gridEndMinutes: number,
  fallbackStart: number,
  fallbackEnd: number,
): Array<{ startMinutes: number; endMinutes: number }> {
  if (!weekdayRule) return [];
  const dayStart = parseHmToMinutes(weekdayRule.start, fallbackStart);
  const dayEnd = parseHmToMinutes(weekdayRule.end, fallbackEnd);
  const segments: Array<{ startMinutes: number; endMinutes: number }> = [];
  if (dayStart > gridStartMinutes) {
    segments.push({ startMinutes: gridStartMinutes, endMinutes: dayStart });
  }
  if (dayEnd < gridEndMinutes) {
    segments.push({ startMinutes: dayEnd, endMinutes: gridEndMinutes });
  }
  return segments;
}

type BrasilApiHoliday = { date: string; name: string };

const FIXED_NATIONAL_HOLIDAYS_PTBR: Record<string, string> = {
  "01-01": "Confraternização Universal",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "09-07": "Independência do Brasil",
  "10-12": "Nossa Senhora Aparecida",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "11-20": "Dia da Consciência Negra",
  "12-25": "Natal",
};

function isPmocScheduleRow(s: ScheduleOut): boolean {
  return s.service_order_id == null && (s.notes ?? "").startsWith("[PMOC]");
}

function enrichScheduleRow(s: ScheduleOut): AgendaVisualSchedule {
  const isPmoc = isPmocScheduleRow(s);
  return {
    ...s,
    is_pmoc: isPmoc || undefined,
    pmoc_label: isPmoc ? "PMOC" : undefined,
  };
}

function unavailabilityDisplayMeta(reason: string | null | undefined): { tag: string; title: string; isFolga: boolean } {
  const text = (reason ?? "").trim();
  const lower = text.toLowerCase();
  if (lower.includes("folga")) {
    return { tag: "FOLGA", title: text || "Folga", isFolga: true };
  }
  return { tag: "BLOQUEIO", title: text || "Horário bloqueado", isFolga: false };
}

function blockOverlapsDayKey(block: Unavailability, dayKey: string): boolean {
  const startKey = localDateKey(new Date(block.starts_at));
  const endKey = localDateKey(new Date(block.ends_at));
  return startKey <= dayKey && endKey >= dayKey;
}

function clipUnavailabilityToDay(
  block: Unavailability,
  day: Date,
): { starts: Date; ends: Date } | null {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  const start = new Date(block.starts_at);
  const end = new Date(block.ends_at);
  if (end < dayStart || start > dayEnd) return null;
  return {
    starts: start < dayStart ? dayStart : start,
    ends: end > dayEnd ? dayEnd : end,
  };
}

export function TechnicianSchedulePage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [technicians, setTechnicians] = useState<UserOut[]>([]);
  const [technicianId, setTechnicianId] = useState("");
  const [workRows, setWorkRows] = useState<WorkWindow[]>([]);
  const [breakRows, setBreakRows] = useState<BreakWindow[]>([]);
  const [unavailabilityRows, setUnavailabilityRows] = useState<Unavailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const agendaMode = searchParams.get("mode") === "config" ? "config" : "visual";
  const [calendarView, setCalendarView] = useState<"week" | "day" | "month">(() =>
    typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT).matches ? "day" : "week",
  );
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT).matches,
  );
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [focusedDate, setFocusedDate] = useState(() => new Date());
  const [scheduleRows, setScheduleRows] = useState<ScheduleOut[]>([]);
  const [pmocMockRevision, setPmocMockRevision] = useState(0);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [hasLoadedVisualOnce, setHasLoadedVisualOnce] = useState(false);
  const [tenantHolidays, setTenantHolidays] = useState<TenantHoliday[]>([]);
  const [apiNationalHolidays, setApiNationalHolidays] = useState<Map<string, string>>(new Map());

  const [workForm, setWorkForm] = useState({ id: "", weekday: "0", start_time: "08:00", end_time: "18:00" });
  const [breakForm, setBreakForm] = useState({ id: "", weekday: "0", start_time: "12:00", end_time: "13:00" });
  const [unForm, setUnForm] = useState({ id: "", starts_at: "", ends_at: "", reason: "" });
  const [visualBlocks, setVisualBlocks] = useState<Unavailability[]>([]);
  const [selectedPmoc, setSelectedPmoc] = useState<PmocAgendaEventSchedule | null>(null);
  const [blockTimeOpen, setBlockTimeOpen] = useState(false);
  const [blockTimeEdit, setBlockTimeEdit] = useState<Unavailability | null>(null);
  const [blockDraftTimes, setBlockDraftTimes] = useState<{ startsAt: string; endsAt: string } | null>(null);
  const [dragSelect, setDragSelect] = useState<{
    dayKey: string;
    anchorMinutes: number;
    currentMinutes: number;
  } | null>(null);
  const [whatsappModuleActive, setWhatsappModuleActive] = useState(false);
  const [sendingReminderScheduleId, setSendingReminderScheduleId] = useState<number | null>(null);
  const overlayPointerRef = useRef<{
    day: Date;
    overlay: HTMLElement;
    pointerId: number;
    startClientY: number;
    anchorMinutes: number;
    currentMinutes: number;
    shiftDrag: boolean;
    suppressClick: boolean;
  } | null>(null);

  const canManage = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const canView = !!ctx && (canManage || ctx.user.role === "technician");

  const workByWeekday = useMemo(
    () =>
      WEEKDAYS.map((_, weekday) => workRows.filter((w) => w.weekday === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time))),
    [workRows],
  );
  const breaksByWeekday = useMemo(
    () =>
      WEEKDAYS.map((_, weekday) => breakRows.filter((b) => b.weekday === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time))),
    [breakRows],
  );
  const totalWorkMinutes = useMemo(
    () =>
      workRows.reduce((sum, row) => {
        const [sh, sm] = row.start_time.split(":").map(Number);
        const [eh, em] = row.end_time.split(":").map(Number);
        return sum + (eh * 60 + em - (sh * 60 + sm));
      }, 0),
    [workRows],
  );
  const totalBreakMinutes = useMemo(
    () =>
      breakRows.reduce((sum, row) => {
        const [sh, sm] = row.start_time.split(":").map(Number);
        const [eh, em] = row.end_time.split(":").map(Number);
        return sum + (eh * 60 + em - (sh * 60 + sm));
      }, 0),
    [breakRows],
  );
  const dayStatus = useMemo(
    () =>
      WEEKDAYS.map((_, idx) => ({
        hasWork: workByWeekday[idx]!.length > 0,
        hasBreak: breaksByWeekday[idx]!.length > 0,
      })),
    [workByWeekday, breaksByWeekday],
  );
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)), [weekStart]);
  const scheduleQueryRange = useMemo(() => {
    if (calendarView === "day") {
      const k = localDateKey(focusedDate);
      return { from_day: k, to_day: k };
    }
    if (calendarView === "week") {
      return { from_day: localDateKey(weekDates[0]!), to_day: localDateKey(weekDates[6]!) };
    }
    const y = focusedDate.getFullYear();
    const m = focusedDate.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from_day: localDateKey(first), to_day: localDateKey(last) };
  }, [calendarView, focusedDate, weekDates]);
  const visibleDates = useMemo(() => {
    if (calendarView === "day") return [focusedDate];
    return weekDates;
  }, [calendarView, focusedDate, weekDates]);
  const monthGrid = useMemo(() => monthGridDates(focusedDate), [focusedDate]);
  const holidayYears = useMemo(() => {
    const set = new Set<number>();
    if (calendarView === "month") {
      set.add(new Date(focusedDate.getFullYear(), focusedDate.getMonth(), 1).getFullYear());
      set.add(new Date(focusedDate.getFullYear(), focusedDate.getMonth() + 1, 0).getFullYear());
    } else {
      for (const d of weekDates) set.add(d.getFullYear());
    }
    return Array.from(set);
  }, [calendarView, focusedDate, weekDates]);

  const pmocMockScheduleRows = useMemo((): AgendaVisualSchedule[] => {
    void pmocMockRevision;
    const from = scheduleQueryRange.from_day;
    const to = scheduleQueryRange.to_day;
    return listPmocMockAgendaEntries()
      .filter((entry) => !technicianId || entry.technician_id === technicianId)
      .map(pmocMockAgendaEntryToScheduleShape)
      .filter((row) => {
        const dayKey = localDateKey(new Date(row.starts_at));
        return dayKey >= from && dayKey <= to;
      });
  }, [pmocMockRevision, scheduleQueryRange.from_day, scheduleQueryRange.to_day, technicianId]);

  const enrichedScheduleRows = useMemo(
    () => scheduleRows.map(enrichScheduleRow),
    [scheduleRows],
  );

  const schedulesByDay = useMemo(() => {
    const map = new Map<string, AgendaVisualSchedule[]>();
    const merged: AgendaVisualSchedule[] = [...enrichedScheduleRows, ...pmocMockScheduleRows];
    for (const s of merged) {
      if (s.status === "cancelled") continue;
      const d = new Date(s.starts_at);
      const key = localDateKey(d);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [enrichedScheduleRows, pmocMockScheduleRows]);
  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of tenantHolidays) {
      map.set(h.holiday_date, h.description || "Feriado");
    }
    for (const [k, v] of apiNationalHolidays.entries()) {
      if (!map.has(k)) map.set(k, `[BRASILAPI-NACIONAL] ${v}`);
    }
    return map;
  }, [tenantHolidays, apiNationalHolidays]);
  const holidayLabelForDay = useMemo(
    () => (day: Date): string | null => {
      const key = localDateKey(day);
      const existing = holidayMap.get(key);
      if (existing) return existing;
      const fixedKey = `${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const fixed = FIXED_NATIONAL_HOLIDAYS_PTBR[fixedKey];
      return fixed ? `[BRASILAPI-NACIONAL] ${fixed}` : null;
    },
    [holidayMap],
  );
  const weekdayHours = useMemo(
    (): Record<string, WeekdayHourSlice> => resolveTenantWeekdayWorkHours(ctx?.tenant),
    [ctx?.tenant],
  );
  const businessDays = useMemo(() => {
    const days = Object.keys(weekdayHours)
      .map((k) => Number(k))
      .filter((d) => !Number.isNaN(d) && d >= 0 && d <= 6);
    return new Set(days);
  }, [weekdayHours]);
  const defaultStartMinutes = 8 * 60;
  const defaultEndMinutes = 18 * 60;
  const companyStartMinutes = useMemo(() => {
    const starts = Object.values(weekdayHours)
      .map((h) => parseHmToMinutes(h.start, defaultStartMinutes))
      .sort((a, b) => a - b);
    return starts[0] ?? defaultStartMinutes;
  }, [weekdayHours]);
  const companyEndMinutes = useMemo(() => {
    const ends = Object.values(weekdayHours)
      .map((h) => parseHmToMinutes(h.end, defaultEndMinutes))
      .sort((a, b) => b - a);
    return ends[0] ?? defaultEndMinutes;
  }, [weekdayHours]);
  const gridStartMinutes = companyStartMinutes;
  const gridEndMinutes = companyEndMinutes;
  const minutesPerDay = Math.max(gridEndMinutes - gridStartMinutes, 1);
  const daySlots = useMemo(() => {
    const slots = [formatMinutesLabel(gridStartMinutes)];
    let hourMark = Math.ceil(gridStartMinutes / 60) * 60;
    if (hourMark === gridStartMinutes) hourMark += 60;
    while (hourMark < gridEndMinutes) {
      slots.push(formatMinutesLabel(hourMark));
      hourMark += 60;
    }
    return slots;
  }, [gridEndMinutes, gridStartMinutes]);
  const calendarRows = Math.max(daySlots.length, 1);
  const technicianNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of technicians) map.set(t.id, t.full_name?.trim() || `Técnico #${t.id}`);
    return map;
  }, [technicians]);

  const agendaVisualBooting = loading || (loadingSchedules && !hasLoadedVisualOnce);
  const agendaVisualReady = !agendaVisualBooting;
  const agendaVisualRefreshing = loadingSchedules && hasLoadedVisualOnce;

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        if (ctx.user.role === "technician") {
          if (cancelled) return;
          setTechnicians([ctx.user]);
          setTechnicianId(String(ctx.user.id));
          return;
        }
        const users = await listTenantUsers({ limit: 100 });
        if (cancelled) return;
        const techs = users.filter((u: UserOut) => u.role === "technician" && u.is_active);
        setTechnicians(techs);
        const queryTechId = searchParams.get("technician_id");
        if (queryTechId && techs.some((t: UserOut) => String(t.id) === queryTechId)) {
          setTechnicianId(queryTechId);
        } else if (techs.length > 0) {
          setTechnicianId("");
        }
      } catch (e) {
        if (!cancelled) setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar tecnicos." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, searchParams]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_BREAKPOINT);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (isMobile && calendarView === "week") setCalendarView("day");
  }, [isMobile, calendarView]);

  useEffect(() => {
    if (!canManage || agendaMode !== "visual") {
      setWhatsappModuleActive(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const status = await getWhatsappModuleStatus();
        if (!cancelled) setWhatsappModuleActive(Boolean(status.entitlement_active));
      } catch {
        if (!cancelled) setWhatsappModuleActive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, agendaMode]);

  useEffect(() => {
    if (!technicianId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [work, breaks, unavailability] = await Promise.all([
          listWorkWindows(Number(technicianId)),
          listBreakWindows(Number(technicianId)),
          listUnavailability(Number(technicianId)),
        ]);
        if (cancelled) return;
        setWorkRows(work);
        setBreakRows(breaks);
        setUnavailabilityRows(unavailability);
      } catch (e) {
        if (!cancelled) setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar agenda do tecnico." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [technicianId]);

  useEffect(() => {
    if (agendaMode !== "visual") return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listTenantHolidays({ limit: 500 });
        if (cancelled) return;
        setTenantHolidays(rows);
      } catch {
        if (!cancelled) setTenantHolidays([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agendaMode]);

  useEffect(() => {
    if (agendaMode !== "visual" || !ctx?.tenant.block_national_holidays) {
      setApiNationalHolidays(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const results = await Promise.all(
          holidayYears.map(async (year) => {
            const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
            if (!response.ok) return [] as BrasilApiHoliday[];
            const data = (await response.json()) as BrasilApiHoliday[];
            return Array.isArray(data) ? data : [];
          }),
        );
        if (cancelled) return;
        const merged = new Map<string, string>();
        for (const rows of results) {
          for (const row of rows) {
            if (row?.date && row?.name) merged.set(row.date, row.name);
          }
        }
        setApiNationalHolidays(merged);
      } catch {
        if (!cancelled) setApiNationalHolidays(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agendaMode, ctx?.tenant.block_national_holidays, holidayYears]);

  useEffect(() => {
    if ((ctx?.user.role === "technician" && !technicianId) || agendaMode !== "visual") return;
    let cancelled = false;
    void (async () => {
      setLoadingSchedules(true);
      try {
        const rows = await listSchedules({
          technician_id: technicianId ? Number(technicianId) : undefined,
          limit: 500,
          from_day: scheduleQueryRange.from_day,
          to_day: scheduleQueryRange.to_day,
        });
        if (cancelled) return;
        setScheduleRows(rows);
      } catch (e) {
        if (!cancelled) setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar agenda visual." });
      } finally {
        if (!cancelled) setLoadingSchedules(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [technicianId, agendaMode, scheduleQueryRange.from_day, scheduleQueryRange.to_day, ctx?.user.role]);

  useEffect(() => {
    if (agendaMode !== "visual" || loadingSchedules) return;
    setHasLoadedVisualOnce(true);
  }, [agendaMode, loadingSchedules]);

  useEffect(() => {
    if (agendaMode !== "visual") return;
    const refresh = () => setPmocMockRevision((n) => n + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [agendaMode]);

  const visualBlocksInRange = useMemo(() => {
    const from = scheduleQueryRange.from_day;
    const to = scheduleQueryRange.to_day;
    return visualBlocks.filter((b) => {
      const startKey = localDateKey(new Date(b.starts_at));
      const endKey = localDateKey(new Date(b.ends_at));
      return startKey <= to && endKey >= from;
    });
  }, [visualBlocks, scheduleQueryRange.from_day, scheduleQueryRange.to_day]);

  useEffect(() => {
    if (agendaMode !== "visual") return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listUnavailability(technicianId ? Number(technicianId) : undefined, {
          from_day: scheduleQueryRange.from_day,
          to_day: scheduleQueryRange.to_day,
          limit: 100,
        });
        if (!cancelled) setVisualBlocks(rows);
      } catch (e) {
        if (!cancelled) {
          setVisualBlocks([]);
          setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar bloqueios da agenda." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agendaMode, technicianId, scheduleQueryRange.from_day, scheduleQueryRange.to_day]);

  async function refreshVisualAgenda() {
    setPmocMockRevision((n) => n + 1);
    try {
      const rows = await listSchedules({
        technician_id: technicianId ? Number(technicianId) : undefined,
        limit: 500,
        from_day: scheduleQueryRange.from_day,
        to_day: scheduleQueryRange.to_day,
      });
      setScheduleRows(rows);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao atualizar agenda." });
    }
    try {
      const blocks = await listUnavailability(technicianId ? Number(technicianId) : undefined, {
        from_day: scheduleQueryRange.from_day,
        to_day: scheduleQueryRange.to_day,
        limit: 100,
      });
      setVisualBlocks(blocks);
      if (technicianId) setUnavailabilityRows(blocks);
    } catch {
      setVisualBlocks([]);
    }
  }

  async function submitWork() {
    if (!canManage) return;
    if (!technicianId) return;
    try {
      if (workForm.id) {
        await updateWorkWindow(Number(workForm.id), {
          weekday: Number(workForm.weekday),
          start_time: workForm.start_time,
          end_time: workForm.end_time,
        });
      } else {
        await createWorkWindow({
          technician_id: Number(technicianId),
          weekday: Number(workForm.weekday),
          start_time: workForm.start_time,
          end_time: workForm.end_time,
        });
      }
      setWorkForm({ id: "", weekday: "0", start_time: "08:00", end_time: "18:00" });
      setWorkRows(await listWorkWindows(Number(technicianId)));
      setMsg({ kind: "ok", text: "Jornada salva com sucesso." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar jornada." });
    }
  }

  async function submitBreak() {
    if (!canManage) return;
    if (!technicianId) return;
    try {
      if (breakForm.id) {
        await updateBreakWindow(Number(breakForm.id), {
          weekday: Number(breakForm.weekday),
          start_time: breakForm.start_time,
          end_time: breakForm.end_time,
        });
      } else {
        await createBreakWindow({
          technician_id: Number(technicianId),
          weekday: Number(breakForm.weekday),
          start_time: breakForm.start_time,
          end_time: breakForm.end_time,
        });
      }
      setBreakForm({ id: "", weekday: "0", start_time: "12:00", end_time: "13:00" });
      setBreakRows(await listBreakWindows(Number(technicianId)));
      setMsg({ kind: "ok", text: "Pausa salva com sucesso." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar pausa." });
    }
  }

  async function submitUnavailability() {
    if (!canManage) return;
    if (!technicianId || !unForm.starts_at || !unForm.ends_at) return;
    try {
      if (unForm.id) {
        await updateUnavailability(Number(unForm.id), {
          starts_at: new Date(unForm.starts_at).toISOString(),
          ends_at: new Date(unForm.ends_at).toISOString(),
          reason: unForm.reason || undefined,
        });
      } else {
        await createUnavailability({
          technician_id: Number(technicianId),
          starts_at: new Date(unForm.starts_at).toISOString(),
          ends_at: new Date(unForm.ends_at).toISOString(),
          reason: unForm.reason || undefined,
        });
      }
      setUnForm({ id: "", starts_at: "", ends_at: "", reason: "" });
      setUnavailabilityRows(await listUnavailability(Number(technicianId)));
      setMsg({ kind: "ok", text: "Indisponibilidade salva com sucesso." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar indisponibilidade." });
    }
  }

  async function removeWork(id: number) {
    if (!canManage) return;
    if (!technicianId) return;
    try {
      await deleteWorkWindow(id);
      setWorkRows(await listWorkWindows(Number(technicianId)));
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao excluir jornada." });
    }
  }
  async function removeBreak(id: number) {
    if (!canManage) return;
    if (!technicianId) return;
    try {
      await deleteBreakWindow(id);
      setBreakRows(await listBreakWindows(Number(technicianId)));
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao excluir pausa." });
    }
  }
  async function removeUnavailability(id: number) {
    if (!canManage) return;
    if (!technicianId) return;
    try {
      await deleteUnavailability(id);
      setUnavailabilityRows(await listUnavailability(Number(technicianId)));
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao excluir indisponibilidade." });
    }
  }

  const DRAG_CLICK_THRESHOLD_PX = 8;

  const resolveOverlayMinutes = useCallback(
    (clientY: number, overlay: HTMLElement, day: Date): { minutes: number; valid: boolean } => {
      const holidayLabel = holidayLabelForDay(day);
      const weekday = toTenantWeekday(day);
      const isBusinessDay = businessDays.has(weekday);
      if (holidayLabel || !isBusinessDay) return { minutes: 0, valid: false };
      const weekdayRule = weekdayHours[String(weekday)];
      const dayStartMin = weekdayRule
        ? parseHmToMinutes(weekdayRule.start, companyStartMinutes)
        : companyStartMinutes;
      const dayEndMin = weekdayRule
        ? parseHmToMinutes(weekdayRule.end, companyEndMinutes)
        : companyEndMinutes;
      const rect = overlay.getBoundingClientRect();
      const y = clientY - rect.top;
      const ratio = Math.min(Math.max(y / rect.height, 0), 1);
      const rawMinutes = Math.round((ratio * minutesPerDay) / 15) * 15;
      const absoluteMinute = gridStartMinutes + rawMinutes;
      if (absoluteMinute < dayStartMin || absoluteMinute >= dayEndMin) {
        return { minutes: absoluteMinute, valid: false };
      }
      return { minutes: absoluteMinute, valid: true };
    },
    [
      businessDays,
      companyEndMinutes,
      companyStartMinutes,
      gridStartMinutes,
      holidayLabelForDay,
      minutesPerDay,
      weekdayHours,
    ],
  );

  const dateFromAbsoluteMinutes = useCallback((day: Date, absoluteMinutes: number): Date => {
    const d = new Date(day);
    d.setHours(Math.floor(absoluteMinutes / 60), absoluteMinutes % 60, 0, 0);
    return d;
  }, []);

  const openBlockModalFromDrag = useCallback(
    (day: Date, startMin: number, endMin: number) => {
      const start = Math.min(startMin, endMin);
      let end = Math.max(startMin, endMin);
      if (end <= start) end = start + 15;
      const startsAt = dateFromAbsoluteMinutes(day, start);
      const endsAt = dateFromAbsoluteMinutes(day, end);
      setBlockTimeEdit(null);
      setBlockDraftTimes({
        startsAt: toLocalInput(startsAt.toISOString()),
        endsAt: toLocalInput(endsAt.toISOString()),
      });
      setBlockTimeOpen(true);
    },
    [dateFromAbsoluteMinutes],
  );

  function openBlockTimeModalManual() {
    setBlockTimeEdit(null);
    setBlockDraftTimes(null);
    setBlockTimeOpen(true);
  }

  function handleOverlayPointerDown(e: React.PointerEvent<HTMLDivElement>, day: Date) {
    if (!canManage) return;
    const holidayLabel = holidayLabelForDay(day);
    const weekday = toTenantWeekday(day);
    if (holidayLabel || !businessDays.has(weekday)) return;
    const overlay = e.currentTarget;
    const { minutes, valid } = resolveOverlayMinutes(e.clientY, overlay, day);
    if (!valid) return;
    overlay.setPointerCapture(e.pointerId);
    const shiftDrag = e.shiftKey;
    overlayPointerRef.current = {
      day,
      overlay,
      pointerId: e.pointerId,
      startClientY: e.clientY,
      anchorMinutes: minutes,
      currentMinutes: minutes,
      shiftDrag,
      suppressClick: shiftDrag,
    };
    if (shiftDrag) {
      setDragSelect({ dayKey: localDateKey(day), anchorMinutes: minutes, currentMinutes: minutes });
    }
  }

  function handleOverlayPointerMove(e: React.PointerEvent<HTMLDivElement>, day: Date) {
    const session = overlayPointerRef.current;
    if (!session || session.day.getTime() !== day.getTime()) return;
    const { minutes, valid } = resolveOverlayMinutes(e.clientY, session.overlay, day);
    if (!valid) return;
    if (Math.abs(e.clientY - session.startClientY) >= DRAG_CLICK_THRESHOLD_PX) {
      session.suppressClick = true;
    }
    session.currentMinutes = minutes;
    if (session.shiftDrag) {
      setDragSelect({ dayKey: localDateKey(day), anchorMinutes: session.anchorMinutes, currentMinutes: minutes });
    }
  }

  function handleOverlayPointerUp(e: React.PointerEvent<HTMLDivElement>, day: Date) {
    const session = overlayPointerRef.current;
    if (!session || session.day.getTime() !== day.getTime()) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
    if (session.shiftDrag) {
      openBlockModalFromDrag(day, session.anchorMinutes, session.currentMinutes);
    } else if (!session.suppressClick) {
      const offsetFromDayStart = session.anchorMinutes - gridStartMinutes;
      openNewOrderFromSlot(day, offsetFromDayStart);
    }
    overlayPointerRef.current = null;
    setDragSelect(null);
  }

  function handleOverlayPointerCancel() {
    overlayPointerRef.current = null;
    setDragSelect(null);
  }

  if (!ctx) return <Navigate to="/login" replace />;
  if (!canView) return <Navigate to="/app" replace />;

  function openNewOrderFromSlot(day: Date, minuteOffset: number) {
    const base = new Date(day);
    const totalMinutes = gridStartMinutes + minuteOffset;
    base.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
    const params = new URLSearchParams();
    params.set("starts_at", base.toISOString());
    if (technicianId) params.set("technician_id", technicianId);
    params.set("from", "agenda");
    navigate(`/app/service-orders/new?${params.toString()}`);
  }

  function goToDate(value: string) {
    if (!value) return;
    const target = new Date(`${value}T00:00:00`);
    if (Number.isNaN(target.getTime())) return;
    setFocusedDate(target);
    setWeekStart(startOfWeek(target));
  }

  function jumpToday() {
    const today = new Date();
    setFocusedDate(today);
    setWeekStart(startOfWeek(today));
  }

  function navigateCalendar(step: number) {
    if (calendarView === "month") {
      const next = addMonths(focusedDate, step);
      setFocusedDate(next);
      setWeekStart(startOfWeek(next));
      return;
    }
    if (calendarView === "day") {
      const next = addDays(focusedDate, step);
      setFocusedDate(next);
      setWeekStart(startOfWeek(next));
      return;
    }
    const nextWeek = addDays(weekStart, step * 7);
    setWeekStart(nextWeek);
    setFocusedDate(nextWeek);
  }

  async function handleSendScheduleReminder(schedule: AgendaVisualSchedule) {
    if (sendingReminderScheduleId === schedule.id) return;
    setSendingReminderScheduleId(schedule.id);
    try {
      await sendScheduleWhatsappReminder(schedule.id);
      setMsg({ kind: "ok", text: "Lembrete enviado pelo WhatsApp." });
    } catch (e) {
      setMsg({
        kind: "err",
        text: e instanceof Error ? e.message : "Não foi possível enviar o lembrete pelo WhatsApp.",
      });
    } finally {
      setSendingReminderScheduleId(null);
    }
  }

  return (
    <div className={styles.wrap}>
      {agendaMode === "config" ? (
        <div className={styles.inlineSwitch}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() =>
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete("mode");
                return next;
              })
            }
          >
            Ir para agenda visual
          </button>
        </div>
      ) : null}

      {agendaMode === "config" && loading ? <p className={styles.loadingBanner}>Carregando configuração da agenda…</p> : null}
      {msg ? <p className={msg.kind === "ok" ? styles.ok : styles.err}>{msg.text}</p> : null}

      {agendaMode === "config" ? (
        <>
      <section className={`${styles.card} ${styles.cardInteractive}`}>
        <h3 className={styles.sectionTitle}>Visão semanal</h3>
        <div className={styles.kpiRow}>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Carga semanal</p>
            <p className={styles.kpiValue}>{Math.max(totalWorkMinutes, 0)} min</p>
          </article>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Pausas semanais</p>
            <p className={styles.kpiValue}>{Math.max(totalBreakMinutes, 0)} min</p>
          </article>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Horas liquidas</p>
            <p className={styles.kpiValue}>{Math.max(totalWorkMinutes - totalBreakMinutes, 0)} min</p>
          </article>
        </div>
        <div className={styles.weekGrid}>
          {WEEKDAYS.map((day, idx) => (
            <article
              key={day}
              className={`${styles.dayCard} ${
                !dayStatus[idx]!.hasWork ? styles.dayCardWarn : dayStatus[idx]!.hasBreak ? styles.dayCardGood : styles.dayCardInfo
              }`}
            >
              <p className={styles.dayTitle}>{day}</p>
              <div className={styles.dayBlock}>
                <p className={styles.dayLabel}>Jornada</p>
                {workByWeekday[idx]!.length === 0 ? <p className={styles.dayMuted}>Sem configuração</p> : null}
                {workByWeekday[idx]!.map((w) => (
                  <span key={w.id} className={styles.dayPill}>
                    {w.start_time} - {w.end_time}
                  </span>
                ))}
              </div>
              <div className={styles.dayBlock}>
                <p className={styles.dayLabel}>Pausas</p>
                {breaksByWeekday[idx]!.length === 0 ? <p className={styles.dayMuted}>Sem pausa cadastrada</p> : null}
                {breaksByWeekday[idx]!.map((b) => (
                  <span key={b.id} className={styles.dayPillSoft}>
                    {b.start_time} - {b.end_time}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.card} ${styles.cardInteractive}`}>
        <h3 className={styles.sectionTitle}>Jornada semanal</h3>
        <div className={styles.formGrid}>
          <select className={styles.input} value={workForm.weekday} onChange={(e) => setWorkForm((v) => ({ ...v, weekday: e.target.value }))}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <input className={styles.input} type="time" value={workForm.start_time} onChange={(e) => setWorkForm((v) => ({ ...v, start_time: e.target.value }))} />
          <input className={styles.input} type="time" value={workForm.end_time} onChange={(e) => setWorkForm((v) => ({ ...v, end_time: e.target.value }))} />
          <button className={styles.btnPrimary} type="button" onClick={() => void submitWork()} disabled={!canManage}>
            {workForm.id ? "Salvar" : "Adicionar"}
          </button>
        </div>
        <ul className={styles.list}>
          {workRows.map((w) => (
            <li key={w.id}>
              <span>{WEEKDAYS[w.weekday]} {w.start_time} - {w.end_time}</span>
              <div className={styles.rowActions}>
                <button className={styles.btnGhost} type="button" disabled={!canManage} onClick={() => setWorkForm({ id: String(w.id), weekday: String(w.weekday), start_time: w.start_time, end_time: w.end_time })}>Editar</button>
                <button className={styles.btnGhost} type="button" disabled={!canManage} onClick={() => void removeWork(w.id)}>Excluir</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${styles.card} ${styles.cardInteractive}`}>
        <h3 className={styles.sectionTitle}>Pausas / almoço</h3>
        <div className={styles.formGrid}>
          <select className={styles.input} value={breakForm.weekday} onChange={(e) => setBreakForm((v) => ({ ...v, weekday: e.target.value }))}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <input className={styles.input} type="time" value={breakForm.start_time} onChange={(e) => setBreakForm((v) => ({ ...v, start_time: e.target.value }))} />
          <input className={styles.input} type="time" value={breakForm.end_time} onChange={(e) => setBreakForm((v) => ({ ...v, end_time: e.target.value }))} />
          <button className={styles.btnPrimary} type="button" onClick={() => void submitBreak()} disabled={!canManage}>
            {breakForm.id ? "Salvar" : "Adicionar"}
          </button>
        </div>
        <ul className={styles.list}>
          {breakRows.map((b) => (
            <li key={b.id}>
              <span>{WEEKDAYS[b.weekday]} {b.start_time} - {b.end_time}</span>
              <div className={styles.rowActions}>
                <button className={styles.btnGhost} type="button" disabled={!canManage} onClick={() => setBreakForm({ id: String(b.id), weekday: String(b.weekday), start_time: b.start_time, end_time: b.end_time })}>Editar</button>
                <button className={styles.btnGhost} type="button" disabled={!canManage} onClick={() => void removeBreak(b.id)}>Excluir</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${styles.card} ${styles.cardInteractive}`}>
        <h3 className={styles.sectionTitle}>Indisponibilidades</h3>
        <div className={styles.formGridWide}>
          <input className={styles.input} type="datetime-local" value={unForm.starts_at} onChange={(e) => setUnForm((v) => ({ ...v, starts_at: e.target.value }))} />
          <input className={styles.input} type="datetime-local" value={unForm.ends_at} onChange={(e) => setUnForm((v) => ({ ...v, ends_at: e.target.value }))} />
          <input className={styles.input} placeholder="Motivo (opcional)" value={unForm.reason} onChange={(e) => setUnForm((v) => ({ ...v, reason: e.target.value }))} />
          <button className={styles.btnPrimary} type="button" onClick={() => void submitUnavailability()} disabled={!canManage}>
            {unForm.id ? "Salvar" : "Adicionar"}
          </button>
        </div>
        <ul className={styles.list}>
          {unavailabilityRows.map((u) => (
            <li key={u.id}>
              <span>{toLocalInput(u.starts_at).replace("T", " ")} - {toLocalInput(u.ends_at).replace("T", " ")} {u.reason ? `• ${u.reason}` : ""}</span>
              <div className={styles.rowActions}>
                <button className={styles.btnGhost} type="button" disabled={!canManage} onClick={() => setUnForm({ id: String(u.id), starts_at: toLocalInput(u.starts_at), ends_at: toLocalInput(u.ends_at), reason: u.reason ?? "" })}>Editar</button>
                <button className={styles.btnGhost} type="button" disabled={!canManage} onClick={() => void removeUnavailability(u.id)}>Excluir</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
        </>
      ) : null}

      {agendaMode === "visual" ? (
        <section className={styles.card}>
          <div className={styles.legendRow} aria-label="Legenda da agenda">
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendSwatchOs}`} />
              Agendamento pendente
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendSwatchConfirmed}`} />
              Agendamento confirmado
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendSwatchBlocked}`} />
              Feriado
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendSwatchBlocked}`} />
              Sem expediente
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendSwatchBlock}`} />
              Folga / bloqueio
            </span>
            {canManage ? (
              <span className={styles.legendItem}>
                <span className={styles.legendHint}>Shift + arrastar no calendário para bloquear</span>
              </span>
            ) : null}
          </div>
          <div className={styles.calendarToolbar}>
            <div className={styles.calendarToolbarLeft}>
              <button className={styles.btnGhost} type="button" onClick={jumpToday}>Hoje</button>
              <div className={styles.viewToggle}>
                <button
                  type="button"
                  className={`${styles.viewToggleBtn} ${calendarView === "day" ? styles.viewToggleBtnActive : ""}`}
                  onClick={() => setCalendarView("day")}
                >
                  Dia
                </button>
                <button
                  type="button"
                  className={`${styles.viewToggleBtn} ${calendarView === "week" ? styles.viewToggleBtnActive : ""}`}
                  onClick={() => setCalendarView("week")}
                >
                  Semana
                </button>
                <button
                  type="button"
                  className={`${styles.viewToggleBtn} ${calendarView === "month" ? styles.viewToggleBtnActive : ""}`}
                  onClick={() => setCalendarView("month")}
                >
                  Mês
                </button>
              </div>
              <button className={styles.btnGhost} type="button" onClick={() => navigateCalendar(-1)}>
                ←
              </button>
              <button className={styles.btnGhost} type="button" onClick={() => navigateCalendar(1)}>
                →
              </button>
            </div>
            <div className={styles.calendarToolbarRight}>
              {canManage ? (
                <button
                  className={styles.btnPrimary}
                  type="button"
                  onClick={openBlockTimeModalManual}
                >
                  Bloquear horário
                </button>
              ) : null}
              <label className={styles.toolbarTechLabel} htmlFor="tech-select-inline">Técnico</label>
              <select
                id="tech-select-inline"
                className={styles.toolbarTechSelect}
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                disabled={!canManage}
              >
                {canManage ? <option value="">Todos os técnicos</option> : null}
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
              <p className={styles.meta}>
                {calendarView === "month"
                  ? formatMonthYearTitle(focusedDate).replace(/^./, (ch) => ch.toUpperCase())
                  : calendarView === "week"
                    ? `${formatDayHeader(weekDates[0]!)} - ${formatDayHeader(weekDates[6]!)}`
                    : formatDayHeaderFull(focusedDate)}
              </p>
              <input
                type="date"
                className={styles.weekDateInput}
                value={`${focusedDate.getFullYear()}-${String(focusedDate.getMonth() + 1).padStart(2, "0")}-${String(focusedDate.getDate()).padStart(2, "0")}`}
                onChange={(e) => goToDate(e.target.value)}
                title="Escolher data"
              />
            </div>
          </div>
          <div
            className={`${styles.calendarViewport} ${calendarView === "month" ? styles.calendarViewportMonth : ""}`}
            aria-busy={agendaVisualBooting}
          >
            <div
              className={`${styles.calendarLoadingOverlay} ${agendaVisualReady ? styles.calendarLoadingOverlayHidden : ""}`}
              aria-hidden={agendaVisualReady}
            >
              <div className={styles.calendarLoadingOverlayInner}>
                <div className={styles.calendarLoadingSpinner} aria-hidden />
                <p className={styles.calendarLoadingText}>Carregando agenda…</p>
              </div>
            </div>
            <div
              className={`${styles.calendarSurface} ${agendaVisualReady ? styles.calendarSurfaceReady : ""} ${
                agendaVisualRefreshing ? styles.calendarSurfaceRefreshing : ""
              }`}
            >
          {calendarView === "month" ? (
            <div className={styles.monthPlanner}>
              <div className={styles.monthWeekdayLabels}>
                {WEEKDAYS.map((d) => (
                  <span key={d} className={styles.monthWeekdayLabel}>
                    {d}.
                  </span>
                ))}
              </div>
              <div className={styles.monthCells}>
                {monthGrid.map((cellDate) => {
                  const key = localDateKey(cellDate);
                  const inAnchorMonth =
                    cellDate.getMonth() === focusedDate.getMonth() &&
                    cellDate.getFullYear() === focusedDate.getFullYear();
                  const isTodayCell = key === localDateKey(new Date());
                  const holidayLabel = holidayLabelForDay(cellDate);
                  const weekday = toTenantWeekday(cellDate);
                  const isBusinessDay = businessDays.has(weekday);
                  const osCount = countOsPerDay(schedulesByDay, key);
                  const blockCount = countBlocksPerDay(visualBlocksInRange, key);
                  const blocked = Boolean(holidayLabel) || !isBusinessDay;
                  return (
                    <button
                      key={`${key}-${cellDate.getTime()}`}
                      type="button"
                      className={`${styles.monthCell} ${!inAnchorMonth ? styles.monthCellMuted : ""} ${
                        isTodayCell ? styles.monthCellToday : ""
                      } ${blocked ? styles.monthCellBlocked : ""}`}
                      onClick={() => {
                        setFocusedDate(cellDate);
                        setWeekStart(startOfWeek(cellDate));
                        setCalendarView("day");
                      }}
                    >
                      <span className={styles.monthCellDay}>{cellDate.getDate()}</span>
                      {blocked ? (
                        <span className={styles.monthCellHint}>{holidayLabel ? "Feriado" : "Sem exped."}</span>
                      ) : osCount > 0 ? (
                        <span className={styles.monthOsBadge}>{osCount}</span>
                      ) : blockCount > 0 ? (
                        <span className={styles.monthBlockBadge} title="Folga ou bloqueio">
                          {blockCount}
                        </span>
                      ) : (
                        <span className={styles.monthCellEmpty}> </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
          <div
            className={`${styles.calendarGrid} ${calendarView === "day" ? styles.calendarGridDay : styles.calendarGridWeek}`}
            style={{ "--calendar-rows": String(calendarRows) } as CSSProperties}
          >
            <div className={styles.timeColumn}>
              <div className={styles.calendarHeaderSpacer} />
              {daySlots.map((slot) => (
                <div key={slot} className={styles.timeSlot}>
                  {slot}
                </div>
              ))}
            </div>
            {visibleDates.map((day, dayIndex) => {
              const isToday = localDateKey(day) === localDateKey(new Date());
              const actionsOpenLeft = dayIndex >= visibleDates.length - 1;
              return (
              <article
                key={localDateKey(day)}
                className={`${styles.calendarDayColumn} ${isToday ? styles.calendarDayColumnToday : ""}`}
              >
                <p className={`${styles.calendarDayHeader} ${isToday ? styles.calendarDayHeaderToday : ""}`}>{formatDayHeader(day)}</p>
                <div className={`${styles.calendarDayBody} ${isToday ? styles.calendarDayBodyToday : ""}`}>
                  {(() => {
                    const holidayLabel = holidayLabelForDay(day);
                    const weekday = toTenantWeekday(day);
                    const isBusinessDay = businessDays.has(weekday);
                    if (holidayLabel) {
                      return (
                        <div
                          className={`${styles.calendarEvent} ${styles.calendarBlockedEvent}`}
                          style={{ top: "0%", height: "100%" }}
                          title={holidayLabel}
                        >
                          <p className={styles.scheduleTime}>Feriado</p>
                          <p className={styles.scheduleMeta}>{holidayLabel.replace("[BRASILAPI-NACIONAL] ", "")}</p>
                        </div>
                      );
                    }
                    if (!isBusinessDay) {
                      return (
                        <div className={`${styles.calendarEvent} ${styles.calendarBlockedEvent}`} style={{ top: "0%", height: "100%" }}>
                          <p className={styles.scheduleTime}>Sem expediente</p>
                          <p className={styles.scheduleMeta}>Dia sem expediente</p>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {(() => {
                    const holidayLabel = holidayLabelForDay(day);
                    const weekday = toTenantWeekday(day);
                    if (holidayLabel || !businessDays.has(weekday)) return null;
                    return outsideExpedienteSegments(
                      weekdayHours[String(weekday)],
                      gridStartMinutes,
                      gridEndMinutes,
                      companyStartMinutes,
                      companyEndMinutes,
                    ).map((segment, idx) => {
                      const top = ((segment.startMinutes - gridStartMinutes) / minutesPerDay) * 100;
                      const height = ((segment.endMinutes - segment.startMinutes) / minutesPerDay) * 100;
                      return (
                        <div
                          key={`off-hours-${localDateKey(day)}-${idx}`}
                          className={`${styles.calendarEvent} ${styles.calendarBlockedEvent}`}
                          style={{ top: `${Math.max(top, 0)}%`, height: `${Math.max(height, 2)}%` }}
                          title="Fora do expediente configurado da empresa"
                          aria-hidden
                        >
                          {height >= 6 ? (
                            <>
                              <p className={styles.scheduleTime}>Sem expediente</p>
                              <p className={styles.scheduleMeta}>Fora do horário da empresa</p>
                            </>
                          ) : null}
                        </div>
                      );
                    });
                  })()}
                  {canManage &&
                  !holidayLabelForDay(day) &&
                  businessDays.has(toTenantWeekday(day)) ? (
                    <>
                      <div
                        className={styles.calendarDayOverlay}
                        title="Clique: nova OS · Segure Shift e arraste: bloquear horário"
                        onPointerDown={(e) => handleOverlayPointerDown(e, day)}
                        onPointerMove={(e) => handleOverlayPointerMove(e, day)}
                        onPointerUp={(e) => handleOverlayPointerUp(e, day)}
                        onPointerCancel={handleOverlayPointerCancel}
                      />
                      {dragSelect?.dayKey === localDateKey(day) ? (() => {
                        const startMin = Math.min(dragSelect.anchorMinutes, dragSelect.currentMinutes);
                        const endMin = Math.max(dragSelect.anchorMinutes, dragSelect.currentMinutes);
                        const top = ((startMin - gridStartMinutes) / minutesPerDay) * 100;
                        const height = (Math.max(endMin - startMin, 15) / minutesPerDay) * 100;
                        const previewStart = dateFromAbsoluteMinutes(day, startMin);
                        const previewEnd = dateFromAbsoluteMinutes(day, Math.max(endMin, startMin + 15));
                        return (
                          <div
                            className={styles.calendarDragSelectPreview}
                            style={{ top: `${Math.max(top, 0)}%`, height: `${Math.max(height, 4)}%` }}
                          >
                            <p className={styles.calendarDragSelectPreviewLabel}>
                              {formatHourRange(previewStart.toISOString(), previewEnd.toISOString())}
                            </p>
                          </div>
                        );
                      })() : null}
                    </>
                  ) : null}
                  {visualBlocksInRange.map((block) => {
                    const clipped = clipUnavailabilityToDay(block, day);
                    if (!clipped) return null;
                    const weekday = toTenantWeekday(day);
                    const weekdayRule = weekdayHours[String(weekday)];
                    const visibleStartMin = weekdayRule
                      ? parseHmToMinutes(weekdayRule.start, companyStartMinutes)
                      : companyStartMinutes;
                    const visibleEndMin = weekdayRule
                      ? parseHmToMinutes(weekdayRule.end, companyEndMinutes)
                      : companyEndMinutes;
                    let startMinutes = clipped.starts.getHours() * 60 + clipped.starts.getMinutes();
                    let endMinutes = clipped.ends.getHours() * 60 + clipped.ends.getMinutes();
                    startMinutes = Math.max(startMinutes, visibleStartMin);
                    endMinutes = Math.min(endMinutes, visibleEndMin);
                    if (endMinutes <= startMinutes) return null;
                    const top = ((startMinutes - gridStartMinutes) / minutesPerDay) * 100;
                    const height = (Math.max(endMinutes - startMinutes, 15) / minutesPerDay) * 100;
                    const techName = technicianNameById.get(block.technician_id);
                    const display = unavailabilityDisplayMeta(block.reason);
                    return (
                      <div
                        key={`block-${block.id}-${localDateKey(day)}`}
                        className={`${styles.calendarEvent} ${styles.calendarEventBlock} ${
                          display.isFolga ? styles.calendarEventBlockFolga : ""
                        }`}
                        style={{ top: `${Math.max(top, 0)}%`, height: `${Math.max(height, 10)}%` }}
                        title={display.title}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canManage) return;
                          setBlockTimeEdit(block);
                          setBlockTimeOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && canManage) {
                            e.preventDefault();
                            setBlockTimeEdit(block);
                            setBlockTimeOpen(true);
                          }
                        }}
                      >
                        <p className={styles.scheduleTime}>
                          {formatHourRange(clipped.starts.toISOString(), clipped.ends.toISOString())}
                          <span className={styles.blockAgendaTag}> {display.tag}</span>
                        </p>
                        <p className={styles.scheduleMeta}>{ellipsis(display.title, 28)}</p>
                        {!technicianId && techName ? (
                          <p className={styles.scheduleMeta}>Técnico: {ellipsis(techName, 22)}</p>
                        ) : null}
                      </div>
                    );
                  })}
                  {(schedulesByDay.get(localDateKey(day)) ?? []).map((s) => {
                    const start = new Date(s.starts_at);
                    const end = new Date(s.ends_at);
                    const startMinutes = start.getHours() * 60 + start.getMinutes();
                    const endMinutes = end.getHours() * 60 + end.getMinutes();
                    const top = ((startMinutes - gridStartMinutes) / minutesPerDay) * 100;
                    const height = (Math.max(endMinutes - startMinutes, 15) / minutesPerDay) * 100;
                    const isConfirmed = String(s.status || "").toLowerCase() === "confirmed";
                    const isPmoc = Boolean(s.is_pmoc);
                    const showReminderAction =
                      canManage && whatsappModuleActive && !isPmoc && scheduleAllowsWhatsappReminder(s);
                    const showOsAction = !isPmoc && Boolean(s.service_order_id);
                    const showHoverActions = showReminderAction || showOsAction;
                    const sendingReminder = sendingReminderScheduleId === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`${styles.calendarEvent} ${showHoverActions ? styles.calendarEventWithActions : ""} ${isPmoc ? styles.calendarEventPmoc : ""} ${isConfirmed && !isPmoc ? styles.calendarEventConfirmed : ""}`}
                        style={{ top: `${Math.max(top, 0)}%`, height: `${Math.max(height, 8)}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (showHoverActions) return;
                          if (isPmoc) {
                            setSelectedPmoc(s);
                            return;
                          }
                          if (s.service_order_id) {
                            navigate(serviceOrderPath(ctx?.user.role, s.service_order_id));
                          }
                        }}
                        title={
                          isPmoc
                            ? "Compromisso PMOC (planejamento)"
                            : s.service_order_id
                              ? "Abrir OS"
                              : "Agendamento sem OS vinculada"
                        }
                        role={showHoverActions ? undefined : "button"}
                        tabIndex={showHoverActions ? -1 : 0}
                        onKeyDown={(e) => {
                          if (showHoverActions) return;
                          if (isPmoc) {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedPmoc(s);
                            }
                            return;
                          }
                          if ((e.key === "Enter" || e.key === " ") && s.service_order_id) {
                            e.preventDefault();
                            navigate(serviceOrderPath(ctx?.user.role, s.service_order_id));
                          }
                        }}
                      >
                        <div className={styles.calendarEventBody}>
                        <p className={styles.scheduleTime}>
                          {formatHourRange(s.starts_at, s.ends_at)} {isConfirmed ? "· Confirmado" : ""}
                          {isPmoc ? (
                            <span className={styles.pmocAgendaTag}> PMOC</span>
                          ) : null}
                        </p>
                        <p className={styles.scheduleMeta}>
                          {isPmoc ? "Visita PMOC planejada" : `OS #${s.service_order_id ?? "-"}`}
                        </p>
                        <p
                          className={styles.scheduleMeta}
                          title={s.client_name?.trim() ? s.client_name : `Cliente #${s.client_id}`}
                        >
                          Cliente: {ellipsis(s.client_name?.trim() ? s.client_name : `#${s.client_id}`, 24)}
                        </p>
                        {s.client_phone?.trim() ? (
                          <p className={styles.scheduleMeta}>Tel: {formatPhoneBr(s.client_phone)}</p>
                        ) : null}
                        {s.client_whatsapp?.trim() ? (
                          <p className={styles.scheduleMeta}>WhatsApp: {formatPhoneBr(s.client_whatsapp)}</p>
                        ) : null}
                        {s.client_address?.trim() ? (
                          isMobile ? (
                            <p className={`${styles.scheduleMeta} ${styles.scheduleAddressRow}`} title={s.client_address}>
                              <span className={styles.scheduleAddressPrefix}>Endereço: </span>
                              <a
                                href={googleMapsSearchUrl(s.client_address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.scheduleAddressLink}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {ellipsis(s.client_address, 36)}
                              </a>
                              <span className={styles.scheduleAddressSep} aria-hidden>
                                {" · "}
                              </span>
                              <a
                                href={wazeSearchUrl(s.client_address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.scheduleAddressLinkAlt}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Waze
                              </a>
                            </p>
                          ) : (
                            <p className={styles.scheduleMeta} title={s.client_address}>
                              Endereço: {ellipsis(s.client_address, 36)}
                            </p>
                          )
                        ) : null}
                        </div>
                        {showHoverActions ? (
                          <div
                            className={`${styles.calendarEventActions} ${actionsOpenLeft ? styles.calendarEventActionsLeft : ""} ${isMobile ? styles.calendarEventActionsVisible : ""}`}
                          >
                            {showOsAction ? (
                              <button
                                type="button"
                                className={styles.calendarEventActionBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(serviceOrderPath(ctx?.user.role, s.service_order_id!));
                                }}
                              >
                                Abrir OS
                              </button>
                            ) : null}
                            {showReminderAction ? (
                              <button
                                type="button"
                                className={`${styles.calendarEventActionBtn} ${styles.calendarEventActionBtnPrimary}`}
                                disabled={sendingReminder}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleSendScheduleReminder(s);
                                }}
                              >
                                {sendingReminder ? "Enviando…" : "Enviar lembrete"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </article>
              );
            })}
          </div>
          )}
            </div>
          </div>
        </section>
      ) : null}

      <PmocAgendaEventModal
        open={selectedPmoc != null}
        schedule={selectedPmoc}
        onClose={() => setSelectedPmoc(null)}
        onChanged={() => void refreshVisualAgenda()}
        canManage={canManage}
      />
      <AgendaBlockTimeModal
        open={blockTimeOpen}
        onClose={() => {
          setBlockTimeOpen(false);
          setBlockTimeEdit(null);
          setBlockDraftTimes(null);
        }}
        onSaved={() => void refreshVisualAgenda()}
        defaultTechnicianId={technicianId}
        editBlock={blockTimeEdit}
        initialStartsAt={blockDraftTimes?.startsAt}
        initialEndsAt={blockDraftTimes?.endsAt}
        canManage={canManage}
      />

    </div>
  );
}
