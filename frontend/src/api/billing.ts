import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import type { DashboardTierCap, FinanceModeCap } from "./platformSaasPlans";

export type BillingPlan = {
  plan_key: string;
  display_name: string;
  description: string;
  footnote: string;
  finance_max_mode: FinanceModeCap;
  dashboard_tier?: DashboardTierCap;
  dashboard_label?: string;
  max_users: number | null;
  monthly_price_brl: number | null;
  sort_order: number;
};

export type BillingStatus = {
  active_plan: string;
  active_plan_label: string;
  max_users: number | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  stripe_configured: boolean;
  has_stripe_customer: boolean;
  has_active_subscription: boolean;
  subscribed_plan_key: string | null;
  trial_ends_at: string | null;
  trial_days_remaining: number | null;
  is_on_free_trial: boolean;
  is_trial_expired: boolean;
  has_paid_access: boolean;
  subscription_access_blocked: boolean;
  subscription_cancel_at_period_end: boolean;
  subscription_ends_at: string | null;
};

export type BillingSubscriptionActionResult = {
  subscription_status: string | null;
  subscription_cancel_at_period_end: boolean;
  subscription_ends_at: string | null;
  message: string;
};

export type BillingCheckoutResult = {
  checkout_url: string | null;
  upgraded_in_place: boolean;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const err = body as { detail?: unknown; error?: { message?: unknown } };
    if (typeof err.detail === "string") return err.detail;
    if (typeof err.error?.message === "string") return err.error.message;
  }
  return fallback;
}

export async function fetchBillingPlans(): Promise<BillingPlan[]> {
  const response = await fetch(apiUrl("/api/v1/billing/plans"), { headers: authHeaders() });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar os planos."));
  return body as BillingPlan[];
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  const response = await fetch(apiUrl("/api/v1/billing/status"), { headers: authHeaders() });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar o status da assinatura."));
  return body as BillingStatus;
}

export async function createBillingCheckout(planKey: string): Promise<BillingCheckoutResult> {
  const response = await fetch(apiUrl("/api/v1/billing/checkout"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ plan_key: planKey }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível iniciar o checkout."));
  const parsed = body as BillingCheckoutResult;
  if (!parsed.upgraded_in_place && !parsed.checkout_url) {
    throw new Error("Resposta de checkout inválida.");
  }
  return parsed;
}

export type BillingSyncResult = {
  synced: boolean;
  active_plan: string;
  has_active_subscription: boolean;
};

export async function syncBillingSubscription(): Promise<BillingSyncResult> {
  const response = await fetch(apiUrl("/api/v1/billing/sync-subscription"), {
    method: "POST",
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível sincronizar a assinatura."));
  return body as BillingSyncResult;
}

export async function cancelBillingSubscription(): Promise<BillingSubscriptionActionResult> {
  const response = await fetch(apiUrl("/api/v1/billing/cancel-subscription"), {
    method: "POST",
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível cancelar a assinatura."));
  return body as BillingSubscriptionActionResult;
}

export async function resumeBillingSubscription(): Promise<BillingSubscriptionActionResult> {
  const response = await fetch(apiUrl("/api/v1/billing/resume-subscription"), {
    method: "POST",
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível reativar a assinatura."));
  return body as BillingSubscriptionActionResult;
}

export async function createBillingPortal(): Promise<string> {
  const response = await fetch(apiUrl("/api/v1/billing/portal"), {
    method: "POST",
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(body, "Não foi possível abrir o portal de cobrança."));
  const url = (body as { portal_url?: string }).portal_url;
  if (!url) throw new Error("Resposta do portal inválida.");
  return url;
}
