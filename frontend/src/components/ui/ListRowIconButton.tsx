import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "../../pages/listTableCommon.module.css";

export type ListRowIconButtonVariant = "edit" | "delete" | "neutral";

type ListRowIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ListRowIconButtonVariant;
  children: ReactNode;
};

function resolveVariantClass(variant: ListRowIconButtonVariant): string {
  switch (variant) {
    case "edit":
      return styles.rowActionBtnEdit;
    case "delete":
      return styles.rowActionBtnDelete;
    default:
      return styles.rowActionBtnNeutral;
  }
}

export function ListRowIconButton({
  variant = "neutral",
  className,
  type = "button",
  children,
  ...rest
}: ListRowIconButtonProps) {
  return (
    <button
      type={type}
      className={[styles.rowActionBtn, resolveVariantClass(variant), className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

type ListRowActionsProps = {
  children: ReactNode;
  className?: string;
};

export function ListRowActions({ children, className }: ListRowActionsProps) {
  return <div className={[styles.rowActions, className].filter(Boolean).join(" ")}>{children}</div>;
}
