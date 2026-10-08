import type { UserOut } from "../api/auth";

const DEFAULT_PLATFORM_EMAIL = "contato@climaris.com.br";

function resolvePlatformOperatorEmail(): string {
  const raw = import.meta.env.VITE_PLATFORM_OPERATOR_EMAIL;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().toLowerCase();
  }
  return DEFAULT_PLATFORM_EMAIL;
}

/** Contato institucional e fallback de roteamento (alinhe com `PLATFORM_OPERATOR_EMAIL` na API). */
export const PLATFORM_ADMIN_EMAIL = resolvePlatformOperatorEmail();

/** Compatível com API antiga: preferir `user.is_platform_operator` vindo do backend. */
export function isPlatformOperatorUser(user: Pick<UserOut, "email" | "is_platform_operator">): boolean {
  if (user.is_platform_operator === true) return true;
  return user.email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;
}

/** Só e-mail (ex.: antes do `fetchCurrentUser` no login). */
export function isPlatformAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;
}
