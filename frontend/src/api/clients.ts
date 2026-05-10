import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import {
  demoCreateClient,
  demoDeleteClient,
  demoListClients,
  demoUpdateClient,
  demoClientServiceItemLinksAll,
  demoClients,
  demoEquipmentDocuments,
  demoEquipmentHistoryRows,
  demoEquipments,
  isDemoMode,
} from "../lib/demoMode";

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
  state_registration: string | null;
  ie_indicator: string | null;
  municipal_registration: string | null;
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
  state_registration?: string;
  ie_indicator?: ClientIeIndicator;
  municipal_registration?: string;
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
};

export type EquipmentOut = {
  id: number;
  client_id: number;
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
  state_registration?: string | null;
  ie_indicator?: ClientIeIndicator | null;
  municipal_registration?: string | null;
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

export async function listClients(params?: { q?: string; skip?: number; limit?: number }): Promise<ClientOut[]> {
  if (isDemoMode()) {
    const q = params?.q?.trim().toLowerCase();
    let filtered = demoListClients();
    if (q) {
      filtered = demoClients.filter(c => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
    }
    return Promise.resolve(filtered);
  }
  const q = params?.q?.trim();
  const skip = params?.skip ?? 0;
  const limit = params?.limit ?? 50;
  const sp = new URLSearchParams();
  sp.set("skip", String(skip));
  sp.set("limit", String(limit));
  if (q) sp.set("q", q);
  const response = await fetch(apiUrl(`/api/v1/clients?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar clientes.", response.status));
  }
  return body as ClientOut[];
}

export async function getClient(clientId: number): Promise<ClientOut> {
  if (isDemoMode()) {
    const c = demoClients.find((x) => x.id === clientId);
    if (!c) throw new Error("Cliente não encontrado.");
    return Promise.resolve({ ...c });
  }
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o cliente.", response.status));
  }
  return body as ClientOut;
}

export async function createClient(payload: ClientCreatePayload): Promise<ClientOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoCreateClient(payload as Partial<ClientOut> & { name: string }));
  }
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
  if (isDemoMode()) {
    return Promise.resolve(demoUpdateClient(clientId, payload as Partial<ClientOut>));
  }
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
  if (isDemoMode()) {
    demoDeleteClient(clientId);
    return Promise.resolve();
  }
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir o cliente.", response.status));
}

export async function listClientEquipments(clientId: number, params?: { only_active?: boolean }): Promise<EquipmentOut[]> {
  if (isDemoMode()) {
    let rows = demoEquipments.filter((e) => e.client_id === clientId);
    if (params?.only_active) rows = rows.filter((e) => e.ativo);
    return Promise.resolve(rows.map((e) => ({ ...e })));
  }
  const sp = new URLSearchParams();
  if (params?.only_active) sp.set("only_active", "true");
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/equipments${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar equipamentos.", response.status));
  }
  return body as EquipmentOut[];
}

export async function createClientEquipment(clientId: number, payload: EquipmentCreatePayload): Promise<EquipmentOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/equipments`), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível criar equipamento.", response.status));
  }
  return body as EquipmentOut;
}

export async function updateClientEquipment(
  clientId: number,
  equipmentId: number,
  payload: EquipmentUpdatePayload,
): Promise<EquipmentOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/equipments/${equipmentId}`), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível atualizar equipamento.", response.status));
  }
  return body as EquipmentOut;
}

export async function deactivateClientEquipment(clientId: number, equipmentId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/equipments/${equipmentId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível inativar equipamento.", response.status));
}

export async function listEquipmentHistory(clientId: number, equipmentId: number): Promise<EquipmentHistoryRowOut[]> {
  if (isDemoMode()) {
    const rows = demoEquipmentHistoryRows.filter((r) => r.client_id === clientId && r.equipment_id === equipmentId);
    return Promise.resolve(
      rows.map(({ client_id: _c, equipment_id: _e, ...rest }) => rest),
    );
  }
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/equipments/${equipmentId}/history`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível carregar histórico do equipamento.", response.status));
  return body as EquipmentHistoryRowOut[];
}

export async function listClientServiceItemsLinks(
  clientId: number,
  params?: { only_without_equipment?: boolean },
): Promise<ClientServiceItemLinkRowOut[]> {
  if (isDemoMode()) {
    let rows = demoClientServiceItemLinksAll.filter((l) => l.client_id === clientId);
    if (params?.only_without_equipment) rows = rows.filter((l) => l.equipment_id == null);
    return Promise.resolve(rows.map(({ client_id: _id, ...rest }) => rest));
  }
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
  if (params?.limit) sp.set("limit", String(params.limit));
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
  if (isDemoMode()) {
    const eqIds = new Set(demoEquipments.filter((e) => e.client_id === clientId).map((e) => e.id));
    let rows = demoEquipmentDocuments.filter((d) => eqIds.has(d.equipment_id));
    if (params?.document_type) rows = rows.filter((d) => d.document_type === params.document_type);
    if (params?.status) rows = rows.filter((d) => d.status === params.status);
    const q = params?.q?.trim().toLowerCase();
    if (q) rows = rows.filter((d) => d.title.toLowerCase().includes(q));
    if (params?.only_overdue) {
      const now = Date.now();
      rows = rows.filter((d) => {
        if (!d.next_due_at) return false;
        return Date.parse(d.next_due_at) < now && d.status !== "expired" && d.status !== "cancelled";
      });
    }
    if (params?.issued_from) {
      const from = Date.parse(params.issued_from);
      rows = rows.filter((d) => d.issued_at != null && Date.parse(d.issued_at) >= from);
    }
    if (params?.issued_to) {
      const to = Date.parse(params.issued_to);
      rows = rows.filter((d) => d.issued_at != null && Date.parse(d.issued_at) <= to);
    }
    if (params?.next_due_from) {
      const from = Date.parse(params.next_due_from);
      rows = rows.filter((d) => d.next_due_at != null && Date.parse(d.next_due_at) >= from);
    }
    if (params?.next_due_to) {
      const to = Date.parse(params.next_due_to);
      rows = rows.filter((d) => d.next_due_at != null && Date.parse(d.next_due_at) <= to);
    }
    const lim = params?.limit ?? 200;
    rows = rows.slice(0, lim);
    return Promise.resolve(rows.map((d) => ({ ...d })));
  }
  const sp = new URLSearchParams();
  if (params?.document_type) sp.set("document_type", params.document_type);
  if (params?.status) sp.set("status", params.status);
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.issued_from) sp.set("issued_from", params.issued_from);
  if (params?.issued_to) sp.set("issued_to", params.issued_to);
  if (params?.next_due_from) sp.set("next_due_from", params.next_due_from);
  if (params?.next_due_to) sp.set("next_due_to", params.next_due_to);
  if (params?.only_overdue) sp.set("only_overdue", "true");
  if (params?.limit) sp.set("limit", String(params.limit));
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
