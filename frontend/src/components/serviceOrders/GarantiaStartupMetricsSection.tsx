import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Activity, MapPinCheck, Sparkles, UploadCloud } from "lucide-react";
import { uploadGarantiaStartupEvidence } from "../../api/serviceOrders";
import { captureGeolocation, GeolocationError } from "../../features/digital-work-order/lib/geolocation";
import { useConnectivity } from "../../hooks/useConnectivity";
import type { GarantiaStartupMetricConfig } from "../../lib/garantiaStartupMetrics";
import { getStartupMetricFoto, STARTUP_METRIC_CONFIGS } from "../../lib/garantiaStartupMetrics";
import {
  garantiaPatchFromStartupUpload,
  listStartupPendingUploads,
  syncGarantiaStartupUpload,
} from "../../lib/garantiaStartupSync";
import {
  deleteGarantiaVacuumBlob,
  getGarantiaVacuumBlob,
  newStartupOfflineBlobRef,
  putGarantiaVacuumBlob,
} from "../../lib/garantiaVacuumOfflineStore";
import type { GarantiaStartupFotoEvidence, ServiceOrderGarantiaFields } from "../../lib/serviceOrderGarantia";
import styles from "./GarantiaStartupMetricsSection.module.css";

type Props = {
  orderId?: number;
  garantia: ServiceOrderGarantiaFields;
  canEdit: boolean;
  onGarantiaChange: (patch: Partial<ServiceOrderGarantiaFields>) => void;
};

type MetricSlotProps = {
  config: GarantiaStartupMetricConfig;
  garantia: ServiceOrderGarantiaFields;
  canEdit: boolean;
  busy: boolean;
  orderId?: number;
  isOnline: boolean;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onSuccess: (msg: string | null) => void;
  onGarantiaChange: (patch: Partial<ServiceOrderGarantiaFields>) => void;
};

