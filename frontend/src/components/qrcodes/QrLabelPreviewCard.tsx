import { useEffect, useState } from "react";
import {
  generateQrLabelLayout,
  QR_LABEL_LAYOUT_LABELS,
  type QrLabelLayoutModel,
} from "../../lib/generateQrLabelLayout";
import styles from "./QrLabelsPrintPanel.module.css";

type Props = {
  codeId: string;
  logoUrl: string | null;
  layoutModel: QrLabelLayoutModel;
};

export function QrLabelPreviewCard({ codeId, logoUrl, layoutModel }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void generateQrLabelLayout({
      modelType: layoutModel,
      logoUrl,
      codeId,
      widthPx: 360,
      drawBorder: true,
    })
      .then((r) => {
        if (!cancelled) setPreviewUrl(r.dataUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [codeId, logoUrl, layoutModel]);

  return (
    <div className={styles.livePreview}>
      <p className={styles.livePreviewLabel}>
        {QR_LABEL_LAYOUT_LABELS[layoutModel]}
        {!logoUrl && layoutModel !== "standard" ? " · sem logo (placeholder)" : ""}
      </p>
      <div className={styles.livePreviewBox}>
        {loading ? (
          <span className={styles.muted}>Gerando…</span>
        ) : previewUrl ? (
          <img src={previewUrl} alt={`Etiqueta ${codeId}`} className={styles.livePreviewImg} />
        ) : (
          <span className={styles.muted}>Não foi possível gerar o preview.</span>
        )}
      </div>
    </div>
  );
}
