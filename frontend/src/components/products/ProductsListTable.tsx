import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ProductOut } from "../../api/products";
import { stockQuantitiesFromProduct } from "../../lib/productStock";
import tableStyles from "../../pages/listTableCommon.module.css";
import { ProductStockCells } from "./ProductStockCells";
import { ProductStockTableHeader } from "./ProductStockTableHeader";
import styles from "./ProductsListTable.module.css";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function marginOf(p: ProductOut): number {
  return Number((p.sale_price || p.unit_price || 0) - (p.purchase_price || 0));
}

type Props = {
  rows: ProductOut[];
  canEdit: boolean;
  dupBusy: number | null;
  onDuplicate: (p: ProductOut, e: MouseEvent<HTMLButtonElement>) => void;
  productIcon: ReactNode;
  duplicateIcon: ReactNode;
};

/** Única tabela de listagem de produtos do catálogo (/app/products). */
export function ProductsListTable({
  rows,
  canEdit,
  dupBusy,
  onDuplicate,
  productIcon,
  duplicateIcon,
}: Props) {
  const navigate = useNavigate();

  return (
    <div className={styles.tableContainer}>
      <div className={tableStyles.tableWrap}>
        <table className={`${tableStyles.table} ${styles.table}`} data-testid="products-list-table">
          <thead>
            <ProductStockTableHeader
              before={[
                { key: "product", label: "Produto" },
                { key: "purchase", label: "Compra" },
                { key: "sale", label: "Venda" },
                { key: "margin", label: "Margem" },
              ]}
              after={[
                { key: "status", label: "Status" },
                {
                  key: "actions",
                  label: "",
                  className: tableStyles.tailActionsCol,
                  ariaHidden: true,
                },
              ]}
            />
          </thead>
          <tbody>
            {rows.map((p) => {
              const margin = marginOf(p);
              const stock = stockQuantitiesFromProduct(p);

              return (
                <tr
                  key={p.id}
                  className={tableStyles.rowClickable}
                  onClick={() => navigate(`/app/products/${p.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/app/products/${p.id}`);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                  aria-label={`Abrir produto ${p.name}`}
                >
                  <td>
                    <div className={styles.productCell}>
                      <div className={styles.productIcon}>{productIcon}</div>
                      <div className={styles.productInfo}>
                        <span className={styles.productName}>{p.name}</span>
                        <span className={styles.productSku}>{p.sku}</span>
                      </div>
                    </div>
                  </td>
                  <td className={styles.priceCell}>{formatCurrency(Number(p.purchase_price || 0))}</td>
                  <td className={styles.priceCell}>
                    {formatCurrency(Number(p.sale_price || p.unit_price || 0))}
                  </td>
                  <td
                    className={`${styles.marginCell} ${margin >= 0 ? styles.marginPositive : styles.marginNegative}`}
                  >
                    {formatCurrency(margin)}
                  </td>
                  <ProductStockCells {...stock} />
                  <td>
                    <span className={p.is_active ? styles.statusActive : styles.statusInactive}>
                      {p.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className={`${tableStyles.tailActionsCol} ${tableStyles.rowHint}`}>
                    <div className={tableStyles.rowActions}>
                      {canEdit ? (
                        <button
                          type="button"
                          className={styles.iconCellBtn}
                          title="Duplicar produto"
                          aria-label="Duplicar produto"
                          disabled={dupBusy === p.id}
                          onClick={(e) => onDuplicate(p, e)}
                        >
                          {duplicateIcon}
                        </button>
                      ) : null}
                      <span className={tableStyles.rowHintIcon} aria-hidden>
                        <svg viewBox="0 0 20 20" fill="none" focusable="false">
                          <path
                            d="M7 4L13 10L7 16"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
