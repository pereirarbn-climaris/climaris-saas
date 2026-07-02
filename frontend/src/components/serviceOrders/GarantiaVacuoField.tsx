import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { FileJson, Gauge, MapPinCheck, Sparkles, UploadCloud } from "lucide-react";
import { uploadGarantiaVacuoEvidence } from "../../api/serviceOrders";
import { captureGeolocation, GeolocationError } from "../../features/digital-work-order/lib/geolocation";
import { useConnectivity } from "../../hooks/useConnectivity";
import {
  deleteGarantiaVacuumBlob,
  getGarantiaVacuumBlob,
  newVacuumOfflineBlobRef,
  putGarantiaVacuumBlob,
} from "../../lib/garantiaVacuumOfflineStore";
import {
  garantiaPatchFromVacuoUpload,
  listVacuoPendingUploads,
  syncGarantiaVacuumUpload,
} from "../../lib/garantiaVacuumSync";
import type {
  GarantiaVacuoArquivo,
  GarantiaVacuoEvidenceKind,
  ServiceOrderGarantiaFields,
} from "../../lib/serviceOrderGarantia";
import { isTestoTjfFile, parseTestoTjfFile } from "../../lib/testoTjfParser";
import styles from "./GarantiaVacuoField.module.css";

type Props = {
  orderId?: number;
  garantia: ServiceOrderGarantiaFields;
  canEdit: boolean;
  onGarantiaChange: (patch: Partial<ServiceOrderGarantiaFields>) => void;
};

