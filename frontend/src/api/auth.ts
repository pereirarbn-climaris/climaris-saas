import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import { isDemoMode, demoUser, demoTenant } from "../lib/demoMode";

export type UserRole = "admin" | "technician" | "receptionist";

export type TenantStatus = "active" | "suspended" | "cancelled";

export type FiscalTaxIdKind = "cnpj" | "cpf";

/** Situação fiscal do tenant na API (`pending` até concluir cadastro). */
export type TaxIdKind = FiscalTaxIdKind | "pending";

export type UserOut = {
  id: number;
  tenant_id: number;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  is_platform_operator: boolean;
  phone: string | null;
  whatsapp: string | null;
};

export type UserProvisionOut = UserOut & { temporary_password: string };

export type WeekdayWorkHours = Record<string, { start: string; end: string }> | null;

export type TenantOut = {
  id: number;
  name: string;
  cnpj: string;
  tax_id_kind: TaxIdKind;
  tax_document: string;
  active_plan: string;
  finance_enabled: boolean;
  finance_mode: "basic" | "intermediate" | "management";
  timezone: string;
  business_days: string;
  workday_start: string;
  workday_end: string;
  weekday_work_hours: WeekdayWorkHours;
  block_national_holidays: boolean;
  status: TenantStatus;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal_code: string | null;
  address_country: string;
  address_ibge_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  whatsapp_instance_name: string | null;
  whatsapp_connection_status: string | null;
  whatsapp_connected_at: string | null;
  logo_s3_key: string | null;
  logo_url: string | null;
  logo_content_type: string | null;
  logo_updated_at: string | null;
  pdf_primary_color: string;
  registration_complete?: boolean;
};

export type TokenResponse = {
  access_token: string;
  token_type?: string;
  must_change_password: boolean;
  tenant_id: number;
  is_platform_operator: boolean;
  two_factor_required?: boolean;
  two_factor_token?: string | null;
  captcha_required?: boolean;
  captcha_token?: string | null;
  captcha_question?: string | null;
};

