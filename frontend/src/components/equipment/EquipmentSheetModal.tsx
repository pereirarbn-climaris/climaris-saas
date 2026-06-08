import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Save } from "lucide-react";
import type { ClientSiteOut } from "../../api/clients";
import { fetchCurrentTenant, type TenantOut } from "../../api/auth";
import { listHvacEquipmentHistory } from "../../api/clients";
import { updateClientCatalogEquipment } from "../../api/equipmentCatalog";
import { buildTechnicalSpecRows } from "../../lib/categoryFieldDefinitions";
import { mapHistoryRowsToMaintenanceEvents } from "../../lib/equipmentProfileAdapter";
import { buildPublicEquipmentUrl } from "../../lib/publicEquipmentUrl";
import { toast } from "../../lib/toast";
import { getTenantDisplayName } from "../../lib/tenantDisplay";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import {
  buildEquipmentEditDraft,
  EquipmentSheetEditForm,
  type EquipmentEditDraft,
} from "./EquipmentSheetEditForm";
import { EquipmentSheetEmbeddedView } from "./EquipmentSheetEmbeddedView";
import { EquipmentThermalLabelPrint } from "./EquipmentThermalLabelPrint";
import { EquipmentTechnicalSpecsGrid } from "./EquipmentTechnicalSpecsGrid";
import styles from "./EquipmentSheetModal.module.css";

type Props = {
  equipment: EquipmentItem;
  clientId: number;
  clientSites?: ClientSiteOut[];
  readOnly?: boolean;
  onClose: () => void;
  onUpdated?: () => void;
};

export function EquipmentSheetModal({
  equipment,
  clientId,
  clientSites,
  readOnly = false,
  onClose,
  onUpdated,
}: Props) {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState("");
  const [maintenanceHistory, setMaintenanceHistory] = useState(
    () => [] as ReturnType<typeof mapHistoryRowsToMaintenanceEvents>,
  );
  const [tenant, setTenant] = useState<TenantOut | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<EquipmentEditDraft>(() => buildEquipmentEditDraft(equipment));
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    setIsEditing(false);
    setEditDraft(buildEquipmentEditDraft(equipment));
  }, [equipment]);

  const publicUrl =
    equipment.qrcodeCodeId?.trim()
      ? buildPublicEquipmentUrl(equipment.qrcodeCodeId)
      : equipment.publicToken
        ? buildPublicEquipmentUrl(equipment.publicToken)
        : null;

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentTenant()
      .then((t) => {
        if (!cancelled) setTenant(t);
      })
      .catch(() => {
        if (!cancelled) setTenant(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isEditing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isEditing]);

  useEffect(() => {
    if (!equipment.legacyEquipmentId) {
      setMaintenanceHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryErr("");
    void (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, equipment.legacyEquipmentId]);

  const multiSplitSlot = useMemo(() => {
    if (!isMultiSplit(equipment) || !equipment.components?.length) return null;
    return (
      <div className={styles.componentsWrap}>
        <h3 className={styles.componentsTitle}>Componentes</h3>
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
                {part.serialNumber ? <p className={styles.componentMeta}>Série: {part.serialNumber}</p> : null}
                {partSpecs.length > 0 ? <EquipmentTechnicalSpecsGrid specs={partSpecs} compact /> : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }, [equipment]);

  async function handleSaveEdit() {
    const tag = editDraft.tag.trim();
    if (!tag) {
      toast.error("Informe o local / identificação do equipamento.");
      return;
    }

    const components =
      equipment.components?.map((part) => ({
        id: part.id,
        serial_number: editDraft.componentSerials[part.id]?.trim() || null,
      })) ?? [];

    setSavingEdit(true);
    try {
      await updateClientCatalogEquipment(equipment.id, {
        tag,
        installation_reference: editDraft.installationReference.trim() || null,
        installation_date: editDraft.installationDate || null,
        is_active: editDraft.status === "ativo",
        client_site_id: editDraft.clientSiteId,
        components: components.length > 0 ? components : undefined,
      });
      toast.success("Equipamento atualizado.");
      setIsEditing(false);
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isEditing) onClose();
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="equipment-sheet-title">
        {publicUrl && tenant ? (
          <EquipmentThermalLabelPrint
            providerName={getTenantDisplayName(tenant)}
            logoUrl={tenant.logo_url}
            publicUrl={publicUrl}
            tag={equipment.tag}
            brand={equipment.brandName ?? ""}
            model={equipment.modelName ?? ""}
          />
        ) : null}
        <div className={styles.body}>
          <EquipmentSheetEmbeddedView
            equipment={equipment}
            publicUrl={publicUrl}
            history={maintenanceHistory}
            historyLoading={historyLoading}
            historyError={historyErr || null}
            middleSlot={!isEditing ? multiSplitSlot : null}
            readOnly={readOnly}
            isEditing={isEditing}
            editForm={
              isEditing ? (
                <EquipmentSheetEditForm
                  equipment={equipment}
                  draft={editDraft}
                  clientSites={clientSites}
                  disabled={savingEdit}
                  onChange={setEditDraft}
                />
              ) : null
            }
            onClose={onClose}
            onPrintLabel={publicUrl ? () => window.print() : undefined}
          />
        </div>

        <footer className={styles.footer}>
          {isEditing ? (
            <>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={savingEdit}
                onClick={() => {
                  setEditDraft(buildEquipmentEditDraft(equipment));
                  setIsEditing(false);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={savingEdit}
                onClick={() => void handleSaveEdit()}
              >
                <Save size={16} aria-hidden />
                {savingEdit ? "Salvando…" : "Salvar alterações"}
              </button>
            </>
          ) : (
            <>
              {!readOnly ? (
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => {
                    setEditDraft(buildEquipmentEditDraft(equipment));
                    setIsEditing(true);
                  }}
                >
                  <Pencil size={16} aria-hidden />
                  Editar
                </button>
              ) : null}
              <button type="button" className={styles.btnGhost} onClick={onClose}>
                Fechar
              </button>
              {equipment.legacyEquipmentId ? (
                <Link to="/app/service-orders" className={styles.btnPrimary}>
                  Ver ordens de serviço
                </Link>
              ) : null}
            </>
          )}
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
