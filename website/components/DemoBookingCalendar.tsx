"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { fetchDemoCalendar, fetchDemoSlots, type DemoCalendarDay, type DemoSlot } from "@/lib/api";

type Props = {
  value: string | null;
  onChange: (startsAtIso: string) => void;
  required?: boolean;
  compact?: boolean;
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

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

function formatMonthTitle(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function formatSelectedDay(isoDay: string): string {
  return new Date(`${isoDay}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
}

function formatSelectedDayShort(isoDay: string): string {
  return new Date(`${isoDay}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
}

export function DemoBookingCalendar({ value, onChange, required = true, compact = false }: Props) {
  const [focusedMonth, setFocusedMonth] = useState(() => new Date());
  const [calendarDays, setCalendarDays] = useState<DemoCalendarDay[]>([]);
  const [daySlots, setDaySlots] = useState<DemoSlot[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthGrid = useMemo(() => monthGridDates(focusedMonth), [focusedMonth]);
  const dayMap = useMemo(() => new Map(calendarDays.map((d) => [d.date, d])), [calendarDays]);
  const currentMonth = focusedMonth.getMonth();

  const loadMonth = useCallback(async (anchor: Date) => {
    setLoadingMonth(true);
    setError(null);
    try {
      const data = await fetchDemoCalendar({
        year: anchor.getFullYear(),
        month: anchor.getMonth() + 1,
      });
      setCalendarDays(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o calendário.");
    } finally {
      setLoadingMonth(false);
    }
  }, []);

  useEffect(() => {
    void loadMonth(focusedMonth);
  }, [focusedMonth, loadMonth]);

  async function selectDay(dayKey: string, status: string) {
    if (status !== "available") return;
    setSelectedDay(dayKey);
    onChange("");
    setLoadingSlots(true);
    try {
      const slots = await fetchDemoSlots({ from: dayKey, days: 1 });
      setDaySlots(slots.filter((s) => s.starts_at.startsWith(dayKey)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar horários.");
      setDaySlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  if (error && calendarDays.length === 0) {
    return (
      <p className="rounded-btn border border-error/20 bg-error/5 px-4 py-3 text-sm text-error" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      <div
        className={`rounded-card border border-border bg-surface-elevated shadow-card ${compact ? "p-2.5" : "p-4"}`}
      >
        <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? "mb-2" : "mb-3"}`}>
          <p className={`font-semibold capitalize text-text ${compact ? "text-xs" : "text-sm"}`}>
            {formatMonthTitle(focusedMonth)}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-btn border border-border text-text-muted hover:text-text"
              aria-label="Mês anterior"
              onClick={() => setFocusedMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-btn border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text"
              onClick={() => setFocusedMonth(new Date())}
            >
              Hoje
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-btn border border-border text-text-muted hover:text-text"
              aria-label="Próximo mês"
              onClick={() => setFocusedMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-7 gap-0.5 ${compact ? "mb-1" : "mb-2"}`}>
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className={`text-center font-semibold uppercase tracking-wide text-text-muted ${compact ? "py-0.5 text-[0.6rem]" : "py-1 text-[0.7rem]"}`}
            >
              {wd}
            </div>
          ))}
        </div>

        <div className={`relative grid grid-cols-7 ${compact ? "gap-0.5" : "gap-1"}`}>
          {loadingMonth ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-btn bg-surface/80">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : null}
          {monthGrid.map((cell) => {
            const key = localDateKey(cell);
            const meta = dayMap.get(key);
            const inMonth = cell.getMonth() === currentMonth;
            const status = meta?.status ?? (inMonth ? "past" : "closed");
            const isSelected = selectedDay === key;
            const isAvailable = status === "available";
            const isToday = key === localDateKey(new Date());

            let cellClass = compact
              ? "flex min-h-[2.1rem] items-center justify-center rounded-btn border text-[0.65rem] transition "
              : "flex min-h-[2.75rem] items-center justify-center rounded-btn border text-xs transition ";
            if (!inMonth) cellClass += "opacity-35 ";
            if (isAvailable) {
              cellClass += "border-primary/25 bg-primary/10 text-primary hover:border-primary/50 hover:bg-primary/15 cursor-pointer ";
            } else {
              cellClass += "border-border/60 bg-surface text-text-muted cursor-default ";
            }
            if (isSelected) cellClass += "ring-2 ring-primary bg-primary/15 ";
            if (isToday && inMonth) cellClass += "font-bold ";

            return (
              <button
                key={key}
                type="button"
                disabled={!isAvailable}
                aria-label={
                  isAvailable
                    ? `Dia ${cell.getDate()} disponível`
                    : `Dia ${cell.getDate()} indisponível`
                }
                className={cellClass}
                onClick={() => void selectDay(key, status)}
              >
                <span className={compact ? "text-xs" : "text-sm"}>{cell.getDate()}</span>
              </button>
            );
          })}
        </div>

      </div>

      {selectedDay ? (
        <div className={`rounded-card border border-border bg-surface-elevated shadow-card ${compact ? "p-2.5" : "p-4"}`}>
          <p className={`mb-2 capitalize text-text ${compact ? "text-xs font-medium" : "label-field"}`}>
            {compact
              ? `${formatSelectedDayShort(selectedDay)} — horário ${required ? "*" : ""}`
              : `Horários em ${formatSelectedDay(selectedDay)} ${required ? "*" : ""}`}
          </p>
          {loadingSlots ? (
            <div className={`flex items-center gap-2 text-text-muted ${compact ? "text-xs" : "text-sm"}`}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando…
            </div>
          ) : daySlots.length === 0 ? (
            <p className={`text-text-muted ${compact ? "text-xs" : "text-sm"}`}>Nenhum horário livre neste dia.</p>
          ) : (
            <div className={`grid grid-cols-3 gap-1.5 ${compact ? "" : "sm:grid-cols-6"}`}>
              {daySlots.map((slot) => {
                const selected = value === slot.starts_at;
                return (
                  <button
                    key={slot.starts_at}
                    type="button"
                    className={`rounded-btn border font-medium transition ${
                      compact ? "px-1.5 py-1.5 text-xs" : "px-2 py-2 text-sm"
                    } ${
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-surface text-text hover:border-primary/40"
                    }`}
                    onClick={() => onChange(slot.starts_at)}
                  >
                    {formatTime(slot.starts_at)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <input type="hidden" name="scheduled_at" value={value ?? ""} required={required} />
    </div>
  );
}
