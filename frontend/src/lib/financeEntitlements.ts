import type { FinanceSettingsOut } from "../api/finance";
import { isDeveloperPlan, normalizePlanKey } from "./planRules";
import {
  FinanceEntitlementsSchema,
  FinanceFeatureKeySchema,
  type FinanceEntitlements,
  type FinanceFeatureKey,
} from "../schemas/financeCore";

export type FinanceEntitlementsInput = {
  settings: FinanceSettingsOut | null;
  planKey?: string | null;
  planLabel?: string | null;
  marketplaceSlugs?: string[];
};

const MODE_RANK = { basic: 0, intermediate: 1, management: 2 } as const;

function hasSlug(slugs: string[], slug: string): boolean {
  return slugs.some((s) => s.trim().toLowerCase() === slug.toLowerCase());
}

/**
 * Resolve permissões financeiras no cliente (espelha `app/finance_entitlements.py`).
 * A API continua sendo a fonte de verdade — use GET /finance/entitlements quando disponível.
 */
export function resolveFinanceEntitlements(input: FinanceEntitlementsInput): FinanceEntitlements {
  const settings = input.settings;
  const planKey = normalizePlanKey(input.planKey ?? "basic");
  const planLabel = input.planLabel ?? planKey;
  const slugs = input.marketplaceSlugs ?? [];

  const effective = settings?.effective_mode ?? "basic";
  let maxMode = settings?.max_available_mode ?? "basic";
  if (hasSlug(slugs, "finance-intermediate") && MODE_RANK[maxMode] < MODE_RANK.intermediate) {
    maxMode = "intermediate";
  }
  if (hasSlug(slugs, "finance-management")) {
    maxMode = "management";
  }

  const isBeta = isDeveloperPlan(planKey);
  const isProPlus = isBeta || ["professional", "enterprise"].includes(planKey);
  const financeEnabled = settings?.finance_enabled ?? false;

  const features: Record<FinanceFeatureKey, boolean> = {
    finance_module: financeEnabled,
    finance_intermediate: financeEnabled && MODE_RANK[effective] >= MODE_RANK.intermediate,
    finance_management: financeEnabled && MODE_RANK[effective] >= MODE_RANK.management,
    payment_pix_boleto:
      financeEnabled && MODE_RANK[effective] >= MODE_RANK.intermediate && (isProPlus || isBeta),
    auto_reconciliation:
      financeEnabled && MODE_RANK[effective] >= MODE_RANK.management && (isProPlus || isBeta),
    payment_gateways: financeEnabled && MODE_RANK[effective] >= MODE_RANK.intermediate,
  };

  const blocked_reasons: Partial<Record<FinanceFeatureKey, string>> = {};
  if (!financeEnabled) {
    blocked_reasons.finance_module = "Financeiro desativado neste workspace.";
  }
  if (!features.finance_intermediate) {
    blocked_reasons.finance_intermediate =
      "Disponível no modo Intermediário ou superior (plano Professional+ ou app na Loja).";
  }
  if (!features.payment_pix_boleto) {
    blocked_reasons.payment_pix_boleto =
      "Emissão de Pix/Boleto requer modo Intermediário+ e plano Professional ou Enterprise.";
  }
  if (!features.auto_reconciliation) {
    blocked_reasons.auto_reconciliation =
      "Conciliação automática (OFX) requer modo Gestão e plano Professional ou Enterprise.";
  }
  if (!features.payment_gateways) {
    blocked_reasons.payment_gateways = "Gateways de pagamento requerem modo Intermediário ou superior.";
  }

  if (isBeta) {
    for (const feature of FinanceFeatureKeySchema.options) {
      features[feature] = true;
    }
    for (const key of Object.keys(blocked_reasons) as FinanceFeatureKey[]) {
      delete blocked_reasons[key];
    }
    maxMode = "management";
  }

  return FinanceEntitlementsSchema.parse({
    plan_key: planKey,
    plan_label: planLabel,
    effective_finance_mode: effective,
    max_finance_mode: maxMode,
    features,
    blocked_reasons,
  });
}

export function canUseFinanceFeature(
  entitlements: FinanceEntitlements | null | undefined,
  feature: FinanceFeatureKey,
): boolean {
  if (!entitlements) return false;
  return Boolean(entitlements.features[feature]);
}

export function financeFeatureBlockedMessage(
  entitlements: FinanceEntitlements | null | undefined,
  feature: FinanceFeatureKey,
): string | null {
  if (!entitlements) return "Carregando permissões…";
  if (entitlements.features[feature]) return null;
  return entitlements.blocked_reasons[feature] ?? "Recurso não disponível no seu plano.";
}

export function parseFinanceFeatureKey(raw: string): FinanceFeatureKey | null {
  const r = FinanceFeatureKeySchema.safeParse(raw);
  return r.success ? r.data : null;
}
