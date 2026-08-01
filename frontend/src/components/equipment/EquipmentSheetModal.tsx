import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Save, X } from "lucide-react";
import type { ClientSiteOut } from "../../api/clients";
import { fetchCurrentTenant, type TenantOut } from "../../api/auth";
import { listHvacEquipmentHistory } from "../../api/clients";
import { updateClientCatalogEquipment } from "../../api/equipmentCatalog";
import { generateQrCodes, validateQrCode } from "../../api/qrcodes";
import { buildTechnicalSpecRows } from "../../lib/categoryFieldDefinitions";
import { mapHistoryRowsToMaintenanceEvents } from "../../lib/equipmentProfileAdapter";
import { buildPublicEquipmentUrl } from "../../lib/publicEquipmentUrl";
import { parseScannedQrCode } from "../../lib/qrcodeScan";
import { buildQrLabelPreviewItems, buildQrLabelsPdfBlob } from "../../lib/qrcodeLabelsPdf";
import { toast } from "../../lib/toast";
import { getTenantDisplayName } from "../../lib/tenantDisplay";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import { QrCodeScannerModal } from "../qrcodes/QrCodeScannerModal";
import { EquipmentQrCodeCard } from "./EquipmentQrCodeCard";
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
  /** Abre a ficha já em modo de edição (ex.: ação "Editar equipamento" da listagem). */
  initialEditing?: boolean;
  onClose: () => void;
  onUpdated?: () => void;
};

