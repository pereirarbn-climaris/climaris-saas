type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id: string;
  ariaLabel?: string;
};

export function FormSwitch({ checked, onChange, disabled, id, ariaLabel }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        display: "inline-flex",
        height: 24,
        width: 44,
        flexShrink: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 9999,
        border: "2px solid transparent",
        backgroundColor: checked ? "var(--color-primary, #2563eb)" : "#e2e8f0",
        opacity: disabled ? 0.55 : 1,
        transition: "background-color 0.2s ease",
      }}
    >
      <span
        style={{
          pointerEvents: "none",
          display: "inline-block",
          height: 20,
          width: 20,
          borderRadius: "50%",
          backgroundColor: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transform: checked ? "translateX(20px)" : "translateX(0)",
          transition: "transform 0.2s ease",
        }}
      />
    </button>
  );
}
