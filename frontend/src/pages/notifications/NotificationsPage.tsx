import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import type { NotificationOut } from "../../api/notifications";
import { NotificationPreferencesModal } from "../../components/notifications/NotificationPreferencesModal";
import {
  useNotificationKinds,
  useNotificationMutations,
  useNotificationsPageList,
} from "../../features/notifications/hooks/useNotifications";
import {
  formatNotificationBody,
  formatNotificationDate,
  notificationDateFilterRange,
  notificationKindLabel,
  type NotificationDateFilter,
} from "../../lib/notificationDisplay";
import { loadNotificationPreferences } from "../../lib/notificationPreferences";
import styles from "./NotificationsPage.module.css";

type Tab = "unread" | "all";

const PAGE_SIZE = 30;

function NotificationRowMenu({
  notification,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: {
  notification: NotificationOut;
  onMarkRead: (id: number) => void;
  onMarkUnread: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={styles.rowMenu} ref={rootRef}>
      <button
        type="button"
        className={styles.rowMenuBtn}
        aria-label="Ações da notificação"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} strokeWidth={2} />
      </button>
      {open ? (
        <div className={styles.rowMenuPanel} role="menu">
          {notification.is_read ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMarkUnread(notification.id);
                setOpen(false);
              }}
            >
              Marcar como não lida
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMarkRead(notification.id);
                setOpen(false);
              }}
            >
              Marcar como lida
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={styles.rowMenuDanger}
            onClick={() => {
              onDelete(notification.id);
              setOpen(false);
            }}
          >
            Excluir
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationsPage() {
  const [tab, setTab] = useState<Tab>("unread");
  const [kindFilter, setKindFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<NotificationDateFilter>("all");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<NotificationOut[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsVersion, setPrefsVersion] = useState(0);

  const dateRange = useMemo(() => notificationDateFilterRange(dateFilter), [dateFilter]);
  const listParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      unreadOnly: tab === "unread",
      kind: kindFilter || null,
      fromDate: dateRange.fromDate ?? null,
      toDate: dateRange.toDate ?? null,
    }),
    [offset, tab, kindFilter, dateRange.fromDate, dateRange.toDate],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useNotificationsPageList(listParams);
  const { data: kindOptions = {} } = useNotificationKinds();
  const { markRead, markUnread, markReadBulk, markAllRead, removeOne, removeBulk } = useNotificationMutations();

  useEffect(() => {
    setOffset(0);
    setItems([]);
    setSelectedIds(new Set());
  }, [tab, kindFilter, dateFilter, prefsVersion]);

  useEffect(() => {
    if (!data) return;
    setTotal(data.total);
    if (offset === 0) {
      setItems(data.items);
      return;
    }
    setItems((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const nextItems = data.items.filter((item) => !existingIds.has(item.id));
      return nextItems.length > 0 ? [...prev, ...nextItems] : prev;
    });
  }, [data, offset]);

  const mutedKinds = useMemo(() => new Set(loadNotificationPreferences().mutedKinds), [prefsVersion]);
  const visibleItems = useMemo(
    () => items.filter((item) => !mutedKinds.has(item.kind)),
    [items, mutedKinds],
  );

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id));
  const someSelected = selectedIds.size > 0;
  const selectedUnreadCount = visibleItems.filter((item) => selectedIds.has(item.id) && !item.is_read).length;

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleItems.map((item) => item.id)));
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleMarkSelectedRead() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    markReadBulk.mutate(ids, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  }

  function handleDeleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Excluir ${ids.length} notificação(ões) selecionada(s)?`)) return;
    removeBulk.mutate(ids, {
      onSuccess: () => {
        setSelectedIds(new Set());
        setOffset(0);
        setItems([]);
        void refetch();
      },
    });
  }

  function handleDeleteOne(id: number) {
    if (!window.confirm("Excluir esta notificação?")) return;
    removeOne.mutate(id, {
      onSuccess: () => {
        setItems((prev) => prev.filter((item) => item.id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });
  }

  const hasMore = items.length < total;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Notificações</h1>
          <p className={styles.subtitle}>Veja avisos antigos, marque como lidas ou exclua o que não precisa mais.</p>
        </div>
        <button type="button" className={styles.prefsBtn} onClick={() => setPrefsOpen(true)}>
          Gerenciar preferências
        </button>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Filtro de leitura">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "unread"}
          className={tab === "unread" ? styles.tabActive : styles.tab}
          onClick={() => setTab("unread")}
        >
          Não lidas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={tab === "all" ? styles.tabActive : styles.tab}
          onClick={() => setTab("all")}
        >
          Todas
        </button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Tipo</span>
            <select className={styles.select} value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="">Todos os tipos</option>
              {Object.entries(kindOptions).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Data</span>
            <select
              className={styles.select}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as NotificationDateFilter)}
            >
              <option value="all">Qualquer data</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="90d">Últimos 90 dias</option>
            </select>
          </label>
        </div>

        {tab === "unread" && (data?.unread_count ?? 0) > 0 ? (
          <button
            type="button"
            className={styles.linkBtn}
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            Marcar todas como lidas
          </button>
        ) : null}
      </div>

      {someSelected ? (
        <div className={styles.selectionBar}>
          <span>{selectedIds.size} selecionado(s)</span>
          <button type="button" className={styles.linkBtn} onClick={() => setSelectedIds(new Set())}>
            Desmarcar
          </button>
          {selectedUnreadCount > 0 ? (
            <button
              type="button"
              className={styles.linkBtn}
              disabled={markReadBulk.isPending}
              onClick={handleMarkSelectedRead}
            >
              Marcar {selectedUnreadCount} selecionada(s) como lidas
            </button>
          ) : null}
          <button
            type="button"
            className={styles.dangerBtn}
            disabled={removeBulk.isPending}
            onClick={handleDeleteSelected}
          >
            Excluir selecionadas
          </button>
        </div>
      ) : null}

      {isError ? (
        <p className={styles.error}>{error instanceof Error ? error.message : "Erro ao carregar notificações."}</p>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colCheck}>
                <input
                  type="checkbox"
                  aria-label="Selecionar todas"
                  checked={allVisibleSelected && visibleItems.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Notificação</th>
              <th className={styles.colDate}>Data</th>
              <th className={styles.colActions} aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {isLoading && visibleItems.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>
                  Carregando…
                </td>
              </tr>
            ) : null}

            {!isLoading && visibleItems.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>
                  {tab === "unread" ? "Nenhuma notificação não lida." : "Nenhuma notificação encontrada."}
                </td>
              </tr>
            ) : null}

            {visibleItems.map((notification) => {
              const content = (
                <>
                  {!notification.is_read ? <span className={styles.unreadDot} aria-hidden /> : null}
                  <span className={styles.rowText}>
                    <strong>{notification.title}</strong>
                    <span className={styles.rowBody}>{formatNotificationBody(notification)}</span>
                    <span className={styles.rowKind}>{notificationKindLabel(notification.kind)}</span>
                  </span>
                </>
              );

              return (
                <tr key={notification.id} className={notification.is_read ? styles.rowRead : styles.rowUnread}>
                  <td className={styles.colCheck}>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${notification.title}`}
                      checked={selectedIds.has(notification.id)}
                      onChange={() => toggleSelect(notification.id)}
                    />
                  </td>
                  <td>
                    {notification.link_path ? (
                      <Link
                        to={notification.link_path}
                        className={styles.rowLink}
                        onClick={() => {
                          if (!notification.is_read) markRead.mutate(notification.id);
                        }}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={styles.rowLink}
                        onClick={() => {
                          if (!notification.is_read) markRead.mutate(notification.id);
                        }}
                      >
                        {content}
                      </button>
                    )}
                  </td>
                  <td className={styles.colDate}>{formatNotificationDate(notification.created_at)}</td>
                  <td className={styles.colActions}>
                    <NotificationRowMenu
                      notification={notification}
                      onMarkRead={(id) => markRead.mutate(id)}
                      onMarkUnread={(id) => markUnread.mutate(id)}
                      onDelete={handleDeleteOne}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className={styles.footer}>
        <span>
          {visibleItems.length} {visibleItems.length === 1 ? "item" : "itens"}
          {total > visibleItems.length ? ` de ${total}` : ""}
        </span>
        {hasMore ? (
          <button
            type="button"
            className={styles.loadMoreBtn}
            disabled={isFetching}
            onClick={() => setOffset(items.length)}
          >
            {isFetching ? "Carregando…" : "Carregar mais"}
          </button>
        ) : null}
      </footer>

      <NotificationPreferencesModal
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        kindOptions={kindOptions}
        onSaved={() => setPrefsVersion((value) => value + 1)}
      />
    </div>
  );
}
