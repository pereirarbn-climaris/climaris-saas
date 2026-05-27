import { apiUrl } from "../lib/apiUrl";
import { API_MAX_PAGE_LIMIT, clampApiLimit } from "../lib/apiPagination";
import { getAccessToken } from "../lib/authStorage";

export type CategoryFieldDefinitionOut = {
  key: string;
  name: string;
  type: "text" | "number" | "select";
  unit: string | null;
  required: boolean;
  is_active: boolean;
  options: string[];
};

export type CategoryFieldDefinitionIn = {
  key?: string;
  name: string;
  type: "text" | "number" | "select";
  unit?: string | null;
  required?: boolean;
  is_active?: boolean;
  options?: string[];
};

export type EquipmentCategoryOut = {
  id: string;
  name: string;
  icon_key: string;
  sort_order: number;
  has_fluid_type: boolean;
  has_capacity: boolean;
  has_voltage: boolean;
  field_definitions: CategoryFieldDefinitionOut[];
};

export type EquipmentCategoryListOut = {
  items: EquipmentCategoryOut[];
};

export type EquipmentCategoryCreatePayload = {
  name: string;
  icon_key?: string;
  sort_order?: number;
  has_fluid_type?: boolean;
  has_capacity?: boolean;
  has_voltage?: boolean;
  field_definitions?: CategoryFieldDefinitionIn[];
};

export type EquipmentCategoryUpdatePayload = {
  name?: string;
  icon_key?: string;
  sort_order?: number;
  has_fluid_type?: boolean;
  has_capacity?: boolean;
  has_voltage?: boolean;
  field_definitions?: CategoryFieldDefinitionIn[];
};

export type EquipmentManualBriefOut = {
  id: string;
  title: string;
  s3_url: string;
};

export type EquipmentManualOptionOut = {
  id: string;
  title: string;
};

export type EquipmentManualListOut = {
  items: EquipmentManualOptionOut[];
};

export type EquipmentCatalogComponentType = "UNICO" | "EVAPORADORA" | "CONDENSADORA";

export type EquipmentCatalogOut = {
  id: string;
  category_id: string;
  category: EquipmentCategoryOut;
  component_type: EquipmentCatalogComponentType;
  brand: string;
  model: string;
  model_evaporator: string | null;
  model_condenser: string | null;
  capacity: string | null;
  fluid_type: string | null;
  voltage: string | null;
  technical_data: Record<string, string | number | boolean>;
  manual_id: string | null;
  manual: EquipmentManualBriefOut | null;
  manual_url: string | null;
};

export type EquipmentCatalogListOut = {
  items: EquipmentCatalogOut[];
  total: number;
  skip: number;
  limit: number;
};

export type ClientEquipmentCatalogRefOut = {
  id: string;
  category_id: string;
  category: EquipmentCategoryOut;
  component_type: EquipmentCatalogComponentType;
  brand: string;
  model: string;
  model_evaporator: string | null;
  model_condenser: string | null;
  capacity: string | null;
  fluid_type: string | null;
  voltage: string | null;
  technical_data?: Record<string, string | number | boolean>;
  manual_id: string | null;
  manual: EquipmentManualBriefOut | null;
  manual_url: string | null;
};

export type ClientEquipmentComponentOut = {
  id: string;
  catalog_id: string;
  serial_number: string | null;
  catalog: ClientEquipmentCatalogRefOut;
};

export type ClientEquipmentOut = {
  id: string;
  client_id: number;
  client_site_id?: number | null;
  tag: string;
  installation_reference?: string | null;
  installation_date: string | null;
  is_active: boolean;
  legacy_equipment_id: number | null;
  legacy_fabricante?: string | null;
  legacy_modelo?: string | null;
  legacy_capacidade_btu?: number | null;
  legacy_serial?: string | null;
  public_token?: string | null;
  qrcode_code_id?: string | null;
  components: ClientEquipmentComponentOut[];
  can_delete?: boolean;
  delete_block_reason?: string | null;
};

export type ClientEquipmentManualOut = {
  id: string;
  title: string;
  url: string;
  kind: string;
  component_label?: string | null;
};

export type ClientEquipmentComponentCreatePayload = {
  catalog_id: string;
  serial_number?: string | null;
};

export type ClientEquipmentCreatePayload = {
  tag: string;
  installation_reference?: string | null;
  client_site_id?: number | null;
  installation_date?: string | null;
  qrcode_code_id?: string | null;
  components: ClientEquipmentComponentCreatePayload[];
  /** Legado: um único componente */
  catalog_id?: string;
  serial_number?: string | null;
};

