import { apiUrl } from "../lib/apiUrl";
import { clampApiLimit } from "../lib/apiPagination";
import { getAccessToken } from "../lib/authStorage";
export type ClientTaxIdKind = "cpf" | "cnpj";

export type ClientIeIndicator = "1" | "2" | "9";
export type EquipmentType = "AR_CONDICIONADO";

export type ClientOut = {
  id: number;
  tenant_id: number;
  name: string;
  document: string | null;
  tax_id_kind: string;
  optante_mei: boolean;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  trade_name: string | null;
  contact_person_name: string | null;
  state_registration: string | null;
  ie_indicator: string | null;
  municipal_registration: string | null;
  rg?: string | null;
  birth_date?: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal_code: string | null;
  address_country: string;
  address_ibge_code: string | null;
  preventive_campaign_opt_out: boolean;
  is_active: boolean;
  is_verified_cnpj?: boolean;
  last_cnpj_commercial_update?: string | null;
  main_activity_code?: string | null;
  main_activity_description?: string | null;
  legal_nature?: string | null;
  registration_status?: string | null;
  founded_at?: string | null;
  notes?: string | null;
  tags?: string[];
  created_at: string;
};

export type ClientSiteType = "matriz" | "filial" | "unidade_operacional" | "local_instalacao" | "sem_cnpj";

