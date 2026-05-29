import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import type { FinanceEntitlements, FinanceFeatureKey } from "../../schemas/financeCore";
import { canUseFinanceFeature, financeFeatureBlockedMessage } from "../../lib/financeEntitlements";

type Props = {
  entitlements: FinanceEntitlements | null | undefined;
  feature: FinanceFeatureKey;
  children: ReactNode;
  /** Conteúdo quando bloqueado; padrão: aviso com motivo. */
  fallback?: ReactNode;
  hideWhenBlocked?: boolean;
};

export function FinanceFeatureGate({
  entitlements,
  feature,
  children,
  fallback,
  hideWhenBlocked = false,
}: Props) {
  if (canUseFinanceFeature(entitlements, feature)) {
    return <>{children}</>;
  }
  if (hideWhenBlocked) return null;
  if (fallback) return <>{fallback}</>;
  const message = financeFeatureBlockedMessage(entitlements, feature);
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      role="status"
    >
      <Lock size={16} className="shrink-0 mt-0.5" aria-hidden />
      <p className="m-0">{message}</p>
    </div>
  );
}
