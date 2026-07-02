import { apiUrl } from "../lib/apiUrl";

import { getAccessToken } from "../lib/authStorage";

import type { ServiceOrderMissingRequirement } from "../types/serviceOrders";



export type DigitalWorkOrderEvidenceOut = {

  id: string;

  evidence_key: string;

  evidence_type: string;

  storage_key: string | null;

  latitude: number | null;

  longitude: number | null;

  captured_offline: boolean;

  sync_status: string;

};



export type DigitalWorkOrderOut = {

  id: string;

  tenant_id: number;

  service_order_id: number;

  equipment_asset_id: string | null;

  compliance_schema_version: string;

  validation_status: string;

  validation_errors: unknown[];

  last_validated_at: string | null;

  offline_client_id: string | null;

  last_synced_at: string | null;

  version: number;

};



export type DigitalWorkOrderDetailOut = DigitalWorkOrderOut & {

  evidences: DigitalWorkOrderEvidenceOut[];

};



export type DigitalWorkOrderValidateOut = {

  can_finalize: boolean;

  missing_requirements: ServiceOrderMissingRequirement[];

};



export type DigitalWorkOrderSyncMeta = {

  conflict_detected: boolean;

  version: number;

};



export type DigitalWorkOrderMeasurementsSyncResult = DigitalWorkOrderSyncMeta & {

  measurements: Array<{

    id: string;

    metric_key: string;

    value_numeric: number | null;

    value_text: string | null;

    unit: string | null;

    is_required: boolean;

    recorded_offline: boolean;

    sync_status: string;

  }>;

};



export type DigitalWorkOrderEvidenceUploadResult = DigitalWorkOrderSyncMeta & {

  evidence: DigitalWorkOrderEvidenceOut;

};



export const DIGITAL_WORK_ORDER_CONFLICT_TOAST =

  "Atenção: A OS foi editada por outra pessoa, mas suas medições foram atualizadas com sucesso.";



export type UploadDigitalWorkOrderEvidenceParams = {

  evidence_key: string;

  file: File;

  latitude: number;

  longitude: number;

  accuracy_meters?: number | null;

  captured_at: string;

  captured_offline?: boolean;

  is_required?: boolean;

  last_version?: number | null;

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

  const token = getAccessToken();

  if (!token) throw new Error("Sessão expirada.");

  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

}



function errorMessage(body: unknown, fallback: string, status: number): string {

  if (body && typeof body === "object" && typeof (body as { detail?: unknown }).detail === "string") {

    return (body as { detail: string }).detail;

  }

  return `${fallback} (HTTP ${status}).`;

}



function readSyncMeta(body: unknown): DigitalWorkOrderSyncMeta {

  const row = body as { conflict_detected?: boolean; version?: number };

  return {

    conflict_detected: Boolean(row.conflict_detected),

    version: typeof row.version === "number" ? row.version : 1,

  };

}



export async function getDigitalWorkOrderByServiceOrder(serviceOrderId: number): Promise<DigitalWorkOrderDetailOut> {

  const response = await fetch(apiUrl(`/api/v1/digital-os/by-service-order/${serviceOrderId}`), {

    headers: bearer(),

  });

  const body = await parseBody(response);

  if (!response.ok) {

    throw new Error(errorMessage(body, "Não foi possível carregar a OS digital.", response.status));

  }

  return body as DigitalWorkOrderDetailOut;

}



export async function validateDigitalWorkOrder(digitalId: string): Promise<DigitalWorkOrderValidateOut> {

  const response = await fetch(apiUrl(`/api/v1/digital-os/${digitalId}/validate`), { headers: bearer() });

  const body = await parseBody(response);

  if (!response.ok) {

    throw new Error(errorMessage(body, "Não foi possível validar a OS digital.", response.status));

  }

  return body as DigitalWorkOrderValidateOut;

}



export async function postDigitalWorkOrderMeasurements(

  digitalId: string,

  measurements: Array<{

    metric_key: string;

    value_numeric?: number | null;

    value_text?: string | null;

    unit?: string | null;

    recorded_offline?: boolean;

  }>,

  options?: { last_version?: number | null },

): Promise<DigitalWorkOrderMeasurementsSyncResult> {

  const response = await fetch(apiUrl(`/api/v1/digital-os/${digitalId}/measurements`), {

    method: "POST",

    headers: jsonHeaders(),

    body: JSON.stringify({

      last_version: options?.last_version ?? null,

      measurements,

    }),

  });

  const body = await parseBody(response);

  if (!response.ok && response.status !== 209) {

    throw new Error(errorMessage(body, "Não foi possível salvar medições.", response.status));

  }

  const parsed = body as DigitalWorkOrderMeasurementsSyncResult;

  const meta = readSyncMeta(body);

  return {

    ...parsed,

    ...meta,

    measurements: parsed.measurements ?? [],

  };

}



export async function uploadDigitalWorkOrderEvidence(

  digitalId: string,

  params: UploadDigitalWorkOrderEvidenceParams,

): Promise<DigitalWorkOrderEvidenceUploadResult> {

  const form = new FormData();

  form.append("evidence_key", params.evidence_key);

  form.append("latitude", String(params.latitude));

  form.append("longitude", String(params.longitude));

  form.append("file", params.file, params.file.name);

  if (params.accuracy_meters != null) {

    form.append("accuracy_meters", String(params.accuracy_meters));

  }

  form.append("captured_offline", params.captured_offline ? "true" : "false");

  form.append("is_required", params.is_required ? "true" : "false");

  if (params.last_version != null) {

    form.append("last_version", String(params.last_version));

  }



  const response = await fetch(apiUrl(`/api/v1/digital-os/${digitalId}/evidences/upload`), {

    method: "POST",

    headers: bearer(),

    body: form,

  });

  const body = await parseBody(response);

  if (!response.ok && response.status !== 209) {

    throw new Error(errorMessage(body, "Não foi possível enviar a evidência.", response.status));

  }

  const parsed = body as DigitalWorkOrderEvidenceUploadResult;

  const meta = readSyncMeta(body);

  return {

    ...parsed,

    ...meta,

    evidence: parsed.evidence,

  };

}



export async function postDigitalWorkOrderEvidences(

  digitalId: string,

  evidences: Array<{

    evidence_key: string;

    storage_key?: string | null;

    mime_type?: string | null;

    latitude?: number | null;

    longitude?: number | null;

    accuracy_meters?: number | null;

    captured_offline?: boolean;

    is_required?: boolean;

  }>,

  options?: { last_version?: number | null },

): Promise<{ evidences: DigitalWorkOrderEvidenceOut[] } & DigitalWorkOrderSyncMeta> {

  const response = await fetch(apiUrl(`/api/v1/digital-os/${digitalId}/evidences`), {

    method: "POST",

    headers: jsonHeaders(),

    body: JSON.stringify({

      last_version: options?.last_version ?? null,

      evidences,

    }),

  });

  const body = await parseBody(response);

  if (!response.ok && response.status !== 209) {

    throw new Error(errorMessage(body, "Não foi possível registrar evidências.", response.status));

  }

  const parsed = body as { evidences?: DigitalWorkOrderEvidenceOut[] };

  return {

    evidences: parsed.evidences ?? [],

    ...readSyncMeta(body),

  };

}