function isLoginDemoEnabled(): boolean {
  return String(import.meta.env.VITE_LOGIN_DEMO_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

function createDemoTokenResponse(): TokenResponse {
  return {
    access_token: "demo-access-token",
    token_type: "bearer",
    must_change_password: false,
    tenant_id: 1,
    is_platform_operator: false,
  };
}

export type TenantAdminPatch = {
  name?: string;
  active_plan?: string;
  finance_enabled?: boolean;
  finance_mode?: "basic" | "intermediate" | "management";
  timezone?: string;
  business_days?: string;
  workday_start?: string;
  workday_end?: string;
  weekday_work_hours?: Record<string, { start: string; end: string }>;
  block_national_holidays?: boolean;
  status?: TenantStatus;
  tax_id_kind?: FiscalTaxIdKind;
  tax_document?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_district?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  address_country?: string;
  address_ibge_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  pdf_primary_color?: string;
};

export type UserSelfPatch = {
  full_name?: string;
  email?: string;
  phone?: string | null;
  whatsapp?: string | null;
};

export type UserAdminPatch = {
  full_name?: string;
  email?: string;
  role?: UserRole;
  is_active?: boolean;
  phone?: string | null;
  whatsapp?: string | null;
};

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

/** Extrai mensagem legível da API (vários formatos FastAPI / nginx / legado). */
function errorMessage(body: unknown, fallback: string, response?: Response): string {
  if (body && typeof body === "object") {
    const o = body as {
      error?: { message?: unknown };
      detail?: unknown;
      message?: unknown;
      _raw?: string;
    };
    const fromError = o.error?.message;
    if (fromError != null && fromError !== "") {
      if (typeof fromError === "string") return fromError;
      if (Array.isArray(fromError)) {
        const joined = fromError
          .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
          .filter(Boolean)
          .join("; ");
        if (joined) return joined;
      }
      if (typeof fromError === "object") {
        const s = JSON.stringify(fromError);
        if (s && s !== "{}") return s;
      }
    }
    const topMsg = o.message;
    if (typeof topMsg === "string" && topMsg) return topMsg;
    const d = o.detail;
    if (typeof d === "string" && d) return d;
    if (Array.isArray(d)) {
      const first = d[0] as { msg?: string } | undefined;
      if (first && typeof first.msg === "string") return first.msg;
    }
    if (typeof o._raw === "string" && o._raw.trim()) {
      try {
        const inner = JSON.parse(o._raw) as { error?: { message?: string }; detail?: string };
        if (typeof inner?.error?.message === "string" && inner.error.message) return inner.error.message;
        if (typeof inner?.detail === "string" && inner.detail) return inner.detail;
      } catch {
        if (!o._raw.includes("<html")) return o._raw.trim();
      }
    }
  }
  if (response) {
    const st = response.status;
    if (st >= 400) return `${fallback} (HTTP ${st})`;
  }
  return fallback;
}

/** Mensagens da API em inglês ou técnicas → texto amigável em PT-BR no login. */
function mapLoginErrorToPt(raw: string): string {
  const t = raw.trim();
  const table: Record<string, string> = {
    "Invalid email or password.": "E-mail ou senha incorretos.",
    "Invalid credentials.": "E-mail ou senha incorretos.",
    "User is inactive.": "Conta inativa. Entre em contato com o administrador.",
    "Rate limit exceeded.": "Muitas tentativas seguidas. Aguarde um minuto e tente novamente.",
    "Validation error.": "Dados inválidos. Verifique e-mail e senha.",
  };
  if (table[t]) return table[t];
  if (t.includes("E-mail ainda não confirmado")) return t;
  if (t.includes("Acesso temporariamente bloqueado")) return t;
  if (t.includes("Muitas tentativas neste dispositivo")) return t;
  if (t.includes("Este e-mail está em mais de uma empresa")) return t;
  if (t.includes("Não foi possível enviar o código de verificação por e-mail")) return t;
  if (/^internal server error$/i.test(t) || t.includes('"detail":"Internal Server Error"'))
    return (
      "Erro interno no servidor. Atualize a página (Ctrl+F5). " +
      "No servidor: reinicie a API, execute `alembic upgrade head` no container da API e confira os logs."
    );
  return raw;
}

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(): HeadersInit {
  return { ...bearer(), "Content-Type": "application/json" };
}

export type TrustedDeviceOut = {
  id: number;
  expires_at: string;
  created_at: string;
  last_used_at: string | null;
  is_current_browser: boolean;
};

export async function loginRequest(payload: {
  email: string;
  password: string;
  tenant_id?: number;
  captcha_token?: string;
  captcha_answer?: string;
  two_factor_token?: string;
  two_factor_code?: string;
  trust_this_device?: boolean;
}): Promise<TokenResponse> {
  try {
    const response = await fetch(apiUrl("/api/v1/auth/login"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await parseBody(response);
    if (!response.ok) {
      throw new Error(mapLoginErrorToPt(errorMessage(body, "Não foi possível entrar.", response)));
    }
    const data = body as TokenResponse;
    if (
      !data.access_token &&
      !data.captcha_required &&
      !data.two_factor_required
    ) {
      throw new Error(
        "Resposta inválida do servidor ao entrar. Atualize a página (Ctrl+F5) e tente de novo. Se persistir, avise o suporte."
      );
    }
    return data;
  } catch (err) {
    // Em ambientes de preview/edicao sem backend acessivel, permite navegar no front.
    if (isLoginDemoEnabled()) {
      return createDemoTokenResponse();
    }
    throw err;
  }
}

export async function registerRequest(payload: {
  tenant_name: string;
  full_name: string;
  email: string;
  password: string;
  phone?: string | null;
  whatsapp?: string | null;
  tax_document?: string | null;
  tax_id_kind?: "cnpj" | "cpf";
  active_plan?: string;
  timezone?: string;
  business_days?: number[];
}): Promise<TenantOut> {
  const response = await fetch(apiUrl("/api/v1/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível criar a conta."));
  }
  return body as TenantOut;
}

export async function verifyEmailRequest(token: string): Promise<{ message: string }> {
  const response = await fetch(apiUrl("/api/v1/auth/verify-email"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.trim() }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível confirmar o e-mail."));
  }
  return body as { message: string };
}

export async function resendVerificationEmailRequest(email: string | { email: string }): Promise<{ message: string }> {
  const payload = typeof email === "string" ? { email: email.trim().toLowerCase() } : email;
  const response = await fetch(apiUrl("/api/v1/auth/resend-verification-email"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível reenviar o e-mail."));
  }
  return body as { message: string };
}

export async function forgotPasswordRequest(email: string): Promise<{ message: string }> {
  const response = await fetch(apiUrl("/api/v1/auth/forgot-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível enviar o e-mail de recuperação."));
  }
  return body as { message: string };
}

export async function resetPasswordRequest(token: string, newPassword: string): Promise<{ message: string }> {
  const response = await fetch(apiUrl("/api/v1/auth/reset-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.trim(), new_password: newPassword }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível redefinir a senha."));
  }
  return body as { message: string };
}

export async function fetchCurrentUser(): Promise<UserOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoUser);
  }
  const response = await fetch(apiUrl("/api/v1/auth/me"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar o usuário."));
  }
  return body as UserOut;
}

