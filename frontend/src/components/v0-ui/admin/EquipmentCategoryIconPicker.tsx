import type { CSSProperties } from "react";
import {
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_LABELS,
  getCategoryVisual,
  type CategoryIconKey,
} from "../../../lib/equipmentCategoryIcons";
import styles from "./EquipmentCategoryIconPicker.module.css";

type Props = {
  value: CategoryIconKey;
  onChange: (key: CategoryIconKey) => void;
  disabled?: boolean;
};

export function EquipmentCategoryIconPicker({ value, onChange, disabled }: Props) {
  return (
    <div className={styles.grid} role="radiogroup" aria-label="Icone da categoria">
      {CATEGORY_ICON_KEYS.map((key) => {
        const visual = getCategoryVisual(key);
        const Icon = visual.Icon;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            className={`${styles.option} ${selected ? styles.optionSelected : ""}`}
            style={
              selected
                ? ({
                    borderColor: visual.accentColor,
                    backgroundColor: `${visual.accentColor}12`,
                  } as CSSProperties)
                : undefined
            }
            onClick={() => onChange(key)}
            aria-pressed={selected}
            title={CATEGORY_ICON_LABELS[key]}
          >
            <span className={styles.iconWrap} style={{ color: visual.accentColor }}>
              <Icon size={22} />
            </span>
            <span className={styles.label}>{CATEGORY_ICON_LABELS[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
