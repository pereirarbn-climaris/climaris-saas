"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchDemoSlots, type DemoSlot } from "@/lib/api";

type Props = {
  value: string | null;
  onChange: (startsAtIso: string) => void;
  required?: boolean;
};

function groupByDay(slots: DemoSlot[]): Map<string, DemoSlot[]> {
  const map = new Map<string, DemoSlot[]>();
  for (const slot of slots) {
    const dayKey = slot.starts_at.slice(0, 10);
    const list = map.get(dayKey) ?? [];
    list.push(slot);
    map.set(dayKey, list);
  }
  return map;
}

function formatDayLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function DemoSlotPicker({ value, onChange, required = true }: Props) {
  const [slots, setSlots] = useState<DemoSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchDemoSlots({ days: 21 });
        if (cancelled) return;
        setSlots(data);
        if (data.length > 0) {
          setSelectedDay(data[0]!.starts_at.slice(0, 10));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar horários.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => groupByDay(slots), [slots]);
  const dayKeys = useMemo(() => [...grouped.keys()], [grouped]);
  const daySlots = selectedDay ? grouped.get(selectedDay) ?? [] : [];

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-btn border border-border bg-surface px-4 py-6 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Carregando horários disponíveis…
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-btn border border-error/20 bg-error/5 px-4 py-3 text-sm text-error" role="alert">
        {error}
      </p>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-btn border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        Não há horários disponíveis no momento. Entre em contato pelo e-mail contato@climaris.com.br.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="label-field mb-2">
          Escolha o dia {required ? "*" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {dayKeys.map((day) => (
            <button
              key={day}
              type="button"
              className={`rounded-btn border px-3 py-2 text-sm capitalize transition ${
                selectedDay === day
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border bg-surface text-text-muted hover:border-primary/40"
              }`}
              onClick={() => setSelectedDay(day)}
            >
              {formatDayLabel(day)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label-field mb-2">Horário (Brasília) {required ? "*" : ""}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {daySlots.map((slot) => {
            const selected = value === slot.starts_at;
            return (
              <button
                key={slot.starts_at}
                type="button"
                className={`rounded-btn border px-2 py-2 text-sm font-medium transition ${
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
      </div>

      {required && !value ? (
        <p className="text-xs text-text-muted">Selecione um horário para confirmar a demonstração.</p>
      ) : null}

      <input type="hidden" name="scheduled_at" value={value ?? ""} required={required} />
    </div>
  );
}
