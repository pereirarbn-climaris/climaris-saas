import * as React from "react";

export type ButtonVariant = "default" | "outline" | "destructive" | "ghost";
export type ButtonSize = "default" | "sm" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyle: Record<ButtonVariant, React.CSSProperties> = {
  default: {
    backgroundColor: "var(--color-primary, #2563eb)",
    color: "#fff",
    border: "none",
  },
  outline: {
    backgroundColor: "var(--color-surface, #fff)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border, #e5e7eb)",
  },
  destructive: {
    backgroundColor: "transparent",
    color: "var(--color-danger, #dc2626)",
    border: "1px solid var(--color-danger, #dc2626)",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--color-text-muted)",
    border: "none",
  },
};

const sizeStyle: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    height: "2rem",
    padding: "0 0.75rem",
    fontSize: "0.8125rem",
  },
  default: {
    height: "2.25rem",
    padding: "0 1rem",
    fontSize: "0.875rem",
  },
  lg: {
    height: "2.75rem",
    padding: "0 1.25rem",
    fontSize: "1rem",
  },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", style, disabled, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.375rem",
        borderRadius: "var(--btn-radius, 6px)",
        fontWeight: 500,
        lineHeight: 1.2,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        transition: "opacity 0.15s ease, background-color 0.15s ease",
        ...sizeStyle[size],
        ...variantStyle[variant],
        ...style,
      }}
      {...props}
    />
  ),
);
Button.displayName = "Button";
