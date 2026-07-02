import type { ReactNode } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { isPurchasesEnabled } from "../../lib/planProducts";
import type { DashboardOutletContext } from "../../pages/dashboardContext";

/** Bloqueia rota quando o plano não inclui compras de produtos. */
export function RequirePurchasesPlan({ children }: { children: ReactNode }) {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  if (ctx?.tenant && !isPurchasesEnabled(ctx.tenant)) {
    return <Navigate to="/app" replace />;
  }
  return children;
}
