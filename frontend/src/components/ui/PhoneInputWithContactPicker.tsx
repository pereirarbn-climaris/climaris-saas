import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { isContactPickerAvailable, pickContactPhone } from "../../lib/contactPicker";
import styles from "./PhoneInputWithContactPicker.module.css";

function AgendaIcon() {
  return (
    <svg className={styles.agendaBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 2v4M8 2v4" strokeLinecap="round" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeLinecap="round" />
    </svg>
  );
}

export type PhoneInputWithContactPickerProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  inputStyle?: CSSProperties;
  /** Exibe botão da agenda quando o navegador suporta Contact Picker. */
  showContactPicker?: boolean;
  id?: string;
};

export function PhoneInputWithContactPicker({
  value,
  onChange,
  onBlur,
  disabled = false,
  placeholder,
  inputStyle,
  showContactPicker = true,
  id,
}: PhoneInputWithContactPickerProps) {
  const [pickerAvailable, setPickerAvailable] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setPickerAvailable(isContactPickerAvailable());
  }, []);

  const onPickFromAgenda = useCallback(async () => {
    if (disabled || picking) return;
    setPicking(true);
    try {
      const result = await pickContactPhone();
      if (result.ok) {
        onChange(result.phone);
      }
    } finally {
      setPicking(false);
    }
  }, [disabled, onChange, picking]);

  const showAgenda = showContactPicker && pickerAvailable;

  return (
    <div className={styles.wrap}>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        className={styles.input}
        style={inputStyle}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
      />
      {showAgenda ? (
        <button
          type="button"
          className={styles.agendaBtn}
          onClick={() => void onPickFromAgenda()}
          disabled={disabled || picking}
          title="Buscar número na agenda do celular"
          aria-label="Buscar número na agenda"
        >
          <AgendaIcon />
          <span className={styles.agendaBtnLabel}>{picking ? "…" : "Agenda"}</span>
        </button>
      ) : null}
    </div>
  );
}
