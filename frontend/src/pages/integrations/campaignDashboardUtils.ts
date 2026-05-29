import type { Campaign } from "../../api/whatsappCampaigns";

export type SendSpeed = "fast" | "medium" | "slow";

export type SpeedIconKind = "zap" | "gauge" | "shield";

export const SPEED_OPTIONS: {
  value: SendSpeed;
  title: string;
  subtitle: string;
  delay: string;
  icon: SpeedIconKind;
}[] = [
  {
    value: "fast",
    title: "Rápida",
    subtitle: "Ideal para listas pequenas",
    delay: "1–2 s entre mensagens",
    icon: "zap",
  },
  {
    value: "medium",
    title: "Média",
    subtitle: "Equilíbrio segurança e tempo",
    delay: "5–8 s entre mensagens",
    icon: "gauge",
  },
  {
    value: "slow",
    title: "Lenta",
    subtitle: "Máxima proteção anti-ban",
    delay: "15–30 s entre mensagens",
    icon: "shield",
  },
];

export function defaultCampaignMessage() {
  return "Olá {nome_cliente}! Aqui é da {empresa}. Podemos ajudar com uma revisão preventiva?";
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.ceil(seconds)} s`;
  const min = Math.ceil(seconds / 60);
  return min < 60 ? `~${min} min` : `~${Math.round(min / 60)} h`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

export type StatusTone = "success" | "info" | "warning" | "neutral" | "danger";

export function campaignStatusMeta(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case "running":
      return { label: "Em envio", tone: "info" };
    case "completed":
      return { label: "Concluída", tone: "success" };
    case "completed_with_errors":
      return { label: "Concluída c/ falhas", tone: "warning" };
    case "failed":
      return { label: "Falhou", tone: "danger" };
    case "draft":
      return { label: "Rascunho", tone: "neutral" };
    case "scheduled":
      return { label: "Agendado", tone: "info" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export type ScheduleMode = "now" | "later";

export function formatScheduleSummary(mode: ScheduleMode, date: string, time: string): string {
  if (mode === "now") return "Disparo imediato";
  if (!date || !time) return "Defina data e hora no passo de agendamento";
  try {
    const dt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(dt.getTime())) return "Data ou hora inválida";
    return `Disparo programado para ${dt.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return "Data ou hora inválida";
  }
}

/** ISO UTC para API; null = disparo imediato. */
export function buildScheduledAtIso(mode: ScheduleMode, date: string, time: string): string | null {
  if (mode === "now") return null;
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export function isScheduledInFuture(mode: ScheduleMode, date: string, time: string): boolean {
  const iso = buildScheduledAtIso(mode, date, time);
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

export function defaultScheduleDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultScheduleTime(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

export function isoToLocalScheduleFields(iso: string): { date: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, time: `${h}:${min}` };
}

export function whatsappJobShowsScheduledBadge(job: {
  status: string;
  scheduled_for: string | null;
}): boolean {
  if (!job.scheduled_for) return false;
  const sf = new Date(job.scheduled_for);
  if (Number.isNaN(sf.getTime())) return false;
  if (!["pending", "queued"].includes(job.status)) return false;
  return sf.getTime() > Date.now();
}

export function formatWhatsappScheduledAt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sendProgressPct(campaign: Campaign): number {
  const total = Math.max(campaign.total_contacts, 0);
  if (total === 0) return campaign.status === "completed" ? 100 : 0;
  return Math.min(100, Math.round((campaign.sent_count / total) * 100));
}
