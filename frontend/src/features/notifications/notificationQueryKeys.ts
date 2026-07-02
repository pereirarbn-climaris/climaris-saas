import type { NotificationListParams } from "../../api/notifications";

export const notificationQueryKeys = {
  all: ["notifications"] as const,
  list: (params?: NotificationListParams) => [...notificationQueryKeys.all, "list", params ?? {}] as const,
  kinds: () => [...notificationQueryKeys.all, "kinds"] as const,
  unreadCount: () => [...notificationQueryKeys.all, "unread-count"] as const,
};
