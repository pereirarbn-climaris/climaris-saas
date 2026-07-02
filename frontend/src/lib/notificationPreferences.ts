const STORAGE_KEY = "climaris.notificationPreferences";

export type NotificationPreferences = {
  mutedKinds: string[];
  soundEnabled: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  mutedKinds: [],
  soundEnabled: true,
};

export function loadNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      mutedKinds: Array.isArray(parsed.mutedKinds)
        ? parsed.mutedKinds.filter((kind): kind is string => typeof kind === "string")
        : [],
      soundEnabled: parsed.soundEnabled !== false,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveNotificationPreferences(preferences: NotificationPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
