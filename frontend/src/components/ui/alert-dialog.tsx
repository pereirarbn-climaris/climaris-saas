import { useEffect, useId, type ReactNode } from "react";
import styles from "./alert-dialog.module.css";

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      {children}
    </div>
  );
}

export interface AlertDialogContentProps {
  children: ReactNode;
  wide?: boolean;
  labelledBy?: string;
  describedBy?: string;
}

export function AlertDialogContent({
  children,
  wide = false,
  labelledBy,
  describedBy,
}: AlertDialogContentProps) {
  return (
    <div
      className={`${styles.content} ${wide ? styles.contentWide : ""}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function AlertDialogHeader({ children }: { children: ReactNode }) {
  return <div className={styles.header}>{children}</div>;
}

export function AlertDialogTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className={styles.title}>
      {children}
    </h2>
  );
}

export function AlertDialogDescription({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className={styles.description}>
      {children}
    </p>
  );
}

export function AlertDialogBody({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

export function AlertDialogFooter({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}

export function AlertDialogCancel({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={styles.btnOutline} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function AlertDialogAction({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "warning" | "destructive";
}) {
  const className =
    variant === "destructive"
      ? styles.btnDestructive
      : variant === "warning"
        ? styles.btnWarning
        : variant === "primary"
          ? styles.btnPrimary
          : styles.btnOutline;
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function AlertDialogTextarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        id={fieldId}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={4}
      />
    </div>
  );
}
