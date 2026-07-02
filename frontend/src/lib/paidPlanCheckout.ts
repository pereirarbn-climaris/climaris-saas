import { createBillingCheckout } from "../api/billing";
import { normalizePlanKey } from "./planRules";

/** Planos pagos contratáveis via Stripe (não trial nem developer). */
export function isPaidContractPlan(planKey: string | null | undefined): boolean {
  const key = normalizePlanKey(planKey);
  return key !== "free_30d" && key !== "beta_internal";
}

const PENDING_CHECKOUT_KEY = "climaris_pending_checkout_plan";

export function rememberPendingCheckoutPlan(planKey: string): void {
  if (!isPaidContractPlan(planKey)) return;
  try {
    localStorage.setItem(PENDING_CHECKOUT_KEY, normalizePlanKey(planKey));
  } catch {
    /* ignore */
  }
}

export function readPendingCheckoutPlan(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_CHECKOUT_KEY);
    return raw && isPaidContractPlan(raw) ? normalizePlanKey(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingCheckoutPlan(): void {
  try {
    localStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {
    /* ignore */
  }
}

/** Inicia checkout Stripe. Retorna true se redirecionou (ou está processando). */
export async function startPaidPlanCheckout(planKey: string): Promise<"redirect" | "upgraded" | "skipped"> {
  const key = normalizePlanKey(planKey);
  if (!isPaidContractPlan(key)) return "skipped";
  const result = await createBillingCheckout(key);
  if (result.upgraded_in_place) return "upgraded";
  if (result.checkout_url) {
    window.location.href = result.checkout_url;
    return "redirect";
  }
  throw new Error("Resposta de checkout inválida.");
}
