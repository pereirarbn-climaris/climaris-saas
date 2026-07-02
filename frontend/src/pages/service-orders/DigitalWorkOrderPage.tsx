import { useCallback, useEffect, useMemo, useState } from "react";

import { Link, Navigate, useLocation, useOutletContext, useParams } from "react-router-dom";

import {

  DIGITAL_WORK_ORDER_CONFLICT_TOAST,

  getDigitalWorkOrderByServiceOrder,

  postDigitalWorkOrderMeasurements,

  uploadDigitalWorkOrderEvidence,

  validateDigitalWorkOrder,

  type DigitalWorkOrderDetailOut,

  type DigitalWorkOrderEvidenceOut,

} from "../../api/digitalWorkOrders";

import { ComplianceBlockedAlert } from "../../components/service-orders/ComplianceBlockedAlert";

import { EvidenceUploader } from "../../features/digital-work-order/components/EvidenceUploader";

import { useOfflineDigitalWorkOrder } from "../../features/digital-work-order/hooks/useOfflineDigitalWorkOrder";

import { useConnectivity } from "../../hooks/useConnectivity";

import {

  deleteOfflineEvidenceBlob,

  getOfflineEvidenceBlob,

  updateOfflineDraftVersion,

} from "../../features/digital-work-order/lib/offlineEvidenceStore";

import { parseMeasurementValues, validateOfflineRequirements } from "../../features/digital-work-order/lib/offlineValidation";

import type { OfflineDigitalWorkOrderDraft } from "../../features/digital-work-order/types";

import type { ServiceOrderMissingRequirement } from "../../types/serviceOrders";

import type { DashboardOutletContext } from "../dashboardContext";

import styles from "./DigitalWorkOrderPage.module.css";



type LocationState = { digitalWorkOrderId?: string };



type RequiredMeasurementSpec = {

  key: string;

  unit?: string;

  label?: string;

};



type RequiredEvidenceSpec = {

  key: string;

  label: string;

};



const DEFAULT_MEASUREMENTS: RequiredMeasurementSpec[] = [

  { key: "pressao_succao", unit: "psi", label: "Pressão de sucção" },

  { key: "pressao_descarga", unit: "psi", label: "Pressão de descarga" },

  { key: "corrente_compressor", unit: "A", label: "Corrente do compressor" },

  { key: "temp_evaporacao", unit: "°C", label: "Temperatura de evaporação" },

];



const DEFAULT_EVIDENCES: RequiredEvidenceSpec[] = [

  { key: "placa_identificacao", label: "Foto da placa de identificação" },

  { key: "ambiente_instalacao", label: "Foto do ambiente de instalação" },

];



const MEASUREMENT_KEYS = DEFAULT_MEASUREMENTS.map((s) => s.key);

const EVIDENCE_KEYS = DEFAULT_EVIDENCES.map((s) => s.key);

const DEBOUNCE_MS = 400;



