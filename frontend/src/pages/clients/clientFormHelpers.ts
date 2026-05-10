import {
  type ClientIeIndicator,
  type ClientOut,
  type ClientTaxIdKind,
  type ClientUpdatePayload,
} from "../../api/clients";
import type { CnpjLookupResult } from "../../api/cnpj";
import type { BudgetStatus } from "../../api/budgets";
import type { OrderStatus } from "../../api/serviceOrders";
import {
  digitsOnly,
  digitsOnlyPhoneForApi,
  formatCepInput,
  formatPhoneBrInput,
  formatTaxDocumentInput,
} from "../../lib/brMask";

export type FormState = {
  name: string;
  document: string;
  tax_id_kind: ClientTaxIdKind;
  phone: string;
  whatsapp: string;
  email: string;
  trade_name: string;
  state_registration: string;
  ie_indicator: "" | ClientIeIndicator;
  municipal_registration: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_district: string;
  address_city: string;
  address_state: string;
  address_postal_code: string;
};

export type EquipmentFormState = {
  tipo: "AR_CONDICIONADO";
  identificacao: string;
  categoria_instalacao: string;
  fabricante: string;
  modelo: string;
  modelo_evaporadora: string;
  modelo_condensadora: string;
  serial: string;
  capacidade_btu: string;
  capacidade_tr: string;
  tipo_gas: string;
  voltagem: string;
  tecnologia_ciclo: "" | "on_off" | "inverter";
  local_instalacao: string;
  ambiente_nome: string;
  ambiente_tipo: string;
  area_m2: string;
  ocupacao_fixa: string;
  ocupacao_flutuante: string;
  carga_termica_total: string;
  massa_gas_kg: string;
  corrente_nominal_a: string;
  filtro_tipo: string;
  filtro_quantidade: string;
  filtro_dimensoes: string;
  filtro_periodicidade_limpeza: string;
  ativo: boolean;
};

export type EquipmentDocumentFormState = {
  target_equipment_id: number | "";
  document_type: "pmoc" | "technical_report" | "hygiene_report";
  title: string;
  status: "draft" | "issued" | "signed" | "expired" | "cancelled";
  issued_at: string;
  valid_until: string;
  next_due_at: string;
  notes: string;
};

export type EquipmentDocumentFilters = {
  q: string;
  document_type: "" | "pmoc" | "technical_report" | "hygiene_report";
  status: "" | "draft" | "issued" | "signed" | "expired" | "cancelled";
  only_overdue: boolean;
};

export function formatEquipmentHistorySource(source: string): string {
  if (source === "ordem_concluida") return "OS concluída";
  if (source === "auto_split") return "Separação automática";
  if (source === "app") return "App";
  return source;
}

export function emptyForm(): FormState {
  return {
    name: "",
    document: "",
    tax_id_kind: "cnpj",
    phone: "",
    whatsapp: "",
    email: "",
    trade_name: "",
    state_registration: "",
    ie_indicator: "",
    municipal_registration: "",
    address_street: "",
    address_number: "",
    address_complement: "",
    address_district: "",
    address_city: "",
    address_state: "",
    address_postal_code: "",
  };
}

export function emptyEquipmentForm(): EquipmentFormState {
  return {
    tipo: "AR_CONDICIONADO",
    identificacao: "",
    categoria_instalacao: "",
    fabricante: "",
    modelo: "",
    modelo_evaporadora: "",
    modelo_condensadora: "",
    serial: "",
    capacidade_btu: "",
    capacidade_tr: "",
    tipo_gas: "",
    voltagem: "",
    tecnologia_ciclo: "",
    local_instalacao: "",
    ambiente_nome: "",
    ambiente_tipo: "",
    area_m2: "",
    ocupacao_fixa: "",
    ocupacao_flutuante: "",
    carga_termica_total: "",
    massa_gas_kg: "",
    corrente_nominal_a: "",
    filtro_tipo: "",
    filtro_quantidade: "",
    filtro_dimensoes: "",
    filtro_periodicidade_limpeza: "",
    ativo: true,
  };
}

export function emptyEquipmentDocumentForm(): EquipmentDocumentFormState {
  return {
    target_equipment_id: "",
    document_type: "pmoc",
    title: "",
    status: "draft",
    issued_at: "",
    valid_until: "",
    next_due_at: "",
    notes: "",
  };
}

export function emptyEquipmentDocumentFilters(): EquipmentDocumentFilters {
  return {
    q: "",
    document_type: "",
    status: "",
    only_overdue: false,
  };
}

