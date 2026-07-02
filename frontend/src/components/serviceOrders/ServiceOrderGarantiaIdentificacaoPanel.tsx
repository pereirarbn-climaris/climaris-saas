import { useState } from "react";
import type { EquipmentLabelResolveOut } from "../../api/equipmentCatalogAi";
import { validateQrCode } from "../../api/qrcodes";
import { EquipmentLabelPhotoButtons } from "../equipment/EquipmentLabelPhotoButtons";
import { QrCodeScannerModal } from "../qrcodes/QrCodeScannerModal";
import { parseScannedQrCode } from "../../lib/qrcodeScan";
import { buildGarantiaSerialPatch, type ServiceOrderGarantiaFields } from "../../lib/serviceOrderGarantia";
import styles from "./ServiceOrderGarantiaForm.module.css";

type Props = {
  garantia: ServiceOrderGarantiaFields;
  canEdit: boolean;
  onGarantiaChange: (patch: Partial<ServiceOrderGarantiaFields>) => void;
};

export function ServiceOrderGarantiaIdentificacaoPanel({ garantia, canEdit, onGarantiaChange }: Props) {
  const [labelMsg, setLabelMsg] = useState<string | null>(null);
  const [labelErr, setLabelErr] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrcodeLocked, setQrcodeLocked] = useState(Boolean(garantia.qrcodeCodeId.trim()));
  const [qrcodeMsg, setQrcodeMsg] = useState("");
  const [qrcodeValidating, setQrcodeValidating] = useState(false);

  const handleResolved = (resolved: EquipmentLabelResolveOut) => {
    const ext = resolved.extraction;
    const marcaModelo = `${resolved.brand} ${resolved.model_display}`.trim();
    const capacidade =
      resolved.capacidade_btu != null && resolved.capacidade_btu > 0
        ? `${resolved.capacidade_btu} BTU`
        : ext.capacidade_btus?.trim() ?? "";
    const suggestedTag = resolved.suggested_identificacao?.trim() ?? "";
    const kindLabel = resolved.equipment_kind === "climatizador" ? "Climatizador" : "Ar-condicionado";
    const serieEvap = ext.serie_evaporadora?.trim() || ext.numero_serie?.trim() || "";
    const serieCond = ext.serie_condensadora?.trim() || "";
    const tipoAparelho = ext.tipo_equipamento?.trim() || ext.tipo_instalacao?.trim() || "";

    const serialPatch = buildGarantiaSerialPatch(garantia, {
      catalogId: resolved.catalog_id,
      catalogLabel: marcaModelo,
      catalogCategoryName: resolved.category_name,
      marcaModelo: marcaModelo || garantia.marcaModelo,
      capacidade: capacidade || garantia.capacidade,
      equipmentTag: garantia.equipmentTag.trim() || suggestedTag || garantia.equipmentTag,
      localInstalacao: garantia.localInstalacao.trim() || suggestedTag || garantia.localInstalacao,
      tipoAparelho: tipoAparelho || garantia.tipoAparelho,
      serieEvaporadora: serieEvap || garantia.serieEvaporadora,
      serieCondensadora: serieCond || garantia.serieCondensadora,
    });

    onGarantiaChange(serialPatch);

    setLabelErr(null);
    const serialHint =
      serieEvap || serieCond
        ? ` Série${serieEvap && serieCond ? "s" : ""}: ${[serieEvap, serieCond].filter(Boolean).join(" / ")}.`
        : "";
    setLabelMsg(
      (resolved.catalog_created
        ? `${kindLabel}: modelo "${marcaModelo}" cadastrado no catálogo pela leitura da etiqueta.`
        : `${kindLabel}: modelo "${marcaModelo}" identificado no catálogo.`) + serialHint,
    );
  };

  const validateAndLockQrcode = async (raw: string): Promise<boolean> => {
    const code = parseScannedQrCode(raw);
    if (!code) {
      setQrcodeMsg("Informe ou escaneie um código QR válido.");
      setQrcodeLocked(false);
      return false;
    }
    setQrcodeValidating(true);
    setQrcodeMsg("");
    try {
      const result = await validateQrCode(code);
      if (!result.found || !result.available) {
        setQrcodeMsg(result.message || "Código indisponível.");
        setQrcodeLocked(false);
        return false;
      }
      onGarantiaChange({ qrcodeCodeId: result.code_id ?? code });
      setQrcodeLocked(true);
      setQrcodeMsg("Etiqueta QR validada para este equipamento.");
      return true;
    } catch (e) {
      setQrcodeMsg(e instanceof Error ? e.message : "Falha ao validar código.");
      setQrcodeLocked(false);
      return false;
    } finally {
      setQrcodeValidating(false);
    }
  };

  return (
    <div className={styles.garantiaTools}>
      <QrCodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => void validateAndLockQrcode(code)}
      />

        <EquipmentLabelPhotoButtons
          variant="split_ac"
          mode="resolve"
          equipmentKind="auto"
          disabled={!canEdit}
          onExtracted={() => {}}
          onResolved={handleResolved}
          onError={(msg) => {
            setLabelErr(msg);
            setLabelMsg(null);
          }}
        />

      {labelMsg ? <p className={styles.alertOk}>{labelMsg}</p> : null}
      {labelErr ? <p className={styles.alertErr}>{labelErr}</p> : null}
      {garantia.catalogLabel ? (
        <div className={styles.catalogBadge}>
          <strong>{garantia.catalogLabel}</strong>
          {garantia.catalogCategoryName ? ` · ${garantia.catalogCategoryName}` : ""}
        </div>
      ) : null}

      <div className={styles.qrRow}>
        <label className={styles.field}>
          <span className={styles.label}>Etiqueta QR</span>
          <div className={styles.qrInputRow}>
            <input
              className={styles.input}
              value={garantia.qrcodeCodeId}
              readOnly={qrcodeLocked}
              disabled={!canEdit || qrcodeValidating}
              placeholder="QR0000035"
              onChange={(e) => {
                onGarantiaChange({ qrcodeCodeId: e.target.value });
                if (qrcodeLocked) setQrcodeLocked(false);
                if (qrcodeMsg) setQrcodeMsg("");
              }}
            />
            {!qrcodeLocked ? (
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={!canEdit || qrcodeValidating || !garantia.qrcodeCodeId.trim()}
                onClick={() => void validateAndLockQrcode(garantia.qrcodeCodeId)}
              >
                {qrcodeValidating ? "…" : "Validar"}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={!canEdit || qrcodeLocked || qrcodeValidating}
              onClick={() => setScannerOpen(true)}
            >
              Escanear
            </button>
          </div>
          {qrcodeMsg ? (
            <span className={qrcodeLocked ? styles.alertOk : styles.alertErr}>{qrcodeMsg}</span>
          ) : (
            <span className={styles.fieldHint}>Opcional — vincula a cartela física ao equipamento do cliente</span>
          )}
        </label>
      </div>
    </div>
  );
}
