import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type PlatformApiCredentialOut = {
  id: number;
  provider_slug: string;
  display_name: string;
  api_base_url: string | null;
  has_api_key: boolean;
  api_key_preview: string | null;
  has_aws_access_key_id: boolean;
  aws_access_key_id_preview: string | null;
  has_aws_secret_access_key: boolean;
  aws_secret_access_key_preview: string | null;
  aws_keys_updated_at: string | null;
  extra_config: Record<string, unknown> | null;
  key_updated_at: string | null;
  updated_at: string;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body && typeof (body as { detail: unknown }).detail === "string") {
    return (body as { detail: string }).detail;
  }
  return fallback;
}

export async function listPlatformApiCredentials(): Promise<PlatformApiCredentialOut[]> {
  const response = await fetch(apiUrl("/api/v1/platform/api-credentials"), {
    headers: authHeaders(),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível carregar credenciais."));
  return body as PlatformApiCredentialOut[];
}

export async function upsertPlatformApiCredential(
  providerSlug: string,
  payload: {
    display_name: string;
    api_key?: string;
    api_base_url?: string;
    aws_access_key_id?: string;
    aws_secret_access_key?: string;
    extra_config?: Record<string, unknown>;
    clear_api_key?: boolean;
    clear_aws_keys?: boolean;
  },
): Promise<PlatformApiCredentialOut> {
  const response = await fetch(apiUrl(`/api/v1/platform/api-credentials/${providerSlug}`), {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível salvar a credencial."));
  return body as PlatformApiCredentialOut;
}