export function EquipmentSheetModal({
  equipment,
  clientId,
  clientSites,
  readOnly = false,
  initialEditing = false,
  onClose,
  onUpdated,
}: Props) {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState("");
  const [maintenanceHistory, setMaintenanceHistory] = useState(
    () => [] as ReturnType<typeof mapHistoryRowsToMaintenanceEvents>,
  );
  const [tenant, setTenant] = useState<TenantOut | null>(null);
  const [isEditing, setIsEditing] = useState(Boolean(initialEditing) && !readOnly);
  const [editDraft, setEditDraft] = useState<EquipmentEditDraft>(() => buildEquipmentEditDraft(equipment));
  const [savingEdit, setSavingEdit] = useState(false);

  const existingQr = (equipment.qrcodeCodeId ?? "").trim();
  const [qrcodeCodeId, setQrcodeCodeId] = useState(existingQr);
  const [qrcodeLocked, setQrcodeLocked] = useState(Boolean(existingQr));
  const [qrcodeMsg, setQrcodeMsg] = useState(existingQr ? "QR Code já vinculado a este equipamento." : "");
  const [qrcodeValidating, setQrcodeValidating] = useState(false);
  const [qrcodeGenerating, setQrcodeGenerating] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrChanging, setQrChanging] = useState(false);

  function resetQrStateFromEquipment(eq: EquipmentItem) {
    const code = (eq.qrcodeCodeId ?? "").trim();
    setQrcodeCodeId(code);
    setQrcodeLocked(Boolean(code));
    setQrcodeMsg(code ? "QR Code já vinculado a este equipamento." : "");
    setQrcodeValidating(false);
    setQrcodeGenerating(false);
    setScannerOpen(false);
    setQrChanging(false);
  }

  useEffect(() => {
    setIsEditing(Boolean(initialEditing) && !readOnly);
    setEditDraft(buildEquipmentEditDraft(equipment));
    resetQrStateFromEquipment(equipment);
  }, [equipment, initialEditing, readOnly]);

  const publicUrl =
    equipment.qrcodeCodeId?.trim()
      ? buildPublicEquipmentUrl(equipment.qrcodeCodeId)
      : equipment.publicToken
        ? buildPublicEquipmentUrl(equipment.publicToken)
        : null;

  /** Na edição, se o usuário já validou um novo QR, mostra a prévia desse código. */
  const editPreviewUrl =
    isEditing && qrcodeLocked && qrcodeCodeId.trim()
      ? buildPublicEquipmentUrl(qrcodeCodeId.trim())
      : publicUrl;

  const hasLinkedQr = Boolean(existingQr) || (qrcodeLocked && Boolean(qrcodeCodeId.trim()));
  const changeQrLabel = publicUrl || hasLinkedQr ? "Alterar QR" : "Cadastrar QR";

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

  const brandModel =
    [equipment.brandName, equipment.modelName].filter(Boolean).join(" · ") || "Ficha do equipamento";

  async function validateAndLockQrcode(raw: string): Promise<string | null> {
    const code = parseScannedQrCode(raw);
    if (!code) {
      setQrcodeMsg("Informe ou escaneie um código QR válido.");
      setQrcodeLocked(false);
      return null;
    }
    // Já é o QR atualmente vinculado a este equipamento — não precisa estar "available".
    if (existingQr && code.toUpperCase() === existingQr.toUpperCase()) {
      setQrcodeCodeId(existingQr);
      setQrcodeLocked(true);
      setQrcodeMsg("QR Code já vinculado a este equipamento.");
      return existingQr;
    }
    setQrcodeValidating(true);
    setQrcodeMsg("");
    try {
      const result = await validateQrCode(code);
      if (!result.found || !result.available) {
        setQrcodeMsg(result.message || "Código indisponível.");
        setQrcodeLocked(false);
        return null;
      }
      const lockedCode = (result.code_id ?? code).trim();
      setQrcodeCodeId(lockedCode);
      setQrcodeLocked(true);
      setQrcodeMsg(
        existingQr
          ? "Novo código validado. Ao salvar, a etiqueta anterior será substituída."
          : "Código validado. Clique em Salvar alterações para vincular.",
      );
      setQrChanging(false);
      return lockedCode;
    } catch (e) {
      setQrcodeMsg(e instanceof Error ? e.message : "Falha ao validar código.");
      setQrcodeLocked(false);
      return null;
    } finally {
      setQrcodeValidating(false);
    }
  }

  async function generateAndLockQrcode(): Promise<void> {
    setQrcodeGenerating(true);
    setQrcodeMsg("");
    try {
      const result = await generateQrCodes(1);
      const newCode = result.first_code_id;
      if (!newCode) {
        setQrcodeMsg("Não foi possível gerar um novo código. Tente novamente.");
        return;
      }
      await validateAndLockQrcode(newCode);
    } catch (e) {
      setQrcodeMsg(e instanceof Error ? e.message : "Falha ao gerar novo código QR.");
    } finally {
      setQrcodeGenerating(false);
    }
  }

  async function previewQrLabel(codeId: string): Promise<string | null> {
    const code = parseScannedQrCode(codeId);
    if (!code) return null;
    try {
      const [item] = await buildQrLabelPreviewItems([{ codeId: code }]);
      return item?.dataUrl ?? null;
    } catch {
      return null;
    }
  }

  async function printQrLabel(codeId: string): Promise<void> {
    const code = parseScannedQrCode(codeId);
    if (!code) return;
    try {
      const blob = await buildQrLabelsPdfBlob([{ codeId: code }], "thermal_58");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setQrcodeMsg(e instanceof Error ? e.message : "Falha ao gerar etiqueta para impressão.");
    }
  }

  async function handleSaveEdit() {
    const tag = editDraft.tag.trim();
    if (!tag) {
      toast.error("Informe o local / identificação do equipamento.");
      return;
    }

    let codeToLink = qrcodeLocked ? qrcodeCodeId.trim() : "";
    if (qrcodeCodeId.trim() && !qrcodeLocked) {
      const locked = await validateAndLockQrcode(qrcodeCodeId);
      if (!locked) {
        toast.error("Valide o QR Code antes de salvar ou limpe o campo.");
        return;
      }
      codeToLink = locked;
    }

    const components =
      equipment.components?.map((part) => ({
        id: part.id,
        serial_number: editDraft.componentSerials[part.id]?.trim() || null,
      })) ?? [];

    const previousQr = existingQr.toUpperCase();
    const nextQr = codeToLink.toUpperCase();
    const qrChanged = Boolean(nextQr) && nextQr !== previousQr;

    setSavingEdit(true);
    try {
      const manufactureYear = editDraft.manufactureYear.trim() ? Number(editDraft.manufactureYear) : null;
      const gasChargeKg = editDraft.gasChargeKg.trim() ? Number(editDraft.gasChargeKg.replace(",", ".")) : null;
      await updateClientCatalogEquipment(equipment.id, {
        tag,
        installation_reference: editDraft.installationReference.trim() || null,
        installation_date: editDraft.installationDate || null,
        manufacture_year: manufactureYear,
        gas_charge_kg: gasChargeKg,
        notes: editDraft.notes.trim() || null,
        is_active: editDraft.status === "ativo",
        client_site_id: editDraft.clientSiteId,
        components: components.length > 0 ? components : undefined,
        ...(qrChanged ? { qrcode_code_id: codeToLink } : {}),
      });
      toast.success(qrChanged ? "Equipamento e QR Code atualizados." : "Equipamento atualizado.");
      setIsEditing(false);
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSavingEdit(false);
    }
  }

  function handleCancelEdit() {
    setEditDraft(buildEquipmentEditDraft(equipment));
    resetQrStateFromEquipment(equipment);
    setIsEditing(false);
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

        {isEditing ? (
          <QrCodeScannerModal
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onScan={(code) => {
              setScannerOpen(false);
              void validateAndLockQrcode(code);
            }}
          />
        ) : null}

        <header className={styles.header}>
          <div className={styles.headerMain}>
            <h2 id="equipment-sheet-title" className={styles.headerTitle}>
              {isEditing ? "Editar equipamento" : equipment.tag || "Equipamento"}
            </h2>
            <p className={styles.headerSubtitle}>
              {isEditing
                ? "Atualize os dados de instalação, status, localização e QR Code do aparelho."
                : brandModel}
            </p>
          </div>
          <div className={styles.headerActions}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={savingEdit}
                  onClick={handleCancelEdit}
                >
                  <X size={16} aria-hidden />
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
                    className={styles.btnSecondary}
                    onClick={() => {
                      setEditDraft(buildEquipmentEditDraft(equipment));
                      resetQrStateFromEquipment(equipment);
                      setIsEditing(true);
                    }}
                  >
                    <Pencil size={16} aria-hidden />
                    Editar
                  </button>
                ) : null}
                {equipment.legacyEquipmentId ? (
                  <Link to="/app/service-orders" className={styles.btnPrimary}>
                    Ver ordens de serviço
                  </Link>
                ) : null}
              </>
            )}
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
              ×
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <EquipmentSheetEmbeddedView
            equipment={equipment}
            publicUrl={isEditing ? editPreviewUrl : publicUrl}
            history={maintenanceHistory}
            historyLoading={historyLoading}
            historyError={historyErr || null}
            middleSlot={!isEditing ? multiSplitSlot : null}
            readOnly={readOnly}
            isEditing={isEditing}
            hideHeader
            qrPanelSlot={
              isEditing && qrChanging ? (
                <div className={styles.qrChangeWrap}>
                  <div className={styles.qrChangeToolbar}>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      disabled={savingEdit}
                      onClick={() => {
                        setQrChanging(false);
                        setScannerOpen(false);
                        if (!qrcodeLocked) {
                          resetQrStateFromEquipment(equipment);
                          setQrChanging(false);
                        }
                      }}
                    >
                      <X size={16} aria-hidden />
                      Voltar ao QR
                    </button>
                    {qrcodeLocked && qrcodeCodeId.trim() ? (
                      <p className={styles.qrChangeHint}>
                        Código pronto: <strong>{qrcodeCodeId}</strong> — clique em Salvar alterações para confirmar.
                      </p>
                    ) : (
                      <p className={styles.qrChangeHint}>Escaneie, digite ou gere um novo código QR.</p>
                    )}
                  </div>
                  <EquipmentQrCodeCard
                    codeId={qrcodeCodeId}
                    locked={qrcodeLocked}
                    message={qrcodeMsg}
                    validating={qrcodeValidating}
                    generating={qrcodeGenerating}
                    disabled={savingEdit}
                    onCodeChange={(next) => {
                      setQrcodeCodeId(next);
                      if (qrcodeMsg) setQrcodeMsg("");
                      if (qrcodeLocked) setQrcodeLocked(false);
                    }}
                    onValidate={() => void validateAndLockQrcode(qrcodeCodeId)}
                    onOpenScanner={() => setScannerOpen(true)}
                    onGenerate={() => void generateAndLockQrcode()}
                    onClear={() => {
                      setQrcodeLocked(false);
                      setQrcodeCodeId("");
                      setQrcodeMsg("Informe, escaneie ou gere um novo QR Code para vincular.");
                    }}
                    onPreview={() => previewQrLabel(qrcodeCodeId)}
                    onPrintLabel={() => printQrLabel(qrcodeCodeId)}
                  />
                </div>
              ) : undefined
            }
            qrExtraActions={
              isEditing && !qrChanging ? (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={savingEdit}
                  onClick={() => {
                    setQrChanging(true);
                    if (qrcodeLocked && existingQr && qrcodeCodeId === existingQr) {
                      setQrcodeLocked(false);
                      setQrcodeCodeId("");
                      setQrcodeMsg("");
                    }
                  }}
                >
                  {changeQrLabel}
                </button>
              ) : null
            }
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
            onPrintLabel={editPreviewUrl ? () => window.print() : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function isMultiSplit(equipment: EquipmentItem): boolean {
  const parts = equipment.components ?? [];
  if (parts.length <= 1) return false;
  return parts.some((c) => c.componentType === "CONDENSADORA" || c.componentType === "EVAPORADORA");
}
