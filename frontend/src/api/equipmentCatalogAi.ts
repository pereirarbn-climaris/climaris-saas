import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type EquipmentLabelExtractionOut = {
  marca: string | null;
  modelo_evaporadora: string | null;
  modelo_condensadora: string | null;
  capacidade_btus: string | null;
  fluido_refrigerante: string | null;
  tensao: string | null;
  tipo_equipamento: string | null;
  tecnologia: string | null;
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
  }
  return `${fallback} (${status})`;
}

/** Envia fotos de etiqueta(s) para extração via IA multimodal. */
export async function extractEquipmentLabelFromPhotos(params: {
  evaporatorImage?: File | null;
  condenserImage?: File | null;
}): Promise<EquipmentLabelExtractionOut> {
  const fd = new FormData();
  if (params.evaporatorImage) {
    fd.append("evaporator_image", params.evaporatorImage, params.evaporatorImage.name);
  }
  if (params.condenserImage) {
    fd.append("condenser_image", params.condenserImage, params.condenserImage.name);
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
