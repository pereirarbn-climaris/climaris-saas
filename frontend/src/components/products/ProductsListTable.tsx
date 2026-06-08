import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
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

function salePriceOf(p: ProductOut): number {
  return Number(p.sale_price || p.unit_price || 0);
}

type Props = {
  rows: ProductOut[];
  canEdit: boolean;
  canOpenDetail?: boolean;
  dupBusy: number | null;
  onDuplicate: (p: ProductOut, e: MouseEvent<HTMLButtonElement>) => void;
  productIcon: ReactNode;
  duplicateIcon: ReactNode;
  showStock?: boolean;
};

/** Única tabela de listagem de produtos do catálogo (/app/products). */
export function ProductsListTable({
  rows,
  canEdit,
  canOpenDetail = true,
  dupBusy,
  onDuplicate,
  productIcon,
  duplicateIcon,
  showStock = true,
}: Props) {
  const navigate = useNavigate();

  function openProduct(id: number) {
    if (!canOpenDetail) return;
    navigate(`/app/products/${id}`);
  }

  function rowInteractionProps(p: ProductOut) {
    if (!canOpenDetail) return {};
    return {
      className: tableStyles.rowClickable,
      onClick: () => openProduct(p.id),
      onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openProduct(p.id);
        }
      },
      role: "link" as const,
      tabIndex: 0,
      "aria-label": `Abrir produto ${p.name}`,
    };
  }

  return (
    <div className={styles.tableContainer}>
      <div className={styles.mobileTableWrap}>
        <div className={tableStyles.tableWrap}>
          <table
            className={`${tableStyles.table} ${styles.productsTableDense}`}
            data-testid="products-list-table-mobile"
            aria-label="Lista de produtos"
          >
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col" className={styles.colMobilePrice}>
                  Venda
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} {...rowInteractionProps(p)}>
                  <td>
                    <div className={styles.productCellMobile}>
                      <div className={styles.productIconMobile} aria-hidden>
                        {productIcon}
                      </div>
                      <span className={styles.mobileName}>{p.name}</span>
                    </div>
                  </td>
                  <td className={styles.colMobilePrice}>
                    <span className={styles.mobilePrice}>{formatCurrency(salePriceOf(p))}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.desktopTableWrap}>
        <div className={tableStyles.tableWrap}>
          <table className={`${tableStyles.table} ${styles.table}`} data-testid="products-list-table">
            <thead>
              {showStock ? (
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
              ) : (
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">Compra</th>
                  <th scope="col">Venda</th>
                  <th scope="col">Margem</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={tableStyles.tailActionsCol} aria-hidden="true" />
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((p) => {
                const margin = marginOf(p);
                const stock = stockQuantitiesFromProduct(p);
                return (
                  <tr key={p.id} {...rowInteractionProps(p)}>
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
                    <td className={styles.priceCell}>{formatCurrency(salePriceOf(p))}</td>
                    <td
                      className={`${styles.marginCell} ${margin >= 0 ? styles.marginPositive : styles.marginNegative}`}
                    >
                      {formatCurrency(margin)}
                    </td>
                    {showStock ? <ProductStockCells {...stock} /> : null}
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
                        {canOpenDetail ? (
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
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
