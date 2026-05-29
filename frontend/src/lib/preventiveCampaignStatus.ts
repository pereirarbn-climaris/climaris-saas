import type { PreventiveItem } from "../api/preventiveMaintenance";

export type PreventiveCampaignBadge = {
  key: "agenda" | "mensagem_enviada" | "vencida";
  label: string;
};

const BADGE_LABELS: Record<PreventiveCampaignBadge["key"], string> = {
  agenda: "Agenda",
  mensagem_enviada: "Mensagem enviada",
  vencida: "Vencida",
};

export function preventiveCampaignBadges(row: PreventiveItem): PreventiveCampaignBadge[] {
  const badges: PreventiveCampaignBadge[] = [];
  if (row.status_agenda) badges.push({ key: "agenda", label: BADGE_LABELS.agenda });
  if (row.status_mensagem_enviada) {
    badges.push({ key: "mensagem_enviada", label: BADGE_LABELS.mensagem_enviada });
  }
  if (row.status_vencida) badges.push({ key: "vencida", label: BADGE_LABELS.vencida });
  return badges;
}

export function groupCampaignBadges(equipments: PreventiveItem[]): PreventiveCampaignBadge[] {
  const keys = new Set<PreventiveCampaignBadge["key"]>();
  for (const row of equipments) {
    for (const badge of preventiveCampaignBadges(row)) {
      keys.add(badge.key);
    }
  }
  const order: PreventiveCampaignBadge["key"][] = ["agenda", "mensagem_enviada", "vencida"];
  return order.filter((k) => keys.has(k)).map((k) => ({ key: k, label: BADGE_LABELS[k] }));
}
