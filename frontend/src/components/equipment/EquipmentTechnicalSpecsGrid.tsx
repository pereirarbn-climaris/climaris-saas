import type { TechnicalSpecRow } from "../../lib/categoryFieldDefinitions";
import styles from "./EquipmentTechnicalSpecsGrid.module.css";

type Props = {
  specs: TechnicalSpecRow[];
  emptyMessage?: string;
  compact?: boolean;
};

export function EquipmentTechnicalSpecsGrid({
  specs,
  emptyMessage = "Nenhum dado técnico cadastrado.",
  compact = false,
}: Props) {
  if (!specs.length) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <dl className={compact ? styles.gridCompact : styles.grid}>
      {specs.map((row) => (
        <div key={row.key} className={styles.item}>
          <dt className={styles.label}>{row.label}</dt>
          <dd className={styles.value}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
