import type { TenantOut } from "../api/auth";

type TenantPlanProducts = Pick<
  TenantOut,
  "inventory_enabled" | "products_inventory_allowed" | "products_purchases_enabled" | "products_max_images"
>;

/** Plano inclui módulo de estoque (configuração em Operação → Planos SaaS). */
export function isInventoryAllowedByPlan(tenant?: TenantPlanProducts | null): boolean {
  return tenant?.products_inventory_allowed === true;
}

/** Estoque efetivo no app: plano permite e o admin ligou o controle em Produtos. */
export function isInventoryActive(tenant?: TenantPlanProducts | null): boolean {
  if (!isInventoryAllowedByPlan(tenant)) return false;
  return tenant?.inventory_enabled !== false;
}

/** Módulo de compras liberado no plano. */
export function isPurchasesEnabled(tenant?: TenantPlanProducts | null): boolean {
  return tenant?.products_purchases_enabled === true;
}

/** Limite de imagens por produto (`null` = ilimitado). */
export function productsMaxImages(tenant?: TenantPlanProducts | null): number | null {
  const raw = tenant?.products_max_images;
  if (raw == null) return null;
  return raw;
}
