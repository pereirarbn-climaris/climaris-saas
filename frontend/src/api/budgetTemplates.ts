import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import type { BudgetTemplateSettings } from "../lib/budgetPdfGenerator";

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as { detail?: unknown };
    if (typeof o.detail === "string" && o.detail) return o.detail;
  }
  return fallback;
}

function jsonHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function fetchBudgetTemplateSettings(): Promise<BudgetTemplateSettings> {
  const response = await fetch(apiUrl("/api/v1/budgets/template-settings"), {
    headers: jsonHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar os modelos de orçamento."));
  }
  return body as BudgetTemplateSettings;
}

export type BudgetTemplatePreviewPayload = Partial<BudgetTemplateSettings>;

export async function fetchBudgetTemplatePreviewPdf(payload: BudgetTemplatePreviewPayload): Promise<Blob> {
  const response = await fetch(apiUrl("/api/v1/budgets/template-settings/preview-pdf"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      template_key: payload.template_key ?? "classic",
      brand_color: payload.brand_color,
      default_warranty_terms: payload.default_warranty_terms ?? null,
      default_payment_terms: payload.default_payment_terms ?? null,
      default_technical_notes: payload.default_technical_notes ?? null,
    }),
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errorMessage(body, "Não foi possível gerar o PDF de pré-visualização."));
  }
  return response.blob();
}

export async function patchBudgetTemplateSettings(
  payload: Partial<BudgetTemplateSettings>,
): Promise<BudgetTemplateSettings> {
  const response = await fetch(apiUrl("/api/v1/budgets/template-settings"), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar a configuração."));
  }
  return body as BudgetTemplateSettings;
}