export type ClientSiteOut = {
  id: number;
  client_id: number;
  name: string;
  site_type: ClientSiteType;
  nickname: string | null;
  contact_name: string | null;
  responsible_role: string | null;
  phone: string | null;
  email: string | null;
  has_own_document: boolean;
  document: string | null;
  legal_name: string | null;
  trade_name: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  reference_point: string | null;
  has_equipment: boolean;
  participates_pmoc: boolean;
  use_main_contacts: boolean;
  use_main_billing_address: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

export type ClientSitePayload = {
  name: string;
  site_type?: ClientSiteType;
  nickname?: string;
  contact_name?: string;
  responsible_role?: string;
  phone?: string;
  email?: string;
  has_own_document?: boolean;
  document?: string;
  legal_name?: string;
  trade_name?: string;
  state_registration?: string;
  municipal_registration?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  reference_point?: string;
  has_equipment?: boolean;
  participates_pmoc?: boolean;
  use_main_contacts?: boolean;
  use_main_billing_address?: boolean;
  is_active?: boolean;
  notes?: string;
};

export type ClientCnpjCommercialRefreshResult = {
  client: ClientOut;
  lookup: import("./cnpj").CnpjCommercialResult;
};

export type ClientCreatePayload = {
  name: string;
  document?: string;
  tax_id_kind?: ClientTaxIdKind;
  optante_mei?: boolean;
  phone?: string;
  whatsapp?: string;
  email?: string;
  trade_name?: string;
  contact_person_name?: string;
  state_registration?: string;
  ie_indicator?: ClientIeIndicator;
  municipal_registration?: string;
  rg?: string;
  birth_date?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_district?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  address_country?: string;
  address_ibge_code?: string;
  preventive_campaign_opt_out?: boolean;
  is_active?: boolean;
  is_verified_cnpj?: boolean;
  main_activity_code?: string;
  main_activity_description?: string;
  legal_nature?: string;
  registration_status?: string;
  founded_at?: string;
  notes?: string;
  tags?: string[];
};

export type EquipmentOut = {
  id: number;
  client_id: number;
  client_site_id?: number | null;
  public_token?: string;
  tipo: EquipmentType;
  identificacao: string;
  fabricante: string | null;
  modelo: string | null;
  serial: string | null;
  capacidade_btu: number | null;
  capacidade_tr: number | null;
  categoria_instalacao: string | null;
  modelo_evaporadora: string | null;
  modelo_condensadora: string | null;
  tipo_gas: string | null;
  voltagem: string | null;
  tecnologia_ciclo: "on_off" | "inverter" | null;
  local_instalacao: string | null;
  installation_reference: string | null;
  ambiente_nome: string | null;
  ambiente_tipo: string | null;
  area_m2: number | null;
  ocupacao_fixa: number | null;
  ocupacao_flutuante: number | null;
  carga_termica_total: string | null;
  massa_gas_kg: number | null;
  corrente_nominal_a: number | null;
  filtro_tipo: string | null;
  filtro_quantidade: number | null;
  filtro_dimensoes: string | null;
  filtro_periodicidade_limpeza: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type EquipmentCreatePayload = {
  tipo: EquipmentType;
  identificacao: string;
  fabricante?: string;
  modelo?: string;
  serial?: string;
  capacidade_btu?: number;
  capacidade_tr?: number;
  categoria_instalacao?: string;
  modelo_evaporadora?: string;
  modelo_condensadora?: string;
  tipo_gas?: string;
  voltagem?: string;
  tecnologia_ciclo?: "on_off" | "inverter";
  local_instalacao?: string;
  installation_reference?: string;
  ambiente_nome?: string;
  ambiente_tipo?: string;
  area_m2?: number;
  ocupacao_fixa?: number;
  ocupacao_flutuante?: number;
  carga_termica_total?: string;
  massa_gas_kg?: number;
  corrente_nominal_a?: number;
  filtro_tipo?: string;
  filtro_quantidade?: number;
  filtro_dimensoes?: string;
  filtro_periodicidade_limpeza?: string;
  ativo?: boolean;
};

export type EquipmentUpdatePayload = Partial<EquipmentCreatePayload> & { ativo?: boolean };
export type EquipmentHistoryRowOut = {
  changed_at: string;
  source: string;
  previous_equipment_id: number | null;
  new_equipment_id: number | null;
  service_order_id: number;
  service_item_id: number;
  service_name: string | null;
  changed_by_user_id: number | null;
  changed_by_user_name: string | null;
  service_order_number?: string | null;
  order_status?: string | null;
  order_status_label?: string | null;
  service_type?: string | null;
  order_tipo_servico?: string | null;
  technician_name?: string | null;
  checklist_items?: EquipmentChecklistItemOut[];
  is_preventive?: boolean;
};

export type EquipmentChecklistItemOut = {
  id?: string | null;
  descricao: string;
  status: string;
};
export type ClientServiceItemLinkRowOut = {
  service_order_id: number;
  service_item_id: number;
  service_id: number;
  service_name: string;
  order_status: string;
  equipment_id: number | null;
};

export type EquipmentDocumentType = "pmoc" | "technical_report" | "hygiene_report";
export type EquipmentDocumentStatus = "draft" | "issued" | "signed" | "expired" | "cancelled";

export type EquipmentDocumentOut = {
  id: number;
  tenant_id: number;
  equipment_id: number;
  service_order_id: number | null;
  responsible_user_id: number | null;
  technician_id: number | null;
  document_type: EquipmentDocumentType;
  status: EquipmentDocumentStatus;
  document_number: number;
  title: string;
  issued_at: string | null;
  valid_until: string | null;
  next_due_at: string | null;
  notes: string | null;
  schema_version: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** Lista agregada na ficha do cliente (documento + qual equipamento). */
export type EquipmentDocumentWithEquipmentOut = EquipmentDocumentOut & {
  equipment_identificacao: string;
};

export type EquipmentDocumentCreatePayload = {
  document_type: EquipmentDocumentType;
  title: string;
  status?: EquipmentDocumentStatus;
  issued_at?: string;
  valid_until?: string;
  next_due_at?: string;
  service_order_id?: number;
  technician_id?: number;
  notes?: string;
  schema_version?: string;
  payload?: Record<string, unknown>;
};

export type EquipmentDocumentAttachmentOut = {
  id: number;
  document_id: number;
  file_type: string;
  file_name: string | null;
  file_s3_key: string | null;
  file_url: string | null;
  uploaded_by_user_id: number | null;
  created_at: string;
};

export type EquipmentDocumentEventOut = {
  id: number;
  document_id: number;
  event_type: string;
  actor_user_id: number | null;
  metadata_json: string | null;
  created_at: string;
};

/** `null` = limpar o campo no servidor (PUT parcial com campo explícito). */
export type ClientUpdatePayload = {
  name?: string;
  document?: string;
  tax_id_kind?: ClientTaxIdKind;
  optante_mei?: boolean;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  trade_name?: string | null;
  contact_person_name?: string | null;
  state_registration?: string | null;
  ie_indicator?: ClientIeIndicator | null;
  municipal_registration?: string | null;
  rg?: string | null;
  birth_date?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_district?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
  address_ibge_code?: string | null;
  preventive_campaign_opt_out?: boolean;
  is_active?: boolean;
  is_verified_cnpj?: boolean;
  main_activity_code?: string | null;
  main_activity_description?: string | null;
  legal_nature?: string | null;
  registration_status?: string | null;
  founded_at?: string | null;
  notes?: string | null;
  tags?: string[];
};

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function errorMessage(body: unknown, fallback: string, status: number): string {
  if (body && typeof body === "object") {
    const o = body as { error?: { message?: string; details?: unknown }; detail?: unknown };
    const detailsList = o.error?.details;
    if (Array.isArray(detailsList) && detailsList.length > 0) {
      const row = detailsList[0] as { msg?: string };
      if (typeof row.msg === "string" && row.msg.trim()) return row.msg.trim();
    }
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
    const d = o.detail;
    if (typeof d === "string") {
      const lower = d.toLowerCase();
      if (lower.includes("telefone")) return "Já existe um cliente com este telefone nesta empresa.";
      if (lower.includes("cpf/cnpj") || lower.includes("document")) {
        return "Já existe um cliente com este CPF/CNPJ nesta empresa.";
      }
      return d;
    }
  }
  if (status === 404) return "Cliente não encontrado.";
  if (status === 409) return "Já existe cliente com este telefone ou documento nesta empresa.";
  return fallback;
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export type ClientStatusFilter = "active" | "inactive" | "all";

export type ClientListSortKey = "name" | "email" | "whatsapp";
export type ClientListSortDir = "asc" | "desc";

export type ClientCountResult = {
  total: number;
  empresas: number;
  pessoas: number;
  ativos: number;
};

export type ClientDuplicateCheckResult = {
  document_exists: boolean;
  whatsapp_exists: boolean;
};

export async function listClients(params?: {
  q?: string;
  skip?: number;
  limit?: number;
  status?: ClientStatusFilter;
  sortKey?: ClientListSortKey;
  sortDir?: ClientListSortDir;
}): Promise<ClientOut[]> {
  const q = params?.q?.trim();
  const skip = params?.skip ?? 0;
  const limit = clampApiLimit(params?.limit, 50);
  const sp = new URLSearchParams();
  sp.set("skip", String(skip));
  sp.set("limit", String(limit));
  if (params?.status) sp.set("status", params.status);
  if (params?.sortKey) sp.set("sort_key", params.sortKey);
  if (params?.sortDir) sp.set("sort_dir", params.sortDir);
  if (q) sp.set("q", q);
  const response = await fetch(apiUrl(`/api/v1/clients?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar clientes.", response.status));
  }
  return body as ClientOut[];
}

/** Lista todos os clientes que casam com o filtro (várias requisições se necessário; a API aceita no máximo 200 por página). */
export async function listClientsAll(params?: {
  q?: string;
  status?: ClientStatusFilter;
}): Promise<ClientOut[]> {

  const PAGE = 200;
  const MAX_PAGES = 500;
  const all: ClientOut[] = [];
  for (let skip = 0, i = 0; i < MAX_PAGES; skip += PAGE, i += 1) {
    const page = await listClients({ ...params, skip, limit: PAGE });
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

export async function getClient(clientId: number): Promise<ClientOut> {

  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o cliente.", response.status));
  }
  return body as ClientOut;
}

export type ClientAuditEntryOut = {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  changes: Record<string, unknown>;
  created_at: string;
};

export type ClientImportSummaryOut = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export async function countClients(params?: {
  q?: string;
  status?: ClientStatusFilter;
}): Promise<ClientCountResult> {

  const sp = new URLSearchParams();
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.status) sp.set("status", params.status);
  const response = await fetch(apiUrl(`/api/v1/clients/count?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível contar clientes.", response.status));
  const data = body as ClientCountResult;
  return {
    total: data.total,
    empresas: data.empresas ?? 0,
    pessoas: data.pessoas ?? 0,
    ativos: data.ativos ?? 0,
  };
}

export async function checkClientDuplicate(params: {
  document?: string;
  whatsapp?: string;
  excludeClientId?: number;
}): Promise<ClientDuplicateCheckResult> {
  const sp = new URLSearchParams();
  if (params.document?.trim()) sp.set("document", params.document.trim());
  if (params.whatsapp?.trim()) sp.set("whatsapp", params.whatsapp.trim());
  if (params.excludeClientId != null) sp.set("exclude_client_id", String(params.excludeClientId));
  const qs = sp.toString();
  const response = await fetch(apiUrl(`/api/v1/clients/check-duplicate${qs ? `?${qs}` : ""}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível validar duplicidade de cliente.", response.status));
  }
  return body as ClientDuplicateCheckResult;
}

export async function exportClientsCsv(params?: { status?: ClientStatusFilter }): Promise<Blob> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  const qs = sp.toString();
  const response = await fetch(apiUrl(`/api/v1/clients/export${qs ? `?${qs}` : ""}`), { headers: bearer() });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errorMessage(body, "Não foi possível exportar.", response.status));
  }
  return response.blob();
}

export async function importClientsCsv(file: File): Promise<ClientImportSummaryOut> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.append("file", file);
  const response = await fetch(apiUrl("/api/v1/clients/import"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Importação falhou.", response.status));
  return body as ClientImportSummaryOut;
}

export async function listClientAudit(clientId: number, limit?: number): Promise<ClientAuditEntryOut[]> {
  const safeLimit = clampApiLimit(limit, 200);
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/audit?limit=${safeLimit}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar histórico.", response.status));
  return body as ClientAuditEntryOut[];
}

export async function createClient(payload: ClientCreatePayload): Promise<ClientOut> {

  const response = await fetch(apiUrl("/api/v1/clients"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível criar o cliente.", response.status));
  }
  return body as ClientOut;
}

export async function updateClient(clientId: number, payload: ClientUpdatePayload): Promise<ClientOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar o cliente.", response.status));
  }
  return body as ClientOut;
}

export async function deleteClient(clientId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir o cliente.", response.status));
}

/** Segmento da API para equipamentos HVAC legados (OS, PMOC, checklists). */
export const CLIENT_HVAC_EQUIPMENTS_SEGMENT = "hvac-equipments";

/**
 * Monta URL `/api/v1/clients/{id}/hvac-equipments` (não confundir com `/equipments` do catálogo v2).
 */
export function clientHvacEquipmentsApiPath(
  clientId: number,
  equipmentId?: number,
  trailing = "",
): string {
  const base = `/api/v1/clients/${clientId}/${CLIENT_HVAC_EQUIPMENTS_SEGMENT}`;
  if (equipmentId == null) return `${base}${trailing}`;
  return `${base}/${equipmentId}${trailing}`;
}

function isCatalogEquipmentRow(row: unknown): boolean {
  return (
    row != null &&
    typeof row === "object" &&
    "catalog_id" in row &&
    typeof (row as { catalog_id?: unknown }).catalog_id === "string"
  );
}

function parseHvacEquipmentOut(body: unknown): EquipmentOut {
  if (isCatalogEquipmentRow(body)) {
    throw new Error(
      "Resposta do catálogo multi-equipamentos recebida em vez do modelo HVAC legado. " +
        "Use o endpoint /hvac-equipments para OS e PMOC.",
    );
  }
  if (!body || typeof body !== "object" || typeof (body as EquipmentOut).id !== "number") {
    throw new Error("Formato de equipamento HVAC inválido na resposta da API.");
  }
  return body as EquipmentOut;
}

function parseHvacEquipmentList(body: unknown): EquipmentOut[] {
  if (!Array.isArray(body)) {
    throw new Error("Lista de equipamentos HVAC inválida na resposta da API.");
  }
  if (body.length > 0 && isCatalogEquipmentRow(body[0])) {
    throw new Error(
      "A API retornou itens do catálogo v2 (/equipments). Para OS e PMOC, use /hvac-equipments.",
    );
  }
  return body.map((row) => parseHvacEquipmentOut(row));
}

/** Lista equipamentos HVAC do cliente (modelo legado `EquipmentOut`). */
export async function listClientHvacEquipments(
  clientId: number,
  params?: { only_active?: boolean; client_site_id?: number },
): Promise<EquipmentOut[]> {
  const sp = new URLSearchParams();
  if (params?.only_active) sp.set("only_active", "true");
  if (params?.client_site_id != null) sp.set("client_site_id", String(params.client_site_id));
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(clientHvacEquipmentsApiPath(clientId, undefined, suffix)), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar equipamentos.", response.status));
  }
  return parseHvacEquipmentList(body);
}

/** @deprecated Alias — prefira `listClientHvacEquipments`. */
export const listClientEquipments = listClientHvacEquipments;

export async function createClientHvacEquipment(
  clientId: number,
  payload: EquipmentCreatePayload,
): Promise<EquipmentOut> {
  const response = await fetch(apiUrl(clientHvacEquipmentsApiPath(clientId)), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível criar equipamento.", response.status));
  }
  return parseHvacEquipmentOut(body);
}

/** @deprecated Alias — prefira `createClientHvacEquipment`. */
export const createClientEquipment = createClientHvacEquipment;

export async function updateClientHvacEquipment(
  clientId: number,
  equipmentId: number,
  payload: EquipmentUpdatePayload,
): Promise<EquipmentOut> {
  const response = await fetch(apiUrl(clientHvacEquipmentsApiPath(clientId, equipmentId)), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível atualizar equipamento.", response.status));
  }
  return parseHvacEquipmentOut(body);
}

/** @deprecated Alias — prefira `updateClientHvacEquipment`. */
export const updateClientEquipment = updateClientHvacEquipment;

export async function deactivateClientHvacEquipment(clientId: number, equipmentId: number): Promise<void> {
  const response = await fetch(apiUrl(clientHvacEquipmentsApiPath(clientId, equipmentId)), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível inativar equipamento.", response.status));
}

/** @deprecated Alias — prefira `deactivateClientHvacEquipment`. */
export const deactivateClientEquipment = deactivateClientHvacEquipment;

export async function listHvacEquipmentHistory(
  clientId: number,
  equipmentId: number,
): Promise<EquipmentHistoryRowOut[]> {

  const response = await fetch(apiUrl(clientHvacEquipmentsApiPath(clientId, equipmentId, "/history")), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar histórico do equipamento.", response.status));
  return body as EquipmentHistoryRowOut[];
}

/** @deprecated Alias — prefira `listHvacEquipmentHistory`. */
export const listEquipmentHistory = listHvacEquipmentHistory;

export async function listHvacEquipmentPreventiveHistory(
  clientId: number,
  equipmentId: number,
): Promise<EquipmentHistoryRowOut[]> {

  const response = await fetch(
    apiUrl(clientHvacEquipmentsApiPath(clientId, equipmentId, "/history/preventives")),
    { headers: bearer() },
  );
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o histórico preventivo do equipamento.", response.status));
  }
  return body as EquipmentHistoryRowOut[];
}

export async function listClientServiceItemsLinks(
  clientId: number,
  params?: { only_without_equipment?: boolean },
): Promise<ClientServiceItemLinkRowOut[]> {

  const sp = new URLSearchParams();
  if (params?.only_without_equipment) sp.set("only_without_equipment", "true");
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/service-items-links${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar serviços do cliente.", response.status));
  return body as ClientServiceItemLinkRowOut[];
}

export async function listEquipmentDocuments(
  equipmentId: number,
  params?: {
    document_type?: EquipmentDocumentType;
    status?: EquipmentDocumentStatus;
    q?: string;
    issued_from?: string;
    issued_to?: string;
    next_due_from?: string;
    next_due_to?: string;
    only_overdue?: boolean;
    limit?: number;
  },
): Promise<EquipmentDocumentOut[]> {
  const sp = new URLSearchParams();
  if (params?.document_type) sp.set("document_type", params.document_type);
  if (params?.status) sp.set("status", params.status);
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.issued_from) sp.set("issued_from", params.issued_from);
  if (params?.issued_to) sp.set("issued_to", params.issued_to);
  if (params?.next_due_from) sp.set("next_due_from", params.next_due_from);
  if (params?.next_due_to) sp.set("next_due_to", params.next_due_to);
  if (params?.only_overdue) sp.set("only_overdue", "true");
  if (params?.limit != null) sp.set("limit", String(clampApiLimit(params.limit)));
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/equipments/${equipmentId}/documents${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar documentos do equipamento.", response.status));
  return body as EquipmentDocumentOut[];
}

/** PMOC/laudos de todos os equipamentos do cliente (uma lista na aba Cadastro). */
export async function listClientEquipmentDocuments(
  clientId: number,
  params?: {
    document_type?: EquipmentDocumentType;
    status?: EquipmentDocumentStatus;
    q?: string;
    issued_from?: string;
    issued_to?: string;
    next_due_from?: string;
    next_due_to?: string;
    only_overdue?: boolean;
    limit?: number;
  },
): Promise<EquipmentDocumentWithEquipmentOut[]> {

  const sp = new URLSearchParams();
  if (params?.document_type) sp.set("document_type", params.document_type);
  if (params?.status) sp.set("status", params.status);
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.issued_from) sp.set("issued_from", params.issued_from);
  if (params?.issued_to) sp.set("issued_to", params.issued_to);
  if (params?.next_due_from) sp.set("next_due_from", params.next_due_from);
  if (params?.next_due_to) sp.set("next_due_to", params.next_due_to);
  if (params?.only_overdue) sp.set("only_overdue", "true");
  if (params?.limit != null) sp.set("limit", String(clampApiLimit(params.limit)));
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/equipment-documents${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar documentos do cliente.", response.status));
  }
  return body as EquipmentDocumentWithEquipmentOut[];
}

export async function createEquipmentDocument(
  equipmentId: number,
  payload: EquipmentDocumentCreatePayload,
): Promise<EquipmentDocumentOut> {
  const response = await fetch(apiUrl(`/api/v1/equipments/${equipmentId}/documents`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível criar documento do equipamento.", response.status));
  return body as EquipmentDocumentOut;
}

export async function getEquipmentDocument(equipmentId: number, documentId: number): Promise<EquipmentDocumentOut> {
  const response = await fetch(apiUrl(`/api/v1/equipments/${equipmentId}/documents/${documentId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar documento do equipamento.", response.status));
  return body as EquipmentDocumentOut;
}

export async function listEquipmentDocumentAttachments(
  equipmentId: number,
  documentId: number,
): Promise<EquipmentDocumentAttachmentOut[]> {
  const response = await fetch(apiUrl(`/api/v1/equipments/${equipmentId}/documents/${documentId}/attachments`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar anexos do documento.", response.status));
  return body as EquipmentDocumentAttachmentOut[];
}

export async function uploadEquipmentDocumentAttachment(
  equipmentId: number,
  documentId: number,
  file: File,
): Promise<EquipmentDocumentAttachmentOut> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.append("file", file);
  const response = await fetch(apiUrl(`/api/v1/equipments/${equipmentId}/documents/${documentId}/attachments`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível enviar anexo do documento.", response.status));
  return body as EquipmentDocumentAttachmentOut;
}

export async function deleteEquipmentDocumentAttachment(
  equipmentId: number,
  documentId: number,
  attachmentId: number,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/v1/equipments/${equipmentId}/documents/${documentId}/attachments/${attachmentId}`),
    {
      method: "DELETE",
      headers: bearer(),
    },
  );
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível remover anexo do documento.", response.status));
}

export async function listEquipmentDocumentEvents(
  equipmentId: number,
  documentId: number,
  limit = 200,
): Promise<EquipmentDocumentEventOut[]> {
  const response = await fetch(apiUrl(`/api/v1/equipments/${equipmentId}/documents/${documentId}/events?limit=${limit}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar histórico do documento.", response.status));
  return body as EquipmentDocumentEventOut[];
}

export const CNPJ_COMMERCIAL_COOLDOWN_DAYS = 60;

export function cnpjCommercialCooldownDaysRemaining(lastUpdate: string | null | undefined): number | null {
  if (!lastUpdate) return null;
  const last = new Date(lastUpdate);
  if (Number.isNaN(last.getTime())) return null;
  const daysSince = Math.floor((Date.now() - last.getTime()) / 86_400_000);
  if (daysSince >= CNPJ_COMMERCIAL_COOLDOWN_DAYS) return null;
  return Math.max(1, CNPJ_COMMERCIAL_COOLDOWN_DAYS - daysSince);
}

export async function refreshClientCnpjCommercial(
  clientId: number,
  mergeAddress = true,
): Promise<ClientCnpjCommercialRefreshResult> {
  const q = mergeAddress ? "" : "?merge_address=false";
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/cnpj-commercial-refresh${q}`), {
    method: "POST",
    headers: jsonHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível atualizar via Receita (Comercial).", response.status));
  }
  return body as ClientCnpjCommercialRefreshResult;
}

export async function listClientSites(clientId: number): Promise<ClientSiteOut[]> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/sites`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar filiais/obras.", response.status));
  return body as ClientSiteOut[];
}

export async function createClientSite(clientId: number, payload: ClientSitePayload): Promise<ClientSiteOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/sites`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível cadastrar filial/obra.", response.status));
  return body as ClientSiteOut;
}

export async function updateClientSite(
  clientId: number,
  siteId: number,
  payload: Partial<ClientSitePayload>,
): Promise<ClientSiteOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/sites/${siteId}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível atualizar a unidade/filial.", response.status));
  return body as ClientSiteOut;
}

export async function deleteClientSite(clientId: number, siteId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/sites/${siteId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir filial/obra.", response.status));
}

/** Endereço cadastrado do cliente (múltiplos endereços por tipo, vinculáveis a uma unidade/filial). */
export type ClientAddressType = "principal" | "cobranca" | "instalacao" | "correspondencia" | "outros";

export type ClientAddressOut = {
  id: number;
  client_id: number;
  client_site_id: number | null;
  address_type: ClientAddressType;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  reference_point: string | null;
  is_principal: boolean;
  use_for_billing: boolean;
  use_for_pmoc: boolean;
  use_for_service_orders: boolean;
  use_for_correspondence: boolean;
  is_active: boolean;
  created_at: string;
};

export type ClientAddressPayload = {
  address_type?: ClientAddressType;
  client_site_id?: number | null;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  reference_point?: string;
  is_principal?: boolean;
  use_for_billing?: boolean;
  use_for_pmoc?: boolean;
  use_for_service_orders?: boolean;
  use_for_correspondence?: boolean;
  is_active?: boolean;
};

export async function listClientAddresses(clientId: number): Promise<ClientAddressOut[]> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/addresses`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar endereços.", response.status));
  return body as ClientAddressOut[];
}

export async function createClientAddress(
  clientId: number,
  payload: ClientAddressPayload,
): Promise<ClientAddressOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/addresses`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível cadastrar endereço.", response.status));
  return body as ClientAddressOut;
}

export async function updateClientAddress(
  clientId: number,
  addressId: number,
  payload: Partial<ClientAddressPayload>,
): Promise<ClientAddressOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/addresses/${addressId}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível atualizar o endereço.", response.status));
  return body as ClientAddressOut;
}

export async function deleteClientAddress(clientId: number, addressId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/addresses/${addressId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir o endereço.", response.status));
}

export async function duplicateClientAddress(
  clientId: number,
  addressId: number,
): Promise<ClientAddressOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/addresses/${addressId}/duplicate`), {
    method: "POST",
    headers: jsonHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível duplicar o endereço.", response.status));
  return body as ClientAddressOut;
}

/** Contato adicional do cliente (múltiplos contatos, cada um com preferências de notificação). */
export type ClientContactCategory =
  | "responsavel"
  | "tecnico"
  | "financeiro"
  | "administrativo"
  | "comercial"
  | "outros";

export type ClientContactOut = {
  id: number;
  client_id: number;
  client_site_id: number | null;
  name: string;
  category: ClientContactCategory;
  role: string | null;
  department: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  receives_service_orders: boolean;
  receives_pmoc: boolean;
  receives_financial: boolean;
  receives_contracts: boolean;
  receives_whatsapp_notifications: boolean;
  receives_automatic_emails: boolean;
  is_principal: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientContactPayload = {
  name: string;
  category?: ClientContactCategory;
  role?: string;
  department?: string;
  client_site_id?: number | null;
  whatsapp: string;
  phone?: string;
  email: string;
  receives_service_orders?: boolean;
  receives_pmoc?: boolean;
  receives_financial?: boolean;
  receives_contracts?: boolean;
  receives_whatsapp_notifications?: boolean;
  receives_automatic_emails?: boolean;
  is_principal?: boolean;
  is_active?: boolean;
  notes?: string;
};

export async function listClientContacts(clientId: number): Promise<ClientContactOut[]> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contacts`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar contatos.", response.status));
  return body as ClientContactOut[];
}

export async function createClientContact(
  clientId: number,
  payload: ClientContactPayload,
): Promise<ClientContactOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contacts`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível cadastrar contato.", response.status));
  return body as ClientContactOut;
}

export async function updateClientContact(
  clientId: number,
  contactId: number,
  payload: Partial<ClientContactPayload>,
): Promise<ClientContactOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contacts/${contactId}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível atualizar contato.", response.status));
  return body as ClientContactOut;
}

export async function deleteClientContact(clientId: number, contactId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contacts/${contactId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir contato.", response.status));
}

export async function duplicateClientContact(clientId: number, contactId: number): Promise<ClientContactOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contacts/${contactId}/duplicate`), {
    method: "POST",
    headers: jsonHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível duplicar o contato.", response.status));
  return body as ClientContactOut;
}

/** Contrato comercial do cliente (PMOC, manutenção, avulso etc.). */
export type ClientContractStatus = "draft" | "active" | "suspended" | "expired" | "cancelled";

export type ClientContractAttachmentOut = {
  id: number;
  client_contract_id: number;
  file_type: string;
  file_name: string | null;
  file_url: string | null;
  size_bytes: number | null;
  uploaded_by_user_id: number | null;
  created_at: string;
};

export type ClientContractOut = {
  id: number;
  client_id: number;
  contract_number: string;
  contract_type: string;
  title: string;
  status: ClientContractStatus;
  recurrence: string;
  start_date: string;
  end_date: string;
  value: number;
  payment_method: string | null;
  due_day: number | null;
  notes: string | null;
  client_site_id?: number | null;
  responsible_user_id?: number | null;
  category?: string | null;
  form_category_label?: string | null;
  next_due_date?: string | null;
  adjustment_index?: string | null;
  adjustment_period?: string | null;
  late_fee_percent?: number | null;
  interest_percent?: number | null;
  auto_renewal?: boolean;
  expiry_notice_days?: number | null;
  coverage_location?: string | null;
  billing_notes?: string | null;
  display_number?: string | null;
  contract_year?: number | null;
  equipment_ids?: string[];
  services?: string[];
  attachments_count?: number;
  created_at: string;
  updated_at: string;
};

export type ClientContractNextNumberOut = {
  contract_number: string;
  contract_year: number;
  sequence: number;
  preview: boolean;
};

export type ClientContractPayload = {
  contract_number?: string | null;
  contract_type: string;
  title: string;
  status?: ClientContractStatus;
  recurrence?: string;
  start_date: string;
  end_date: string;
  value: number;
  payment_method?: string;
  due_day?: number;
  notes?: string;
  client_site_id?: number | null;
  responsible_user_id?: number | null;
  category?: string;
  form_category_label?: string | null;
  next_due_date?: string | null;
  adjustment_index?: string | null;
  adjustment_period?: string | null;
  late_fee_percent?: number | null;
  interest_percent?: number | null;
  auto_renewal?: boolean;
  expiry_notice_days?: number | null;
  coverage_location?: string | null;
  billing_notes?: string | null;
  display_number?: string | null;
  contract_year?: number | null;
  equipment_ids?: string[];
  services?: string[];
};

export async function listClientContracts(clientId: number): Promise<ClientContractOut[]> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contracts`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar contratos.", response.status));
  return body as ClientContractOut[];
}

export async function fetchClientContractNextNumber(
  clientId: number,
  year?: number,
): Promise<ClientContractNextNumberOut> {
  const sp = new URLSearchParams();
  if (year != null) sp.set("year", String(year));
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contracts/next-number${suffix}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível gerar a prévia do número do contrato.", response.status));
  }
  return body as ClientContractNextNumberOut;
}

export async function createClientContract(
  clientId: number,
  payload: ClientContractPayload,
): Promise<ClientContractOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contracts`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível cadastrar contrato.", response.status));
  return body as ClientContractOut;
}

export async function updateClientContract(
  clientId: number,
  contractId: number,
  payload: Partial<ClientContractPayload>,
): Promise<ClientContractOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contracts/${contractId}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível atualizar contrato.", response.status));
  return body as ClientContractOut;
}

export async function deleteClientContract(clientId: number, contractId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contracts/${contractId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir contrato.", response.status));
}

export async function listClientContractAttachments(
  clientId: number,
  contractId: number,
): Promise<ClientContractAttachmentOut[]> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contracts/${contractId}/attachments`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar anexos do contrato.", response.status));
  return body as ClientContractAttachmentOut[];
}

export async function uploadClientContractAttachment(
  clientId: number,
  contractId: number,
  file: File,
): Promise<ClientContractAttachmentOut> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.append("file", file);
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/contracts/${contractId}/attachments`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível enviar anexo do contrato.", response.status));
  return body as ClientContractAttachmentOut;
}

export async function deleteClientContractAttachment(
  clientId: number,
  contractId: number,
  attachmentId: number,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/v1/clients/${clientId}/contracts/${contractId}/attachments/${attachmentId}`),
    {
      method: "DELETE",
      headers: bearer(),
    },
  );
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível remover anexo do contrato.", response.status));
}
