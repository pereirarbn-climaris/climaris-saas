/**
 * Contrato compartilhado entre a configuração de orçamentos (UI) e o gerador PDF (backend).
 * A renderização final do PDF é feita em Python (ReportLab); este módulo centraliza tipos e merge de textos.
 */

import type { BudgetTextPreset } from "./budgetTextPresets";
import { defaultTextFromPresets } from "./budgetTextPresets";

export { PDF_STYLES, TABLE_THEME, tintHex, normalizePreviewTemplateId } from "./budgetPdfTheme";
export type { BudgetPreviewTemplateId } from "./budgetPdfTheme";

export type BudgetTemplateKey = "classic" | "professional";

export type BudgetTemplateSettings = {
  template_key: BudgetTemplateKey;
  brand_color: string;
  font_color: string;
  default_warranty_terms: string | null;
  default_payment_terms: string | null;
  default_payment_method: string | null;
  default_scope_text: string | null;
  default_technical_notes: string | null;
  default_validity_days?: number;
  warranty_presets?: BudgetTextPreset[];
  payment_presets?: BudgetTextPreset[];
  payment_method_presets?: BudgetTextPreset[];
  scope_presets?: BudgetTextPreset[];
  technical_presets?: BudgetTextPreset[];
  signature_url?: string | null;
  has_signature?: boolean;
};

export type TemplateConfig = {
  templateKey: BudgetTemplateKey;
  brandColor: string;
  fontColor: string;
  warrantyText: string | null;
  paymentTermsText: string | null;
  paymentMethodText: string | null;
  observationsText: string | null;
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
export const DEFAULT_FONT_COLOR = "#000000";

export function normalizeBrandColor(value: string | null | undefined, fallback = DEFAULT_BRAND_COLOR): string {
  return normalizeHexColor(value, fallback);
}

export function normalizeFontColor(value: string | null | undefined, fallback = DEFAULT_FONT_COLOR): string {
  return normalizeHexColor(value, fallback);
}

function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  const raw = (value ?? fallback).trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(raw) ? raw : fallback;
}

/** Limita digitação a # + 6 caracteres hex (evita códigos inválidos como #10A2E3D). */
export function sanitizeHexInput(raw: string): string {
  const upper = raw.trim().toUpperCase();
  const body = (upper.startsWith("#") ? upper.slice(1) : upper).replace(/[^0-9A-F]/g, "").slice(0, 6);
  return `#${body}`;
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
  const paymentMethod =
    (budget?.payment_method ?? "").trim() ||
    defaultTextFromPresets(settings.payment_method_presets ?? []) ||
    (settings.default_payment_method ?? "").trim() ||
    null;
  const observations =
    (budget?.observation ?? "").trim() ||
    defaultTextFromPresets(settings.technical_presets ?? []) ||
    (settings.default_technical_notes ?? "").trim() ||
    null;

  return {
    templateKey: settings.template_key,
    brandColor: normalizeBrandColor(settings.brand_color),
    fontColor: normalizeFontColor(settings.font_color),
    warrantyText: warranty,
    paymentTermsText: payment,
    paymentMethodText: paymentMethod,
    observationsText: observations,
  };
}

/** Valores iniciais para formulário de novo orçamento a partir das predefinições. */
export function defaultBudgetFormTexts(settings: BudgetTemplateSettings): {
  paymentTerms: string;
  paymentMethod: string;
  warrantyTerms: string;
  scopeText: string;
  observation: string;
  validityDays: number;
} {
  const warranty =
    defaultTextFromPresets(settings.warranty_presets ?? []) || (settings.default_warranty_terms ?? "");
  const payment =
    defaultTextFromPresets(settings.payment_presets ?? []) || (settings.default_payment_terms ?? "");
  const paymentMethod =
    defaultTextFromPresets(settings.payment_method_presets ?? []) || (settings.default_payment_method ?? "");
  const scopeText =
    defaultTextFromPresets(settings.scope_presets ?? []) || (settings.default_scope_text ?? "");
  const observation =
    defaultTextFromPresets(settings.technical_presets ?? []) || (settings.default_technical_notes ?? "");
  return {
    paymentTerms: payment,
    paymentMethod,
    warrantyTerms: warranty,
    scopeText,
    observation,
    validityDays: Math.max(1, settings.default_validity_days ?? 30),
  };
}
