import { equipmentConfirmSummaryRows } from "../../lib/equipmentConfirmDisplay";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";

type Props = {
  equipment: EquipmentItem;
};

export function EquipmentConfirmSummary({ equipment }: Props) {
  const rows = equipmentConfirmSummaryRows(equipment);
  if (rows.length === 0) return null;

  return (
    <dl
      style={{
        margin: 0,
        padding: "0.75rem 1rem",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--card-radius)",
        display: "grid",
        gap: "0.5rem",
      }}
    >
      {rows.map((row) => (
        <div key={row.label} style={{ display: "grid", gridTemplateColumns: "7rem 1fr", gap: "0.5rem", fontSize: "0.8125rem" }}>
          <dt style={{ margin: 0, color: "var(--color-text-muted)", fontWeight: 500 }}>{row.label}</dt>
          <dd style={{ margin: 0, color: "var(--color-text)" }}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
