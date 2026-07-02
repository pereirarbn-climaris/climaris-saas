import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, type NotificationUnreadCountOut } from "../../../api/notifications";
import { emitNotificationAlert } from "../../../lib/notificationAlerts";
import { formatNotificationBody } from "../../../lib/notificationDisplay";
import { loadNotificationPreferences } from "../../../lib/notificationPreferences";
import { playNotificationSound } from "../../../lib/notificationSound";
import { notificationQueryKeys } from "../notificationQueryKeys";

const POLL_INTERVAL_MS = 20_000;
const BASELINE_STORAGE_KEY = "climaris.notificationBaselineId";

function readBaselineId(): number | null {
  try {
    const raw = sessionStorage.getItem(BASELINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeBaselineId(id: number): void {
  try {
    sessionStorage.setItem(BASELINE_STORAGE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

export function useNotificationAlerts(enabled: boolean) {
  const queryClient = useQueryClient();
  const baselineReadyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function poll() {
      try {
        const data = await fetchNotifications({ limit: 20 });
        if (cancelled) return;

        const maxId = data.items.reduce((max, item) => Math.max(max, item.id), 0);
        const baseline = readBaselineId();

        if (!baselineReadyRef.current || baseline === null) {
          writeBaselineId(maxId);
          baselineReadyRef.current = true;
          queryClient.setQueryData(notificationQueryKeys.unreadCount(), { unread_count: data.unread_count });
          return;
        }

        const fresh = data.items
          .filter((item) => item.id > baseline)
          .sort((a, b) => a.id - b.id);

        if (fresh.length === 0) {
          const cachedUnread =
            queryClient.getQueryData<NotificationUnreadCountOut>(notificationQueryKeys.unreadCount())?.unread_count ??
            null;
          if (cachedUnread === 0 && data.unread_count > 0) {
            void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
            return;
          }
          queryClient.setQueryData(notificationQueryKeys.unreadCount(), { unread_count: data.unread_count });
          return;
        }

        const prefs = loadNotificationPreferences();
        let playedSound = false;

        for (const notification of fresh) {
          if (prefs.mutedKinds.includes(notification.kind)) continue;
          emitNotificationAlert({
            id: notification.id,
            title: notification.title,
            body: formatNotificationBody(notification),
            kind: notification.kind,
            linkPath: notification.link_path,
          });
          if (prefs.soundEnabled && !playedSound) {
            playNotificationSound();
            playedSound = true;
          }
        }

        writeBaselineId(Math.max(baseline, ...fresh.map((item) => item.id)));
        queryClient.setQueryData(notificationQueryKeys.unreadCount(), { unread_count: data.unread_count });
        void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
      } catch {
        /* ignore transient polling errors */
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, queryClient]);
}
