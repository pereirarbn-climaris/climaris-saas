import { humanizeWhatsappSendError } from "./whatsappErrorMessages";

export const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  service_order_created: "Nova OS",
  service_order_scheduled: "Agendamento",
  service_order_started: "Em andamento",
  service_order_done: "Concluída",
  service_order_cancelled: "Cancelada",
  budget_approved: "Orçamento",
  finance_payment_received: "Financeiro",
  whatsapp_send_failed: "WhatsApp",
  platform_announcement: "Climaris",
  system: "Sistema",
};

export function notificationKindLabel(kind: string): string {
  return NOTIFICATION_KIND_LABELS[kind] ?? kind;
}

function humanizeLegacyWhatsappFailureBody(body: string): string {
  return humanizeWhatsappSendError(body);
}

export { humanizeWhatsappSendError } from "./whatsappErrorMessages";

export function formatNotificationBody(notification: { kind: string; body: string }): string {
  if (notification.kind !== "whatsapp_send_failed") return notification.body;
  return humanizeLegacyWhatsappFailureBody(notification.body);
}

export function formatNotificationRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} d`;
  return formatNotificationDate(iso);
}

export function formatNotificationDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export type NotificationDateFilter = "all" | "7d" | "30d" | "90d";

export function notificationDateFilterRange(filter: NotificationDateFilter): {
  fromDate?: string;
  toDate?: string;
} {
  if (filter === "all") return {};
  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);
  return { fromDate: from.toISOString().slice(0, 10) };
}
