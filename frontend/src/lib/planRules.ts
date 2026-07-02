/**
 * Regras de plano SaaS (espelha `app/plan_rules.py`).
 * Plano Developer (`beta_internal` e aliases) tem acesso total em dev/homologação interna.
 */

const PLAN_ALIAS: Record<string, string> = {
  starter: "free_30d",
  trial: "free_30d",
  trial_30d: "free_30d",
  basic: "basic",
  professional: "professional",
  enterprise: "enterprise",
  beta: "beta_internal",
  "beta-internal": "beta_internal",
  beta_interno: "beta_internal",
  developer: "beta_internal",
  dev: "beta_internal",
  beta_internalss: "beta_internal",
  beta_internals: "beta_internal",
  beta_internal55: "beta_internal",
};

/** Normaliza `tenants.active_plan` ou `plan_key` da API. */
export function normalizePlanKey(rawPlan: string | null | undefined): string {
  const normalized = (rawPlan ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) return "free_30d";
  return PLAN_ALIAS[normalized] ?? normalized;
}

/** Developer / beta interno — liberado geral (financeiro, WhatsApp, etc.). */
export function isDeveloperPlan(rawPlan: string | null | undefined): boolean {
  return normalizePlanKey(rawPlan) === "beta_internal";
}

const PLAN_DISPLAY_LABELS: Record<string, string> = {
  free_30d: "Free 30 dias",
  basic: "Basic",
  basico: "Basic",
  professional: "Professional",
  enterprise: "Enterprise",
  beta_internal: "Developer (uso interno)",
};

/** Rótulo amigável para exibir na UI do cliente (sidebar, conta). */
export function getPlanDisplayLabel(
  activePlan: string | null | undefined,
  apiLabel?: string | null,
): string {
  if (apiLabel?.trim()) return apiLabel.trim();
  const key = normalizePlanKey(activePlan);
  return PLAN_DISPLAY_LABELS[key] ?? key.replace(/_/g, " ");
}
