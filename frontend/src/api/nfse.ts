import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type NfseSettingsOut = {
  mei_opt_in: boolean;
  default_optante_mei: boolean;
  mei_environment: "homolog" | "producao";
  has_mei_certificate: boolean;
  mei_certificate_file_name: string | null;
  has_mei_portal_credentials: boolean;
  mei_last_tested_at: string | null;
  mei_last_test_error: string | null;
  focus_opt_in: boolean;
  has_focus_api_key: boolean;
  focus_environment: "homolog" | "producao";
  auto_issue_on_payment: boolean;
  default_codigo_tributacao_nacional?: string | null;
  default_codigo_nbs?: string | null;
  /** Tag IM na DPS nacional — alguns municípios exigem (até 15 caracteres). */
  prestador_inscricao_municipal?: string | null;
  /** Série da DPS (XML / Id), ex. 70000 — igual ao cadastro no emissor nacional. */
  dps_serie?: string | null;
  /** Definido pela consulta CNPJ (MEI → nacional; demais → Focus). */
  auto_nfse_provider?: "national_mei" | "focus" | null;
};

export type NfseTributacaoNacionalItem = {
  codigo: string;
  descricao: string;
  nbs_sugerido?: string | null;
};

export type NfseSettingsPatch = Partial<{
  mei_opt_in: boolean;
  default_optante_mei: boolean;
  mei_environment: "homolog" | "producao";
  mei_certificate_base64: string;
  mei_certificate_file_name: string;
  mei_certificate_password: string;
  mei_portal_username: string;
  mei_portal_password: string;
  clear_mei_certificate: boolean;
  clear_mei_portal_credentials: boolean;
  focus_opt_in: boolean;
  focus_api_key: string;
  focus_environment: "homolog" | "producao";
  clear_focus_api_key: boolean;
  auto_issue_on_payment: boolean;
  default_codigo_tributacao_nacional?: string | null;
  default_codigo_nbs?: string | null;
  prestador_inscricao_municipal?: string | null;
  dps_serie?: string | null;
  auto_nfse_provider?: "national_mei" | "focus" | null;
}>;

export type NfseMeiTestPayload = Partial<{
  mei_certificate_base64: string;
  mei_certificate_password: string;
  mei_portal_username: string;
  mei_portal_password: string;
  /** default true — handshake mTLS com o host do Sefin (homolog ou produção conforme configuração). */
  test_sefin_connectivity: boolean;
}>;

export type NfseMeiTestOut = {
  ok: boolean;
  certificate_ok: boolean;
  portal_credentials_present: boolean;
  message: string;
  sefin_ok?: boolean | null;
  sefin_message?: string | null;
};

export type NfseImportDisplay = Record<string, unknown>;

export type NfseInvoiceOut = {
  id: number;
  tenant_id: number;
  client_id: number;
  client_name: string | null;
  service_order_id: number | null;
  finance_entry_id: number | null;
  provider: "national_mei" | "focus";
  status: "pending_submission" | "issued" | "failed" | "cancelled";
  amount: number;
  rps_number: string | null;
  nfse_number: string | null;
  nfse_access_key: string | null;
  verification_code: string | null;
  municipal_code: string | null;
  request_payload_json: string | null;
  response_payload_json: string | null;
  import_display: NfseImportDisplay | null;
  error_message: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NfseImportXmlBatchItemOut = {
  index: number;
  file_name: string | null;
  ok: boolean;
  message: string;
  invoice_id: number | null;
  nfse_number: string | null;
};

export type NfseImportXmlBatchOut = {
  total: number;
  imported: number;
  failed: number;
  items: NfseImportXmlBatchItemOut[];
};

function headersJson(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

/** FastAPI usa `detail` como string (HTTPException) ou lista de erros de validação. */
function formatFastApiDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item && typeof (item as { msg: unknown }).msg === "string") {
          return (item as { msg: string }).msg;
        }
        return null;
      })
      .filter((s): s is string => Boolean(s && s.trim()));
    if (parts.length) return parts.join(" ");
  }
  return null;
}

function errMsg(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const obj = body as { detail?: unknown; error?: { message?: string } };
    if (obj.error?.message) return obj.error.message;
    const fromDetail = formatFastApiDetail(obj.detail);
    if (fromDetail) return fromDetail;
  }
  return fallback;
}

