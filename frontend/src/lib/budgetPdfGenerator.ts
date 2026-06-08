/**
 * Contrato compartilhado entre a configuração de orçamentos (UI) e o gerador PDF (backend).
 * A renderização final do PDF é feita em Python (ReportLab); este módulo centraliza tipos e merge de textos.
 */

export { PDF_STYLES, TABLE_THEME, tintHex, normalizePreviewTemplateId } from "./budgetPdfTheme";
export type { BudgetPreviewTemplateId } from "./budgetPdfTheme";

export type BudgetTemplateKey = "classic" | "professional";

export type BudgetTemplateSettings = {
  template_key: BudgetTemplateKey;
  brand_color: string;
  default_warranty_terms: string | null;
  default_payment_terms: string | null;
  default_technical_notes: string | null;
};

export type TemplateConfig = {
  templateKey: BudgetTemplateKey;
  brandColor: string;
  warrantyText: string | null;
  paymentTermsText: string | null;
  technicalNotesText: string | null;
};

export const BUDGET_TEMPLATE_OPTIONS: { value: BudgetTemplateKey; label: string; description: string }[] = [
  {
    value: "classic",
    label: "Modelo 1 — Clássico",
    description: "Cabeçalho em cartão, seções Serviços e Produtos, total destacado.",
  },
  {
    value: "professional",
    label: "Modelo 2 — Profissional",
    description: "Logo à esquerda, prestador à direita, tabelas de materiais e mão de obra separadas.",
  },
];

export const DEFAULT_BRAND_COLOR = "#0B7FAF";

export function normalizeBrandColor(value: string | null | undefined, fallback = DEFAULT_BRAND_COLOR): string {
  const raw = (value ?? fallback).trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
}

export function resolveTemplateConfig(
  settings: BudgetTemplateSettings,
  budget?: {
    warranty_terms?: string | null;
    payment_terms?: string | null;
    observation?: string | null;
    payment_method?: string | null;
  },
): TemplateConfig {
  const warranty =
    (budget?.warranty_terms ?? "").trim() || (settings.default_warranty_terms ?? "").trim() || null;
  const payment =
    (budget?.payment_terms ?? "").trim() || (settings.default_payment_terms ?? "").trim() || null;
  const technical =
    (budget?.observation ?? "").trim() || (settings.default_technical_notes ?? "").trim() || null;

  return {
    templateKey: settings.template_key,
    brandColor: normalizeBrandColor(settings.brand_color),
    warrantyText: warranty,
    paymentTermsText: payment,
    technicalNotesText: technical,
  };
}

/** Valores iniciais para formulário de novo orçamento a partir das predefinições. */
export function defaultBudgetFormTexts(settings: BudgetTemplateSettings): {
  paymentTerms: string;
  warrantyTerms: string;
  observation: string;
} {
  return {
    paymentTerms: settings.default_payment_terms ?? "",
    warrantyTerms: settings.default_warranty_terms ?? "",
    observation: settings.default_technical_notes ?? "",
  };
}
