/** Extrai mensagem legível da API (vários formatos FastAPI / nginx / legado). */
export function apiErrorMessage(body: unknown, fallback: string, response?: Response): string {
  if (body && typeof body === "object") {
    const o = body as {
      error?: { message?: unknown; details?: unknown };
      detail?: unknown;
      message?: unknown;
      _raw?: string;
    };
    const details = o.error?.details;
    if (Array.isArray(details) && details.length > 0) {
      const fieldMsgs = details
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          const msg = (item as { msg?: unknown }).msg;
          return typeof msg === "string" ? msg : "";
        })
        .filter(Boolean);
      if (fieldMsgs.length > 0) return fieldMsgs.join("; ");
    }
    const fromError = o.error?.message;
    if (fromError != null && fromError !== "") {
      if (typeof fromError === "string" && fromError !== "Validation error.") return fromError;
      if (typeof fromError === "string") return fallback;
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

/** Gera slug de plano SaaS (espelha validação backend: `^[a-z0-9_\-]+$`). */
export function slugifyPlanKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 80);
}

const PLAN_KEY_RE = /^[a-z0-9_-]+$/;

export function normalizePlanKeyInput(raw: string): string {
  return slugifyPlanKey(raw);
}

export function isValidPlanKey(raw: string): boolean {
  const key = raw.trim();
  return key.length > 0 && key.length <= 80 && PLAN_KEY_RE.test(key);
}
