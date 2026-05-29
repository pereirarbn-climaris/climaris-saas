import { apiUrl } from '../lib/apiUrl';
import { getAccessToken } from '../lib/authStorage';

/** Erro HTTP tipado — usado pelo adaptador financeiro e demais serviços. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  json?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
  errFallback?: string;
};

function bearer(json = false): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new ApiError('Sessão expirada.', 401);
  return json
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { Authorization: `Bearer ${token}` };
}

export function parseApiErrorBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: { message?: string }; detail?: unknown };
    if (o.error?.message) return o.error.message;
    if (typeof o.detail === 'string' && o.detail.trim()) return o.detail;
    if (Array.isArray(o.detail) && o.detail.length) {
      const parts = o.detail
        .map((x) =>
          typeof x === 'object' && x && 'msg' in x ? String((x as { msg?: string }).msg) : String(x),
        )
        .filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
  }
  return fallback;
}

function defaultMessageForStatus(status: number, fallback: string): string {
  if (status === 401) return 'Sessão expirada ou credenciais inválidas. Faça login novamente.';
  if (status === 403) return 'Sem permissão para esta ação no seu plano ou perfil.';
  if (status === 404) return 'Recurso não encontrado.';
  if (status === 400 || status === 422) return fallback || 'Requisição inválida.';
  return fallback || `Erro HTTP ${status}.`;
}

/**
 * Cliente HTTP central do frontend.
 * Lança `ApiError` com status quando response.ok === false.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const sp = new URLSearchParams();
  if (options.searchParams) {
    for (const [k, v] of Object.entries(options.searchParams)) {
      if (v === undefined || v === null) continue;
      sp.set(k, String(v));
    }
  }
  const qs = sp.toString();
  const url = apiUrl(qs ? `${path}?${qs}` : path);
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: bearer(options.json !== undefined),
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });

  const rawText = await response.text();
  let body: unknown = {};
  try {
    if (rawText.trim()) body = JSON.parse(rawText) as unknown;
  } catch {
    body = { _raw: rawText.slice(0, 300) };
  }

  if (!response.ok) {
    const fallback = options.errFallback ?? 'Falha na requisição.';
    const fromBody = parseApiErrorBody(body, '');
    const message = fromBody || defaultMessageForStatus(response.status, fallback);
    throw new ApiError(message, response.status, body);
  }

  return body as T;
}
