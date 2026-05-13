import { tryRefreshAccessToken } from "../api/auth";

/** Renovação periódica do JWT quando há refresh token (ex.: app aberto no celular). */
export function startSessionRefreshTimer(): () => void {
  const id = window.setInterval(() => {
    void tryRefreshAccessToken();
  }, 60_000);
  return () => window.clearInterval(id);
}
