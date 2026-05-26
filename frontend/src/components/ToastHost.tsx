import { useEffect, useState } from "react";
import { subscribeToast, type ToastPayload } from "../lib/toast";
import styles from "./ToastHost.module.css";

const AUTO_DISMISS_MS = 4500;

export function ToastHost() {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => subscribeToast((payload) => setToast(payload)), []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const isOk = toast.kind === "ok";

  return (
    <div className={styles.viewport} aria-live="polite">
      <div
        role={isOk ? "status" : "alert"}
        className={`${styles.toast} ${isOk ? styles.toastOk : styles.toastErr}`}
      >
        <span className={styles.icon} aria-hidden>
          {isOk ? "✓" : "!"}
        </span>
        <p className={styles.text}>{toast.text}</p>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setToast(null)}
          aria-label="Fechar notificação"
        >
          ×
        </button>
      </div>
    </div>
  );
}
