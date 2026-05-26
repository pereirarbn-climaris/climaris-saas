import type { ReactNode } from "react";
import styles from "./ProductStockTable.module.css";

export type StockHeaderColumn = {
  key: string;
  label: ReactNode;
  rowSpan?: number;
  className?: string;
  ariaHidden?: boolean;
};

type Props = {
  before?: StockHeaderColumn[];
  after?: StockHeaderColumn[];
};

/** Cabeçalho unificado: grupo Estoque + subcolunas Físico / Reservado / Disponível. */
export function ProductStockTableHeader({ before = [], after = [] }: Props) {
  return (
    <>
      <tr className={styles.headerRowTop}>
        {before.map((col) => (
          <th
            key={col.key}
            rowSpan={col.rowSpan ?? 2}
            className={col.className}
            aria-hidden={col.ariaHidden ? true : undefined}
          >
            {col.label}
          </th>
        ))}
        <th colSpan={3} className={styles.stockGroupHead}>
          Estoque
        </th>
        {after.map((col) => (
          <th
            key={col.key}
            rowSpan={col.rowSpan ?? 2}
            className={col.className}
            aria-hidden={col.ariaHidden ? true : undefined}
          >
            {col.label}
          </th>
        ))}
      </tr>
      <tr className={styles.headerRowSub}>
        <th className={styles.stockSubHead} scope="col">
          Físico
        </th>
        <th className={styles.stockSubHead} scope="col">
          Reservado
        </th>
        <th className={styles.stockSubHead} scope="col">
          Disponível
        </th>
      </tr>
    </>
  );
}
