import type {
  Budget,
  ClientData,
  ClientRegime,
  Equipment,
  HistoryItem,
  PMOCData,
  ServiceOrder,
} from "../components/v0-ui/clients";
import type { ClientAuditEntryOut, ClientCreatePayload, ClientOut, ClientUpdatePayload, EquipmentOut } from "../api/clients";
import type { BudgetOut } from "../api/budgets";
import type { PmocPlanOut } from "../api/pmoc";
import type { ServiceOrderOut } from "../api/serviceOrders";
import type { CnpjLookupResult } from "../api/cnpj";
import { digitsOnly, formatCepInput, formatPhoneBrInput, formatTaxDocumentInput } from "./brMask";

function mapOrderStatus(status: string): ServiceOrder["status"] {
  const m: Record<string, ServiceOrder["status"]> = {
    open: "pendente",
    approved: "pendente",
    scheduled: "agendada",
    in_progress: "em_andamento",
    done: "concluida",
    cancelled: "cancelada",
  };
  return m[status] ?? "pendente";
}

function mapBudgetStatus(status: string): Budget["status"] {
  const m: Record<string, Budget["status"]> = {
    draft: "rascunho",
    sent: "enviado",
    approved: "aprovado",
    rejected: "recusado",
    expired: "expirado",
  };
  return m[status] ?? "rascunho";
}

function orderTotal(order: ServiceOrderOut): number {
  const services = order.service_items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const products = order.product_items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  return Math.max(0, services + products - (order.discount_amount || 0));
}

function mapEquipmentTipo(categoria?: string | null): Equipment["tipo"] {
  const c = (categoria ?? "").toLowerCase();
  if (c.includes("cassete")) return "cassete";
  if (c.includes("piso")) return "piso_teto";
  if (c.includes("janela")) return "janela";
  if (c.includes("multi")) return "multi_split";
  if (c.includes("vrf")) return "vrf";
  return "split";
}

export function clientOutToViewData(c: ClientOut): ClientData {
  const type = c.tax_id_kind === "cpf" ? "pf" : "pj";
  let regime: ClientRegime = "regular";
  if (c.optante_mei) regime = "mei";
  return {
    id: String(c.id),
    type,
    razaoSocial: c.name,
    nomeFantasia: c.trade_name ?? undefined,
    documento: formatTaxDocumentInput(c.document ?? "", type === "pf" ? "cpf" : "cnpj"),
    regime,
    whatsapp: formatPhoneBrInput(c.whatsapp ?? ""),
    telefone: formatPhoneBrInput(c.phone ?? ""),
    email: c.email ?? "",
    contactPersonName: c.contact_person_name ?? undefined,
    stateRegistration: c.state_registration ?? undefined,
    ieIndicator: c.ie_indicator ?? undefined,
    municipalRegistration: c.municipal_registration ?? undefined,
    addressIbgeCode: digitsOnly(c.address_ibge_code ?? "").slice(0, 7) || undefined,
    preventiveCampaignOptOut: Boolean(c.preventive_campaign_opt_out),
    isActive: c.is_active !== false,
    isVerifiedCnpj: Boolean(c.is_verified_cnpj),
    endereco: {
      cep: formatCepInput(c.address_postal_code ?? ""),
      logradouro: c.address_street ?? "",
      numero: c.address_number ?? "",
      complemento: c.address_complement ?? "",
      bairro: c.address_district ?? "",
      cidade: c.address_city ?? "",
      estado: c.address_state ?? "",
    },
  };
}

export function emptyViewData(): ClientData {
  return {
    type: "pj",
    razaoSocial: "",
    documento: "",
    regime: "regular",
    whatsapp: "",
    telefone: "",
    email: "",
    isActive: true,
    preventiveCampaignOptOut: false,
    endereco: {},
  };
}

export function mergeViewData(base: ClientData, patch: Partial<ClientData>): ClientData {
  return {
    ...base,
    ...patch,
    endereco: { ...base.endereco, ...patch.endereco },
  };
}

