import { Check } from "lucide-react";
import styles from "./CategoryColorPicker.module.css";

/** Cores curadas para categorias financeiras — legíveis em gráficos e filtros. */
export const FINANCE_CATEGORY_PALETTE = [
  { value: "#64748b", label: "Cinza" },
  { value: "#ef4444", label: "Vermelho" },
  { value: "#f97316", label: "Laranja" },
  { value: "#eab308", label: "Amarelo" },
  { value: "#22c55e", label: "Verde" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#6366f1", label: "Índigo" },
  { value: "#8b5cf6", label: "Violeta" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#78716c", label: "Marrom" },
  { value: "#0ea5e9", label: "Ciano" },
] as const;

function normalizeHex(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function isLightSwatch(hex: string): boolean {
  const n = hex.replace("#", "");
  if (n.length !== 6) return false;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 170;
}

type Props = {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
  compact?: boolean;
};

export function CategoryColorPicker({ value, onChange, disabled, id, label = "Cor", compact }: Props) {
  const normalized = normalizeHex(value);
  const groupId = id ?? "category-color-picker";

  return (
    <div className={`${styles.categoryColorPicker} ${compact ? styles.compact : ""}`} role="group" aria-labelledby={`${groupId}-label`}>
      <p className={styles.label} id={`${groupId}-label`}>
        {label}
      </p>
      <div className={styles.swatchGrid}>
        <button
          type="button"
          className={`${styles.swatch} ${styles.swatchNone} ${!normalized ? styles.swatchSelected : ""}`}
          disabled={disabled}
          aria-label="Sem cor"
          aria-pressed={!normalized}
          title="Sem cor"
          onClick={() => onChange("")}
        >
          {!normalized ? (
            <span className={`${styles.swatchCheck} ${styles.swatchCheckDark}`} aria-hidden>
              <Check />
            </span>
          ) : null}
        </button>
        {FINANCE_CATEGORY_PALETTE.map((swatch) => {
          const selected = normalized === swatch.value.toLowerCase();
          const light = isLightSwatch(swatch.value);
          return (
            <button
              key={swatch.value}
              type="button"
              className={`${styles.swatch} ${selected ? styles.swatchSelected : ""}`}
              style={{ backgroundColor: swatch.value }}
              disabled={disabled}
              aria-label={swatch.label}
              aria-pressed={selected}
              title={swatch.label}
              onClick={() => onChange(swatch.value)}
            >
              {selected ? (
                <span className={`${styles.swatchCheck} ${light ? styles.swatchCheckDark : ""}`} aria-hidden>
                  <Check />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function resolveCategoryColor(value: string | null | undefined): string {
  const normalized = normalizeHex(value ?? "");
  if (!normalized) return "";
  const known = FINANCE_CATEGORY_PALETTE.find((s) => s.value.toLowerCase() === normalized);
  return known ? known.value : normalized;
}
