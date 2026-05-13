/** Lê `exp` do JWT (payload) sem validar assinatura — só para renovação proativa no cliente. */

export function jwtExpiresAtMs(accessToken: string): number | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
    const json = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True se o access token expira antes de `now + skewMs` ou não dá para ler `exp`. */
export function accessTokenNeedsRefresh(accessToken: string | null, skewMs: number): boolean {
  if (!accessToken) return true;
  const exp = jwtExpiresAtMs(accessToken);
  if (exp == null) return true;
  return exp < Date.now() + skewMs;
}
