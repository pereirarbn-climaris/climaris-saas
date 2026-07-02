import { uploadGarantiaStartupEvidence, type GarantiaStartupEvidenceOut } from "../api/serviceOrders";
import type { GarantiaStartupMetricConfig } from "./garantiaStartupMetrics";
import { STARTUP_METRIC_CONFIGS } from "./garantiaStartupMetrics";
import {
  deleteGarantiaVacuumBlob,
  getGarantiaVacuumBlob,
} from "./garantiaVacuumOfflineStore";
import type { GarantiaStartupFotoEvidence, ServiceOrderGarantiaFields } from "./serviceOrderGarantia";

export function buildStartupFotoFromUpload(
  existing: GarantiaStartupFotoEvidence | null,
  upload: GarantiaStartupEvidenceOut,
): GarantiaStartupFotoEvidence {
  return {
    id: existing?.id ?? `startup_${upload.metricKey}_${Date.now()}`,
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
    extractedValue: upload.extractedValue,
  };
}

export function garantiaPatchFromStartupUpload(
  garantia: ServiceOrderGarantiaFields,
  config: GarantiaStartupMetricConfig,
  upload: GarantiaStartupEvidenceOut,
): Partial<ServiceOrderGarantiaFields> {
  const existing = garantia[config.fotoField] as GarantiaStartupFotoEvidence | null;
  const patch: Partial<ServiceOrderGarantiaFields> = {
    [config.fotoField]: buildStartupFotoFromUpload(existing, upload),
  };
  if (upload.extractedValue?.trim()) {
    patch[config.valueField] = upload.extractedValue.trim();
  }
  return patch;
}

function isPending(foto: GarantiaStartupFotoEvidence | null | undefined): boolean {
  return Boolean(foto?.syncStatus === "pending_upload" && foto.offlineBlobRef);
}

export function listStartupPendingUploads(garantia: ServiceOrderGarantiaFields): GarantiaStartupMetricConfig[] {
  return STARTUP_METRIC_CONFIGS.filter((config) =>
    isPending(garantia[config.fotoField] as GarantiaStartupFotoEvidence | null),
  );
}

export function isStartupPendingUpload(garantia: ServiceOrderGarantiaFields): boolean {
  return listStartupPendingUploads(garantia).length > 0;
}

export async function syncGarantiaStartupUpload(
  orderId: number,
  garantia: ServiceOrderGarantiaFields,
  config: GarantiaStartupMetricConfig,
): Promise<Partial<ServiceOrderGarantiaFields> | null> {
  const foto = garantia[config.fotoField] as GarantiaStartupFotoEvidence | null;
  if (!foto || foto.syncStatus !== "pending_upload" || !foto.offlineBlobRef) {
    return null;
  }
  if (foto.latitude == null || foto.longitude == null || !foto.capturedAt) {
    throw new Error(`Evidência de ${config.label} offline sem geolocalização.`);
  }

  const blob = await getGarantiaVacuumBlob(foto.offlineBlobRef);
  if (!blob) {
    throw new Error(`Foto de ${config.label} offline não encontrada no dispositivo.`);
  }

  const file = new File([blob], foto.fileName || `${config.key}.jpg`, {
    type: foto.mimeType || blob.type || "image/jpeg",
  });

  const upload = await uploadGarantiaStartupEvidence(orderId, {
    file,
    metricKey: config.apiKey,
    latitude: foto.latitude,
    longitude: foto.longitude,
    accuracyMeters: foto.accuracyMeters,
    capturedAt: foto.capturedAt,
    capturedOffline: true,
    extractValue: true,
  });

  await deleteGarantiaVacuumBlob(foto.offlineBlobRef);
  return garantiaPatchFromStartupUpload(garantia, config, upload);
}

export async function syncAllGarantiaStartupPending(
  orderId: number,
  garantia: ServiceOrderGarantiaFields,
): Promise<Partial<ServiceOrderGarantiaFields>> {
  let merged = { ...garantia };
  let patch: Partial<ServiceOrderGarantiaFields> = {};
  for (const config of listStartupPendingUploads(garantia)) {
    const part = await syncGarantiaStartupUpload(orderId, merged, config);
    if (part) {
      merged = { ...merged, ...part };
      patch = { ...patch, ...part };
    }
  }
  return patch;
}
