import { useState, type CSSProperties } from "react";
import type { EquipmentLabelResolveOut } from "../../api/equipmentCatalogAi";
import { validateQrCode } from "../../api/qrcodes";
import type { ClientSiteOut } from "../../api/clients";
import { EquipmentLabelPhotoButtons } from "../equipment/EquipmentLabelPhotoButtons";
import { QrCodeScannerModal } from "../qrcodes/QrCodeScannerModal";
import { parseScannedQrCode } from "../../lib/qrcodeScan";
import { InstallationSiteField } from "./ClientAddEquipmentInstallationSiteField";

export type ClientAddEquipmentAiForm = {
  tag: string;
  serialNumber: string;
  installationReference: string;
  installationDate: string;
  clientSiteId: number | null;
  qrcodeCodeId: string;
  catalogId: string | null;
};

type Props = {
  clientSites: ClientSiteOut[];
  highlightedSiteName: string | null;
  form: ClientAddEquipmentAiForm;
  onFormChange: (patch: Partial<ClientAddEquipmentAiForm>) => void;
  catalogMeta: { categoryName: string; catalogCreated: boolean; equipmentKind: string } | null;
  labelMsg: string | null;
  formError: string | null;
  disabled?: boolean;
  onResolved: (resolved: EquipmentLabelResolveOut) => void;
  onLabelError: (message: string) => void;
};

export function ClientAddEquipmentAiPanel({
  clientSites,
  highlightedSiteName,
  form,
  onFormChange,
  catalogMeta,
  labelMsg,
  formError,
  disabled = false,
  onResolved,
  onLabelError,
}: Props) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrcodeLocked, setQrcodeLocked] = useState(false);
  const [qrcodeMsg, setQrcodeMsg] = useState("");
  const [qrcodeValidating, setQrcodeValidating] = useState(false);

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
      onFormChange({ qrcodeCodeId: result.code_id ?? code });
      setQrcodeLocked(true);
      setQrcodeMsg("Código validado para este cadastro.");
      return true;
    } catch (e) {
      setQrcodeMsg(e instanceof Error ? e.message : "Falha ao validar código.");
      setQrcodeLocked(false);
      return false;
    } finally {
      setQrcodeValidating(false);
    }
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    height: "var(--input-height)",
    padding: "0 var(--input-padding-x)",
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--input-radius)",
    fontSize: "var(--font-size-base)",
    color: "var(--color-text)",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <>
      <QrCodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => void validateAndLockQrcode(code)}
      />
      <InstallationSiteField
        clientSites={clientSites}
        value={form.clientSiteId}
        onChange={(siteId) => onFormChange({ clientSiteId: siteId })}
        highlightedSiteName={highlightedSiteName}
      />
      <EquipmentLabelPhotoButtons
        variant="field"
        mode="resolve"
        equipmentKind="auto"
        disabled={disabled}
        onExtracted={() => {}}
        onResolved={onResolved}
        onError={onLabelError}
      />
      {labelMsg ? (
        <p style={{ margin: "0.75rem 0 0", fontSize: "var(--font-size-sm)", color: "#047857" }}>{labelMsg}</p>
      ) : null}
      {catalogMeta ? (
        <p style={{ margin: "0.5rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          Categoria: <strong>{catalogMeta.categoryName}</strong>
          {catalogMeta.equipmentKind === "climatizador" ? " · Climatizador" : " · Ar-condicionado"}
          {catalogMeta.catalogCreated ? " · modelo novo no catálogo" : " · modelo já existente"}
        </p>
      ) : null}

      <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            Nome / local do aparelho *
          </label>
          <input
            value={form.tag}
            disabled={disabled}
            placeholder="Ex.: Sala de reunião, Quarto 2"
            style={inputStyle}
            onChange={(e) => onFormChange({ tag: e.target.value })}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            Nº de série *
          </label>
          <input
            value={form.serialNumber}
            disabled={disabled}
            style={inputStyle}
            onChange={(e) => onFormChange({ serialNumber: e.target.value })}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            Referência de localização
          </label>
          <textarea
            value={form.installationReference}
            disabled={disabled}
            rows={2}
            placeholder="Opcional — detalhe para o técnico encontrar o aparelho"
            style={{ ...inputStyle, height: "auto", minHeight: "4rem", padding: "0.65rem var(--input-padding-x)" }}
            onChange={(e) => onFormChange({ installationReference: e.target.value })}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            Data de instalação
          </label>
          <input
            type="date"
            value={form.installationDate}
            disabled={disabled}
            style={inputStyle}
            onChange={(e) => onFormChange({ installationDate: e.target.value })}
          />
        </div>
        <div>
          <span
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            Etiqueta QR (opcional)
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <input
              value={form.qrcodeCodeId}
              readOnly={qrcodeLocked}
              disabled={disabled || qrcodeValidating}
              placeholder="QR0000035"
              style={{ ...inputStyle, flex: "1 1 8rem" }}
              onChange={(e) => {
                onFormChange({ qrcodeCodeId: e.target.value });
                if (qrcodeLocked) setQrcodeLocked(false);
                if (qrcodeMsg) setQrcodeMsg("");
              }}
            />
            {!qrcodeLocked ? (
              <button
                type="button"
                disabled={disabled || qrcodeValidating || !form.qrcodeCodeId.trim()}
                onClick={() => void validateAndLockQrcode(form.qrcodeCodeId)}
                style={{
                  height: "var(--input-height)",
                  padding: "0 0.75rem",
                  borderRadius: "var(--btn-radius)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-elevated)",
                  cursor: "pointer",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: 600,
                }}
              >
                {qrcodeValidating ? "…" : "Validar"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled || qrcodeLocked || qrcodeValidating}
              onClick={() => setScannerOpen(true)}
              style={{
                height: "var(--input-height)",
                padding: "0 0.75rem",
                borderRadius: "var(--btn-radius)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface-elevated)",
                cursor: "pointer",
                fontSize: "var(--font-size-sm)",
                fontWeight: 600,
              }}
            >
              Escanear
            </button>
          </div>
          {qrcodeMsg ? (
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "var(--font-size-xs)",
                color: qrcodeLocked ? "#047857" : "var(--color-error)",
              }}
            >
              {qrcodeMsg}
            </p>
          ) : null}
        </div>
      </div>
      {formError ? (
        <p style={{ margin: "1rem 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-error)" }}>{formError}</p>
      ) : null}
    </>
  );
}
