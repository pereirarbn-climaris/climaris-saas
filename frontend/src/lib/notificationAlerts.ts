export type NotificationAlertPayload = {
  id: number;
  title: string;
  body: string;
  kind: string;
  linkPath?: string | null;
};

type NotificationAlertListener = (payload: NotificationAlertPayload) => void;

const listeners = new Set<NotificationAlertListener>();

export function subscribeNotificationAlerts(listener: NotificationAlertListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNotificationAlert(payload: NotificationAlertPayload): void {
  for (const listener of listeners) {
    listener(payload);
  }
}
