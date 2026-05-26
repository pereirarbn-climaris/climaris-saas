import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export type StorageReindexReport = {
  tenant_id: number | null;
  qrcodes_checked: number;
  qrcodes_invalid: number;
  qrcodes_regenerated: number;
  qrcodes_links_cleared: number;
  qrcodes_synced_from_equipment: number;
  budgets_checked: number;
  budgets_status_repaired: number;
  budgets_tracking_repaired: number;
  budgets_pdf_missing: number;
  budgets_pdf_uploaded: number;
  alerts: string[];
  errors: string[];
};

export async function fetchStorageAlerts(): Promise<string[]> {
  const response = await fetch(apiUrl("/api/v1/system/storage-alerts"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error("Não foi possível carregar alertas de armazenamento.");
  const alerts = (body as { alerts?: string[] }).alerts;
  return Array.isArray(alerts) ? alerts : [];
}

export async function runStorageReindex(options?: {
  regenerate_invalid_qr?: boolean;
  reupload_missing_budget_pdfs?: boolean;
}): Promise<StorageReindexReport> {
  const response = await fetch(apiUrl("/api/v1/system/reindex"), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify({
      regenerate_invalid_qr: options?.regenerate_invalid_qr ?? true,
      reupload_missing_budget_pdfs: options?.reupload_missing_budget_pdfs ?? false,
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error("Falha ao executar reindexação de armazenamento.");
  return body as StorageReindexReport;
}
