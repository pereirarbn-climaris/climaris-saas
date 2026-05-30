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
  findServiceOrderLinkOption,
  useServiceOrderLinkOptions,
  type ServiceOrderLinkOption,
} from '../hooks/useServiceOrderLinkOptions';

export type ServiceOrderLinkSelection = {
  serviceOrderId: number;
};

export type ServiceOrderLinkComboboxProps = {
  value: string | null;
  onChange: (selection: ServiceOrderLinkSelection | null, option: ServiceOrderLinkOption | null) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
};

export function ServiceOrderLinkCombobox({
  value,
  onChange,
  disabled,
  id: idProp,
  placeholder = 'Buscar OS por número…',
}: ServiceOrderLinkComboboxProps) {
  const reactId = useId();
  const baseId = idProp ?? reactId.replace(/:/g, '');
  const listId = `${baseId}-listbox`;
  const searchId = `${baseId}-search`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: options = [], isLoading, isFetching } = useServiceOrderLinkOptions(query, open || Boolean(value));

  const selected = useMemo(
    () => findServiceOrderLinkOption(options, value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const pick = useCallback(
    (opt: ServiceOrderLinkOption | null) => {
      if (!opt) {
        onChange(null, null);
        setQuery('');
      } else {
        onChange({ serviceOrderId: opt.serviceOrderId }, opt);
        setQuery(opt.label);
      }
      setOpen(false);
    },
    [onChange],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, Math.max(0, options.length - 1)));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    }
    if (e.key === 'Enter' && options[highlighted]) {
      e.preventDefault();
      pick(options[highlighted]);
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <input
        id={searchId}
        className={styles.input}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : selected?.label ?? ''}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(0);
          if (!e.target.value.trim()) onChange(null, null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul id={listId} className={styles.list} role="listbox">
          {isLoading || isFetching ? (
            <li className={styles.empty}>Carregando OS…</li>
          ) : options.length === 0 ? (
            <li className={styles.empty}>Nenhuma OS em andamento ou concluída.</li>
          ) : (
            options.map((opt, idx) => (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === opt.id}
                  className={`${styles.option} ${idx === highlighted ? styles.optionHighlighted : ''}`}
                  onMouseEnter={() => setHighlighted(idx)}
                  onClick={() => pick(opt)}
                >
                  {opt.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
