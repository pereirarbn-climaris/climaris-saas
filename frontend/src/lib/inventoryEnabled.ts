import type { TenantOut } from "../api/auth";

/** Controle de estoque ativo no workspace (padrão: ligado). */
export function isInventoryEnabled(tenant?: Pick<TenantOut, "inventory_enabled"> | null): boolean {
  return tenant?.inventory_enabled !== false;
}
