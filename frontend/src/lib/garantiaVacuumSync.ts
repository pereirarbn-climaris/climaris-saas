import { uploadGarantiaVacuoEvidence, type GarantiaVacuoEvidenceOut } from "../api/serviceOrders";
import type {
  GarantiaVacuoArquivo,
  GarantiaVacuoEvidenceKind,
  ServiceOrderGarantiaFields,
} from "./serviceOrderGarantia";
import {
  deleteGarantiaVacuumBlob,
  getGarantiaVacuumBlob,
} from "./garantiaVacuumOfflineStore";

function vacuoFieldKey(kind: GarantiaVacuoEvidenceKind): "vacuoFoto" | "vacuoRelatorio" {
  return kind === "relatorio" ? "vacuoRelatorio" : "vacuoFoto";
}

export function buildVacuoArquivoFromUpload(
  existing: GarantiaVacuoArquivo | null,
  kind: GarantiaVacuoEvidenceKind,
  upload: GarantiaVacuoEvidenceOut,
): GarantiaVacuoArquivo {
  return {
    id: existing?.id ?? `vacuo_${kind}_${Date.now()}`,
    kind,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    storageKey: upload.storageKey,
    publicUrl: upload.publicUrl,
    offlineBlobRef: null,
    syncStatus: "synced",
    latitude: upload.latitude,
    longitude: upload.longitude,
    accuracyMeters: upload.accuracyMeters,
    capturedAt: upload.capturedAt,
    capturedOffline: upload.capturedOffline,
    vacuoFinalMicronsAi: upload.vacuoFinalMicrons,
    deviceName: upload.deviceName,
    deviceSerial: upload.deviceSerial,
  };
}

export function garantiaPatchFromVacuoUpload(
  garantia: ServiceOrderGarantiaFields,
  kind: GarantiaVacuoEvidenceKind,
  upload: GarantiaVacuoEvidenceOut,
): Partial<ServiceOrderGarantiaFields> {
  const key = vacuoFieldKey(kind);
  const existing = garantia[key];
  const patch: Partial<ServiceOrderGarantiaFields> = {
    [key]: buildVacuoArquivoFromUpload(existing, kind, upload),
  };
  if (upload.vacuoFinalMicrons?.trim()) {
    // Relatório Testo tem prioridade sobre foto na IA.
    if (kind === "relatorio" || !garantia.vacuoRelatorio?.vacuoFinalMicronsAi?.trim()) {
      patch.vacuoFinalMicrons = upload.vacuoFinalMicrons.trim();
    }
  }
  return patch;
}

function isPending(arquivo: GarantiaVacuoArquivo | null | undefined): boolean {
  return Boolean(arquivo?.syncStatus === "pending_upload" && arquivo.offlineBlobRef);
}

export function listVacuoPendingUploads(garantia: ServiceOrderGarantiaFields): GarantiaVacuoEvidenceKind[] {
  const pending: GarantiaVacuoEvidenceKind[] = [];
  if (isPending(garantia.vacuoFoto)) pending.push("foto");
  if (isPending(garantia.vacuoRelatorio)) pending.push("relatorio");
  return pending;
}

export function isVacuoPendingUpload(garantia: ServiceOrderGarantiaFields): boolean {
  return listVacuoPendingUploads(garantia).length > 0;
}

export async function syncGarantiaVacuumUpload(
  orderId: number,
  garantia: ServiceOrderGarantiaFields,
  kind: GarantiaVacuoEvidenceKind,
): Promise<Partial<ServiceOrderGarantiaFields> | null> {
  const key = vacuoFieldKey(kind);
  const arquivo = garantia[key];
  if (!arquivo || arquivo.syncStatus !== "pending_upload" || !arquivo.offlineBlobRef) {
    return null;
  }
  if (arquivo.latitude == null || arquivo.longitude == null || !arquivo.capturedAt) {
    throw new Error("Evidência de vácuo offline sem geolocalização.");
  }

  const blob = await getGarantiaVacuumBlob(arquivo.offlineBlobRef);
  if (!blob) {
    throw new Error("Arquivo de vácuo offline não encontrado no dispositivo.");
  }

  const file = new File([blob], arquivo.fileName || (kind === "relatorio" ? "vacuo.tjf" : "vacuo.jpg"), {
    type: arquivo.mimeType || blob.type || (kind === "relatorio" ? "application/json" : "image/jpeg"),
  });

  const upload = await uploadGarantiaVacuoEvidence(orderId, {
    file,
    evidenceKind: kind,
    latitude: arquivo.latitude,
    longitude: arquivo.longitude,
    accuracyMeters: arquivo.accuracyMeters,
    capturedAt: arquivo.capturedAt,
    capturedOffline: true,
    extractVacuum: kind === "foto",
  });

  await deleteGarantiaVacuumBlob(arquivo.offlineBlobRef);
  return garantiaPatchFromVacuoUpload(garantia, kind, upload);
}

export async function syncAllGarantiaVacuumPending(
  orderId: number,
  garantia: ServiceOrderGarantiaFields,
): Promise<Partial<ServiceOrderGarantiaFields>> {
  let merged = { ...garantia };
  let patch: Partial<ServiceOrderGarantiaFields> = {};
  for (const kind of listVacuoPendingUploads(garantia)) {
    const part = await syncGarantiaVacuumUpload(orderId, merged, kind);
    if (part) {
      merged = { ...merged, ...part };
      patch = { ...patch, ...part };
    }
  }
  return patch;
}
