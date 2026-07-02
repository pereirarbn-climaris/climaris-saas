import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { NavIconX } from "../dashboard/NavIcons";
import type { NotificationOut } from "../../api/notifications";
import {
  useNotificationMutations,
  useNotificationsList,
} from "../../features/notifications/hooks/useNotifications";
import {
  formatNotificationBody,
  formatNotificationRelativeTime,
  notificationKindLabel,
} from "../../lib/notificationDisplay";
import { toast } from "../../lib/toast";
import styles from "./NotificationCenterPanel.module.css";

export type LocalNotificationItem = {
  id: string;
  title?: string;
  body: ReactNode;
  variant?: "default" | "warn" | "local";
  href?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  localItems?: LocalNotificationItem[];
  onDismissLocal?: (id: string) => void;
};

function itemClassName(notification: NotificationOut): string {
  return notification.is_read ? styles.item : styles.itemUnread;
}

function localItemClassName(variant: LocalNotificationItem["variant"]): string {
  if (variant === "warn") return styles.itemWarn;
  if (variant === "local") return styles.itemLocal;
  return styles.item;
}

function NotificationRow({
  notification,
  onNavigate,
  onDismiss,
}: {
  notification: NotificationOut;
  onNavigate: () => void;
  onDismiss: (id: number) => void;
}) {
  const content = (
    <>
      <span className={styles.itemTitle}>{notification.title}</span>
      <p className={styles.itemBody}>{formatNotificationBody(notification)}</p>
      <span className={styles.itemMeta}>
        {notificationKindLabel(notification.kind)} · {formatNotificationRelativeTime(notification.created_at)}
      </span>
    </>
  );

  const handleDismiss = () => {
    onDismiss(notification.id);
  };

  if (notification.link_path) {
    return (
      <li className={itemClassName(notification)}>
        <Link
          to={notification.link_path}
          className={styles.itemBtn}
          onClick={() => {
            handleDismiss();
            onNavigate();
          }}
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li className={itemClassName(notification)}>
      <button type="button" className={styles.itemBtn} onClick={handleDismiss}>
        {content}
      </button>
    </li>
  );
}

function LocalNotificationRow({
  item,
  onDismiss,
  onNavigate,
}: {
  item: LocalNotificationItem;
  onDismiss: (id: string) => void;
  onNavigate: () => void;
}) {
  const content = (
    <>
      {item.title ? <span className={styles.itemTitle}>{item.title}</span> : null}
      <span className={styles.itemBody}>{item.body}</span>
    </>
  );

  if (item.href) {
    return (
      <li className={localItemClassName(item.variant)}>
        <Link
          to={item.href}
          className={styles.itemBtn}
          onClick={() => {
            onDismiss(item.id);
            onNavigate();
          }}
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li className={localItemClassName(item.variant)}>
      <button
        type="button"
        className={styles.itemBtn}
        onClick={() => {
          onDismiss(item.id);
        }}
      >
        {content}
      </button>
    </li>
  );
}

export function NotificationCenterPanel({
  open,
  onClose,
  localItems = [],
  onDismissLocal,
}: Props) {
  const { data, isLoading, isError, error } = useNotificationsList(open);
  const { markRead, markAllRead } = useNotificationMutations();

  if (!open) return null;

  const apiUnreadCount = data?.unread_count ?? 0;
  const unreadItems = (data?.items ?? []).filter((notification) => !notification.is_read);
  const hasPanelItems = apiUnreadCount > 0 || localItems.length > 0;

  function dismissAllLocalItems() {
    for (const item of localItems) {
      onDismissLocal?.(item.id);
    }
  }

  function handleMarkAllRead() {
    if (apiUnreadCount > 0) {
      markAllRead.mutate(undefined, {
        onSuccess: () => dismissAllLocalItems(),
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Não foi possível marcar todas como lidas.");
        },
      });
      return;
    }
    dismissAllLocalItems();
  }

  return (
    <div className={styles.panelRoot} role="presentation">
      <button type="button" className={styles.backdrop} aria-label="Fechar painel" onClick={onClose} />
      <aside className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="notifications-title">
        <div className={styles.top}>
          <h2 id="notifications-title" className={styles.title}>
            Notificações
          </h2>
          <div className={styles.actions}>
            {hasPanelItems ? (
              <button
                type="button"
                className={styles.markAllBtn}
                disabled={markAllRead.isPending}
                onClick={handleMarkAllRead}
              >
                Marcar todas como lidas
              </button>
            ) : null}
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
              <NavIconX />
            </button>
          </div>
        </div>

        {isError ? (
          <p className={styles.error}>{error instanceof Error ? error.message : "Erro ao carregar notificações."}</p>
        ) : null}

        <ul className={styles.list}>
          {isLoading && unreadItems.length === 0 && localItems.length === 0 ? (
            <li className={styles.empty}>Carregando…</li>
          ) : null}

          {!isLoading && unreadItems.length === 0 && localItems.length === 0 ? (
            <li className={styles.empty}>Nenhuma notificação por enquanto.</li>
          ) : null}

          {unreadItems.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onNavigate={onClose}
              onDismiss={(id) => markRead.mutate(id)}
            />
          ))}

          {localItems.map((item) => (
            <LocalNotificationRow
              key={item.id}
              item={item}
              onDismiss={(id) => onDismissLocal?.(id)}
              onNavigate={onClose}
            />
          ))}
        </ul>

        <div className={styles.footer}>
          <Link to="/app/notifications" className={styles.viewAllLink} onClick={onClose}>
            Ver todas as notificações
          </Link>
        </div>
      </aside>
    </div>
  );
}
