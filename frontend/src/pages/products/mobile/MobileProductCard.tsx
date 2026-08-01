import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { ProductOut } from "../../../api/products";
import { stockQuantitiesFromProduct } from "../../../lib/productStock";
import styles from "./MobileProductCard.module.css";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function marginOf(product: ProductOut): number {
  const purchase = Number(product.purchase_price || 0);
  const sale = Number(product.sale_price || product.unit_price || 0);
  if (sale <= 0) return 0;
  return ((sale - purchase) / sale) * 100;
}

type Props = {
  product: ProductOut;
  canEdit: boolean;
  dupBusy: number | null;
  onDuplicate: (product: ProductOut, event: MouseEvent<HTMLButtonElement>) => void;
  onDelete?: (product: ProductOut) => void;
  onOpenDetails: (id: number) => void;
  onMoveStock: () => void;
  productIcon: ReactNode;
};

export function MobileProductCard({
  product,
  canEdit,
  dupBusy,
  onDuplicate,
  onDelete,
  onOpenDetails,
  onMoveStock,
  productIcon,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const view = useMemo(() => {
    const stock = stockQuantitiesFromProduct(product);
    const available = Number(stock.available ?? product.quantity_available ?? product.stock_quantity ?? 0);
    const margin = marginOf(product);
    const category = product.compatible_equipment_tags?.split(",")[0]?.trim() || "Outros";
    const lowStock = available <= 10;
    const status = !product.is_active ? "Inativo" : lowStock ? "Baixo estoque" : "Ativo";
    return {
      category,
      margin,
      status,
      purchase: Number(product.purchase_price || 0),
      sale: Number(product.sale_price || product.unit_price || 0),
    };
  }, [product]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <article className={styles.card}>
      <div className={styles.topGrid}>
        <div className={styles.imageWrap} aria-hidden>
          {product.primary_image_url?.trim() && !imageFailed ? (
            <img
              src={product.primary_image_url}
              alt=""
              className={styles.image}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className={styles.fallbackIcon}>{productIcon}</span>
          )}
        </div>

        <div className={styles.info}>
          <h3>{product.name}</h3>
          <p>SKU: {product.sku}</p>
          <p>Código: {String(78900000000000 + product.id)}</p>
          <span>{view.category}</span>
        </div>

        <span
          className={`${styles.statusBadge} ${
            view.status === "Ativo"
              ? styles.statusActive
              : view.status === "Baixo estoque"
                ? styles.statusWarning
                : styles.statusInactive
          }`}
        >
          {view.status}
        </span>
      </div>

      <div className={styles.valuesGrid}>
        <div>
          <p>Custo</p>
          <strong>{formatCurrency(view.purchase)}</strong>
        </div>
        <div>
          <p>Venda</p>
          <strong>{formatCurrency(view.sale)}</strong>
        </div>
        <div>
          <p>Margem</p>
          <strong className={styles.margin}>{view.margin.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</strong>
        </div>
      </div>

      <div className={styles.actions} ref={menuOpen ? menuRef : undefined}>
        {canEdit ? (
          <>
            <button type="button" className={styles.iconButton} onClick={() => setMenuOpen((prev) => !prev)} aria-label="Ações">
              <span />
              <span />
              <span />
            </button>
            {menuOpen ? (
              <div className={styles.menu} role="menu">
                <button type="button" role="menuitem" onClick={() => onOpenDetails(product.id)}>
                  Editar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={dupBusy === product.id}
                  onClick={(event) => onDuplicate(product, event)}
                >
                  Duplicar
                </button>
                <button type="button" role="menuitem" onClick={onMoveStock}>
                  Movimentar estoque
                </button>
                <button type="button" role="menuitem" className={styles.menuDelete} onClick={() => onDelete?.(product)}>
                  Excluir
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        <button type="button" className={styles.iconButton} aria-label={`Abrir ${product.name}`} onClick={() => onOpenDetails(product.id)}>
          <svg viewBox="0 0 20 20" fill="none">
            <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </article>
  );
}
