import { formatProductQty } from "../../lib/productStock";
import styles from "./ProductStockBadge.module.css";

type Variant = "physical" | "reserved" | "available";

type Props = {
  variant: Variant;
  value: number;
  title?: string;
};

const LABELS: Record<Variant, string> = {
  physical: "Físico",
  reserved: "Res.",
  available: "Disp.",
};

export function ProductStockBadge({ variant, value, title }: Props) {
  const className =
    variant === "physical"
      ? styles.physical
      : variant === "reserved"
        ? styles.reserved
        : styles.available;

  return (
    <span className={`${styles.badge} ${className}`} title={title}>
      <span className={styles.badgeLabel}>{LABELS[variant]}</span>
      <span className={styles.badgeValue}>{formatProductQty(value)}</span>
    </span>
  );
}
