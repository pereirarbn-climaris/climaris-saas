import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type QrCodeLabelStatus = "available" | "linked";

export type QrCodeOut = {
  id: number;
  tenant_id: number;
  code_id: string;
  status: QrCodeLabelStatus;
  linked_to_equipment_id: number | null;
  client_id?: number | null;
  tenant_has_logo?: boolean;
  tracking_url: string | null;
  created_at: string;
  updated_at: string;
};

export type QrCodeListResponse = {
  items: QrCodeOut[];
  counts: { available: number; linked: number };
  skip: number;
  limit: number;
};

export type QrCodeValidateResult = {
  found: boolean;
  available: boolean;
  code_id?: string | null;
  linked_to_equipment_id?: number | null;
  message: string;
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

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(): HeadersInit {
  return { ...bearer(), "Content-Type": "application/json" };
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as { detail?: unknown; error?: { message?: string } };
    if (typeof o.detail === "string" && o.detail) return o.detail;
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
  }
  return fallback;
}

export async function listQrCodes(params?: {
  status?: QrCodeLabelStatus;
  skip?: number;
  limit?: number;
}): Promise<QrCodeListResponse> {
  const sp = new URLSearchParams();
  sp.set("skip", String(params?.skip ?? 0));
  sp.set("limit", String(params?.limit ?? 200));
  if (params?.status) sp.set("status", params.status);
  const response = await fetch(apiUrl(`/api/v1/qrcodes?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar etiquetas QR."));
  return body as QrCodeListResponse;
}

export async function linkQrCodesToEquipments(): Promise<{
  linked: number;
  equipment_without_qr: number;
  code_ids: string[];
  equipment_still_without_qr: number;
  qrcodes_still_available: number;
  message: string;
}> {
  const response = await fetch(apiUrl("/api/v1/qrcodes/link-equipments"), {
    method: "POST",
    headers: jsonHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível vincular etiquetas aos equipamentos."));
  return body as {
    linked: number;
    equipment_without_qr: number;
    code_ids: string[];
    equipment_still_without_qr: number;
    qrcodes_still_available: number;
    message: string;
  };
}

export async function resetQrCodesInventory(): Promise<{ deleted: number; message: string; next_code_id: string }> {
  const response = await fetch(apiUrl("/api/v1/qrcodes/reset"), {
    method: "POST",
    headers: jsonHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível zerar o inventário de etiquetas."));
  return body as { deleted: number; message: string; next_code_id: string };
}

export async function generateQrCodes(quantity: number): Promise<{
  created: number;
  code_ids: string[];
  first_code_id: string | null;
  last_code_id: string | null;
}> {
  const response = await fetch(apiUrl("/api/v1/qrcodes/generate"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ quantity }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível gerar etiquetas."));
  return body as { created: number; code_ids: string[]; first_code_id: string | null; last_code_id: string | null };
}

export async function validateQrCode(codeId: string): Promise<QrCodeValidateResult> {
  const response = await fetch(apiUrl(`/api/v1/qrcodes/validate/${encodeURIComponent(codeId)}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível validar o código."));
  return body as QrCodeValidateResult;
}

export function qrCodesPdfUrl(params?: { status?: QrCodeLabelStatus; codeIds?: string[] }): string {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.codeIds?.length) sp.set("code_ids", params.codeIds.join(","));
  const q = sp.toString();
  return apiUrl(`/api/v1/qrcodes/labels/pdf${q ? `?${q}` : ""}`);
}

export async function fetchQrCodesPdfBlob(params?: {
  status?: QrCodeLabelStatus;
  codeIds?: string[];
}): Promise<Blob> {
  const response = await fetch(qrCodesPdfUrl(params), { headers: bearer() });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errorMessage(body, "Não foi possível gerar o PDF de etiquetas."));
  }
  return response.blob();
}
