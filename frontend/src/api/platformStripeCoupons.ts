import { apiUrl } from "../lib/apiUrl";
import { apiErrorMessage } from "../lib/apiErrorMessage";
import { getAccessToken } from "../lib/authStorage";

export type StripeProductOption = { id: string; label: string };

export type StripeCoupon = {
  id: string;
  name: string | null;
  valid: boolean;
  discount_type: "percent" | "amount";
  discount_label: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: "once" | "forever" | "repeating";
  duration_in_months: number | null;
  max_redemptions: number | null;
  times_redeemed: number;
  redeem_by: string | null;
  applies_to_product_ids: string[];
  metadata: Record<string, string>;
  created_at: string | null;
};

export type StripePromotionCode = {
  id: string;
  code: string;
  coupon_id: string | null;
  active: boolean;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: string | null;
  first_time_transaction: boolean;
  minimum_amount: number | null;
  minimum_amount_currency: string | null;
  metadata: Record<string, string>;
  created_at: string | null;
};

export type StripeCouponCreatePayload = {
  name: string;
  discount_type: "percent" | "amount";
  percent_off?: number | null;
  amount_off_brl?: number | null;
  duration: "once" | "forever" | "repeating";
  duration_in_months?: number | null;
  coupon_id?: string | null;
  max_redemptions?: number | null;
  redeem_by?: string | null;
  applies_to_product_ids?: string[];
  metadata?: Record<string, string>;
};

export type StripePromotionCodeCreatePayload = {
  coupon_id: string;
  code: string;
  active?: boolean;
  max_redemptions?: number | null;
  expires_at?: string | null;
  first_time_transaction?: boolean;
  minimum_amount_brl?: number | null;
  metadata?: Record<string, string>;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function listStripeProducts(): Promise<StripeProductOption[]> {
  const response = await fetch(apiUrl("/api/v1/platform/stripe/products"), { headers: authHeaders() });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(body, "Não foi possível carregar produtos Stripe.", response));
  return body as StripeProductOption[];
}

export async function listStripeCoupons(): Promise<StripeCoupon[]> {
  const response = await fetch(apiUrl("/api/v1/platform/stripe/coupons"), { headers: authHeaders() });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(body, "Não foi possível carregar cupons.", response));
  return body as StripeCoupon[];
}

export async function createStripeCoupon(payload: StripeCouponCreatePayload): Promise<StripeCoupon> {
  const response = await fetch(apiUrl("/api/v1/platform/stripe/coupons"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(body, "Não foi possível criar o cupom.", response));
  return body as StripeCoupon;
}

export async function deleteStripeCoupon(couponId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/platform/stripe/coupons/${encodeURIComponent(couponId)}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(apiErrorMessage(body, "Não foi possível excluir o cupom.", response));
  }
}

export async function listStripePromotionCodes(couponId?: string): Promise<StripePromotionCode[]> {
  const qs = couponId ? `?coupon_id=${encodeURIComponent(couponId)}` : "";
  const response = await fetch(apiUrl(`/api/v1/platform/stripe/promotion-codes${qs}`), { headers: authHeaders() });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(body, "Não foi possível carregar códigos promocionais.", response));
  return body as StripePromotionCode[];
}

export async function createStripePromotionCode(
  payload: StripePromotionCodeCreatePayload,
): Promise<StripePromotionCode> {
  const response = await fetch(apiUrl("/api/v1/platform/stripe/promotion-codes"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(body, "Não foi possível criar o código promocional.", response));
  return body as StripePromotionCode;
}

export async function updateStripePromotionCode(
  promotionCodeId: string,
  payload: { active?: boolean },
): Promise<StripePromotionCode> {
  const response = await fetch(
    apiUrl(`/api/v1/platform/stripe/promotion-codes/${encodeURIComponent(promotionCodeId)}`),
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(body, "Não foi possível atualizar o código.", response));
  return body as StripePromotionCode;
}
