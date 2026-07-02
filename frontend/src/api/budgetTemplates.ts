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
    if (Array.isArray(o.detail) && o.detail.length > 0) {
      const first = o.detail[0] as { msg?: string; loc?: unknown[] };
      const field = Array.isArray(first.loc) ? first.loc.filter((x) => typeof x === "string").join(" → ") : "";
      const msg = typeof first.msg === "string" ? first.msg : "";
      if (field && msg) return `${field}: ${msg}`;
      if (msg) return msg;
    }
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
      font_color: payload.font_color,
      default_warranty_terms: payload.default_warranty_terms ?? null,
      default_payment_terms: payload.default_payment_terms ?? null,
      default_payment_method: payload.default_payment_method ?? null,
      default_scope_text: payload.default_scope_text ?? null,
      default_technical_notes: payload.default_technical_notes ?? null,
      default_validity_days: payload.default_validity_days ?? null,
      warranty_presets: payload.warranty_presets ?? null,
      payment_presets: payload.payment_presets ?? null,
      payment_method_presets: payload.payment_method_presets ?? null,
      scope_presets: payload.scope_presets ?? null,
      technical_presets: payload.technical_presets ?? null,
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

function authOnlyHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export async function uploadBudgetTemplateSignature(file: File): Promise<BudgetTemplateSettings> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(apiUrl("/api/v1/budgets/template-settings/signature"), {
    method: "POST",
    headers: authOnlyHeaders(),
    body: form,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível enviar a assinatura."));
  }
  return body as BudgetTemplateSettings;
}

export async function deleteBudgetTemplateSignature(): Promise<BudgetTemplateSettings> {
  const response = await fetch(apiUrl("/api/v1/budgets/template-settings/signature"), {
    method: "DELETE",
    headers: authOnlyHeaders(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível remover a assinatura."));
  }
  return body as BudgetTemplateSettings;
}

export function budgetTemplateSignatureFileUrl(): string {
  return apiUrl("/api/v1/budgets/template-settings/signature/file");
}
