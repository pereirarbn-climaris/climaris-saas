import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteNotification,
  deleteNotificationsBulk,
  fetchNotificationKinds,
  fetchNotificationUnreadCount,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  markNotificationsReadBulk,
  type NotificationListOut,
  type NotificationListParams,
} from "../../../api/notifications";
import { notificationQueryKeys } from "../notificationQueryKeys";

const panelListParams: NotificationListParams = { limit: 40 };

export function useNotificationUnreadCount(enabled = true) {
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: fetchNotificationUnreadCount,
    enabled,
    refetchInterval: 60_000,
    select: (data) => data.unread_count,
  });
}

export function useNotificationsList(open: boolean) {
  return useQuery({
    queryKey: notificationQueryKeys.list(panelListParams),
    queryFn: () => fetchNotifications(panelListParams),
    enabled: open,
    staleTime: 15_000,
  });
}

export function useNotificationsPageList(params: NotificationListParams, enabled = true) {
  return useQuery({
    queryKey: notificationQueryKeys.list(params),
    queryFn: () => fetchNotifications(params),
    enabled,
    staleTime: 10_000,
  });
}

export function useNotificationKinds() {
  return useQuery({
    queryKey: notificationQueryKeys.kinds(),
    queryFn: fetchNotificationKinds,
    staleTime: 60_000,
  });
}

function patchListAsRead(list: NotificationListOut | undefined, notificationId: number): NotificationListOut | undefined {
  if (!list) return list;
  let decremented = false;
  const items = list.items.map((item) => {
    if (item.id !== notificationId || item.is_read) return item;
    decremented = true;
    return { ...item, is_read: true, read_at: new Date().toISOString() };
  });
  return {
    ...list,
    items,
    unread_count: decremented ? Math.max(0, list.unread_count - 1) : list.unread_count,
  };
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
  };

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: notificationQueryKeys.all });
      const prevEntries = queryClient.getQueriesData<NotificationListOut>({
        queryKey: notificationQueryKeys.all,
      });
      for (const [key, list] of prevEntries) {
        const nextList = patchListAsRead(list, notificationId);
        if (nextList) {
          queryClient.setQueryData(key, nextList);
          queryClient.setQueryData(notificationQueryKeys.unreadCount(), { unread_count: nextList.unread_count });
        }
      }
      return { prevEntries };
    },
    onError: (_err, _id, ctx) => {
      ctx?.prevEntries?.forEach(([key, list]) => {
        if (list) queryClient.setQueryData(key, list);
      });
    },
    onSettled: invalidate,
  });

  const markUnread = useMutation({
    mutationFn: markNotificationUnread,
    onSettled: invalidate,
  });

  const markReadBulk = useMutation({
    mutationFn: markNotificationsReadBulk,
    onSettled: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationQueryKeys.all });
      const prevEntries = queryClient.getQueriesData<NotificationListOut>({
        queryKey: notificationQueryKeys.all,
      });
      const now = new Date().toISOString();
      for (const [key, list] of prevEntries) {
        if (!list) continue;
        queryClient.setQueryData(key, {
          ...list,
          items: list.items.map((item) => ({ ...item, is_read: true, read_at: item.read_at ?? now })),
          unread_count: 0,
        });
      }
      queryClient.setQueryData(notificationQueryKeys.unreadCount(), { unread_count: 0 });
      return { prevEntries };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prevEntries?.forEach(([key, list]) => {
        if (list) queryClient.setQueryData(key, list);
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(notificationQueryKeys.unreadCount(), result);
    },
  });

  const removeOne = useMutation({
    mutationFn: deleteNotification,
    onSettled: invalidate,
  });

  const removeBulk = useMutation({
    mutationFn: deleteNotificationsBulk,
    onSettled: invalidate,
  });

  return { markRead, markUnread, markReadBulk, markAllRead, removeOne, removeBulk };
}
