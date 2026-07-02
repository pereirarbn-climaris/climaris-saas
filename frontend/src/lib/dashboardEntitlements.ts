/**
 * Nível do dashboard gerencial (espelha `app/dashboard_entitlements.py`).
 */

import { isDeveloperPlan, normalizePlanKey } from "./planRules";
import type { TenantOut } from "../api/auth";

export type DashboardTier = "basic" | "advanced" | "complete";

const TIER_RANK: Record<DashboardTier, number> = {
  basic: 0,
  advanced: 1,
  complete: 2,
};

const FINANCE_MODE_TO_TIER: Record<string, DashboardTier> = {
  basic: "basic",
  intermediate: "advanced",
  management: "complete",
};

const PLAN_TO_TIER: Record<string, DashboardTier> = {
  free_30d: "basic",
  basic: "basic",
  professional: "advanced",
  enterprise: "complete",
  beta_internal: "complete",
};

const TIER_LABELS: Record<DashboardTier, string> = {
  basic: "Básico",
  advanced: "Avançado",
  complete: "Completo",
};

const TIER_DESCRIPTIONS: Record<DashboardTier, string> = {
  basic: "Indicadores essenciais da operação: OS, clientes e faturamento.",
  advanced: "Visão ampliada com agenda, orçamentos, metas e distribuição de OS.",
  complete: "Painel executivo com financeiro, PMOC, conversão e resumo gerencial.",
};

export function dashboardTierRank(tier: DashboardTier): number {
  return TIER_RANK[tier] ?? 0;
}

export function resolveDashboardTier(tenant: TenantOut | null | undefined): DashboardTier {
  if (!tenant) return "basic";
  if (isDeveloperPlan(tenant.active_plan)) return "complete";

  const financeMode = tenant.finance_mode;
  if (financeMode && FINANCE_MODE_TO_TIER[financeMode]) {
    const fromMode = FINANCE_MODE_TO_TIER[financeMode]!;
    const planKey = normalizePlanKey(tenant.active_plan);
    const fromPlan = PLAN_TO_TIER[planKey] ?? "basic";
    return dashboardTierRank(fromPlan) >= dashboardTierRank(fromMode) ? fromPlan : fromMode;
  }

  const planKey = normalizePlanKey(tenant.active_plan);
  return PLAN_TO_TIER[planKey] ?? "basic";
}

export function dashboardTierLabel(tier: DashboardTier): string {
  return TIER_LABELS[tier] ?? "Básico";
}

export function dashboardTierDescription(tier: DashboardTier): string {
  return TIER_DESCRIPTIONS[tier] ?? TIER_DESCRIPTIONS.basic;
}

export function hasDashboardTier(
  current: DashboardTier,
  minimum: DashboardTier,
): boolean {
  return dashboardTierRank(current) >= dashboardTierRank(minimum);
}
