const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Formata valor monetário (pt-BR) a partir apenas dos dígitos digitados (últimos 2 = centavos).
 */
export function formatBrlInputFromDigits(digits: string): string {
  const n = digits.replace(/\D/g, "");
  if (n === "") return brl.format(0);
  const cents = Math.min(parseInt(n, 10), Number.MAX_SAFE_INTEGER);
  return brl.format(cents / 100);
}

/** Converte número (API) para string exibida no input mascarado. */
export function numberToBrlInput(value: number): string {
  let n = value;
  if (!Number.isFinite(n) || n < 0) n = 0;
  const cents = Math.round(n * 100);
  return brl.format(cents / 100);
}

/** Interpreta o texto do input (R$ 1.234,56 ou dígitos) como valor em reais. */
export function parseBrlInputToNumber(formatted: string): number {
  const digits = formatted.replace(/\D/g, "");
  if (digits === "") return 0;
  return parseInt(digits, 10) / 100;
}

/** Exibição somente leitura (totais, labels) em pt-BR. */
export function formatBrlDisplay(value: number): string {
  if (!Number.isFinite(value)) return brl.format(0);
  return brl.format(value);
}