function bearer(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string, status: number): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const msg = (detail as { message?: string }).message;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (typeof first?.msg === "string") return first.msg;
    }
    const err = (body as { error?: { message?: string } }).error;
    if (typeof err?.message === "string" && err.message.trim()) return err.message;
  }
  return `${fallback} (${status})`;
}

/** Catálogo global — uso no app dos clientes (qualquer perfil autenticado). */
export async function listCatalogCategories(): Promise<EquipmentCategoryListOut> {
  const response = await fetch(apiUrl("/api/v1/equipment-catalog/categories"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar as categorias.", response.status));
  }
  return body as EquipmentCategoryListOut;
}

/** Painel Operação — CRUD de categorias (requer ADMIN plataforma). */
export async function listEquipmentCategories(): Promise<EquipmentCategoryListOut> {
  const response = await fetch(apiUrl("/api/v1/operacao/categories"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar as categorias.", response.status));
  }
  return body as EquipmentCategoryListOut;
}

export async function createEquipmentCategory(
  payload: EquipmentCategoryCreatePayload,
): Promise<EquipmentCategoryOut> {
  const response = await fetch(apiUrl("/api/v1/operacao/categories"), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível criar a categoria.", response.status));
  }
  return body as EquipmentCategoryOut;
}

export async function updateEquipmentCategory(
  categoryId: string,
  payload: EquipmentCategoryUpdatePayload,
): Promise<EquipmentCategoryOut> {
  const response = await fetch(apiUrl(`/api/v1/operacao/categories/${categoryId}`), {
    method: "PATCH",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível atualizar a categoria.", response.status));
  }
  return body as EquipmentCategoryOut;
}

export async function deleteEquipmentCategory(categoryId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/operacao/categories/${categoryId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir a categoria.", response.status));
}

export async function listEquipmentManuals(): Promise<EquipmentManualListOut> {
  const response = await fetch(apiUrl("/api/v1/operacao/manuals"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar os manuais.", response.status));
  }
  return body as EquipmentManualListOut;
}

export type EquipmentCatalogDuplicateCheckOut = {
  exists: boolean;
  catalog_id: string | null;
  brand: string | null;
  model: string | null;
  category_name: string | null;
};

export async function checkEquipmentCatalogDuplicate(params: {
  category_id: string;
  brand: string;
  model_evaporator?: string;
  model_condenser?: string;
  model?: string;
  exclude_catalog_id?: string;
}): Promise<EquipmentCatalogDuplicateCheckOut> {
  const qs = new URLSearchParams();
  qs.set("category_id", params.category_id);
  qs.set("brand", params.brand);
  if (params.model_evaporator?.trim()) qs.set("model_evaporator", params.model_evaporator.trim());
  if (params.model_condenser?.trim()) qs.set("model_condenser", params.model_condenser.trim());
  if (params.model?.trim()) qs.set("model", params.model.trim());
  if (params.exclude_catalog_id) qs.set("exclude_catalog_id", params.exclude_catalog_id);

  const response = await fetch(apiUrl(`/api/v1/equipment-catalog/check-duplicate?${qs}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível verificar duplicidade no catálogo.", response.status));
  }
  return body as EquipmentCatalogDuplicateCheckOut;
}

export async function listEquipmentCatalog(params?: {
  skip?: number;
  limit?: number;
  category_id?: string;
  brand?: string;
  model?: string;
  q?: string;
}): Promise<EquipmentCatalogListOut> {
  const search = new URLSearchParams();
  if (params?.skip != null) search.set("skip", String(params.skip));
  if (params?.limit != null) search.set("limit", String(clampApiLimit(params.limit)));
  if (params?.category_id) search.set("category_id", params.category_id);
  if (params?.brand?.trim()) search.set("brand", params.brand.trim());
  if (params?.model?.trim()) search.set("model", params.model.trim());
  if (params?.q?.trim()) search.set("q", params.q.trim());
  const suffix = search.toString() ? `?${search}` : "";
  const response = await fetch(apiUrl(`/api/v1/equipment-catalog${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o catálogo de equipamentos.", response.status));
  }
  return body as EquipmentCatalogListOut;
}

/** Carrega todas as páginas do catálogo global (até `total` itens). */
export async function listAllEquipmentCatalog(params?: {
  category_id?: string;
  brand?: string;
  model?: string;
  q?: string;
}): Promise<EquipmentCatalogOut[]> {
  const pageSize = API_MAX_PAGE_LIMIT;
  const all: EquipmentCatalogOut[] = [];
  let skip = 0;
  let total = Number.POSITIVE_INFINITY;

  while (skip < total) {
    const page = await listEquipmentCatalog({ ...params, skip, limit: pageSize });
    all.push(...page.items);
    total = page.total;
    skip += page.items.length;
    if (page.items.length === 0) break;
  }

  return all;
}

export async function createEquipmentCatalog(form: FormData): Promise<EquipmentCatalogOut> {
  const response = await fetch(apiUrl("/api/v1/equipment-catalog"), {
    method: "POST",
    headers: bearer(),
    body: form,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    const fallback =
      response.status === 409
        ? "Este equipamento já está cadastrado no catálogo. Não cadastre novamente."
        : "Não foi possível cadastrar o modelo no catálogo.";
    throw new Error(errorMessage(body, fallback, response.status));
  }
  return body as EquipmentCatalogOut;
}

export async function createEquipmentCatalogWithExistingManual(form: FormData): Promise<EquipmentCatalogOut> {
  const response = await fetch(apiUrl("/api/v1/equipment-catalog/with-existing-manual"), {
    method: "POST",
    headers: bearer(),
    body: form,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    const fallback =
      response.status === 409
        ? "Este equipamento já está cadastrado no catálogo. Não cadastre novamente."
        : "Não foi possível cadastrar o modelo no catálogo.";
    throw new Error(errorMessage(body, fallback, response.status));
  }
  return body as EquipmentCatalogOut;
}

export async function updateEquipmentCatalog(
  catalogId: string,
  form: FormData,
): Promise<EquipmentCatalogOut> {
  const response = await fetch(apiUrl(`/api/v1/equipment-catalog/${catalogId}`), {
    method: "PATCH",
    headers: bearer(),
    body: form,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível atualizar o modelo no catálogo.", response.status));
  }
  return body as EquipmentCatalogOut;
}

export async function listClientCatalogEquipments(
  clientId: number,
  params?: { only_active?: boolean },
): Promise<ClientEquipmentOut[]> {
  const search = new URLSearchParams();
  if (params?.only_active) search.set("only_active", "true");
  const suffix = search.toString() ? `?${search}` : "";
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/equipments${suffix}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar equipamentos do cliente.", response.status));
  }
  return body as ClientEquipmentOut[];
}

export async function createClientCatalogEquipment(
  clientId: number,
  payload: ClientEquipmentCreatePayload,
): Promise<ClientEquipmentOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/${clientId}/equipments`), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível cadastrar o equipamento.", response.status));
  }
  return body as ClientEquipmentOut;
}

export type ClientEquipmentUpdatePayload = {
  tag?: string;
  installation_reference?: string | null;
  installation_date?: string | null;
  is_active?: boolean;
  client_site_id?: number | null;
  components?: Array<{ id: string; serial_number: string | null }>;
};

export async function updateClientCatalogEquipment(
  equipmentId: string,
  payload: ClientEquipmentUpdatePayload,
): Promise<ClientEquipmentOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/equipments/${equipmentId}`), {
    method: "PATCH",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar o equipamento.", response.status));
  }
  return body as ClientEquipmentOut;
}

export async function updateClientCatalogEquipmentInstallationReference(
  equipmentId: string,
  installationReference: string | null,
): Promise<ClientEquipmentOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/equipments/${equipmentId}/installation-reference`), {
    method: "PATCH",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify({ installation_reference: installationReference }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar a referência de localização.", response.status));
  }
  return body as ClientEquipmentOut;
}

export async function listClientEquipmentManuals(equipmentId: string): Promise<ClientEquipmentManualOut[]> {
  const response = await fetch(apiUrl(`/api/v1/clients/equipments/${equipmentId}/manuals`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar os manuais.", response.status));
  }
  return (body as { items: ClientEquipmentManualOut[] }).items ?? [];
}

export async function updateClientCatalogEquipmentSite(
  equipmentId: string,
  clientSiteId: number | null,
): Promise<ClientEquipmentOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/equipments/${equipmentId}/site`), {
    method: "PATCH",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify({ client_site_id: clientSiteId }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível alterar a obra do equipamento.", response.status));
  }
  return body as ClientEquipmentOut;
}

export async function updateClientCatalogEquipmentStatus(
  equipmentId: string,
  isActive: boolean,
): Promise<ClientEquipmentOut> {
  const response = await fetch(apiUrl(`/api/v1/clients/equipments/${equipmentId}/status`), {
    method: "PATCH",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível atualizar o status do equipamento.", response.status));
  }
  return body as ClientEquipmentOut;
}

export async function deleteClientCatalogEquipment(equipmentId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/clients/equipments/${equipmentId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível excluir o equipamento.", response.status));
}
