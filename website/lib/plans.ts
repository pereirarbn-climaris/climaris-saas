import { freeTrial } from "./site-config";

export type PublicPlan = {
  plan_key: string;
  display_name: string;
  website_tier: string;
  description: string;
  finance_max_mode: string;
  finance_label: string;
  dashboard_tier?: string;
  dashboard_label?: string;
  max_users: number | null;
  monthly_price_brl: number | null;
  sort_order: number;
  highlighted: boolean;
  is_free_trial?: boolean;
  trial_days?: number | null;
  cta?: "register" | "lead";
};

/** Fallback mínimo se a API estiver indisponível — preços genéricos, sem substituir o catálogo vivo. */
export const fallbackPlans: PublicPlan[] = [
  {
    plan_key: freeTrial.planKey,
    display_name: "Free 30 dias",
    website_tier: "Teste grátis",
    description: "Experimente o Climaris — gestão de OS, financeiro básico e PMOC.",
    finance_max_mode: "basic",
    finance_label: "Financeiro básico",
    max_users: 2,
    monthly_price_brl: 0,
    sort_order: 10,
    highlighted: false,
    is_free_trial: true,
    trial_days: freeTrial.days,
    cta: "register",
  },
];

export type PlanComparisonFeature = {
  feature: string;
  valueForPlan: (plan: PublicPlan) => boolean | string;
};

export const planComparisonFeatures: PlanComparisonFeature[] = [
  { feature: "Gestão de OS", valueForPlan: () => true },
  { feature: "Agenda comercial", valueForPlan: () => true },
  { feature: "Agenda do técnico em campo", valueForPlan: () => true },
  { feature: "Gestão preventiva automatizada", valueForPlan: () => true },
  { feature: "Geração de PMOC e laudos", valueForPlan: () => true },
  { feature: "Orçamentos e contratos", valueForPlan: () => true },
  {
    feature: "Automação WhatsApp",
    valueForPlan: (plan) => !plan.is_free_trial && plan.finance_max_mode !== "basic",
  },
  {
    feature: "Dashboard gerencial",
    valueForPlan: (plan) => {
      if (plan.dashboard_label) return plan.dashboard_label;
      if (plan.is_free_trial || plan.finance_max_mode === "basic") return "Básico";
      if (plan.finance_max_mode === "intermediate") return "Avançado";
      return "Completo";
    },
  },
];

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  try {
    const response = await fetch(`${apiBase()}/api/v1/public/plans`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return fallbackPlans;
    const data = (await response.json()) as PublicPlan[];
    return data.length > 0 ? data : fallbackPlans;
  } catch {
    return fallbackPlans;
  }
}

export function splitPlans(plans: PublicPlan[]) {
  const trialPlan = plans.find((p) => p.is_free_trial) ?? null;
  const paidPlans = plans.filter((p) => !p.is_free_trial);
  return { trialPlan, paidPlans };
}

export function formatPlanPrice(plan: PublicPlan): string {
  if (plan.is_free_trial) return "Grátis";
  if (plan.monthly_price_brl === null || plan.monthly_price_brl <= 0) return "Sob consulta";
  return plan.monthly_price_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatMaxUsers(max: number | null): string {
  if (max === null) return "Ilimitado";
  return `Até ${max} usuários`;
}

export function isRegisterPlan(plan: PublicPlan): boolean {
  return plan.cta === "register" || plan.is_free_trial === true;
}