export function clientHasPersistedAddressFromView(data: ClientData): boolean {
  const cepOk = digitsOnly(data.endereco?.cep ?? "").length >= 8;
  const hasStreet = Boolean((data.endereco?.logradouro ?? "").trim());
  const hasCity = Boolean((data.endereco?.cidade ?? "").trim());
  return cepOk || hasStreet || hasCity;
}

export function mergeCnpjLookupToViewData(
  prev: ClientData,
  lu: CnpjLookupResult,
  mergeAddress = true,
): ClientData {
  const nextRegime: ClientRegime =
    typeof lu.optante_mei === "boolean" ? (lu.optante_mei ? "mei" : "regular") : (prev.regime ?? "regular");
  const docFormatted =
    lu.tax_id && digitsOnly(lu.tax_id).length === 14
      ? formatTaxDocumentInput(lu.tax_id, "cnpj")
      : prev.documento;
  const verifiedPatch = { isVerifiedCnpj: true as const, documento: docFormatted };
  if (!mergeAddress) {
    return {
      ...prev,
      ...verifiedPatch,
      razaoSocial: lu.company_name.trim() || prev.razaoSocial,
      nomeFantasia: (lu.trade_name && lu.trade_name.trim()) || lu.company_name.trim() || prev.nomeFantasia,
      regime: nextRegime,
    };
  }
  const a = lu.address;
  const zipDigits = a?.zip ? digitsOnly(a.zip).slice(0, 8) : "";
  return {
    ...prev,
    ...verifiedPatch,
    razaoSocial: lu.company_name.trim() || prev.razaoSocial,
    nomeFantasia: (lu.trade_name && lu.trade_name.trim()) || lu.company_name.trim() || prev.nomeFantasia,
    regime: nextRegime,
    endereco: {
      ...prev.endereco,
      logradouro: a?.street ?? prev.endereco?.logradouro,
      numero: a?.number ?? prev.endereco?.numero,
      complemento: a?.details ?? prev.endereco?.complemento,
      bairro: a?.district ?? prev.endereco?.bairro,
      cidade: a?.city ?? prev.endereco?.cidade,
      estado: a?.state ? a.state.toUpperCase().slice(0, 2) : prev.endereco?.estado,
      cep: zipDigits ? formatCepInput(zipDigits) : prev.endereco?.cep,
    },
  };
}

export function viewDataToCreatePayload(data: ClientData): ClientCreatePayload {
  const tax_id_kind = data.type === "pf" ? "cpf" : "cnpj";
  const document = digitsOnly(data.documento);
  const ibge = digitsOnly(data.addressIbgeCode ?? "").slice(0, 7);
  const base: ClientCreatePayload = {
    name: data.razaoSocial.trim(),
    tax_id_kind,
    phone: digitsOnly(data.telefone ?? "") || undefined,
    whatsapp: digitsOnly(data.whatsapp ?? "") || undefined,
    email: data.email?.trim() || undefined,
    trade_name: data.nomeFantasia?.trim() || undefined,
    address_street: data.endereco?.logradouro?.trim() || undefined,
    address_number: data.endereco?.numero?.trim() || undefined,
    address_complement: data.endereco?.complemento?.trim() || undefined,
    address_district: data.endereco?.bairro?.trim() || undefined,
    address_city: data.endereco?.cidade?.trim() || undefined,
    address_state: data.endereco?.estado?.trim()?.toUpperCase().slice(0, 2) || undefined,
    address_postal_code: digitsOnly(data.endereco?.cep ?? "").slice(0, 8) || undefined,
    address_country: "Brasil",
    ...(ibge.length === 7 ? { address_ibge_code: ibge } : {}),
    preventive_campaign_opt_out: Boolean(data.preventiveCampaignOptOut),
    is_active: data.isActive !== false,
    ...(data.isVerifiedCnpj ? { is_verified_cnpj: true } : {}),
  };
  if (document) base.document = document;
  if (tax_id_kind === "cnpj") {
    base.optante_mei = data.regime === "mei";
    base.contact_person_name = data.contactPersonName?.trim() || undefined;
    base.state_registration = data.stateRegistration?.trim() || undefined;
    base.ie_indicator = (data.ieIndicator as "1" | "2" | "9" | undefined) || undefined;
    base.municipal_registration = data.municipalRegistration?.trim() || undefined;
  } else {
    base.optante_mei = false;
  }
  return base;
}

