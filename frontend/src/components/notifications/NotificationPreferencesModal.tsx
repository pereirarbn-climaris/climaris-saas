import { useEffect, useState } from "react";
import { NavIconX } from "../dashboard/NavIcons";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "../../lib/notificationPreferences";
import styles from "./NotificationPreferencesModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  kindOptions: Record<string, string>;
  onSaved?: () => void;
};

export function NotificationPreferencesModal({ open, onClose, kindOptions, onSaved }: Props) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => loadNotificationPreferences());

  useEffect(() => {
    if (open) setPreferences(loadNotificationPreferences());
  }, [open]);

  if (!open) return null;

  function toggleKind(kind: string) {
    setPreferences((prev) => {
      const muted = new Set(prev.mutedKinds);
      if (muted.has(kind)) muted.delete(kind);
      else muted.add(kind);
      return { ...prev, mutedKinds: [...muted] };
    });
  }

  function handleSave() {
    saveNotificationPreferences(preferences);
    onSaved?.();
    onClose();
  }

  return (
    <div className={styles.root} role="presentation">
      <button type="button" className={styles.backdrop} aria-label="Fechar" onClick={onClose} />
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="notification-prefs-title">
        <div className={styles.header}>
          <h2 id="notification-prefs-title" className={styles.title}>
            Preferências de notificações
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            <NavIconX />
          </button>
        </div>

        <p className={styles.lead}>
          Escolha quais tipos de aviso aparecem no seu centro de notificações. Isso não impede o envio — apenas
          oculta na lista.
        </p>

        <ul className={styles.kindList}>
          {Object.entries(kindOptions).map(([kind, label]) => {
            const checked = !preferences.mutedKinds.includes(kind);
            return (
              <li key={kind}>
                <label className={styles.kindRow}>
                  <input type="checkbox" checked={checked} onChange={() => toggleKind(kind)} />
                  <span>{label}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <label className={styles.kindRow}>
          <input
            type="checkbox"
            checked={preferences.soundEnabled}
            onChange={(e) => setPreferences((prev) => ({ ...prev, soundEnabled: e.target.checked }))}
          />
          <span>Tocar som ao receber nova notificação</span>
        </label>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={styles.saveBtn} onClick={handleSave}>
            Salvar preferências
          </button>
        </div>
      </div>
    </div>
  );
}
