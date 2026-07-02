import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  subscribeNotificationAlerts,
  type NotificationAlertPayload,
} from "../lib/notificationAlerts";
import styles from "./NotificationAlertHost.module.css";

const AUTO_DISMISS_MS = 8000;
const MAX_VISIBLE = 3;

type VisibleAlert = NotificationAlertPayload & { key: string };

export function NotificationAlertHost() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<VisibleAlert[]>([]);

  useEffect(
    () =>
      subscribeNotificationAlerts((payload) => {
        setAlerts((prev) => {
          const key = `${payload.id}-${Date.now()}`;
          const next = [{ ...payload, key }, ...prev.filter((item) => item.id !== payload.id)];
          return next.slice(0, MAX_VISIBLE);
        });
      }),
    [],
  );

  useEffect(() => {
    if (alerts.length === 0) return;
    const timers = alerts.map((alert) =>
      window.setTimeout(() => {
        setAlerts((prev) => prev.filter((item) => item.key !== alert.key));
      }, AUTO_DISMISS_MS),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [alerts]);

  if (alerts.length === 0) return null;

  return (
    <div className={styles.viewport} aria-live="polite">
      {alerts.map((alert) => {
        const isWarn = alert.kind === "whatsapp_send_failed";
        return (
          <div
            key={alert.key}
            role="alert"
            className={`${styles.alert} ${isWarn ? styles.alertErr : styles.alertOk}`}
          >
            <span className={styles.icon} aria-hidden>
              {isWarn ? "!" : "✓"}
            </span>
            <div className={styles.content}>
              <p className={styles.title}>{alert.title}</p>
              <p className={styles.body}>{alert.body}</p>
              {alert.linkPath ? (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    navigate(alert.linkPath!);
                    setAlerts((prev) => prev.filter((item) => item.key !== alert.key));
                  }}
                >
                  Ver detalhes
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.dismiss}
              aria-label="Fechar alerta"
              onClick={() => setAlerts((prev) => prev.filter((item) => item.key !== alert.key))}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
