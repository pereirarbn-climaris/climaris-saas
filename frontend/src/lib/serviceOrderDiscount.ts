import type { ServiceOrderData } from "../components/v0-ui/service-orders/ServiceOrderFormView";
import { computeLaborTotal, computePartsTotal } from "./serviceOrderLinesSync";

export type DiscountType = "fixed" | "percent";

export function computeOrderSubtotalFromView(data: ServiceOrderData): number {
  const labor = data.servicos?.length ? computeLaborTotal(data.servicos) : data.valorMaoDeObra || 0;
  const parts = data.pecas?.length ? computePartsTotal(data.pecas) : data.valorPecas || 0;
  return Math.max(0, labor + parts);
}

/** Valor em R$ enviado ao backend (`discount_amount`). */
export function computeDiscountAmountFromView(data: ServiceOrderData): number {
  const subtotal = computeOrderSubtotalFromView(data);
  const raw = Math.max(0, Number(data.descontoValor) || 0);
  if (data.descontoTipo === "percent") {
    const pct = Math.min(100, raw);
    return Math.min(subtotal, subtotal * (pct / 100));
  }
  return Math.min(subtotal, raw);
}

export function computeOrderTotalFromView(data: ServiceOrderData): number {
  const subtotal = computeOrderSubtotalFromView(data);
  return Math.max(0, subtotal - computeDiscountAmountFromView(data));
}

/** Ao carregar OS: infere tipo/valor a partir do desconto em R$ salvo no backend. */
export function discountFieldsFromAmount(
  subtotal: number,
  discountAmount: number,
  meta?: { descontoTipo?: DiscountType; descontoValor?: number },
): { descontoTipo: DiscountType; descontoValor: number } {
  if (meta?.descontoTipo && meta.descontoValor != null && Number.isFinite(meta.descontoValor)) {
    return {
      descontoTipo: meta.descontoTipo,
      descontoValor: Math.max(0, meta.descontoValor),
    };
  }
  const amount = Math.max(0, discountAmount);
  if (subtotal > 0 && amount > 0) {
    const pct = (amount / subtotal) * 100;
    const roundedPct = Math.round(pct * 100) / 100;
    if (Math.abs(amount - (subtotal * roundedPct) / 100) < 0.02) {
      return { descontoTipo: "percent", descontoValor: roundedPct };
    }
  }
  return { descontoTipo: "fixed", descontoValor: amount };
}
