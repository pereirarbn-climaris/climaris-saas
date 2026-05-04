import { formatCnpjInput, formatCpfInput, digitsOnly } from "./brMask";

/** Formata CPF/CNPJ (somente dígitos) para exibição em tabelas e labels. */
export function formatBrazilianTaxId(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length === 0) return "";
  if (d.length <= 11) return formatCpfInput(d);
  return formatCnpjInput(d);
}
