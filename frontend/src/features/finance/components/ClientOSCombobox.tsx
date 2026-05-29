import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import styles from '../../../components/ui/catalog-combobox.module.css';
import {
  findClientOSOption,
  isValidClientOSSelection,
  useClientOSLinkOptions,
  type ClientOSLinkOption,
} from '../hooks/useClientOSLinkOptions';

export type ClientOSSelection = {
  clientId: number;
  serviceOrderId?: number;
};

export type ClientOSComboboxProps = {
  value: string | null;
  onChange: (selection: ClientOSSelection | null, option: ClientOSLinkOption | null) => void;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  searchPlaceholder?: string;
};

export function ClientOSCombobox({
  value,
  onChange,
  disabled,
  error,
  id: idProp,
  className,
  placeholder = 'Buscar cliente ou ordem de serviço…',
  searchPlaceholder = 'Nome, ID do cliente ou número da OS…',
}: ClientOSComboboxProps) {
  const reactId = useId();
  const baseId = idProp ?? reactId.replace(/:/g, '');
  const listId = `${baseId}-listbox`;
  const searchId = `${baseId}-search`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { options, isLoading, isFetching } = useClientOSLinkOptions(query, open || Boolean(value));

  const selected = useMemo(
    () => findClientOSOption(options, value) ?? null,
    [options, value],
  );

  const selectionValid = useMemo(
    () => isValidClientOSSelection(options, value),
    [options, value],
  );

  const showError = Boolean(error || (value && !selectionValid && !isLoading));

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const pick = useCallback(
    (opt: ClientOSLinkOption) => {
      onChange(
        { clientId: opt.clientId, serviceOrderId: opt.serviceOrderId },
        opt,
      );
      close();
    },
    [onChange, close],
  );

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.id === value);
    setHighlighted(idx >= 0 ? idx : 0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    setHighlighted((h) => Math.min(h, Math.max(0, options.length - 1)));
  }, [options.length, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(ev.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-client-os-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open]);

  const onKeyDownPanel = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
      return;
    }
    if (options.length === 0) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setHighlighted((h) => Math.min(options.length - 1, h + 1));
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const opt = options[highlighted];
      if (opt) pick(opt);
    }
  };

  const triggerClass = [
    styles.trigger,
    selected ? styles.triggerFilled : '',
    showError ? styles.triggerError : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        id={baseId}
        className={triggerClass}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={showError || undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        onKeyDown={(ev) => {
          if (disabled) return;
          if (!open && (ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' ')) {
            ev.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={styles.triggerLabel}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} viewBox="0 0 20 20" aria-hidden>
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
          {isLoading || isFetching ? (
            <p className={styles.empty} role="status">
              Buscando…
            </p>
          ) : options.length === 0 ? (
            <p className={styles.empty} role="status">
              Nenhum cliente ou OS encontrado.
            </p>
          ) : (
            <ul id={listId} role="listbox" className={styles.list} aria-label={placeholder}>
              {options.map((opt, idx) => (
                <li key={opt.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    data-client-os-idx={idx}
                    aria-selected={opt.id === value}
                    className={`${styles.option} ${idx === highlighted ? styles.optionActive : ''}`}
                    onMouseEnter={() => setHighlighted(idx)}
                    onClick={() => pick(opt)}
                  >
                    <span className={styles.optionPrimary}>{opt.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {value && !selectionValid && !isLoading ? (
        <p className={styles.empty} role="alert" style={{ marginTop: '0.35rem', textAlign: 'left' }}>
          Seleção inválida ou expirada. Escolha novamente na lista.
        </p>
      ) : null}
    </div>
  );
}

export { isValidClientOSSelection, findClientOSOption };
