import type { ServiceIconKey } from "./serviceForm.types";
import { SERVICE_ICON_OPTIONS } from "./serviceForm.types";
import { getServiceIconPalette, ServiceIconGlyph } from "../serviceIcons";
import styles from "./service-form.module.css";

type Props = {
  value: ServiceIconKey;
  onChange: (value: ServiceIconKey) => void;
  disabled?: boolean;
};

export function ServiceIconSelector({ value, onChange, disabled }: Props) {
  return (
    <div className={styles.iconInnerCard}>
      <div className={styles.iconSection}>
        <h3 className={styles.iconTitle}>Ícone do Serviço</h3>
        <p className={styles.iconHint}>Escolha um ícone que represente este serviço.</p>
        <div className={styles.iconGrid} role="group" aria-label="Ícone do serviço">
          {SERVICE_ICON_OPTIONS.map((key) => {
            const palette = getServiceIconPalette(key);
            const active = value === key;
            return (
              <button
                key={key}
                type="button"
                className={`${styles.iconBtn} ${active ? styles.iconBtnActive : ""}`}
                style={
                  active
                    ? {
                        background: palette.background,
                        color: palette.color,
                        borderColor: "transparent",
                        boxShadow: palette.shadow,
                      }
                    : undefined
                }
                aria-pressed={active}
                aria-label={`Ícone ${key}`}
                disabled={disabled}
                onClick={() => onChange(key)}
              >
                <ServiceIconGlyph iconKey={key} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
