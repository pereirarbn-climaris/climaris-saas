import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { matchesCatalogSearch } from "../../lib/catalogSearch";
import { sortByNameAsc } from "../../lib/localeSort";
import styles from "./catalog-combobox.module.css";

export type CatalogComboboxItem = { id: string; name: string };

export type CatalogComboboxProps = {
  items: readonly CatalogComboboxItem[];
  onPick: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  emptyMessage?: string;
};

export function CatalogCombobox({
  items,
  onPick,
  placeholder = "Selecionar…",
  searchPlaceholder = "Pesquisar…",
  disabled,
  id: idProp,
  className,
  emptyMessage = "Nenhum item encontrado.",
}: CatalogComboboxProps) {
  const reactId = useId();
  const baseId = idProp ?? reactId.replace(/:/g, "");
  const listId = `${baseId}-listbox`;
  const searchId = `${baseId}-search`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const sortedItems = useMemo(() => sortByNameAsc(items), [items]);

  const filteredItems = useMemo(() => {
    const q = query.trim();
    if (!q) return sortedItems;
    return sortedItems.filter((item) => matchesCatalogSearch(item.name, q));
  }, [sortedItems, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const pick = useCallback(
    (idx: number) => {
      const item = filteredItems[idx];
      if (!item) return;
      onPick(item.id);
      close();
    },
    [filteredItems, onPick, close],
  );

  useEffect(() => {
    if (!open) return;
    setHighlighted(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHighlighted((h) => Math.min(h, Math.max(0, filteredItems.length - 1)));
  }, [filteredItems.length, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(ev.target as Node)) return;
      close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-catalog-combo-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const onKeyDownPanel = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
      return;
    }
    if (filteredItems.length === 0) return;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setHighlighted((h) => Math.min(filteredItems.length - 1, h + 1));
      return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      pick(highlighted);
    }
  };

  return (
    <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(" ")}>
      <button
        type="button"
        id={baseId}
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        onKeyDown={(ev) => {
          if (disabled) return;
          if (!open && (ev.key === "ArrowDown" || ev.key === "Enter" || ev.key === " ")) {
            ev.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={styles.triggerLabel}>{placeholder}</span>
        <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} viewBox="0 0 20 20" aria-hidden>
          <path
            d="M5 8l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className={styles.panel} onKeyDown={onKeyDownPanel}>
          <div className={styles.searchWrap}>
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              className={styles.searchInput}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
              }}
              placeholder={searchPlaceholder}
              autoComplete="off"
              aria-controls={listId}
              aria-autocomplete="list"
            />
          </div>
          {filteredItems.length === 0 ? (
            <p className={styles.empty} role="status">
              {emptyMessage}
            </p>
          ) : (
            <ul id={listId} role="listbox" className={styles.list} aria-label={placeholder}>
              {filteredItems.map((item, idx) => (
                <li key={item.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    data-catalog-combo-idx={idx}
                    className={`${styles.option} ${idx === highlighted ? styles.optionActive : ""}`}
                    onMouseEnter={() => setHighlighted(idx)}
                    onClick={() => pick(idx)}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

