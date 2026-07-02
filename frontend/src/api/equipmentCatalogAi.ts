import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type EquipmentLabelKind = "ar_condicionado" | "climatizador";
export type EquipmentLabelKindInput = EquipmentLabelKind | "auto";

export type EquipmentLabelExtractionOut = {
  marca: string | null;
  modelo_evaporadora: string | null;
  modelo_condensadora: string | null;
  capacidade_btus: string | null;
  fluido_refrigerante: string | null;
  tensao: string | null;
  tipo_equipamento: string | null;
  tecnologia: string | null;
  serie_evaporadora?: string | null;
  serie_condensadora?: string | null;
  numero_serie?: string | null;
  modelo?: string | null;
  vazao_m3h?: string | null;
  potencia_kw?: string | null;
  tipo_instalacao?: string | null;
  pressao_estatica?: string | null;
};

export type EquipmentLabelResolveOut = {
  equipment_kind: string;
  extraction: EquipmentLabelExtractionOut;
  catalog_id: string;
  catalog_created: boolean;
  category_id: string;
  category_name: string;
  brand: string;
  model_display: string;
  suggested_identificacao: string | null;
  capacidade_btu: number | null;
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
    const record = body as { detail?: unknown; error?: { message?: unknown; details?: unknown } };
    if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
    const nested = record.error?.message;
    if (typeof nested === "string" && nested.trim()) return nested;
  }
  return `${fallback} (${status})`;
}

/** Envia fotos de etiqueta(s) para extração via IA multimodal. */
export async function extractEquipmentLabelFromPhotos(params: {
  equipmentKind?: EquipmentLabelKind;
  evaporatorImage?: File | null;
  condenserImage?: File | null;
  labelImage?: File | null;
}): Promise<EquipmentLabelExtractionOut> {
  const fd = new FormData();
  fd.append("equipment_kind", params.equipmentKind ?? "ar_condicionado");
  if (params.evaporatorImage) {
    fd.append("evaporator_image", params.evaporatorImage, params.evaporatorImage.name);
  }
  if (params.condenserImage) {
    fd.append("condenser_image", params.condenserImage, params.condenserImage.name);
  }
  if (params.labelImage) {
    fd.append("label_image", params.labelImage, params.labelImage.name);
  }
  const response = await fetch(apiUrl("/api/v1/equipment-catalog/ai/extract-label"), {
    method: "POST",
    headers: bearer(),
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível processar a etiqueta com IA.", response.status));
  }
  return body as EquipmentLabelExtractionOut;
}

/** Extrai etiqueta, classifica tipo (se auto) e resolve modelo no catálogo. */
export async function resolveEquipmentLabelFromPhotos(params: {
  equipmentKind?: EquipmentLabelKindInput;
  evaporatorImage?: File | null;
  condenserImage?: File | null;
  labelImage?: File | null;
}): Promise<EquipmentLabelResolveOut> {
  const fd = new FormData();
  fd.append("equipment_kind", params.equipmentKind ?? "auto");
  if (params.evaporatorImage) {
    fd.append("evaporator_image", params.evaporatorImage, params.evaporatorImage.name);
  }
  if (params.condenserImage) {
    fd.append("condenser_image", params.condenserImage, params.condenserImage.name);
  }
  if (params.labelImage) {
    fd.append("label_image", params.labelImage, params.labelImage.name);
  }
  const response = await fetch(apiUrl("/api/v1/equipment-catalog/ai/resolve-label"), {
    method: "POST",
    headers: bearer(),
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    const fallback =
      response.status === 503
        ? "Não foi possível processar a etiqueta com IA. Verifique a chave Claude em Operação → Chaves APIs."
        : "Não foi possível identificar o modelo pela etiqueta.";
    throw new Error(errorMessage(body, fallback, response.status));
  }
  return body as EquipmentLabelResolveOut;
}