export function viewDataToUpdatePayload(data: ClientData): ClientUpdatePayload {
  const create = viewDataToCreatePayload(data);
  return {
    ...create,
    phone: create.phone ?? null,
    whatsapp: create.whatsapp ?? null,
    email: create.email ?? null,
    trade_name: create.trade_name ?? null,
    address_street: create.address_street ?? null,
    address_number: create.address_number ?? null,
    address_complement: create.address_complement ?? null,
    address_district: create.address_district ?? null,
    address_city: create.address_city ?? null,
    address_state: create.address_state ?? null,
    address_postal_code: create.address_postal_code ?? null,
    address_ibge_code: create.address_ibge_code ?? null,
    contact_person_name: create.contact_person_name ?? null,
    state_registration: create.state_registration ?? null,
    ie_indicator: create.ie_indicator ?? null,
    municipal_registration: create.municipal_registration ?? null,
    ...(create.document ? { document: create.document } : {}),
  };
}

export function mapEquipmentsToView(rows: EquipmentOut[]): Equipment[] {
  return rows.map((e) => ({
    id: String(e.id),
    marca: e.fabricante?.trim() || e.identificacao?.trim() || "—",
    modelo: e.modelo?.trim() || e.identificacao?.trim() || "—",
    capacidadeBtu: e.capacidade_btu ?? 0,
    tipo: mapEquipmentTipo(e.categoria_instalacao),
    local: e.local_instalacao?.trim() || e.ambiente_nome?.trim() || "—",
    ultimaManutencao: undefined,
    status: e.ativo ? "ativo" : "inativo",
  }));
}

export function mapOrdersToView(rows: ServiceOrderOut[]): ServiceOrder[] {
  return rows.map((o) => ({
    id: String(o.id),
    numero: `OS-${o.id}`,
    descricao: o.title,
    status: mapOrderStatus(o.status),
    valor: orderTotal(o),
    data: o.schedule?.starts_at ?? new Date().toISOString(),
    tecnico: o.assigned_technician_name ?? undefined,
  }));
}

export function mapBudgetsToView(rows: BudgetOut[]): Budget[] {
  return rows.map((b) => {
    const services = b.service_items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const products = b.product_items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    return {
      id: String(b.id),
      numero: `ORC-${b.id}`,
      descricao: b.observation?.trim() || `Orçamento #${b.id}`,
      status: mapBudgetStatus(b.status),
      valor: services + products,
      data: b.created_at,
      validade: b.validity_days ? undefined : undefined,
    };
  });
}

export function mapAuditToHistory(rows: ClientAuditEntryOut[]): HistoryItem[] {
  return rows.map((row) => ({
    id: String(row.id),
    type: "nota",
    title: row.action,
    description: JSON.stringify(row.changes),
    date: row.created_at,
    user: row.user_name ?? undefined,
  }));
}

export function mapPmocPlansToView(plans: PmocPlanOut[]): PMOCData | undefined {
  if (!plans.length) {
    return { status: "sem_contrato" };
  }
  const active = plans.find((p) => p.status === "active") ?? plans[0]!;
  const statusMap: Record<string, PMOCData["status"]> = {
    active: "ativo",
    draft: "pendente",
    inactive: "pendente",
    archived: "vencido",
  };
  return {
    id: String(active.id),
    status: statusMap[active.status] ?? "pendente",
    contrato: active.title,
    vigenciaInicio: active.activated_at ?? active.created_at,
    vigenciaFim: active.deactivated_at ?? undefined,
    responsavelTecnico: active.responsible_name ?? undefined,
    artNumero: active.art_number ?? undefined,
    relatorios: [],
  };
}
