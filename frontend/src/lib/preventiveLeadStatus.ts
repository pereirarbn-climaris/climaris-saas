import type { PreventiveLead } from "../api/preventiveMaintenance";

export type PreventiveLeadUiStatus = "pendente" | "agendado" | "contato_realizado";

export type PreventiveLeadStatusMeta = {
  key: PreventiveLeadUiStatus;
  label: string;
  tone: "info" | "success" | "warning";
};

const STATUS_META: Record<PreventiveLeadUiStatus, PreventiveLeadStatusMeta> = {
  pendente: { key: "pendente", label: "Pendente", tone: "info" },
  agendado: { key: "agendado", label: "Agendado", tone: "success" },
  contato_realizado: { key: "contato_realizado", label: "Contato realizado", tone: "warning" },
};

/** Status operacional exibido na lista de interessados. */
export function preventiveLeadUiStatus(lead: PreventiveLead): PreventiveLeadUiStatus {
  if (lead.interest_kind === "schedule") return "agendado";
  if (lead.historico_servico_id != null) return "contato_realizado";
  return "pendente";
}

export function preventiveLeadStatusMeta(lead: PreventiveLead): PreventiveLeadStatusMeta {
  return STATUS_META[preventiveLeadUiStatus(lead)];
}

export function preventiveInterestKindLabel(kind: PreventiveLead["interest_kind"]): string {
  return kind === "more" ? "Quero saber mais" : "Agendar";
}

export function whatsappChatUrl(digits: string): string {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return "";
  const withCountry = clean.startsWith("55") ? clean : `55${clean}`;
  return `https://wa.me/${withCountry}`;
}

export function preventiveServiceOrderUrl(clientId: number): string {
  const params = new URLSearchParams();
  params.set("client_id", String(clientId));
  params.set("tipo", "preventiva");
  return `/app/service-orders/new?${params.toString()}`;
}
