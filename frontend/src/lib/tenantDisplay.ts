import type { TenantOut } from "../api/auth";

type TenantNaming = Pick<TenantOut, "name" | "trade_name">;

/** Nome exibido do workspace: nome fantasia quando cadastrado, senão razão social. */
export function getTenantDisplayName(tenant: TenantNaming | null | undefined): string {
  if (!tenant) return "—";
  const trade = (tenant.trade_name ?? "").trim();
  if (trade) return trade;
  const legal = (tenant.name ?? "").trim();
  return legal || "—";
}
