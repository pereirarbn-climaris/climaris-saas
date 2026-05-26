import { useEffect, useState } from "react";
import {
  buildA4Sample2x2Pdf,
  buildQrLabelsPdfBlob,
  type QrLabelPrintItem,
  type QrLabelPrintFormat,
} from "../../lib/qrcodeLabelsPdf";
import type { QrLabelLayoutModel } from "../../lib/generateQrLabelLayout";
import { QR_LABEL_LAYOUT_LABELS } from "../../lib/generateQrLabelLayout";
import { QrLabelPreviewCard } from "./QrLabelPreviewCard";
import styles from "./QrLabelsPrintPanel.module.css";

type Props = {
  items: QrLabelPrintItem[];
  format: QrLabelPrintFormat;
  onFormatChange: (format: QrLabelPrintFormat) => void;
  layoutModel: QrLabelLayoutModel;
  onLayoutModelChange: (model: QrLabelLayoutModel) => void;
  onError?: (message: string) => void;
};

const FORMAT_LABELS: Record<"a4_grid" | "thermal_58", string> = {
  a4_grid: "Folha A4 (4×7 — 28 por página)",
  thermal_58: "Térmica 58 mm",
};

export function QrLabelsPrintPanel({
  items,
  format,
  onFormatChange,
  layoutModel,
  onLayoutModelChange,
  onError,
}: Props) {
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const previewSample = items[0];
  const selectionHint =
    items.length === 0
      ? "Gere um lote ou selecione etiquetas na lista abaixo."
      : items.length === 1
        ? `1 etiqueta para impressão (${previewSample?.codeId ?? ""})`
        : `${items.length} etiquetas para impressão`;

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  useEffect(() => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  }, [items.length, format, layoutModel]);

  async function refreshPdfPreview() {
    if (!items.length) return;
    setDownloading(true);
    try {
      const blob = await buildQrLabelsPdfBlob(items, format, layoutModel);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Falha ao gerar PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const blob = await buildQrLabelsPdfBlob(items, format, layoutModel);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "thermal_58" ? "etiquetas-qr-58mm.pdf" : "etiquetas-qr-a4.pdf";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Falha no download.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadSample2x2() {
    setDownloading(true);
    try {
      const blob = await buildA4Sample2x2Pdf(items, layoutModel);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "etiquetas-qr-amostra-2x2.pdf";
      a.click();
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(url);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Falha na amostra 2x2.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="Impressão e exportação">
      <header className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Impressão e exportação</h2>
          <p className={styles.panelHint}>{selectionHint}</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={!items.length || downloading || format === "thermal_58"}
            onClick={() => void downloadSample2x2()}
            title="Folha A4 com 4 etiquetas (2×2)"
          >
            Amostra 2×2
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={!items.length || downloading}
            onClick={() => void refreshPdfPreview()}
          >
            {downloading ? "Gerando…" : "Visualizar PDF"}
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!items.length || downloading}
            onClick={() => void downloadPdf()}
          >
            Baixar PDF
          </button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="qr-layout-model">
            Modelo
          </label>
          <select
            id="qr-layout-model"
            className={styles.fieldSelect}
            value={layoutModel}
            onChange={(e) => onLayoutModelChange(e.target.value as QrLabelLayoutModel)}
          >
            {(Object.keys(QR_LABEL_LAYOUT_LABELS) as QrLabelLayoutModel[]).map((key) => (
              <option key={key} value={key}>
                {QR_LABEL_LAYOUT_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="qr-print-format-panel">
            Formato PDF
          </label>
          <select
            id="qr-print-format-panel"
            className={styles.fieldSelect}
            value={format}
            onChange={(e) => onFormatChange(e.target.value as QrLabelPrintFormat)}
          >
            <option value="a4_grid">{FORMAT_LABELS.a4_grid}</option>
            <option value="thermal_58">{FORMAT_LABELS.thermal_58}</option>
          </select>
        </div>
      </div>

      <div className={styles.previewGrid}>
        <div className={styles.previewCol}>
          <h3 className={styles.previewColTitle}>Pré-visualização</h3>
          {previewSample ? (
            <QrLabelPreviewCard
              codeId={previewSample.codeId}
              logoUrl={previewSample.logoUrl ?? null}
              layoutModel={layoutModel}
            />
          ) : (
            <div className={styles.emptyPreview}>
              <p className={styles.emptyTitle}>Nenhuma etiqueta selecionada</p>
              <p className={styles.muted}>Gere um lote de 28 cartelas ou marque itens na tabela abaixo.</p>
            </div>
          )}
        </div>

        <div className={styles.previewCol}>
          <h3 className={styles.previewColTitle}>PDF para impressão</h3>
          {pdfPreviewUrl ? (
            <iframe title="Preview PDF etiquetas" src={pdfPreviewUrl} className={styles.pdfFrame} />
          ) : (
            <div className={styles.emptyPreview}>
              <p className={styles.emptyTitle}>PDF ainda não gerado</p>
              <p className={styles.muted}>
                Clique em <strong>Visualizar PDF</strong> ou <strong>Baixar PDF</strong> após gerar ou selecionar etiquetas.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
