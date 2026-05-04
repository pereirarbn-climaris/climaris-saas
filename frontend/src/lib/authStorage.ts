const TOKEN_KEY = "access_token";
const TENANT_ID_KEY = "tenant_id";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Workspace retornado pelo `POST /api/v1/auth/login` (`TokenResponse.tenant_id`). */
export function setTenantId(id: number): void {
  localStorage.setItem(TENANT_ID_KEY, String(id));
}

export function getTenantId(): number | null {
  const v = localStorage.getItem(TENANT_ID_KEY);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TENANT_ID_KEY);
}
