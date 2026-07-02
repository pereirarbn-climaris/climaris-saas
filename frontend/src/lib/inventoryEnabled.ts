import type { TenantOut } from "../api/auth";
import { isInventoryActive } from "./planProducts";

/** Controle de estoque ativo no workspace (plano + preferência do tenant). */
export function isInventoryEnabled(tenant?: Pick<TenantOut, "inventory_enabled" | "products_inventory_allowed"> | null): boolean {
  return isInventoryActive(tenant);
}
