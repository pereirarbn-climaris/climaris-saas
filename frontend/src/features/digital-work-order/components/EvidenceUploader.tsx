import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { MapPinCheck, UploadCloud } from "lucide-react";

import {
  uploadDigitalWorkOrderEvidence,
  type DigitalWorkOrderEvidenceOut,
} from "../../../api/digitalWorkOrders";
import type { OfflineDigitalWorkOrderDraft, OfflineEvidenceDraft } from "../types";
import { captureGeolocation, GeolocationError } from "../lib/geolocation";
import { getOfflineEvidenceBlob, putOfflineEvidenceBlob } from "../lib/offlineEvidenceStore";
import styles from "./EvidenceUploader.module.css";

export type EvidenceUploaderProps = {
  digitalWorkOrderId: string;
  serviceOrderId: number;
  evidenceKey: string;
  label: string;
  required?: boolean;
  isOnline: boolean;
  existingEvidence?: DigitalWorkOrderEvidenceOut | null;
  offlineEvidenceDraft?: OfflineEvidenceDraft | null;
  lastVersion?: number;
  onUploaded: (evidence: DigitalWorkOrderEvidenceOut) => void;
  onSyncResult?: (result: { version: number; conflict_detected: boolean }) => void;
  onOfflineQueued?: () => void;
  saveOfflineDraft: (
    draft: Partial<OfflineDigitalWorkOrderDraft> & Pick<OfflineDigitalWorkOrderDraft, "offline_client_id" | "service_order_id">,
  ) => Promise<unknown>;
};

type LocalState = {
  previewUrl: string;
  file: File;
  geo: {
    latitude: number;
    longitude: number;
    accuracy_meters: number | null;
    captured_at: string;
  };
};

function hasGeoValidated(evidence: DigitalWorkOrderEvidenceOut | null | undefined): boolean {
  return evidence != null && evidence.latitude != null && evidence.longitude != null && Boolean(evidence.storage_key);
}

