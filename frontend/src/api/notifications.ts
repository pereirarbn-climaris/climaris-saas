import { apiUrl } from "../lib/apiUrl";
import { clampApiLimit } from "../lib/apiPagination";
import { getAccessToken } from "../lib/authStorage";

export type NotificationOut = {
  id: number;
  kind: string;
  title: string;
  body: string;
  link_path: string | null;
  entity_type: string | null;
  entity_id: number | null;
  actor_user_id: number | null;
  actor_name: string | null;
  read_at: string | null;
  created_at: string;
  is_read: boolean;
};

export type NotificationListOut = {
  items: NotificationOut[];
  total: number;
  unread_count: number;
};

export type NotificationUnreadCountOut = {
  unread_count: number;
};

export type NotificationBulkDeleteOut = {
  deleted: number;
};

export type NotificationListParams = {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  kind?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
};

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function errorMessage(body: unknown, fallback: string, status: number): string {
  if (body && typeof body === "object") {
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (typeof o.error?.message === "string" && o.error.message) return o.error.message;
    if (typeof o.detail === "string") return o.detail;
  }
  if (status === 401) return "Sessão expirada. Faça login novamente.";
  return fallback;
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export async function fetchNotifications(params?: NotificationListParams): Promise<NotificationListOut> {
  const sp = new URLSearchParams();
  sp.set("limit", String(clampApiLimit(params?.limit, 30)));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  if (params?.unreadOnly) sp.set("unread_only", "true");
  if (params?.kind) sp.set("kind", params.kind);
  if (params?.fromDate) sp.set("from_date", params.fromDate);
  if (params?.toDate) sp.set("to_date", params.toDate);
  const response = await fetch(apiUrl(`/api/v1/notifications?${sp.toString()}`), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar as notificações.", response.status));
  }
  return body as NotificationListOut;
}

export async function fetchNotificationKinds(): Promise<Record<string, string>> {
  const response = await fetch(apiUrl("/api/v1/notifications/kinds"), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar os tipos de notificação.", response.status));
  }
  return body as Record<string, string>;
}

export async function fetchNotificationUnreadCount(): Promise<NotificationUnreadCountOut> {
  const response = await fetch(apiUrl("/api/v1/notifications/unread-count"), {
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o contador de notificações.", response.status));
  }
  return body as NotificationUnreadCountOut;
}

export async function markNotificationRead(notificationId: number): Promise<NotificationOut> {
  const response = await fetch(apiUrl(`/api/v1/notifications/${notificationId}/read`), {
    method: "PATCH",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível marcar a notificação como lida.", response.status));
  }
  return body as NotificationOut;
}

export async function markNotificationUnread(notificationId: number): Promise<NotificationOut> {
  const response = await fetch(apiUrl(`/api/v1/notifications/${notificationId}/unread`), {
    method: "PATCH",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível marcar a notificação como não lida.", response.status));
  }
  return body as NotificationOut;
}

export async function markNotificationsReadBulk(ids: number[]): Promise<NotificationUnreadCountOut> {
  const response = await fetch(apiUrl("/api/v1/notifications/read-bulk"), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível marcar as notificações como lidas.", response.status));
  }
  return body as NotificationUnreadCountOut;
}

export async function markAllNotificationsRead(): Promise<NotificationUnreadCountOut> {
  const response = await fetch(apiUrl("/api/v1/notifications/read-all"), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json" },
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível marcar todas como lidas.", response.status));
  }
  return body as NotificationUnreadCountOut;
}

export async function deleteNotification(notificationId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/notifications/${notificationId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível excluir a notificação.", response.status));
  }
}

export async function deleteNotificationsBulk(ids: number[]): Promise<NotificationBulkDeleteOut> {
  const response = await fetch(apiUrl("/api/v1/notifications/delete-bulk"), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível excluir as notificações.", response.status));
  }
  return body as NotificationBulkDeleteOut;
}
