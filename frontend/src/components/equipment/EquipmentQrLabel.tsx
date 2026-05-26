import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./EquipmentQrLabel.module.css";

type Props = {
  url: string;
  tag: string;
  brandName: string;
  modelName: string;
  className?: string;
  /** Área usada na impressão da etiqueta (classe extra no wrapper). */
  printAreaClassName?: string;
};

function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

export function EquipmentQrLabel({ url, tag, brandName, modelName, className, printAreaClassName }: Props) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQrError(false);
    void QRCode.toDataURL(url, {
      width: 128,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setQrError(true);
          setQrSrc(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const brandModel = [brandName, modelName].filter(Boolean).join(" · ");

  return (
    <div className={[styles.wrap, className, printAreaClassName].filter(Boolean).join(" ")}>
      <div className={styles.qrCard}>
        {qrSrc ? (
          <img src={qrSrc} alt="QR Code da ficha pública do equipamento" width={128} height={128} className={styles.qrImg} />
        ) : (
          <div className={styles.qrPlaceholder} aria-hidden>
            {qrError ? "QR indisponível" : "…"}
          </div>
        )}
        <p className={styles.printTag}>{tag || "Equipamento"}</p>
        {brandModel ? <p className={styles.printBrandModel}>{brandModel}</p> : null}
        <p className={styles.printHint}>Escaneie para ver a ficha e o histórico</p>
      </div>

      <button type="button" className={styles.printBtn} onClick={() => window.print()}>
        <PrinterIcon />
        Imprimir etiqueta QR
      </button>
    </div>
  );
}