export function clientHasPersistedAddress(c: ClientOut): boolean {
  const cepOk = digitsOnly(c.address_postal_code ?? "").length >= 8;
  const hasStreet = Boolean((c.address_street ?? "").trim());
  const hasCity = Boolean((c.address_city ?? "").trim());
  return cepOk || hasStreet || hasCity;
}

export function fromClient(c: ClientOut): FormState {
  const kind = (c.tax_id_kind === "cpf" ? "cpf" : "cnpj") as ClientTaxIdKind;
  return {
    name: c.name,
    document: formatTaxDocumentInput(c.document ?? "", kind),
    tax_id_kind: kind,
    phone: formatPhoneBrInput(c.phone ?? ""),
    whatsapp: formatPhoneBrInput(c.whatsapp ?? ""),
    email: c.email ?? "",
    trade_name: c.trade_name ?? "",
    state_registration: c.state_registration ?? "",
    ie_indicator: (c.ie_indicator === "1" || c.ie_indicator === "2" || c.ie_indicator === "9" ? c.ie_indicator : "") as
      | ""
      | ClientIeIndicator,
    municipal_registration: c.municipal_registration ?? "",
    address_street: c.address_street ?? "",
    address_number: c.address_number ?? "",
    address_complement: c.address_complement ?? "",
    address_district: c.address_district ?? "",
    address_city: c.address_city ?? "",
    address_state: c.address_state ?? "",
    address_postal_code: formatCepInput(c.address_postal_code ?? ""),
  };
}

export function mergeCnpjLookup(prev: FormState, lu: CnpjLookupResult, mergeAddress = true): FormState {
  if (!mergeAddress) {
    return {
      ...prev,
      name: lu.company_name.trim() || prev.name,
      trade_name:
        (lu.trade_name && lu.trade_name.trim()) || lu.company_name.trim() || prev.trade_name,
    };
  }
  const a = lu.address;
  const zipDigits = a?.zip ? digitsOnly(a.zip).slice(0, 8) : "";
  return {
    ...prev,
    name: lu.company_name.trim() || prev.name,
    trade_name:
      (lu.trade_name && lu.trade_name.trim()) || lu.company_name.trim() || prev.trade_name,
    address_street: a?.street ?? prev.address_street,
    address_number: a?.number ?? prev.address_number,
    address_complement: a?.details ?? prev.address_complement,
    address_district: a?.district ?? prev.address_district,
    address_city: a?.city ?? prev.address_city,
    address_state: a?.state ? a.state.toUpperCase().slice(0, 2) : prev.address_state,
    address_postal_code: zipDigits ? formatCepInput(zipDigits) : prev.address_postal_code,
  };
}

export function buildUpdatePayload(f: FormState): ClientUpdatePayload {
  const documentDigits = digitsOnly(f.document);
  const payload: ClientUpdatePayload = {
    name: f.name.trim(),
    tax_id_kind: f.tax_id_kind,
    phone: digitsOnlyPhoneForApi(f.phone) || null,
    whatsapp: digitsOnlyPhoneForApi(f.whatsapp) || null,
    email: f.email.trim() || null,
    trade_name: f.trade_name.trim() || null,
    state_registration: f.state_registration.trim() || null,
    ie_indicator: f.ie_indicator ? f.ie_indicator : null,
    municipal_registration: f.municipal_registration.trim() || null,
    address_street: f.address_street.trim() || null,
    address_number: f.address_number.trim() || null,
    address_complement: f.address_complement.trim() || null,
    address_district: f.address_district.trim() || null,
    address_city: f.address_city.trim() || null,
    address_state: f.address_state.trim() ? f.address_state.trim().toUpperCase().slice(0, 2) : null,
    address_postal_code: digitsOnly(f.address_postal_code).slice(0, 8) || null,
    address_country: "Brasil",
  };
  if (documentDigits) {
    payload.document = documentDigits;
  }
  return payload;
}

export function budgetStatusLabel(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    draft: "Rascunho",
    sent: "Enviado",
    approved: "Aprovado",
    rejected: "Reprovado",
    expired: "Expirado",
  };
  return map[status] ?? status;
}

export function serviceOrderStatusLabel(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    open: "Aberta",
    approved: "Aprovada",
    scheduled: "Agendada",
    in_progress: "Em andamento",
    done: "Concluída",
    cancelled: "Cancelada",
  };
  return map[status] ?? status;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