export function DigitalWorkOrderPage() {

  const ctx = useOutletContext<DashboardOutletContext | undefined>();

  const { orderId } = useParams<{ orderId: string }>();

  const location = useLocation();

  const idNum = orderId ? Number(orderId) : NaN;

  const technicianMode = location.pathname.includes("/tecnico/os/");

  const { isOnline } = useConnectivity();



  const [digital, setDigital] = useState<DigitalWorkOrderDetailOut | null>(null);

  const [evidences, setEvidences] = useState<DigitalWorkOrderEvidenceOut[]>([]);

  const [missing, setMissing] = useState<ServiceOrderMissingRequirement[]>([]);

  const [values, setValues] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [finalizing, setFinalizing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const [localFinalized, setLocalFinalized] = useState(false);



  const backHref = technicianMode ? `/app/tecnico/os/${idNum}` : `/app/service-orders/${idNum}`;

  const offlineClientId = `dwo-${idNum}`;



  const evidenceByKey = useMemo(() => {

    const map = new Map<string, DigitalWorkOrderEvidenceOut>();

    for (const row of evidences) {

      map.set(row.evidence_key, row);

    }

    return map;

  }, [evidences]);



  const refreshValidation = useCallback(async (digitalId: string) => {

    if (!isOnline) return null;

    const validation = await validateDigitalWorkOrder(digitalId);

    setMissing(validation.missing_requirements);

    return validation;

  }, [isOnline]);



  const load = useCallback(async () => {

    if (!Number.isFinite(idNum)) return;

    setLoading(true);

    setError(null);

    try {

      if (isOnline) {

        const row = await getDigitalWorkOrderByServiceOrder(idNum);

        setDigital(row);

        setEvidences(row.evidences ?? []);

        await updateOfflineDraftVersion(offlineClientId, row.version);

        await refreshValidation(row.id);

      }

    } catch (e) {

      if (isOnline) {

        setError(e instanceof Error ? e.message : "Erro ao carregar OS digital.");

      }

    } finally {

      setLoading(false);

    }

  }, [idNum, isOnline, offlineClientId, refreshValidation]);



  const syncOfflineDraft = useCallback(

    async (draft: OfflineDigitalWorkOrderDraft) => {

      const row = await getDigitalWorkOrderByServiceOrder(draft.service_order_id);

      const targetId = row.id;

      let currentVersion = draft.last_version ?? row.version;

      let conflictDetected = false;



      const measurements =

        draft.measurements.length > 0

          ? draft.measurements

          : parseMeasurementValues(draft.measurement_values, DEFAULT_MEASUREMENTS);



      if (measurements.length > 0) {

        const result = await postDigitalWorkOrderMeasurements(

          targetId,

          measurements.map((m) => ({

            metric_key: m.metric_key,

            value_numeric: m.value_numeric,

            value_text: m.value_text,

            unit: m.unit,

            recorded_offline: true,

          })),

          { last_version: currentVersion },

        );

        conflictDetected = conflictDetected || result.conflict_detected;

        currentVersion = result.version;

        await updateOfflineDraftVersion(draft.offline_client_id, currentVersion);

      }



      for (const ev of draft.evidences) {

        if (!ev.blob_ref) continue;

        const blob = await getOfflineEvidenceBlob(ev.blob_ref);

        if (!blob) continue;

        const file = new File([blob], `${ev.evidence_key}.jpg`, {

          type: ev.mime_type || blob.type || "image/jpeg",

        });

        const uploadResult = await uploadDigitalWorkOrderEvidence(targetId, {

          evidence_key: ev.evidence_key,

          file,

          latitude: ev.latitude ?? 0,

          longitude: ev.longitude ?? 0,

          accuracy_meters: ev.accuracy_meters,

          captured_at: ev.captured_at,

          captured_offline: true,

          last_version: currentVersion,

        });

        conflictDetected = conflictDetected || uploadResult.conflict_detected;

        currentVersion = uploadResult.version;

        await updateOfflineDraftVersion(draft.offline_client_id, currentVersion);

        await deleteOfflineEvidenceBlob(ev.blob_ref);

      }



      const refreshed = await getDigitalWorkOrderByServiceOrder(draft.service_order_id);

      setDigital(refreshed);

      setEvidences(refreshed.evidences ?? []);

      await refreshValidation(refreshed.id);

      return { conflictDetected, version: currentVersion };

    },

    [refreshValidation],

  );



  const showConflictToast = useCallback(() => {

    setToast(DIGITAL_WORK_ORDER_CONFLICT_TOAST);

  }, []);



  const { isSyncing, pendingCount, draft, draftLoaded, saveDraft, finalizeOffline } = useOfflineDigitalWorkOrder(

    offlineClientId,

    idNum,

    syncOfflineDraft,

    showConflictToast,

  );



  useEffect(() => {

    void load();

  }, [load]);



  useEffect(() => {

    if (!draftLoaded || !draft) return;

    setValues((prev) => ({ ...draft.measurement_values, ...prev }));

    setLocalFinalized(draft.sync_status === "pending_sync");

  }, [draft, draftLoaded]);



  const debouncedValues = useDebouncedValue(values, DEBOUNCE_MS);



  useEffect(() => {

    if (!Number.isFinite(idNum) || !draftLoaded) return;



    const measurements = parseMeasurementValues(debouncedValues, DEFAULT_MEASUREMENTS);

    const hasMeasurements = Object.values(debouncedValues).some((v) => v.trim() !== "");

    if (!hasMeasurements && !draft?.evidences.length) return;



    void saveDraft({

      offline_client_id: offlineClientId,

      service_order_id: idNum,

      measurement_values: debouncedValues,

      measurements,

      sync_status: draft?.sync_status === "pending_sync" ? "pending_sync" : "pending",

    });

  }, [debouncedValues, draft?.evidences.length, draft?.sync_status, draftLoaded, idNum, offlineClientId, saveDraft]);



  const offlineEvidenceByKey = useMemo(() => {

    const map = new Map<string, NonNullable<typeof draft>["evidences"][number]>();

    for (const row of draft?.evidences ?? []) {

      map.set(row.evidence_key, row);

    }

    return map;

  }, [draft?.evidences]);



  const handleSaveMeasurements = async () => {

    if (!digital && isOnline) return;

    setSaving(true);

    setToast(null);

    try {

      const measurements = parseMeasurementValues(values, DEFAULT_MEASUREMENTS);



      if (measurements.length === 0) {

        setToast("Informe ao menos uma medição.");

        return;

      }



      await saveDraft({

        offline_client_id: offlineClientId,

        service_order_id: idNum,

        measurement_values: values,

        measurements,

        sync_status: localFinalized ? "pending_sync" : "pending",

      });



      if (!isOnline) {

        setToast("Medições salvas localmente. Serão sincronizadas ao reconectar.");

        return;

      }



      if (!digital) return;

      const lastVersion = draft?.last_version ?? digital.version;

      const result = await postDigitalWorkOrderMeasurements(digital.id, measurements, { last_version: lastVersion });

      if (result.conflict_detected) {

        setToast(DIGITAL_WORK_ORDER_CONFLICT_TOAST);

      }

      setDigital((prev) => (prev ? { ...prev, version: result.version } : prev));

      await updateOfflineDraftVersion(offlineClientId, result.version);

      const validation = await refreshValidation(digital.id);

      if (!result.conflict_detected) {

        setToast(validation?.can_finalize ? "Compliance atendido. Você pode concluir a OS." : "Medições salvas.");

      }

    } catch (e) {

      setToast(e instanceof Error ? e.message : "Erro ao salvar medições.");

    } finally {

      setSaving(false);

    }

  };



  const handleFinalizeOffline = async () => {

    setFinalizing(true);

    setToast(null);

    try {

      const offlineEvidenceKeys = new Set((draft?.evidences ?? []).map((e) => e.evidence_key));

      const serverEvidenceKeys = new Set(evidences.map((e) => e.evidence_key));

      const localMissing = validateOfflineRequirements(

        values,

        MEASUREMENT_KEYS,

        EVIDENCE_KEYS,

        offlineEvidenceKeys,

        serverEvidenceKeys,

      );



      if (localMissing.length > 0) {

        setToast(`Preencha todos os campos obrigatórios antes de finalizar: ${localMissing.join(", ")}`);

        return;

      }



      const measurements = parseMeasurementValues(values, DEFAULT_MEASUREMENTS);

      await saveDraft({

        offline_client_id: offlineClientId,

        service_order_id: idNum,

        measurement_values: values,

        measurements,

      });

      await finalizeOffline();

      setLocalFinalized(true);

      setToast("OS finalizada localmente (pending_sync). O compliance será validado após a sincronização.");

    } catch (e) {

      setToast(e instanceof Error ? e.message : "Erro ao finalizar offline.");

    } finally {

      setFinalizing(false);

    }

  };



  const handleEvidenceUploaded = async (evidence: DigitalWorkOrderEvidenceOut) => {

    setEvidences((prev) => {

      const next = prev.filter((row) => row.evidence_key !== evidence.evidence_key);

      return [...next, evidence];

    });

    if (digital) {

      await refreshValidation(digital.id);

    }

    setToast("Evidência registrada com geolocalização.");

  };



  if (!ctx) return <Navigate to="/login" replace />;

  if (!Number.isFinite(idNum)) return <Navigate to={technicianMode ? "/app/agenda" : "/app/service-orders"} replace />;



  const state = location.state as LocationState | null;

  const showOfflineBanner = !isOnline;

  const showPendingSync = localFinalized || draft?.sync_status === "pending_sync";



  return (

    <div className={styles.wrap}>

      {showOfflineBanner ? (

        <div className={styles.offlineBannerFixed} role="status">

          Modo Offline: Dados sendo salvos localmente

        </div>

      ) : null}



      <Link className={styles.back} to={backHref}>

        ← Voltar à OS

      </Link>



      <header className={styles.header}>

        <h1 className={styles.title}>OS Digital #{idNum}</h1>

        <p className={styles.subtitle}>Preencha medições e evidências exigidas pelo fabricante antes de concluir.</p>

        {isSyncing ? <p className={styles.muted}>Sincronizando {pendingCount} item(ns) pendente(s)…</p> : null}

        {showPendingSync ? (

          <p className={styles.pendingSyncBadge}>

            Finalizada localmente — aguardando sincronização (pending_sync). Compliance será validado no servidor.

          </p>

        ) : null}

      </header>



      {loading && isOnline ? <p className={styles.muted}>Carregando…</p> : null}

      {error ? <p className={styles.error}>{error}</p> : null}



      {isOnline && missing.length > 0 ? (

        <ComplianceBlockedAlert

          missingRequirements={missing}

          serviceOrderId={idNum}

          digitalWorkOrderId={digital?.id ?? state?.digitalWorkOrderId ?? null}

          technicianMode={technicianMode}

        />

      ) : null}



      <section className={styles.card}>

        <h2 className={styles.cardTitle}>Medições de engenharia</h2>

        <div className={styles.grid}>

          {DEFAULT_MEASUREMENTS.map((spec) => (

            <label key={spec.key} className={styles.field}>

              <span>

                {spec.label} {spec.unit ? `(${spec.unit})` : ""}

              </span>

              <input

                type="text"

                inputMode="decimal"

                value={values[spec.key] ?? ""}

                onChange={(e) => setValues((prev) => ({ ...prev, [spec.key]: e.target.value }))}

                placeholder="0"

              />

            </label>

          ))}

        </div>

        <div className={styles.actions}>

          <button

            type="button"

            className={styles.btnPrimary}

            disabled={saving || (isOnline && !digital)}

            onClick={() => void handleSaveMeasurements()}

          >

            {saving ? "Salvando…" : isOnline ? "Salvar medições" : "Salvar medições offline"}

          </button>

          {!isOnline && !showPendingSync ? (

            <button

              type="button"

              className={styles.btnSecondary}

              disabled={finalizing}

              onClick={() => void handleFinalizeOffline()}

            >

              {finalizing ? "Finalizando…" : "Finalizar OS offline"}

            </button>

          ) : null}

        </div>

        {toast ? <p className={styles.toast}>{toast}</p> : null}

      </section>



      {digital || !isOnline || draft?.evidences.length ? (

        <section className={styles.card}>

          <h2 className={styles.cardTitle}>Evidências fotográficas</h2>

          <p className={styles.cardHint}>A geolocalização é capturada no momento em que você seleciona a foto.</p>

          <div className={styles.evidenceList}>

            {DEFAULT_EVIDENCES.map((spec) => (

              <EvidenceUploader

                key={spec.key}

                digitalWorkOrderId={digital?.id ?? ""}

                serviceOrderId={idNum}

                evidenceKey={spec.key}

                label={spec.label}

                required

                isOnline={isOnline}

                existingEvidence={evidenceByKey.get(spec.key) ?? null}

                offlineEvidenceDraft={offlineEvidenceByKey.get(spec.key) ?? null}

                lastVersion={draft?.last_version ?? digital?.version ?? 1}

                saveOfflineDraft={saveDraft}

                onUploaded={(evidence) => void handleEvidenceUploaded(evidence)}

                onSyncResult={(meta) => {

                  void updateOfflineDraftVersion(offlineClientId, meta.version);

                  setDigital((prev) => (prev ? { ...prev, version: meta.version } : prev));

                  if (meta.conflict_detected) {

                    setToast(DIGITAL_WORK_ORDER_CONFLICT_TOAST);

                  }

                }}

                onOfflineQueued={() => setToast("Foto salva localmente.")}

              />

            ))}

          </div>

        </section>

      ) : null}

    </div>

  );

}



function useDebouncedValue<T>(value: T, delayMs: number): T {

  const [debounced, setDebounced] = useState(value);

  useEffect(() => {

    const timer = window.setTimeout(() => setDebounced(value), delayMs);

    return () => window.clearTimeout(timer);

  }, [value, delayMs]);

  return debounced;

}


