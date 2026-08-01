import { Plus, Trash2 } from "lucide-react";
import type { ProductOut } from "../../../api/products";
import { formatBrlDisplay, parseBrlInputToNumber } from "../../../lib/currencyBrInput";
import clientStyles from "../../../pages/clients/ClientDetail.module.css";
import type { ServiceProductInputRow } from "./serviceForm.types";
import styles from "./service-form.module.css";

type Props = {
  rows: ServiceProductInputRow[];
  products: ProductOut[];
  servicePrice: string;
  error?: string;
  disabled?: boolean;
  onChange: (rows: ServiceProductInputRow[]) => void;
};

export function ServiceProductInputsCard({
  rows,
  products,
  servicePrice,
  error,
  disabled,
  onChange,
}: Props) {
  const productsSorted = [...products].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );

  const parsedPrice = parseBrlInputToNumber(servicePrice);
  const estimatedMaterialCost = rows.reduce((acc, input) => {
    const pid = Number(input.product_id);
    const qty = Number(input.quantity);
    if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(qty) || qty <= 0) return acc;
    const product = products.find((p) => p.id === pid);
    if (!product) return acc;
    return acc + Number(product.purchase_price || 0) * qty;
  }, 0);
  const estimatedProfit = parsedPrice - estimatedMaterialCost;
  const canEdit = !disabled;

  function updateRow(index: number, patch: Partial<ServiceProductInputRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <>
      <h3 className={clientStyles.cardTitle}>Produtos utilizados</h3>
      <p className={clientStyles.cardHint}>
        Opcional. Vincule os materiais consumidos neste serviço para estimar custo e lucro.
      </p>

      <div
        id="sf-products-section"
        className={`${styles.productInputsCard} ${error ? styles.productInputsCardError : ""}`}
      >
        <div className={styles.productInputsToolbar}>
          <span className={styles.productInputsToolbarLabel}>Materiais do serviço</span>
          {canEdit ? (
            <button
              type="button"
              className={styles.iconAddBtn}
              title="Adicionar produto"
              aria-label="Adicionar produto"
              disabled={disabled}
              onClick={() => onChange([...rows, { product_id: "", quantity: "1" }])}
            >
              <Plus aria-hidden />
            </button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <p className={styles.productInputsEmpty}>
            Nenhum produto vinculado. Use o botão + para incluir.
          </p>
        ) : (
          <>
            <div
              className={`${styles.productInputsHead} ${canEdit ? styles.productInputsHeadWithActions : styles.productInputsHeadNoActions}`}
            >
              <span>Produto</span>
              <span className={styles.productInputsHeadQty}>Quantidade</span>
              {canEdit ? <span className={styles.productInputsHeadAct} aria-hidden /> : null}
            </div>
            <ul className={styles.productInputsList}>
              {rows.map((row, idx) => (
                <li
                  key={`${idx}-${row.product_id}`}
                  className={`${styles.productInputsRow} ${canEdit ? styles.productInputsRowWithActions : styles.productInputsRowNoActions}`}
                >
                  <select
                    className={`${clientStyles.fieldSelect} ${error && !row.product_id ? clientStyles.fieldSelectError : ""}`}
                    value={row.product_id}
                    onChange={(e) => updateRow(idx, { product_id: e.target.value })}
                    disabled={disabled}
                  >
                    <option value="">Selecione</option>
                    {productsSorted.map((product) => (
                      <option key={product.id} value={String(product.id)}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${clientStyles.fieldInput} ${styles.qtyInputCompact} ${error && (!row.quantity || Number(row.quantity) <= 0) ? clientStyles.fieldInputError : ""}`}
                    value={row.quantity}
                    onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                    inputMode="decimal"
                    placeholder="1"
                    disabled={disabled}
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      className={styles.iconTrashBtn}
                      title="Remover produto"
                      aria-label="Remover produto da lista"
                      disabled={disabled}
                      onClick={() => removeRow(idx)}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

        {error ? <p className={clientStyles.fieldError}>{error}</p> : null}

      <div className={styles.profitSummary}>
        <div>
          <span>Custo estimado de materiais</span>
          <strong>{formatBrlDisplay(estimatedMaterialCost)}</strong>
        </div>
        <div>
          <span>Lucro estimado</span>
          <strong>{formatBrlDisplay(Number.isFinite(estimatedProfit) ? estimatedProfit : 0)}</strong>
        </div>
      </div>
    </>
  );
}
