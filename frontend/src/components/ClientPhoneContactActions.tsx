import { useEffect, useId, useRef, useState } from "react";
import { formatPhoneBr, telUrl, whatsappUrl } from "../lib/clientContactDisplay";
import styles from "./ClientPhoneContactActions.module.css";

export type ClientPhoneContactActionsProps = {
  label: string;
  phone: string;
};

export function ClientPhoneContactActions({ label, phone }: ClientPhoneContactActionsProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const formatted = formatPhoneBr(phone);
  const callHref = telUrl(phone);
  const chatHref = whatsappUrl(phone);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!formatted || (!callHref && !chatHref)) return null;

  return (
    <p className={styles.row}>
      <span className={styles.label}>{label}: </span>
      <span className={styles.wrap} ref={wrapRef}>
        <button
          type="button"
          className={styles.trigger}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          {formatted}
        </button>
        {open ? (
          <span id={menuId} className={styles.menu} role="menu">
            {callHref ? (
              <a className={styles.action} href={callHref} role="menuitem" onClick={() => setOpen(false)}>
                Ligar
              </a>
            ) : null}
            {chatHref ? (
              <a
                className={styles.action}
                href={chatHref}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Conversar
              </a>
            ) : null}
          </span>
        ) : null}
      </span>
    </p>
  );
}
