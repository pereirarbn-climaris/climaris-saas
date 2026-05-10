import { useCallback, useEffect, useMemo, useState } from "react";
import { listClients, type ClientOut } from "../api/clients";
import { sortByNameAsc } from "../lib/localeSort";
import loginStyles from "../pages/LoginPage.module.css";
import styles from "./ClientPicker.module.css";

const PAGE = 40;

type Props = {
  inputId: string;
  /** Current selected client id as string, or "" */
  value: string;
  onChange: (clientId: string) => void;
  disabled?: boolean;
  /** Extra row always merged (ex.: cliente da OS ao editar). */
  pinned?: ClientOut | null;
};

export function ClientPicker({ inputId, value: _value, onChange, disabled, pinned }: Props) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [open, setOpen] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [apiSkip, setApiSkip] = useState(0);
  const [items, setItems] = useState<ClientOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setApiSkip(0);
    setItems([]);
    setHasMore(true);
  }, [debouncedQ, includeInactive]);

  const loadPage = useCallback(
    async (startSkip: number, append: boolean) => {
      setLoading(true);
      try {
        const rows = await listClients({
          q: debouncedQ || undefined,
          skip: startSkip,
          limit: PAGE,
          status: includeInactive ? "all" : "active",
        });
        setHasMore(rows.length >= PAGE);
        const nextStart = startSkip + rows.length;
        setApiSkip(nextStart);
        setItems((prev) => {
          const merged = append ? [...prev, ...rows] : rows;
          const map = new Map<number, ClientOut>();
          if (pinned && (!debouncedQ || pinned.name.toLowerCase().includes(debouncedQ.toLowerCase()))) {
            map.set(pinned.id, pinned);
          }
          for (const r of merged) {
            map.set(r.id, r);
          }
          return sortByNameAsc(Array.from(map.values()));
        });
      } finally {
        setLoading(false);
      }
    },
    [debouncedQ, includeInactive, pinned],
  );

  useEffect(() => {
    if (disabled) return;
    void loadPage(0, false);
  }, [disabled, loadPage]);

  const visible = useMemo(() => (open ? items : []), [open, items]);

  return (
    <div className={styles.wrap}>
      <div className={styles.searchFieldWrap}>
        <span className={styles.searchIcon} aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <input
          id={inputId}
          className={loginStyles.input}
          placeholder="Buscar cliente por nome ou documento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
      <label className={styles.inlineCheck}>
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
          disabled={disabled}
        />
        Incluir clientes inativos
      </label>
      {open && visible.length > 0 ? (
        <div className={styles.resultList} role="listbox">
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.resultBtn}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(String(c.id));
                setQ("");
                setOpen(false);
              }}
            >
              <span className={styles.resultName}>
                {c.name}
                {c.is_active === false ? <span className={styles.inactiveBadge}>inativo</span> : null}
              </span>
              <small className={styles.resultMeta}>{c.document ?? "—"}</small>
            </button>
          ))}
          {hasMore ? (
            <button
              type="button"
              className={styles.loadMore}
              disabled={loading}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void loadPage(apiSkip, true)}
            >
              {loading ? "Carregando…" : "Carregar mais"}
            </button>
          ) : null}
        </div>
      ) : null}
      {open && !loading && visible.length === 0 ? <p className={styles.empty}>Nenhum cliente encontrado.</p> : null}
    </div>
  );
}
