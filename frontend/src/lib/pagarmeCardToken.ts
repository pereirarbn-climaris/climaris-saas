/**
 * Tokenização de cartão no browser (Pagar.me Core v5).
 * @see https://docs.pagar.me/reference/criar-token-cart%C3%A3o-1
 *
 * O domínio do app deve estar cadastrado no painel Pagar.me. Sem isso, a API pode recusar a requisição.
 */

const PAGARME_TOKENS_URL = "https://api.pagar.me/core/v5/tokens";

function errFromBody(body: unknown): string {
  if (body && typeof body === "object" && "message" in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return "Não foi possível tokenizar o cartão.";
}

export type PagarmeCardTokenParams = {
  publicKey: string;
  number: string;
  holderName: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  holderDocumentDigits?: string;
};

export async function createPagarmeCardToken(params: PagarmeCardTokenParams): Promise<string> {
  const pk = params.publicKey.trim();
  if (!pk.startsWith("pk_test_") && !pk.startsWith("pk_live_")) {
    throw new Error("Chave pública Pagar.me inválida (pk_test_… ou pk_live_…).");
  }
  const number = params.number.replace(/\D/g, "");
  if (number.length < 13 || number.length > 19) {
    throw new Error("Número do cartão inválido.");
  }
  const month = Number.parseInt(params.expMonth.replace(/\D/g, ""), 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("Mês de validade inválido.");
  }
  const yDigits = params.expYear.replace(/\D/g, "");
  let expYearNum: number;
  if (yDigits.length === 4) {
    expYearNum = Number.parseInt(yDigits.slice(2), 10);
  } else if (yDigits.length === 2) {
    expYearNum = Number.parseInt(yDigits, 10);
  } else {
    throw new Error("Ano de validade inválido (use AA ou AAAA).");
  }
  if (!Number.isFinite(expYearNum)) {
    throw new Error("Ano de validade inválido.");
  }
  const cvv = params.cvv.replace(/\s/g, "");
  if (cvv.length < 3 || cvv.length > 4) {
    throw new Error("CVV inválido.");
  }
  const holder = params.holderName
    .trim()
    .replace(/[^A-Za-zÀ-ÿ\s'.-]/g, "")
    .trim();
  if (holder.length < 2) {
    throw new Error("Nome no cartão inválido.");
  }
  const url = `${PAGARME_TOKENS_URL}?appId=${encodeURIComponent(pk)}`;
  const card: Record<string, string | number> = {
    number,
    holder_name: holder.slice(0, 64),
    exp_month: month,
    exp_year: expYearNum,
    cvv,
  };
  const doc = (params.holderDocumentDigits || "").replace(/\D/g, "");
  if (doc.length === 11 || doc.length === 14) {
    card.holder_document = doc;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "card", card }),
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(errFromBody(body));
  }
  if (body && typeof body === "object" && "id" in body) {
    const id = (body as { id?: unknown }).id;
    if (typeof id === "string" && id.length >= 10) return id;
  }
  throw new Error(errFromBody(body));
}