export async function patchCurrentUser(payload: UserSelfPatch): Promise<UserOut> {
  const response = await fetch(apiUrl("/api/v1/auth/me"), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar o perfil."));
  }
  return body as UserOut;
}

export async function fetchCurrentTenant(): Promise<TenantOut> {
  if (isDemoMode()) {
    return Promise.resolve(demoTenant);
  }
  const response = await fetch(apiUrl("/api/v1/auth/me/tenant"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível carregar a empresa."));
  }
  return body as TenantOut;
}

export async function completeTenantFiscal(payload: { tax_id_kind: FiscalTaxIdKind; tax_document: string }): Promise<TenantOut> {
  const response = await fetch(apiUrl("/api/v1/auth/me/tenant/fiscal"), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível concluir o cadastro fiscal."));
  }
  return body as TenantOut;
}

export async function patchTenantAdmin(payload: TenantAdminPatch): Promise<TenantOut> {
  const response = await fetch(apiUrl("/api/v1/auth/me/tenant"), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar os dados da empresa."));
  }
  return body as TenantOut;
}

export async function getTenantLogoSignedUrl(): Promise<string> {
  const response = await fetch(apiUrl("/api/v1/auth/me/tenant/logo-url"), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível obter o link do logo."));
  }
  const url = (body as { url?: string }).url;
  if (typeof url !== "string" || !url) {
    throw new Error("Resposta inválida do servidor.");
  }
  return url;
}

export async function uploadTenantLogo(file: File): Promise<TenantOut> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.set("file", file);
  const response = await fetch(apiUrl("/api/v1/auth/me/tenant/logo"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível enviar o logo."));
  }
  return body as TenantOut;
}

export async function deleteTenantLogo(): Promise<TenantOut> {
  const response = await fetch(apiUrl("/api/v1/auth/me/tenant/logo"), {
    method: "DELETE",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível excluir o logo."));
  }
  return body as TenantOut;
}

export async function syncTenantNationalHolidays(): Promise<{ inserted: number; block_national_holidays: boolean }> {
  const response = await fetch(apiUrl("/api/v1/auth/me/tenant/sync-national-holidays"), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível sincronizar feriados."));
  }
  return body as { inserted: number; block_national_holidays: boolean };
}

export async function changeMyPassword(payload: { current_password: string; new_password: string }): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/auth/me/change-password"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (response.status === 204) return;
  const body = await parseBody(response);
  throw new Error(errorMessage(body, "Não foi possível alterar a senha."));
}

export async function createTenantUser(payload: {
  tenant_id: number;
  full_name: string;
  email: string;
  role?: UserRole;
}): Promise<UserProvisionOut> {
  const response = await fetch(apiUrl("/api/v1/auth/users"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível criar o usuário."));
  }
  return body as UserProvisionOut;
}

export async function listTenantUsers(params?: { skip?: number; limit?: number }): Promise<UserOut[]> {
  const skip = params?.skip ?? 0;
  const limit = params?.limit ?? 100;
  const sp = new URLSearchParams();
  sp.set("skip", String(skip));
  sp.set("limit", String(limit));
  const response = await fetch(apiUrl(`/api/v1/auth/users?${sp.toString()}`), { headers: bearer() });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível listar usuários."));
  }
  return body as UserOut[];
}

export async function updateTenantUser(userId: number, payload: UserAdminPatch): Promise<UserOut> {
  const response = await fetch(apiUrl(`/api/v1/auth/users/${userId}`), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível salvar o usuário."));
  }
  return body as UserOut;
}

export async function resetTenantUserPassword(userId: number): Promise<UserProvisionOut> {
  const response = await fetch(apiUrl(`/api/v1/auth/users/${userId}/reset-password`), {
    method: "POST",
    headers: bearer(),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, "Não foi possível redefinir a senha."));
  }
  return body as UserProvisionOut;
}

export async function listTrustedDevices(): Promise<TrustedDeviceOut[]> {
  const response = await fetch(apiUrl("/api/v1/auth/me/trusted-devices"), {
    headers: bearer(),
    credentials: "include",
  });
  const body = await parseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Não foi possível listar dispositivos confiáveis."));
  return body as TrustedDeviceOut[];
}

export async function deleteTrustedDevice(deviceId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/auth/me/trusted-devices/${deviceId}`), {
    method: "DELETE",
    headers: bearer(),
    credentials: "include",
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errorMessage(body, "Não foi possível revogar o dispositivo."));
  }
}

export async function deleteAllTrustedDevices(): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/auth/me/trusted-devices"), {
    method: "DELETE",
    headers: bearer(),
    credentials: "include",
  });
  if (!response.ok) {
    const body = await parseBody(response);
    throw new Error(errorMessage(body, "Não foi possível revogar os dispositivos."));
  }
}
