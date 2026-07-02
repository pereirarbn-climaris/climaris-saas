/**
 * Tema visual alinhado ao gerador PDF (ReportLab) e ao Orcamento_Profissional.pdf.
 */

export const PDF_STYLES = {
  page: {
    widthMm: 210,
    heightMm: 297,
    aspectRatio: "210/297" as const,
    marginMm: 15,
  },
  fontFamily: 'Inter, "DejaVu Sans", Helvetica, Arial, sans-serif',
  defaultBrandColor: "#0B7FAF",
  defaultFontColor: "#000000",
  colors: {
    body: "#000000",
    muted: "#000000",
    subtle: "#000000",
    border: "#e2e8f0",
    tableRow: "#f1f5f9",
    signature: "#000000",
    signatureLabel: "#000000",
  },
  fontSize: {
    title: "13pt",
    tagline: "7.2pt",
    section: "9.2pt",
    body: "7.5pt",
    tableHeader: "7.4pt",
    tableBody: "7pt",
    legal: "7.5pt",
  },
  tintWhiteFactor: 0.2,
  lightTintFactor: 0.82,
} as const;

/** Modelo clássico — 3 colunas simplificadas no preview. */
export const TABLE_THEME_CLASSIC = {
  headerMode: "light" as const,
  sectionTitles: { services: "Serviços", products: "Produtos" },
  order: ["services", "products"] as const,
  columns: ["Descrição", "Qtd", "Preço"],
} as const;

/**
 * Modelo profissional — espelha Orcamento_Profissional.pdf
 * (seções 1–4, tabelas com Qtd / Unidade / Preço unitário / Subtotal).
 */
export const TABLE_THEME_PROFESSIONAL = {
  headerMode: "solid" as const,
  sections: {
    scope: "1. ESCOPO TÉCNICO DE MÃO DE OBRA E EXECUÇÃO",
    products: "2. DETALHAMENTO DE PRODUTOS E MATERIAIS APLICADOS",
    productsHeader: "DESCRIÇÃO DO PRODUTO / INSUMO TÉCNICO",
    services: "3. DETALHAMENTO DOS SERVIÇOS TÉCNICOS (MÃO DE OBRA)",
    servicesHeader: "DESCRIÇÃO DO SERVIÇO TÉCNICO EXECUTADO",
    conditions: "4. CONDIÇÕES E GARANTIAS COMERCIAIS",
  },
  /** Cliente à esquerda, prestador à direita (mesma linha, dados abaixo de cada um). */
  partyLayout: "sideBySide" as const,
  partyLabels: {
    provider: "PRESTADOR DOS SERVIÇOS",
    client: "CLIENTE / CONTRATANTE",
  },
  header: {
    showLogo: false,
    companyNameSize: "21pt",
    dividerTint: 0.78,
  },
  table: {
    gridTint: 0.92,
    sectionTitleGapMm: 1.6,
    /** Corpo das linhas sem zebra — só o cabeçalho tem fundo da marca. */
    bodyRowBackground: "transparent" as const,
  },
  columns: ["Descrição", "Qtd.", "Unidade", "Preço unit.", "Subtotal"],
  subtotalLabels: {
    products: "Subtotal Geral de Produtos/Materiais",
    services: "Subtotal Geral de Serviços (Mão de Obra)",
    total: "VALOR TOTAL DO INVESTIMENTO",
  },
} as const;

export const TABLE_THEME = {
  classic: TABLE_THEME_CLASSIC,
  professional: TABLE_THEME_PROFESSIONAL,
} as const;

export type BudgetPreviewTemplateId = "classic" | "professional" | "1" | "2";

export function normalizePreviewTemplateId(
  templateId: BudgetPreviewTemplateId | string,
): "classic" | "professional" {
  const raw = String(templateId).toLowerCase();
  if (raw === "professional" || raw === "2" || raw === "template2" || raw === "modelo2") {
    return "professional";
  }
  return "classic";
}

export function tintHex(hex: string, whiteMix: number): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const f = Math.max(0, Math.min(1, whiteMix));
  const mix = (ch: number) => Math.round(ch * (1 - f) + 255 * f);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function scopeLinesFromText(text: string | undefined, max = 5): string[] {
  if (!text?.trim()) return [];
  const out: string[] = [];
  for (const block of text.replace(/;/g, "\n").split("\n")) {
    const line = block.trim().replace(/^[•\-*]\s*/, "");
    if (line) out.push(line);
    if (out.length >= max) break;
  }
  return out;
}
