import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import styles from "./RowActionsMenu.module.css";

type MenuCoords = { top: number; left: number };

type RowActionsMenuContextValue = {
  close: () => void;
};

const RowActionsMenuContext = createContext<RowActionsMenuContextValue | null>(null);

function useRowActionsMenuContext() {
  const ctx = useContext(RowActionsMenuContext);
  if (!ctx) {
    throw new Error("RowActionsMenuItem must be used inside RowActionsMenu");
  }
  return ctx;
}

type RowActionsMenuProps = {
  ariaLabel: string;
  children: ReactNode;
  /** Conteúdo do botão gatilho (padrão: ⋮). */
  trigger?: ReactNode;
  triggerClassName?: string;
  disabled?: boolean;
  /** Prefere abrir acima do botão (útil em tabelas perto do rodapé). */
  preferUp?: boolean;
};

export function RowActionsMenu({
  ariaLabel,
  children,
  trigger = "⋮",
  triggerClassName,
  disabled = false,
  preferUp = false,
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const triggerEl = triggerRef.current;
      const menu = menuRef.current;
      if (!triggerEl || !menu) return;

      const triggerRect = triggerEl.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const gap = 4;
      const margin = 8;

      let top = preferUp
        ? triggerRect.top - menuRect.height - gap
        : triggerRect.bottom + gap;

      if (preferUp) {
        if (top < margin) {
          top = triggerRect.bottom + gap;
        }
      } else if (top + menuRect.height > window.innerHeight - margin) {
        top = triggerRect.top - menuRect.height - gap;
      }

      let left = triggerRect.right - menuRect.width;
      left = Math.max(margin, Math.min(left, window.innerWidth - menuRect.width - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - menuRect.height - margin));

      setCoords({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", close, true);
    };
  }, [close, open, children, preferUp]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={[styles.trigger, triggerClassName].filter(Boolean).join(" ")}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        title={ariaLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open
        ? createPortal(
            <RowActionsMenuContext.Provider value={{ close }}>
              <button type="button" className={styles.backdrop} aria-label="Fechar menu" onClick={close} />
              <div
                ref={menuRef}
                className={styles.dropdown}
                role="menu"
                style={
                  coords
                    ? { top: coords.top, left: coords.left, visibility: "visible" }
                    : { top: 0, left: 0, visibility: "hidden" }
                }
              >
                {children}
              </div>
            </RowActionsMenuContext.Provider>,
            document.body,
          )
        : null}
    </div>
  );
}

type RowActionsMenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  onSelect?: () => void;
  danger?: boolean;
};

export function RowActionsMenuItem({
  onSelect,
  danger = false,
  className,
  onClick,
  children,
  ...rest
}: RowActionsMenuItemProps) {
  const { close } = useRowActionsMenuContext();

  return (
    <button
      type="button"
      role="menuitem"
      className={[styles.item, danger ? styles.itemDanger : "", className].filter(Boolean).join(" ")}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        close();
        onSelect?.();
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

type RowActionsMenuLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function RowActionsMenuLink({ className, onClick, children, ...rest }: RowActionsMenuLinkProps) {
  const { close } = useRowActionsMenuContext();

  return (
    <a
      role="menuitem"
      className={[styles.link, className].filter(Boolean).join(" ")}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) close();
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
