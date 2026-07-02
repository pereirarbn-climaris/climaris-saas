import type { PreventiveItem } from "../api/preventiveMaintenance";
import { humanizeWhatsappSendError } from "./whatsappErrorMessages";

export type PreventiveCampaignBadge = {
  key: "agenda" | "mensagem_enviada" | "vencida" | "whatsapp_falhou";
  label: string;
  title?: string;
};

const BADGE_LABELS: Record<PreventiveCampaignBadge["key"], string> = {
  agenda: "Agenda",
  mensagem_enviada: "Mensagem enviada",
  vencida: "Vencida",
  whatsapp_falhou: "Falha no WhatsApp",
};

export function preventiveWhatsappFailureMessage(row: PreventiveItem): string | null {
  if (row.ultimo_whatsapp_status !== "failed") return null;
  const raw = row.ultimo_whatsapp_erro?.trim();
  if (!raw) return null;
  return humanizeWhatsappSendError(raw);
}

export function preventiveCampaignBadges(row: PreventiveItem): PreventiveCampaignBadge[] {
  const badges: PreventiveCampaignBadge[] = [];
  if (row.status_agenda) badges.push({ key: "agenda", label: BADGE_LABELS.agenda });
  if (row.status_mensagem_enviada) {
    badges.push({ key: "mensagem_enviada", label: BADGE_LABELS.mensagem_enviada });
  } else {
    const failureMessage = preventiveWhatsappFailureMessage(row);
    if (failureMessage) {
      badges.push({
        key: "whatsapp_falhou",
        label: BADGE_LABELS.whatsapp_falhou,
        title: failureMessage,
      });
    }
  }
  if (row.status_vencida) badges.push({ key: "vencida", label: BADGE_LABELS.vencida });
  return badges;
}

export function groupCampaignBadges(equipments: PreventiveItem[]): PreventiveCampaignBadge[] {
  const keys = new Set<PreventiveCampaignBadge["key"]>();
  let failureTitle: string | undefined;
  for (const row of equipments) {
    for (const badge of preventiveCampaignBadges(row)) {
      keys.add(badge.key);
      if (badge.key === "whatsapp_falhou" && badge.title) {
        failureTitle = badge.title;
      }
    }
  }
  const order: PreventiveCampaignBadge["key"][] = [
    "agenda",
    "mensagem_enviada",
    "whatsapp_falhou",
    "vencida",
  ];
  return order
    .filter((k) => keys.has(k))
    .map((k) => ({
      key: k,
      label: BADGE_LABELS[k],
      title: k === "whatsapp_falhou" ? failureTitle : undefined,
    }));
}

export function groupPreventiveWhatsappFailureMessage(equipments: PreventiveItem[]): string | null {
  for (const row of equipments) {
    const message = preventiveWhatsappFailureMessage(row);
    if (message) return message;
  }
  return null;
}

export function groupHasMessageSent(equipments: PreventiveItem[]): boolean {
  return equipments.some((row) => row.status_mensagem_enviada);
}
