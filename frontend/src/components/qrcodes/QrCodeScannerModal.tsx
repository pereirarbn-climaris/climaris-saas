import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { parseScannedQrCode } from "../../lib/qrcodeScan";
import styles from "./QrCodeScannerModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (codeId: string) => void;
};

export function QrCodeScannerModal({ open, onClose, onScan }: Props) {
  const regionId = useId().replace(/:/g, "");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      await scanner.clear();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) {
      void stopScanner();
      setErr("");
      return;
    }

    let cancelled = false;
    setBusy(true);
    setErr("");

    void (async () => {
      try {
        await stopScanner();
        const scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            const code = parseScannedQrCode(decoded);
            if (!code) return;
            void stopScanner();
            onScan(code);
            onClose();
          },
          () => {
            /* frame sem leitura */
          },
        );
        if (!cancelled) setBusy(false);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Não foi possível acessar a câmera.");
          setBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [open, onClose, onScan, regionId, stopScanner]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-scanner-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="qr-scanner-title">Escanear etiqueta QR</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        <p className={styles.hint}>Aponte a câmera para o QR Code da etiqueta física.</p>
        <div id={regionId} className={styles.reader} />
        {busy ? <p className={styles.muted}>Iniciando câmera…</p> : null}
        {err ? <p className={styles.err}>{err}</p> : null}
      </div>
    </div>
  );
}
