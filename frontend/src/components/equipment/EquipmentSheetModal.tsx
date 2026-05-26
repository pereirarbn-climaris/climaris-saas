import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCurrentTenant, type TenantOut } from "../../api/auth";
import { listHvacEquipmentHistory, listHvacEquipmentPreventiveHistory } from "../../api/clients";
import { updateClientCatalogEquipmentInstallationReference } from "../../api/equipmentCatalog";
import { buildTechnicalSpecRows } from "../../lib/categoryFieldDefinitions";
import {
  mapEquipmentItemToProfile,
  mapHistoryRowsToMaintenanceEvents,
  mapTenantOutToProvider,
} from "../../lib/equipmentProfileAdapter";
import { buildPublicEquipmentUrl } from "../../lib/publicEquipmentUrl";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import { PublicEquipmentProfileView } from "../v0-ui/clients/PublicEquipmentProfileView v2";
import { EquipmentTechnicalSpecsGrid } from "./EquipmentTechnicalSpecsGrid";
import styles from "./EquipmentSheetModal.module.css";

type Props = {
  equipment: EquipmentItem;
  clientId: number;
  readOnly?: boolean;
  onClose: () => void;
  onUpdated?: () => void;
};

export function EquipmentSheetModal({ equipment, clientId, readOnly = false, onClose, onUpdated }: Props) {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState("");
  const [maintenanceHistory, setMaintenanceHistory] = useState(
    () => [] as ReturnType<typeof mapHistoryRowsToMaintenanceEvents>,
  );
  const [preventiveHistory, setPreventiveHistory] = useState(
    () => [] as ReturnType<typeof mapHistoryRowsToMaintenanceEvents>,
  );
  const [preventiveHistoryLoading, setPreventiveHistoryLoading] = useState(false);
  const [preventiveHistoryErr, setPreventiveHistoryErr] = useState("");
  const [tenant, setTenant] = useState<TenantOut | null>(null);
  const [installationReference, setInstallationReference] = useState(equipment.installationReference ?? "");
  const [savingReference, setSavingReference] = useState(false);
  const [referenceErr, setReferenceErr] = useState("");
  const [referenceOk, setReferenceOk] = useState("");

  useEffect(() => {
    setInstallationReference(equipment.installationReference ?? "");
    setReferenceErr("");
    setReferenceOk("");
  }, [equipment.id, equipment.installationReference]);

  const publicUrl =
    equipment.qrcodeCodeId?.trim()
      ? buildPublicEquipmentUrl(equipment.qrcodeCodeId)
      : equipment.publicToken
        ? buildPublicEquipmentUrl(equipment.publicToken)
        : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await fetchCurrentTenant();
        if (!cancelled) setTenant(current);
      } catch {
        if (!cancelled) setTenant(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!equipment.legacyEquipmentId) {
      setMaintenanceHistory([]);
      setPreventiveHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryErr("");
    setPreventiveHistoryLoading(true);
    setPreventiveHistoryErr("");
    void (async () => {
      const loadGeneral = async () => {
        try {
          const rows = await listHvacEquipmentHistory(clientId, equipment.legacyEquipmentId!);
          if (!cancelled) setMaintenanceHistory(mapHistoryRowsToMaintenanceEvents(rows));
        } catch (e) {
          if (!cancelled) {
            setHistoryErr(e instanceof Error ? e.message : "Não foi possível carregar o histórico.");
          }
        } finally {
          if (!cancelled) setHistoryLoading(false);
        }
      };
      const loadPreventive = async () => {
        try {
          const preventiveRows = await listHvacEquipmentPreventiveHistory(
            clientId,
            equipment.legacyEquipmentId!,
          );
          if (!cancelled) setPreventiveHistory(mapHistoryRowsToMaintenanceEvents(preventiveRows));
        } catch (e) {
          if (!cancelled) {
            setPreventiveHistoryErr(
              e instanceof Error ? e.message : "Não foi possível carregar o histórico preventivo.",
            );
          }
        } finally {
          if (!cancelled) setPreventiveHistoryLoading(false);
        }
      };
      void Promise.all([loadGeneral(), loadPreventive()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, equipment.legacyEquipmentId]);

  const provider = useMemo(
    () => (tenant ? mapTenantOutToProvider(tenant) : { name: "Empresa" }),
    [tenant],
  );

  const equipmentProfile = useMemo(
    () =>
      mapEquipmentItemToProfile(equipment, {
        provider,
        maintenanceHistory,
        publicUrl,
      }),
    [equipment, provider, maintenanceHistory, publicUrl],
  );

  const multiSplitSlot =
    isMultiSplit(equipment) && equipment.components?.length ? (
      <div
        className="
          bg-white rounded-xl border border-slate-200
          p-4
        "
      >
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Componentes</h3>
        <ul className={styles.componentsList}>
          {equipment.components.map((part) => {
            const partDefs = part.fieldDefinitions?.length
              ? part.fieldDefinitions
              : equipment.fieldDefinitions ?? [];
            const partSpecs = buildTechnicalSpecRows(partDefs, part.technicalData ?? {});
            return (
              <li key={part.id} className={styles.componentBlock}>
                <p className={styles.componentTitle}>
                  {part.brand} · {part.model}
                </p>
                {part.serialNumber ? (
                  <p className={styles.componentMeta}>Série: {part.serialNumber}</p>
                ) : null}
                {partSpecs.length > 0 ? (
                  <EquipmentTechnicalSpecsGrid specs={partSpecs} compact />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  const locationReferenceSlot = (
    <div className={styles.referenceBox}>
      <label className={styles.referenceLabel} htmlFor="equipment-installation-reference">
        Referência de localização
      </label>
      <textarea
        id="equipment-installation-reference"
        className={styles.referenceInput}
        rows={3}
        value={installationReference}
        disabled={readOnly || savingReference}
        placeholder="Ex: Teto falso - Sala de reunião - Ao lado da janela"
        onChange={(e) => setInstallationReference(e.target.value)}
      />
      {!readOnly ? (
        <div className={styles.referenceActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={savingReference}
            onClick={() => {
              setSavingReference(true);
              setReferenceErr("");
              setReferenceOk("");
              void (async () => {
                try {
                  await updateClientCatalogEquipmentInstallationReference(
                    equipment.id,
                    installationReference.trim() || null,
                  );
                  setReferenceOk("Referência salva.");
                  onUpdated?.();
                } catch (e) {
                  setReferenceErr(
                    e instanceof Error ? e.message : "Não foi possível salvar a referência de localização.",
                  );
                } finally {
                  setSavingReference(false);
                }
              })();
            }}
          >
            {savingReference ? "Salvando…" : "Salvar referência"}
          </button>
        </div>
      ) : null}
      {referenceErr ? <p className={styles.referenceErr}>{referenceErr}</p> : null}
      {referenceOk ? <p className={styles.referenceOk}>{referenceOk}</p> : null}
    </div>
  );

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="equipment-sheet-title">
        <div className={styles.body}>
          <PublicEquipmentProfileView
            equipment={equipmentProfile}
            variant="embedded"
            onClose={onClose}
            historyLoading={historyLoading}
            historyError={historyErr || null}
            preventiveHistory={preventiveHistory}
            preventiveHistoryLoading={preventiveHistoryLoading}
            preventiveHistoryError={preventiveHistoryErr || null}
            middleSlot={
              <>
                {locationReferenceSlot}
                {multiSplitSlot}
              </>
            }
          />
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            Fechar
          </button>
          {equipment.legacyEquipmentId ? (
            <Link to="/app/service-orders" className={styles.btnPrimary}>
              Ver ordens de serviço
            </Link>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function isMultiSplit(equipment: EquipmentItem): boolean {
  const parts = equipment.components ?? [];
  if (parts.length <= 1) return false;
  return parts.some((c) => c.componentType === "CONDENSADORA" || c.componentType === "EVAPORADORA");
}