function fieldKey(kind: GarantiaVacuoEvidenceKind): "vacuoFoto" | "vacuoRelatorio" {
  return kind === "relatorio" ? "vacuoRelatorio" : "vacuoFoto";
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

type SlotProps = {
  kind: GarantiaVacuoEvidenceKind;
  title: string;
  lead: string;
  accept: string;
  capture?: boolean;
  arquivo: GarantiaVacuoArquivo | null;
  canEdit: boolean;
  busy: boolean;
  orderId?: number;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onSuccess: (msg: string | null) => void;
  onGarantiaChange: (patch: Partial<ServiceOrderGarantiaFields>) => void;
  garantia: ServiceOrderGarantiaFields;
  isOnline: boolean;
};

function VacuoEvidenceSlot({
  kind,
  title,
  lead,
  accept,
  capture = false,
  arquivo,
  canEdit,
  busy,
  orderId,
  onBusy,
  onError,
  onSuccess,
  onGarantiaChange,
  garantia,
  isOnline,
}: SlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (localPreview || !arquivo?.offlineBlobRef) return;
      const blob = await getGarantiaVacuumBlob(arquivo.offlineBlobRef);
      if (!blob || cancelled || !isImageMime(arquivo.mimeType)) return;
      setLocalPreview(URL.createObjectURL(blob));
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [arquivo?.offlineBlobRef, arquivo?.mimeType, localPreview]);

  useEffect(() => {
    return () => {
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const persistOffline = async (
    file: File,
    geo: { latitude: number; longitude: number; accuracy_meters: number | null; captured_at: string },
    parsedMicrons: string | null,
    deviceName: string | null,
    deviceSerial: string | null,
  ) => {
    if (!orderId) throw new Error("Salve a OS antes de anexar evidência offline.");
    const blobRef = arquivo?.offlineBlobRef ?? newVacuumOfflineBlobRef(orderId);
    await putGarantiaVacuumBlob(blobRef, file);
    const key = fieldKey(kind);
    const next: GarantiaVacuoArquivo = {
      id: arquivo?.id ?? `vacuo_${kind}_${Date.now()}`,
      kind,
      fileName: file.name,
      mimeType: file.type || (kind === "relatorio" ? "application/json" : "image/jpeg"),
      storageKey: null,
      publicUrl: null,
      offlineBlobRef: blobRef,
      syncStatus: "pending_upload",
      latitude: geo.latitude,
      longitude: geo.longitude,
      accuracyMeters: geo.accuracy_meters,
      capturedAt: geo.captured_at,
      capturedOffline: true,
      vacuoFinalMicronsAi: parsedMicrons,
      deviceName,
      deviceSerial,
    };
    const patch: Partial<ServiceOrderGarantiaFields> = { [key]: next };
    if (parsedMicrons && (kind === "relatorio" || !garantia.vacuoRelatorio?.vacuoFinalMicronsAi)) {
      patch.vacuoFinalMicrons = parsedMicrons;
    }
    onGarantiaChange(patch);
    onSuccess("Salvo offline — será enviado quando a conexão voltar.");
  };

  const processFile = async (file: File) => {
    if (!canEdit) return;
    onError(null);
    onSuccess(null);

    const valid =
      kind === "relatorio"
        ? isTestoTjfFile(file)
        : file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
    if (!valid) {
      onError(kind === "relatorio" ? "Selecione um arquivo .tjf exportado pelo app Testo." : "Use foto JPG, PNG ou WebP.");
      return;
    }
    if (!orderId) {
      onError("Salve a OS antes de arquivar a evidência.");
      return;
    }

    try {
      const geo = await captureGeolocation();
      let parsedMicrons: string | null = null;
      let deviceName: string | null = null;
      let deviceSerial: string | null = null;
      if (kind === "relatorio") {
        const parsed = await parseTestoTjfFile(file);
        parsedMicrons = parsed.vacuoFinalMicrons;
        deviceName = parsed.deviceName;
        deviceSerial = parsed.deviceSerial;
      }

      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
      if (kind === "foto") setLocalPreview(URL.createObjectURL(file));
      else setLocalPreview(null);

      if (!isOnline) {
        await persistOffline(file, geo, parsedMicrons, deviceName, deviceSerial);
        return;
      }

      onBusy(true);
      try {
        const upload = await uploadGarantiaVacuoEvidence(orderId, {
          file,
          evidenceKind: kind,
          latitude: geo.latitude,
          longitude: geo.longitude,
          accuracyMeters: geo.accuracy_meters,
          capturedAt: geo.captured_at,
          capturedOffline: false,
          extractVacuum: kind === "foto",
        });
        onGarantiaChange(garantiaPatchFromVacuoUpload(garantia, kind, upload));
        if (kind === "relatorio" && upload.vacuoFinalMicrons) {
          onSuccess(`Relatório Testo: vácuo mínimo ${upload.vacuoFinalMicrons} µ`);
        } else if (upload.vacuoFinalMicrons) {
          onSuccess(`IA leu ${upload.vacuoFinalMicrons} µ na foto`);
        } else {
          onSuccess("Arquivo arquivado com GPS.");
        }
        setLocalPreview(null);
      } catch {
        await persistOffline(file, geo, parsedMicrons, deviceName, deviceSerial);
      } finally {
        onBusy(false);
      }
    } catch (e) {
      if (e instanceof GeolocationError) onError(e.message);
      else onError(e instanceof Error ? e.message : "Falha ao processar arquivo.");
    }
  };

  const handleRemove = async () => {
    if (!canEdit) return;
    if (arquivo?.offlineBlobRef) await deleteGarantiaVacuumBlob(arquivo.offlineBlobRef);
    if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    onGarantiaChange({ [fieldKey(kind)]: null });
    onError(null);
    onSuccess(null);
  };

  const previewUrl =
    localPreview ?? (arquivo?.publicUrl && isImageMime(arquivo.mimeType) ? arquivo.publicUrl : null);
  const pending = arquivo?.syncStatus === "pending_upload" && Boolean(arquivo.offlineBlobRef);
  const synced = arquivo?.syncStatus === "synced" && Boolean(arquivo.storageKey);

  return (
    <div className={styles.slot}>
      <div className={styles.slotHead}>
        <h5 className={styles.slotTitle}>{title}</h5>
        <div className={styles.vacuoBadges}>
          {pending ? <span className={styles.badgeOffline}>Offline</span> : null}
          {synced ? <span className={styles.badgeSynced}>OK</span> : null}
        </div>
      </div>
      <p className={styles.slotLead}>{lead}</p>

      {previewUrl ? (
        <div className={styles.previewWrap}>
          <img src={previewUrl} alt={title} className={styles.preview} />
        </div>
      ) : arquivo?.fileName && kind === "relatorio" ? (
        <p className={styles.fileChip}>
          <FileJson size={14} aria-hidden /> {arquivo.fileName}
          {arquivo.publicUrl ? (
            <a className={styles.previewLink} href={arquivo.publicUrl} target="_blank" rel="noreferrer">
              Abrir
            </a>
          ) : null}
        </p>
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
          <UploadCloud size={22} aria-hidden />
          <p>{busy ? "Processando…" : kind === "relatorio" ? "Arquivo .tjf" : "Foto do visor"}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture ? "environment" : undefined}
        className={styles.hiddenInput}
        disabled={!canEdit || busy}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (file) void processFile(file);
          e.target.value = "";
        }}
      />

      {arquivo?.vacuoFinalMicronsAi ? (
        <p className={styles.extracted}>
          {kind === "relatorio" ? "Testo" : <Sparkles size={12} />}{" "}
          <strong>{arquivo.vacuoFinalMicronsAi} µ</strong>
          {arquivo.deviceName ? ` · ${arquivo.deviceName}` : ""}
        </p>
      ) : null}

      {arquivo && canEdit ? (
        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} disabled={busy} onClick={() => inputRef.current?.click()}>
            Trocar
          </button>
          <button type="button" className={styles.btnSecondary} disabled={busy} onClick={() => void handleRemove()}>
            Remover
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function GarantiaVacuoField({ orderId, garantia, canEdit, onGarantiaChange }: Props) {
  const { isOnline } = useConnectivity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const tryAutoSync = useCallback(async () => {
    if (!orderId || !isOnline || syncingRef.current) return;
    const kinds = listVacuoPendingUploads(garantia);
    if (!kinds.length) return;
    syncingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      let merged = garantia;
      for (const kind of kinds) {
        const patch = await syncGarantiaVacuumUpload(orderId, merged, kind);
        if (patch) {
          merged = { ...merged, ...patch };
          onGarantiaChange(patch);
        }
      }
      setSuccess("Evidências de vácuo enviadas automaticamente.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sincronizar.");
    } finally {
      syncingRef.current = false;
      setBusy(false);
    }
  }, [garantia, isOnline, onGarantiaChange, orderId]);

  useEffect(() => {
    void tryAutoSync();
  }, [isOnline, tryAutoSync, garantia.vacuoFoto?.syncStatus, garantia.vacuoRelatorio?.syncStatus]);

  const hasGeo =
    (garantia.vacuoFoto?.latitude != null && garantia.vacuoFoto?.longitude != null) ||
    (garantia.vacuoRelatorio?.latitude != null && garantia.vacuoRelatorio?.longitude != null);

  return (
    <div className={styles.vacuoBlock}>
      <div className={styles.vacuoHead}>
        <h4 className={styles.vacuoTitle}>
          <Gauge size={16} style={{ verticalAlign: "text-bottom", marginRight: 4 }} />
          Vácuo final — evidências
        </h4>
        {hasGeo ? (
          <span className={styles.badgeGeo}>
            <MapPinCheck size={13} aria-hidden />
            GPS registrado
          </span>
        ) : null}
      </div>

      <div className={styles.vacuoRow}>
        <label className={styles.metricField}>
          <span className={styles.label}>Valor final (µ)</span>
          <div className={styles.metricInputWrap}>
            <input
              className={styles.input}
              disabled={!canEdit}
              value={garantia.vacuoFinalMicrons}
              placeholder="Ex.: 300"
              onChange={(e) => onGarantiaChange({ vacuoFinalMicrons: e.target.value })}
            />
            <span className={styles.metricUnit}>µ</span>
          </div>
          <span className={styles.fieldHint}>Prioridade: relatório Testo (.tjf) → foto (IA) → manual</span>
        </label>

        <div className={styles.uploadGrid}>
          <VacuoEvidenceSlot
            kind="foto"
            title="Foto do visor"
            lead="Fotografe o vacuômetro. A IA lê o valor em microns."
            accept="image/*"
            capture
            arquivo={garantia.vacuoFoto}
            canEdit={canEdit}
            busy={busy}
            orderId={orderId}
            onBusy={setBusy}
            onError={setError}
            onSuccess={setSuccess}
            onGarantiaChange={onGarantiaChange}
            garantia={garantia}
            isOnline={isOnline}
          />
          <VacuoEvidenceSlot
            kind="relatorio"
            title="Relatório Testo (.tjf)"
            lead="Exporte do app Testo Smart e anexe o arquivo .tjf — o vácuo mínimo é lido automaticamente."
            accept=".tjf,application/json"
            arquivo={garantia.vacuoRelatorio}
            canEdit={canEdit}
            busy={busy}
            orderId={orderId}
            onBusy={setBusy}
            onError={setError}
            onSuccess={setSuccess}
            onGarantiaChange={onGarantiaChange}
            garantia={garantia}
            isOnline={isOnline}
          />
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {success ? <p className={styles.success}>{success}</p> : null}
      {!orderId && canEdit ? (
        <p className={styles.error}>Salve a OS uma vez para habilitar o arquivamento.</p>
      ) : null}
    </div>
  );
}
