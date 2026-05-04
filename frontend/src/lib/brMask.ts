/** Apenas dígitos (0–9). */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** CPF: 000.000.000-00 (até 11 dígitos). */
export function formatCpfInput(raw: string): string {
  const x = digitsOnly(raw).slice(0, 11);
  if (x.length <= 3) return x;
  if (x.length <= 6) return `${x.slice(0, 3)}.${x.slice(3)}`;
  if (x.length <= 9) return `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6)}`;
  return `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6, 9)}-${x.slice(9)}`;
}

/** CNPJ: 00.000.000/0001-00 (até 14 dígitos). */
export function formatCnpjInput(raw: string): string {
  const x = digitsOnly(raw).slice(0, 14);
  if (x.length <= 2) return x;
  if (x.length <= 5) return `${x.slice(0, 2)}.${x.slice(2)}`;
  if (x.length <= 8) return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5)}`;
  if (x.length <= 12) return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8)}`;
  return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12)}`;
}

/** CEP: 00000-000 (até 8 dígitos). */
export function formatCepInput(raw: string): string {
  const x = digitsOnly(raw).slice(0, 8);
  if (x.length <= 5) return x;
  return `${x.slice(0, 5)}-${x.slice(5)}`;
}

/** Máscara de documento conforme tipo (para inputs). */
export function formatTaxDocumentInput(raw: string, kind: "cpf" | "cnpj"): string {
  return kind === "cpf" ? formatCpfInput(raw) : formatCnpjInput(raw);
}

/**
 * Ao trocar PF/PJ, preserva só os dígitos permitidos no novo tipo e reaplica máscara.
 */
export function taxDocumentOnKindChange(previousMasked: string, newKind: "cpf" | "cnpj"): string {
  const d = digitsOnly(previousMasked);
  if (newKind === "cpf") {
    return formatCpfInput(d.slice(0, 11));
  }
  return formatCnpjInput(d.slice(0, 14));
}

/**
 * Telefone BR: (DD) + 8 dígitos (fixo) ou (DD) + 9 dígitos (celular).
 * Celular: primeiro dígito após o DDD é 9 — máscara (DD) 9XXXX-XXXX.
 * Fixo: (DD) XXXX-XXXX.
 */
export function formatPhoneBrInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length === 1) return `(${d}`;
  if (d.length === 2) return `(${d}) `;

  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 0) return `(${ddd}) `;

  if (rest[0] === "9") {
    const r = rest.slice(0, 9);
    if (r.length <= 5) return `(${ddd}) ${r}`;
    return `(${ddd}) ${r.slice(0, 5)}-${r.slice(5)}`;
  }
  const r = rest.slice(0, 8);
  if (r.length <= 4) return `(${ddd}) ${r}`;
  return `(${ddd}) ${r.slice(0, 4)}-${r.slice(4)}`;
}

/** Telefone salvo (só dígitos ou já formatado) para tabelas e leitura. */
export function formatPhoneBrDisplay(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  return formatPhoneBrInput(String(raw));
}

/**
 * URL `https://wa.me/...` para abrir o WhatsApp no celular ou Web.
 * Números BR com 10–11 dígitos recebem prefixo 55 quando ausente.
 */
export function whatsappMeUrl(raw: string | null | undefined): string | null {
  let d = digitsOnly(raw ?? "");
  if (d.length < 10) return null;
  if (d.length <= 11 && !d.startsWith("55")) {
    d = `55${d}`;
  }
  return `https://wa.me/${d}`;
}

/** Apenas dígitos do telefone, no máximo 10 (fixo) ou 11 (celular). */
export function digitsOnlyPhoneForApi(masked: string): string {
  const d = digitsOnly(masked);
  if (d.length < 3) return d;
  if (d[2] === "9") return d.slice(0, 11);
  return d.slice(0, 10);
}