export function EvidenceUploader({
  digitalWorkOrderId,
  serviceOrderId,
  evidenceKey,
  label,
  required = false,
  isOnline,
  existingEvidence = null,
  offlineEvidenceDraft = null,
  lastVersion = 1,
  onUploaded,
  onSyncResult,
  onOfflineQueued,
  saveOfflineDraft,
}: EvidenceUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState<LocalState | null>(null);
  const [uploaded, setUploaded] = useState<DigitalWorkOrderEvidenceOut | null>(existingEvidence);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(Boolean(offlineEvidenceDraft?.blob_ref));
  const offlineClientId = `dwo-${serviceOrderId}`;

  useEffect(() => {
    setUploaded(existingEvidence);
  }, [existingEvidence]);

  useEffect(() => {
    setPendingOffline(Boolean(offlineEvidenceDraft?.blob_ref));
  }, [offlineEvidenceDraft?.blob_ref]);

  useEffect(() => {
    let cancelled = false;
    let previewUrl: string | null = null;

    async function restoreOfflinePreview() {
      if (local || !offlineEvidenceDraft?.blob_ref) return;
      const blob = await getOfflineEvidenceBlob(offlineEvidenceDraft.blob_ref);
      if (!blob || cancelled) return;
      previewUrl = URL.createObjectURL(blob);
      setLocal({
        file: new File([blob], `${evidenceKey}.jpg`, {
          type: offlineEvidenceDraft.mime_type || blob.type || "image/jpeg",
        }),
        previewUrl,
        geo: {
          latitude: offlineEvidenceDraft.latitude ?? 0,
          longitude: offlineEvidenceDraft.longitude ?? 0,
          accuracy_meters: offlineEvidenceDraft.accuracy_meters ?? null,
          captured_at: offlineEvidenceDraft.captured_at,
        },
      });
    }

    void restoreOfflinePreview();
    return () => {
      cancelled = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [evidenceKey, local, offlineEvidenceDraft]);

  useEffect(() => {
    return () => {
      if (local?.previewUrl && !offlineEvidenceDraft?.blob_ref) {
        URL.revokeObjectURL(local.previewUrl);
      }
    };
  }, [local?.previewUrl, offlineEvidenceDraft?.blob_ref]);

  const persistOfflineEvidence = useCallback(
    async (file: File, geo: LocalState["geo"]) => {
      const blobRef = offlineEvidenceDraft?.blob_ref ?? `evidence-${crypto.randomUUID()}`;
      await putOfflineEvidenceBlob(blobRef, file);
      await saveOfflineDraft({
        offline_client_id: offlineClientId,
        service_order_id: serviceOrderId,
        evidences: [
          {
            evidence_key: evidenceKey,
            evidence_type: "photo",
            blob_ref: blobRef,
            mime_type: file.type,
            latitude: geo.latitude,
            longitude: geo.longitude,
            accuracy_meters: geo.accuracy_meters,
            captured_offline: true,
            captured_at: geo.captured_at,
          },
        ],
        sync_status: "pending",
      });
      setPendingOffline(true);
      onOfflineQueued?.();
    },
    [evidenceKey, offlineClientId, offlineEvidenceDraft?.blob_ref, onOfflineQueued, saveOfflineDraft, serviceOrderId],
  );

  const uploadOnline = useCallback(
    async (file: File, geo: LocalState["geo"], capturedOffline: boolean) => {
      const uploadResult = await uploadDigitalWorkOrderEvidence(digitalWorkOrderId, {
        evidence_key: evidenceKey,
        file,
        latitude: geo.latitude,
        longitude: geo.longitude,
        accuracy_meters: geo.accuracy_meters,
        captured_at: geo.captured_at,
        captured_offline: capturedOffline,
        is_required: required,
        last_version: lastVersion,
      });
      setUploaded(uploadResult.evidence);
      setLocal(null);
      onUploaded(uploadResult.evidence);
      onSyncResult?.({ version: uploadResult.version, conflict_detected: uploadResult.conflict_detected });
    },
    [digitalWorkOrderId, evidenceKey, lastVersion, onSyncResult, onUploaded, required],
  );

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith("image/")) {
        setError("Selecione um arquivo de imagem (JPEG, PNG ou WebP).");
        return;
      }

      try {
        const geo = await captureGeolocation();
        if (local?.previewUrl) {
          URL.revokeObjectURL(local.previewUrl);
        }
        const nextLocal: LocalState = {
          file,
          previewUrl: URL.createObjectURL(file),
          geo,
        };
        setLocal(nextLocal);

        if (!isOnline) {
          await persistOfflineEvidence(file, geo);
          return;
        }

        setBusy(true);
        try {
          await uploadOnline(file, geo, false);
        } catch {
          await persistOfflineEvidence(file, geo);
        } finally {
          setBusy(false);
        }
      } catch (e) {
        if (e instanceof GeolocationError) {
          setError(e.message);
        } else {
          setError(e instanceof Error ? e.message : "Não foi possível capturar a localização.");
        }
      }
    },
    [isOnline, local?.previewUrl, persistOfflineEvidence, uploadOnline],
  );

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const handleRetryUpload = async () => {
    if (!local || !isOnline) return;
    setBusy(true);
    setError(null);
    try {
      await uploadOnline(local.file, local.geo, pendingOffline);
      setPendingOffline(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar evidência.");
    } finally {
      setBusy(false);
    }
  };

  const geoValidated = hasGeoValidated(uploaded) || pendingOffline;

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.title}>
          {label}
          {required ? <span className={styles.required}>Obrigatória</span> : null}
        </h3>
        {geoValidated ? (
          <span className={styles.geoBadge} title="Geolocalização validada">
            <MapPinCheck size={16} aria-hidden />
            Geolocalização validada
          </span>
        ) : null}
      </header>

      {uploaded?.storage_key && !local ? (
        <p className={styles.success}>
          Foto registrada com sucesso
          {uploaded.sync_status === "pending" ? " (aguardando sincronização)" : ""}.
        </p>
      ) : null}

      {pendingOffline && !uploaded?.storage_key ? (
        <p className={styles.offline}>Salva offline — será enviada quando a conexão voltar.</p>
      ) : null}

      {local ? (
        <div className={styles.previewWrap}>
          <img src={local.previewUrl} alt={`Pré-visualização ${label}`} className={styles.preview} />
          <p className={styles.coords}>
            GPS: {local.geo.latitude.toFixed(5)}, {local.geo.longitude.toFixed(5)}
            {local.geo.accuracy_meters != null ? ` (±${Math.round(local.geo.accuracy_meters)} m)` : ""}
          </p>
        </div>
      ) : (
        <div
          className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          role="button"
          tabIndex={0}
          aria-label={`Selecionar foto para ${label}`}
        >
          <UploadCloud size={28} aria-hidden />
          <p>Arraste a foto ou toque para selecionar</p>
          <p className={styles.dropHint}>A localização será capturada no momento da seleção</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.hiddenInput}
        onChange={onInputChange}
      />

      {error ? <p className={styles.error}>{error}</p> : null}

      {local && pendingOffline && isOnline ? (
        <button type="button" className={styles.uploadBtn} disabled={busy} onClick={() => void handleRetryUpload()}>
          {busy ? "Enviando…" : "Enviar agora"}
        </button>
      ) : null}
    </article>
  );
}
