import { useOutletContext } from "react-router-dom";
import type { TenantOut } from "../api/auth";
import type { DashboardOutletContext } from "../pages/dashboardContext";

/** Flags conhecidas no backend (`app/feature_flags.py`). */
export const FEATURE_FLAGS = {
  new_laudo: {
    key: "new_laudo",
    label: "Laudo técnico (novo)",
    description: "Editor e PDF do laudo técnico nas ordens de serviço.",
  },
  dre_dashboard: {
    key: "dre_dashboard",
    label: "DRE mensal",
    description: "Relatório DRE no módulo financeiro.",
  },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function getFeaturesEnabled(
  tenant?: Pick<TenantOut, "features_enabled"> | null,
): Record<string, boolean> {
  return tenant?.features_enabled ?? {};
}

export function isFeatureEnabled(
  tenant: Pick<TenantOut, "features_enabled"> | null | undefined,
  flagName: FeatureFlagKey | string,
): boolean {
  const key = String(flagName).trim();
  if (!key) return false;
  return getFeaturesEnabled(tenant)[key] === true;
}

/** Lê `features_enabled` do tenant logado (contexto do dashboard). */
export function useFeature(flagName: FeatureFlagKey | string): boolean {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  return isFeatureEnabled(ctx?.tenant, flagName);
}