function StartupMetricSlot({
  config,
  garantia,
  canEdit,
  busy,
  orderId,
  isOnline,
  onBusy,
  onError,
  onSuccess,
  onGarantiaChange,
}: MetricSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const foto = getStartupMetricFoto(garantia, config);
  const value = String(garantia[config.valueField] ?? "");

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (localPreview || !foto?.offlineBlobRef) return;
      const blob = await getGarantiaVacuumBlob(foto.offlineBlobRef);
      if (!blob || cancelled) return;
      setLocalPreview(URL.createObjectURL(blob));
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [foto?.offlineBlobRef, localPreview]);

  useEffect(() => {
    return () => {
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const persistOffline = async (
    file: File,
    geo: { latitude: number; longitude: number; accuracy_meters: number | null; captured_at: string },
    extracted: string | null,
  ) => {
    if (!orderId) throw new Error("Salve a OS antes de anexar evidência offline.");
    const blobRef = foto?.offlineBlobRef ?? newStartupOfflineBlobRef(orderId, config.apiKey);
    await putGarantiaVacuumBlob(blobRef, file);
    const next: GarantiaStartupFotoEvidence = {
      id: foto?.id ?? `startup_${config.key}_${Date.now()}`,
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      storageKey: null,
      publicUrl: null,
      offlineBlobRef: blobRef,
      syncStatus: "pending_upload",
      latitude: geo.latitude,
      longitude: geo.longitude,
      accuracyMeters: geo.accuracy_meters,
      capturedAt: geo.captured_at,
      capturedOffline: true,
      extractedValue: extracted,
    };
    const patch: Partial<ServiceOrderGarantiaFields> = { [config.fotoField]: next };
    if (extracted) patch[config.valueField] = extracted;
    onGarantiaChange(patch);
    onSuccess("Salvo offline — será enviado quando a conexão voltar.");
  };

  const processFile = async (file: File) => {
    if (!canEdit) return;
    onError(null);
    onSuccess(null);

    const valid = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
    if (!valid) {
      onError("Use foto JPG, PNG ou WebP.");
      return;
    }
    if (!orderId) {
      onError("Salve a OS antes de arquivar a evidência.");
      return;
    }

    try {
      const geo = await captureGeolocation();
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
      setLocalPreview(URL.createObjectURL(file));

      if (!isOnline) {
        await persistOffline(file, geo, null);
        return;
      }

      onBusy(true);
      try {
        const upload = await uploadGarantiaStartupEvidence(orderId, {
          file,
          metricKey: config.apiKey,
          latitude: geo.latitude,
          longitude: geo.longitude,
          accuracyMeters: geo.accuracy_meters,
          capturedAt: geo.captured_at,
          capturedOffline: false,
          extractValue: true,
        });
        onGarantiaChange(garantiaPatchFromStartupUpload(garantia, config, upload));
        if (upload.extractedValue) {
          onSuccess(`${config.label}: IA leu ${upload.extractedValue} ${config.unit}`);
        } else {
          onSuccess("Foto arquivada com GPS.");
        }
        setLocalPreview(null);
      } catch {
        await persistOffline(file, geo, null);
      } finally {
        onBusy(false);
      }
    } catch (e) {
      if (e instanceof GeolocationError) onError(e.message);
      else onError(e instanceof Error ? e.message : "Falha ao processar foto.");
    }
  };

  const handleRemove = async () => {
    if (!canEdit) return;
    if (foto?.offlineBlobRef) await deleteGarantiaVacuumBlob(foto.offlineBlobRef);
    if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    onGarantiaChange({ [config.fotoField]: null });
    onError(null);
    onSuccess(null);
  };

  const previewUrl = localPreview ?? (foto?.publicUrl ? foto.publicUrl : null);
  const pending = foto?.syncStatus === "pending_upload" && Boolean(foto.offlineBlobRef);
  const synced = foto?.syncStatus === "synced" && Boolean(foto.storageKey);
  const hasGeo = foto?.latitude != null && foto?.longitude != null;

  return (
    <div className={styles.metricCard}>
      <div className={styles.metricHead}>
        <h5 className={styles.metricTitle}>{config.label}</h5>
        <div className={styles.badges}>
          {hasGeo ? (
            <span className={styles.badgeGeo}>
              <MapPinCheck size={11} aria-hidden />
              GPS
            </span>
          ) : null}
          {pending ? <span className={styles.badgeOffline}>Offline</span> : null}
          {synced ? <span className={styles.badgeSynced}>OK</span> : null}
        </div>
      </div>

      <div className={styles.metricBody}>
        <label className={styles.valueField}>
          <span className={styles.label}>Valor</span>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              disabled={!canEdit}
              value={value}
              placeholder={config.placeholder}
              onChange={(e) => onGarantiaChange({ [config.valueField]: e.target.value })}
            />
            <span className={styles.unit}>{config.unit}</span>
          </div>
        </label>

        <div>
          <p className={styles.lead}>{config.lead}</p>
          {previewUrl ? (
            <div className={styles.previewWrap}>
              <img src={previewUrl} alt={config.label} className={styles.preview} />
            </div>
          ) : (
            <div
              className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""} ${!canEdit || busy ? styles.dropzoneDisabled : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (canEdit && !busy) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void processFile(file);
              }}
              onClick={() => {
                if (canEdit && !busy) inputRef.current?.click();
              }}
              role="button"
              tabIndex={canEdit ? 0 : -1}
            >
              <UploadCloud size={20} aria-hidden />
              <p>{busy ? "Processando…" : "Foto do instrumento"}</p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className={styles.hiddenInput}
            disabled={!canEdit || busy}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (file) void processFile(file);
              e.target.value = "";
            }}
          />

          {foto?.extractedValue ? (
            <p className={styles.extracted}>
              <Sparkles size={12} aria-hidden />
              IA: <strong>{foto.extractedValue}</strong> {config.unit}
            </p>
          ) : null}

          {foto && canEdit ? (
            <div className={styles.actions} style={{ marginTop: "0.4rem" }}>
              <button type="button" className={styles.btnSecondary} disabled={busy} onClick={() => inputRef.current?.click()}>
                Trocar
              </button>
              <button type="button" className={styles.btnSecondary} disabled={busy} onClick={() => void handleRemove()}>
                Remover
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function GarantiaStartupMetricsSection({ orderId, garantia, canEdit, onGarantiaChange }: Props) {
  const { isOnline } = useConnectivity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const tryAutoSync = useCallback(async () => {
    if (!orderId || !isOnline || syncingRef.current) return;
    const pending = listStartupPendingUploads(garantia);
    if (!pending.length) return;
    syncingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      let merged = garantia;
      for (const config of pending) {
        const patch = await syncGarantiaStartupUpload(orderId, merged, config);
        if (patch) {
          merged = { ...merged, ...patch };
          onGarantiaChange(patch);
        }
      }
      setSuccess("Medições de startup enviadas automaticamente.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sincronizar.");
    } finally {
      syncingRef.current = false;
      setBusy(false);
    }
  }, [garantia, isOnline, onGarantiaChange, orderId]);

  const pendingKeys = STARTUP_METRIC_CONFIGS.map((c) => garantia[c.fotoField]?.syncStatus).join("|");
  useEffect(() => {
    void tryAutoSync();
  }, [isOnline, tryAutoSync, pendingKeys]);

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <h4 className={styles.sectionTitle}>
          <Activity size={15} style={{ verticalAlign: "text-bottom", marginRight: 4 }} />
          Medições de startup — evidências fotográficas
        </h4>
      </div>

      <div className={styles.grid}>
        {STARTUP_METRIC_CONFIGS.map((config) => (
          <StartupMetricSlot
            key={config.key}
            config={config}
            garantia={garantia}
            canEdit={canEdit}
            busy={busy}
            orderId={orderId}
            isOnline={isOnline}
            onBusy={setBusy}
            onError={setError}
            onSuccess={setSuccess}
            onGarantiaChange={onGarantiaChange}
          />
        ))}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {success ? <p className={styles.success}>{success}</p> : null}
      {!orderId && canEdit ? (
        <p className={styles.error}>Salve a OS uma vez para habilitar o arquivamento das fotos.</p>
      ) : null}
    </div>
  );
}
