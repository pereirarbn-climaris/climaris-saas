import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { FinanceBankAccountOut, FinanceBankCatalogRow, FinanceGatewaysOut } from "../../api/finance";
import { FinanceAccountBankMark } from "./FinanceAccountBankMark";
import styles from "./FinanceAccountCombobox.module.css";

export type FinanceAccountComboboxProps = {
  accounts: readonly FinanceBankAccountOut[];
  value: string;
  onChange: (nextId: string) => void;
  gateways: FinanceGatewaysOut | null;
  catalog?: readonly FinanceBankCatalogRow[] | null;
  /** Se omitido, gera `useId()`. */
  id?: string;
  disabled?: boolean;
  emptyOption?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  className?: string;
  /** Classes extras no botão (ex.: `loginStyles.select` na OS). */
  triggerClassName?: string;
};

function sortAccounts(accs: readonly FinanceBankAccountOut[]): FinanceBankAccountOut[] {
  return [...accs].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function FinanceAccountCombobox({
  accounts,
  value,
  onChange,
  gateways,
  catalog,
  id: idProp,
  disabled,
  emptyOption,
  emptyLabel = "Selecionar",
  placeholder = "Selecionar",
  className,
  triggerClassName,
}: FinanceAccountComboboxProps) {
  const reactId = useId();
  const baseId = idProp ?? reactId.replace(/:/g, "");
  const listId = `${baseId}-listbox`;
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => sortAccounts(accounts), [accounts]);

  type Opt = { key: string; account: FinanceBankAccountOut | null; label: string };
  const options: Opt[] = useMemo(() => {
    const out: Opt[] = [];
    if (emptyOption) out.push({ key: "__empty", account: null, label: emptyLabel });
    for (const a of sorted) out.push({ key: String(a.id), account: a, label: a.name });
    return out;
  }, [sorted, emptyOption, emptyLabel]);

  const selectedIndex = useMemo(() => {
    const idx = options.findIndex((o) => (o.account ? String(o.account.id) : "") === value);
    return idx >= 0 ? idx : 0;
  }, [options, value]);

  const selected = useMemo(() => sorted.find((a) => String(a.id) === value), [sorted, value]);

  const close = useCallback(() => setOpen(false), []);

  const pick = useCallback(
    (idx: number) => {
      const o = options[idx];
      if (!o) return;
      onChange(o.account ? String(o.account.id) : "");
      close();
    },
    [options, onChange, close],
  );

  useEffect(() => {
    if (!open) return;
    setHighlighted(selectedIndex);
  }, [open, selectedIndex]);

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

  const onKeyDownTrigger = (ev: KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp" || ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setHighlighted((h) => Math.min(options.length - 1, h + 1));
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
      return;
    }
    if (ev.key === " ") {
      ev.preventDefault();
      pick(highlighted);
    }
  };

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-combo-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-finance-acct-combo-root
    >
      <button
        type="button"
        id={baseId}
        className={[styles.trigger, triggerClassName].filter(Boolean).join(" ")}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDownTrigger}
      >
        <span className={styles.triggerMain}>
          {selected ? (
            <>
              <FinanceAccountBankMark account={selected} gateways={gateways} catalog={catalog} variant="inline" />
              <span className={styles.triggerLabel}>{selected.name}</span>
            </>
          ) : (
            <span className={styles.triggerLabel} style={{ color: "var(--color-text-muted)" }}>
              {emptyOption ? emptyLabel : placeholder}
            </span>
          )}
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
        <ul id={listId} role="listbox" className={styles.list} aria-label="Contas">
          {options.map((o, idx) => (
            <li key={o.key} role="presentation">
              <button
                type="button"
                role="option"
                data-combo-idx={idx}
                aria-selected={o.account ? String(o.account.id) === value : value === ""}
                className={`${styles.option} ${idx === highlighted ? styles.optionActive : ""}`}
                onMouseEnter={() => setHighlighted(idx)}
                onClick={() => pick(idx)}
              >
                {o.account ? (
                  <FinanceAccountBankMark account={o.account} gateways={gateways} catalog={catalog} variant="inline" />
                ) : (
                  <span style={{ width: 22 }} aria-hidden />
                )}
                <span className={styles.optionName}>{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
