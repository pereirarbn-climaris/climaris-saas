/** URL de redirect oficial do checkout (preferência) — alinhado ao backend. */
export function mercadoPagoPreferenceCheckoutUrl(preferenceId: string, sandbox: boolean): string {
  const pref = (preferenceId || "").trim();
  if (!pref) return "";
  const enc = encodeURIComponent(pref);
  const host = sandbox ? "https://sandbox.mercadopago.com.br" : "https://www.mercadopago.com.br";
  return `${host}/checkout/v1/redirect?pref_id=${enc}`;
}

/** Só iframes de domínios Mercado Pago (evita open-redirect). */
export function isMercadoPagoHostedCheckoutUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  const allowed =
    h === "www.mercadopago.com.br" ||
    h === "sandbox.mercadopago.com.br" ||
    h.endsWith(".mercadopago.com.br") ||
    h === "www.mercadopago.com.ar" ||
    h.endsWith(".mercadopago.com.ar") ||
    h === "www.mercadopago.com.mx" ||
    h.endsWith(".mercadopago.com.mx") ||
    h === "www.mercadopago.com.uy" ||
    h.endsWith(".mercadopago.com.uy") ||
    h === "www.mercadopago.cl" ||
    h.endsWith(".mercadopago.cl");
  return allowed;
}
