import { useState } from "react";
import styles from "./EquipmentQrCodeCard.module.css";

type IconProps = { className?: string };

function IconQr({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3z" />
      <path d="M20 14h1v1" />
      <path d="M14 20h1v1" />
      <path d="M20 20h1v1" />
      <path d="M17 17h1v1" />
    </svg>
  );
}

function IconCamera({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconKeyboard({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6" />
    </svg>
  );
}

function IconCheckCircle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconAlertCircle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconPrinter({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function IconEye({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconRefreshCw({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function IconLoader({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function IconSparkles({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
    </svg>
  );
}

export type EquipmentQrCodeCardProps = {
  /** Código digitado/escaneado (ainda não confirmado, ou já vinculado quando `locked`). */
  codeId: string;
  /** true quando o código foi validado e está bloqueado para este cadastro. */
  locked: boolean;
  /** Mensagem de validação (sucesso ou erro) exibida abaixo do campo/ação. */
  message: string;
  /** true durante a chamada de validação do código digitado/escaneado. */
  validating: boolean;
  /** true durante a geração de um novo código (pool interno de etiquetas). */
  generating: boolean;
  onCodeChange: (value: string) => void;
  onValidate: () => void;
  onOpenScanner: () => void;
  onGenerate: () => void;
  onClear: () => void;
  /** Retorna a data URL (imagem) da etiqueta para pré-visualização. */
  onPreview: () => Promise<string | null>;
  onPrintLabel: () => void | Promise<void>;
  disabled?: boolean;
};

export function EquipmentQrCodeCard({
  codeId,
  locked,
  message,
  validating,
  generating,
  onCodeChange,
  onValidate,
  onOpenScanner,
  onGenerate,
  onClear,
  onPreview,
  onPrintLabel,
  disabled,
}: EquipmentQrCodeCardProps) {
  const [activeTab, setActiveTab] = useState<"camera" | "manual">("camera");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  async function handlePreviewClick() {
    setPreviewLoading(true);
    try {
      const dataUrl = await onPreview();
      setPreviewSrc(dataUrl);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handlePrintClick() {
    setPrinting(true);
    try {
      await onPrintLabel();
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.headerIcon} aria-hidden>
          <IconQr className={styles.headerIconSvg} />
        </span>
        <div>
          <h4 className={styles.title}>QR Code do equipamento</h4>
          <p className={styles.subtitle}>
            Esse QR Code permite acesso rápido ao histórico e informações deste equipamento.
          </p>
        </div>
      </div>

      {locked ? (
        <div className={styles.successBlock}>
          <span className={styles.successIcon} aria-hidden>
            <IconCheckCircle className={styles.successIconSvg} />
          </span>
          <p className={styles.successTitle}>QR Code vinculado</p>
          <p className={styles.successCode}>{codeId}</p>

          {previewSrc ? (
            <img src={previewSrc} alt={`QR Code ${codeId}`} className={styles.previewImg} />
          ) : null}

          <div className={styles.successActions}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => void handlePreviewClick()}
              disabled={previewLoading}
            >
              {previewLoading ? <IconLoader className={styles.spin} /> : <IconEye />}
              Visualizar QR
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => void handlePrintClick()}
              disabled={printing}
            >
              {printing ? <IconLoader className={styles.spin} /> : <IconPrinter />}
              Imprimir etiqueta
            </button>
            <button type="button" className={`${styles.actionBtn} ${styles.actionBtnMuted}`} onClick={onClear} disabled={disabled}>
              <IconRefreshCw />
              Trocar QR
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "camera"}
              className={`${styles.tabBtn} ${activeTab === "camera" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("camera")}
              disabled={disabled}
            >
              <IconCamera />
              Ler com a câmera
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "manual"}
              className={`${styles.tabBtn} ${activeTab === "manual" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("manual")}
              disabled={disabled}
            >
              <IconKeyboard />
              Inserir código
            </button>
          </div>

          {activeTab === "camera" ? (
            <button
              type="button"
              className={styles.cameraDrop}
              onClick={onOpenScanner}
              disabled={disabled}
            >
              <span className={styles.cameraIconWrap} aria-hidden>
                <IconCamera className={styles.cameraIconSvg} />
              </span>
              <span className={styles.cameraTitle}>Clique para abrir a câmera</span>
              <span className={styles.cameraHint}>Centralize o QR Code no quadro</span>
            </button>
          ) : (
            <div className={styles.manualBlock}>
              <label className={styles.manualLabel} htmlFor="equipment-qr-manual-input">
                Código do QR Code
              </label>
              <div className={styles.manualRow}>
                <input
                  id="equipment-qr-manual-input"
                  type="text"
                  className={styles.manualInput}
                  placeholder="Ex.: EQP-AC-001-2025"
                  value={codeId}
                  disabled={disabled}
                  onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && codeId.trim() && !validating) {
                      e.preventDefault();
                      onValidate();
                    }
                  }}
                />
                <button
                  type="button"
                  className={styles.manualIconBtn}
                  title="Validar código"
                  disabled={disabled || !codeId.trim() || validating}
                  onClick={onValidate}
                >
                  {validating ? <IconLoader className={styles.spin} /> : <IconQr />}
                </button>
              </div>

              <div className={styles.generateRow}>
                <span className={styles.generateDivider} aria-hidden>
                  ou
                </span>
                <button
                  type="button"
                  className={styles.generateBtn}
                  onClick={onGenerate}
                  disabled={disabled || generating}
                >
                  {generating ? <IconLoader className={styles.spin} /> : <IconSparkles />}
                  {generating ? "Gerando…" : "Gerar QR automaticamente"}
                </button>
              </div>
            </div>
          )}

          {message ? (
            <p className={`${styles.message} ${styles.messageError}`}>
              <IconAlertCircle className={styles.messageIcon} />
              {message}
            </p>
          ) : (
            <p className={styles.messageMuted}>Opcional: você pode vincular o QR Code depois, na ficha do equipamento.</p>
          )}
        </>
      )}
    </div>
  );
}
