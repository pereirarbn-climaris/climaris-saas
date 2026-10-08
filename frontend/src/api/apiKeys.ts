import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type TenantApiKeyOut = {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

export type TenantApiKeyCreated = TenantApiKeyOut & {
  api_key: string;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export async function listTenantApiKeys(params?: { skip?: number; limit?: number }): Promise<TenantApiKeyOut[]> {
  const sp = new URLSearchParams();
  if (params?.skip != null) sp.set("skip", String(params.skip));
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  const response = await fetch(apiUrl(`/api/v1/api-keys${q ? `?${q}` : ""}`), { headers: authHeaders() });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body && "detail" in body && typeof (body as { detail: unknown }).detail === "string"
        ? (body as { detail: string }).detail
        : "Não foi possível listar as chaves.",
    );
  }
  return body as TenantApiKeyOut[];
}

export async function createTenantApiKey(payload: { name: string }): Promise<TenantApiKeyCreated> {
  const response = await fetch(apiUrl("/api/v1/api-keys"), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: payload.name.trim() }),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : "Não foi possível criar a chave.";
    throw new Error(msg);
  }
  return body as TenantApiKeyCreated;
}

export async function revokeTenantApiKey(keyId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/api-keys/${keyId}`), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (response.status === 204) return;
  const body: unknown = await response.json().catch(() => ({}));
  throw new Error(
    typeof body === "object" && body && "detail" in body
      ? String((body as { detail: unknown }).detail)
      : "Não foi possível revogar a chave.",
  );
}
