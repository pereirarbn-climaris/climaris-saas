import { useRef, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import styles from "./ImportSpreadsheetModal.module.css";

function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v10m0 0l-4-4m4 4l4-4M5 16.5v1A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type ImportSpreadsheetModalProps = {
  open: boolean;
  title: string;
  titleId: string;
  importing: boolean;
  dragActive: boolean;
  fileLabel: string | null;
  csvTemplateUrl?: string;
  xlsxTemplateUrl?: string;
  formatsMeta: string;
  dropHint?: string;
  disabled?: boolean;
  accept?: string;
  children?: ReactNode;
  onClose: () => void;
  onDragActiveChange: (active: boolean) => void;
  onFile: (file: File) => void;
};

export function ImportSpreadsheetModal({
  open,
  title,
  titleId,
  importing,
  dragActive,
  fileLabel,
  csvTemplateUrl,
  xlsxTemplateUrl,
  formatsMeta,
  dropHint = "Arraste e solte um CSV ou Excel aqui, ou clique para selecionar.",
  disabled = false,
  accept = ".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  children,
  onClose,
  onDragActiveChange,
  onFile,
}: ImportSpreadsheetModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const zoneDisabled = importing || disabled;

  function pickFile() {
    if (!zoneDisabled) fileInputRef.current?.click();
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || zoneDisabled) return;
    onFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    onDragActiveChange(false);
    if (zoneDisabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!importing) onClose();
      }}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            <span className={styles.titleIcon} aria-hidden>
              <ImportIcon />
            </span>
            {title}
          </h2>
          <button type="button" className={styles.closeBtn} aria-label="Fechar" onClick={onClose} disabled={importing}>
            <CloseIcon />
          </button>
        </header>

        <div className={styles.body}>
          {csvTemplateUrl || xlsxTemplateUrl ? (
            <section className={styles.templateSection}>
              <div>
                <p className={styles.templateTitle}>Modelo de arquivo</p>
                <p className={styles.templateHint}>Baixe um modelo para facilitar a importacao.</p>
              </div>
              <div className={styles.templateActions}>
                {csvTemplateUrl ? (
                  <a className={styles.templateBtn} href={csvTemplateUrl} download>
                    <DownloadIcon />
                    Baixar CSV
                  </a>
                ) : null}
                {xlsxTemplateUrl ? (
                  <a className={styles.templateBtn} href={xlsxTemplateUrl} download>
                    <DownloadIcon />
                    Baixar XLSX
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}

          {children}

          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className={styles.fileInputHidden}
            onChange={onPickFile}
          />

          <div
            className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ""} ${importing ? styles.dropZoneBusy : ""} ${disabled ? styles.dropZoneDisabled : ""}`}
            role="button"
            tabIndex={zoneDisabled ? -1 : 0}
            onClick={pickFile}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pickFile();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!zoneDisabled) onDragActiveChange(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!zoneDisabled) onDragActiveChange(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragActiveChange(false);
            }}
            onDrop={onDrop}
          >
            <span className={styles.dropZoneIcon} aria-hidden>
              <FileIcon />
            </span>
            <span className={styles.dropZoneTitle}>{importing ? "Importando planilha..." : "Selecionar arquivo"}</span>
            <span className={styles.dropZoneHint}>
              {fileLabel ? `Arquivo selecionado: ${fileLabel}` : dropHint}
            </span>
            <span className={styles.dropZoneMeta}>{formatsMeta}</span>
            <button
              type="button"
              className={styles.chooseBtn}
              onClick={(e) => {
                e.stopPropagation();
                pickFile();
              }}
              disabled={zoneDisabled}
            >
              <ImportIcon />
              Escolher arquivo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