export async function getNfseSettings(): Promise<NfseSettingsOut> {
  const response = await fetch(apiUrl("/api/v1/nfse/settings"), { headers: headersJson() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível carregar configurações NFS-e."));
  return body as NfseSettingsOut;
}

export async function listNfseTributacaoNacionalCatalog(): Promise<NfseTributacaoNacionalItem[]> {
  const response = await fetch(apiUrl("/api/v1/nfse/tributacao-nacional/catalog"), { headers: headersJson() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível carregar códigos de tributação."));
  return body as NfseTributacaoNacionalItem[];
}

export async function patchNfseSettings(payload: NfseSettingsPatch): Promise<NfseSettingsOut> {
  const response = await fetch(apiUrl("/api/v1/nfse/settings"), {
    method: "PATCH",
    headers: headersJson(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível salvar configurações NFS-e."));
  return body as NfseSettingsOut;
}

export async function testNfseMeiCredentials(payload: NfseMeiTestPayload): Promise<NfseMeiTestOut> {
  const response = await fetch(apiUrl("/api/v1/nfse/settings/test-mei"), {
    method: "POST",
    headers: headersJson(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível testar credenciais MEI."));
  return body as NfseMeiTestOut;
}

export async function listNfseInvoices(params?: {
  status?: NfseInvoiceOut["status"];
  provider?: NfseInvoiceOut["provider"];
  service_order_id?: number;
  search?: string;
  sort?: "nfse_number_desc" | "nfse_number_asc" | "id_desc";
  limit?: number;
}): Promise<NfseInvoiceOut[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status_filter", params.status);
  if (params?.provider) sp.set("provider", params.provider);
  if (params?.service_order_id != null) sp.set("service_order_id", String(params.service_order_id));
  if (params?.search?.trim()) sp.set("search", params.search.trim());
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.limit) sp.set("limit", String(params.limit));
  const suffix = sp.toString() ? `?${sp.toString()}` : "";
  const response = await fetch(apiUrl(`/api/v1/nfse/invoices${suffix}`), { headers: headersJson() });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível listar NFS-e."));
  return body as NfseInvoiceOut[];
}

export async function issueNfse(payload: {
  service_order_id?: number;
  finance_entry_id?: number;
  force_provider?: NfseInvoiceOut["provider"];
  codigo_tributacao_nacional?: string | null;
  codigo_nbs?: string | null;
  client_id?: number;
  amount?: number;
  service_description?: string | null;
}): Promise<NfseInvoiceOut> {
  const response = await fetch(apiUrl("/api/v1/nfse/issue"), {
    method: "POST",
    headers: headersJson(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível emitir NFS-e."));
  return body as NfseInvoiceOut;
}

export async function patchNfseInvoice(
  invoiceId: number,
  payload: { service_order_id?: number; finance_entry_id?: number },
): Promise<NfseInvoiceOut> {
  const response = await fetch(apiUrl(`/api/v1/nfse/invoices/${invoiceId}`), {
    method: "PATCH",
    headers: headersJson(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível atualizar a NFS-e."));
  return body as NfseInvoiceOut;
}

export async function importIssuedNfseXml(payload: {
  client_id?: number;
  associate_client_id?: number;
  auto_create_client_if_missing?: boolean;
  service_order_id?: number;
  finance_entry_id?: number;
  provider?: NfseInvoiceOut["provider"];
  xml_content: string;
  amount?: number;
}): Promise<NfseInvoiceOut> {
  const response = await fetch(apiUrl("/api/v1/nfse/import-issued-xml"), {
    method: "POST",
    headers: headersJson(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível importar XML da NFS-e."));
  return body as NfseInvoiceOut;
}

export async function reparseNfseInvoiceFromXml(invoiceId: number): Promise<NfseInvoiceOut> {
  const response = await fetch(apiUrl(`/api/v1/nfse/invoices/${invoiceId}/reparse-xml`), {
    method: "POST",
    headers: headersJson(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível reprocessar o XML desta NFS-e."));
  return body as NfseInvoiceOut;
}

/** Consulta o ADN (GET /dps) para sincronizar nota Nacional MEI ainda em Pendente envio. */
export async function refreshNfseInvoiceFromAdn(invoiceId: number): Promise<NfseInvoiceOut> {
  const response = await fetch(apiUrl(`/api/v1/nfse/invoices/${invoiceId}/refresh-adn`), {
    method: "POST",
    headers: headersJson(),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível consultar o ADN para esta NFS-e."));
  return body as NfseInvoiceOut;
}

export async function importIssuedNfseXmlBatch(payload: {
  client_id?: number;
  associate_client_id?: number;
  auto_create_client_if_missing?: boolean;
  service_order_id?: number;
  finance_entry_id?: number;
  provider?: NfseInvoiceOut["provider"];
  xml_items: string[];
  file_names?: string[];
  amount?: number;
}): Promise<NfseImportXmlBatchOut> {
  const response = await fetch(apiUrl("/api/v1/nfse/import-issued-xml/batch"), {
    method: "POST",
    headers: headersJson(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errMsg(body, "Não foi possível importar lote de XML."));
  return body as NfseImportXmlBatchOut;
}
