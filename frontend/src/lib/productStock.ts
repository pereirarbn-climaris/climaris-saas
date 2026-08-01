export type StockQuantities = {
  physical: number;
  reserved: number;
  available: number;
};

/** Campos mínimos de estoque usados pelos helpers (evita import circular com api/products). */
export type ProductStockSource = {
  stock_quantity?: number;
  quantity_physical?: number;
  quantity_reserved?: number;
  quantity_available?: number | null;
};

/** Normaliza saldos vindos da API (inclui fallback de stock_quantity legado). */
export function normalizeProductStock<T extends ProductStockSource>(p: T): T {
  const physical = Number(p.quantity_physical ?? p.stock_quantity ?? 0);
  const reserved = Number(p.quantity_reserved ?? 0);
  const available =
    p.quantity_available != null && Number.isFinite(Number(p.quantity_available))
      ? Number(p.quantity_available)
      : Math.max(0, physical - reserved);
  return {
    ...p,
    stock_quantity: physical,
    quantity_physical: physical,
    quantity_reserved: reserved,
    quantity_available: available,
  };
}

export function formatProductQty(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
}

export function productPhysical(p: ProductStockSource): number {
  return Number(p.quantity_physical ?? p.stock_quantity ?? 0);
}

export function productReserved(p: ProductStockSource): number {
  return Number(p.quantity_reserved ?? 0);
}

export function productAvailable(p: ProductStockSource): number {
  if (p.quantity_available != null && Number.isFinite(Number(p.quantity_available))) {
    return Number(p.quantity_available);
  }
  return Math.max(0, productPhysical(p) - productReserved(p));
}

export function stockQuantitiesFromProduct(p: ProductStockSource): StockQuantities {
  return {
    physical: productPhysical(p),
    reserved: productReserved(p),
    available: productAvailable(p),
  };
}
