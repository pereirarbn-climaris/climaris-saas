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
import styles from "./catalog-combobox.module.css";

export type ClientComboboxItem = {
  id: string;
  nome: string;
  endereco?: string;
  contato?: string;
  /** Compatível com `Cliente` da OS — alias de `contato` na exibição */
  telefone?: string;
  /** Usados na busca, não exibidos no dropdown */
  nomeFantasia?: string;
  documento?: string;
};

export type ClientComboboxProps = {
  clientes: readonly ClientComboboxItem[];
  value: string;
  onChange: (clienteId: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  className?: string;
  emptyMessage?: string;
};

function clientContato(c: ClientComboboxItem): string {
  return (c.contato ?? c.telefone ?? "").trim();
}

function clientLabel(c: ClientComboboxItem): string {
  const contato = clientContato(c);
  return contato ? `${c.nome} · ${contato}` : c.nome;
}

function clientMatchesQuery(c: ClientComboboxItem, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return (
    matchesCatalogSearch(c.nome, q) ||
    matchesCatalogSearch(c.nomeFantasia ?? "", q) ||
    matchesCatalogSearch(c.documento ?? "", q) ||
    matchesCatalogSearch(c.endereco ?? "", q) ||
    matchesCatalogSearch(clientContato(c), q)
  );
}

export function ClientCombobox({
  clientes,
  value,
  onChange,
  placeholder = "Selecione o cliente",
  searchPlaceholder = "Pesquisar cliente...",
  disabled,
  error,
  id: idProp,
  className,
  emptyMessage = "Nenhum cliente encontrado.",
}: ClientComboboxProps) {
  const reactId = useId();
  const baseId = idProp ?? reactId.replace(/:/g, "");
  const listId = `${baseId}-listbox`;
  const searchId = `${baseId}-search`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const sortedClientes = useMemo(
    () => [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [clientes],
  );

  const filteredClientes = useMemo(() => {
    const q = query.trim();
    if (!q) return sortedClientes;
    return sortedClientes.filter((c) => clientMatchesQuery(c, q));
  }, [sortedClientes, query]);

  const selected = useMemo(
    () => sortedClientes.find((c) => c.id === value),
    [sortedClientes, value],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const pick = useCallback(
    (idx: number) => {
      const client = filteredClientes[idx];
      if (!client) return;
      onChange(client.id);
      close();
    },
    [filteredClientes, onChange, close],
  );

  useEffect(() => {
    if (!open) return;
    const idx = filteredClientes.findIndex((c) => c.id === value);
    setHighlighted(idx >= 0 ? idx : 0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, filteredClientes, value]);

  useEffect(() => {
    if (!open) return;
    setHighlighted((h) => Math.min(h, Math.max(0, filteredClientes.length - 1)));
  }, [filteredClientes.length, open]);

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
    const el = root.querySelector(`[data-client-combo-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const onKeyDownPanel = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
      return;
    }
    if (filteredClientes.length === 0) return;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setHighlighted((h) => Math.min(filteredClientes.length - 1, h + 1));
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

  const triggerClass = [
    styles.trigger,
    selected ? styles.triggerFilled : "",
    error ? styles.triggerError : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(" ")}>
      <button
        type="button"
        id={baseId}
        className={triggerClass}
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
        <span className={styles.triggerLabel}>
          {selected ? clientLabel(selected) : placeholder}
        </span>
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
          {filteredClientes.length === 0 ? (
            <p className={styles.empty} role="status">
              {emptyMessage}
            </p>
          ) : (
            <ul id={listId} role="listbox" className={styles.list} aria-label={placeholder}>
              {filteredClientes.map((client, idx) => (
                <li key={client.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    data-client-combo-idx={idx}
                    aria-selected={client.id === value}
                    className={`${styles.option} ${idx === highlighted ? styles.optionActive : ""}`}
                    onMouseEnter={() => setHighlighted(idx)}
                    onClick={() => pick(idx)}
                  >
                    <span className={styles.optionStack}>
                      <span className={styles.optionPrimary}>{client.nome}</span>
                      {client.endereco ? (
                        <span className={styles.optionMeta}>{client.endereco}</span>
                      ) : null}
                      {clientContato(client) ? (
                        <span className={styles.optionMeta}>{clientContato(client)}</span>
                      ) : null}
                    </span>
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
