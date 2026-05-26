import type { StockQuantities } from "../../lib/productStock";
import { ProductStockBadge } from "./ProductStockBadge";
import styles from "./ProductStockTable.module.css";

type Props = StockQuantities;

/** Três colunas de estoque (badges) — único padrão visual no catálogo e no inventário. */
export function ProductStockCells({ physical, reserved, available }: Props) {
  return (
    <>
      <td className={styles.stockCell}>
        <ProductStockBadge variant="physical" value={physical} title="Estoque físico" />
      </td>
      <td className={styles.stockCell}>
        <ProductStockBadge variant="reserved" value={reserved} title="Reservado em OS abertas" />
      </td>
      <td className={styles.stockCell}>
        <ProductStockBadge variant="available" value={available} title="Disponível para uso" />
      </td>
    </>
  );
}
