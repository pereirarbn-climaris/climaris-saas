const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let googleScriptPromise: Promise<void> | null = null;
let runtimeGoogleClientId: string | null = null;

type GoogleCredentialResponse = { credential?: string };

function loadGoogleScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google disponível apenas no navegador."));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar Google Identity.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar Google Identity."));
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

export function getGoogleClientId(): string {
  if (runtimeGoogleClientId && runtimeGoogleClientId.trim()) return runtimeGoogleClientId.trim();
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
}

export function setGoogleClientIdRuntime(clientId: string | null | undefined): void {
  const normalized = String(clientId ?? "").trim();
  runtimeGoogleClientId = normalized || null;
}

export function isGoogleAuthEnabled(): boolean {
  return getGoogleClientId().length > 0;
}

export async function renderGoogleButton(
  target: HTMLElement,
  opts: {
    text: "continue_with" | "signup_with" | "signin_with";
    onCredential: (idToken: string) => void;
  }
): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error("Google login não configurado (VITE_GOOGLE_CLIENT_ID).");
  await loadGoogleScript();
  if (!window.google?.accounts?.id) throw new Error("Google Identity indisponível no navegador.");

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response: GoogleCredentialResponse) => {
      const token = String(response.credential ?? "").trim();
      if (token) opts.onCredential(token);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  target.innerHTML = "";
  window.google.accounts.id.renderButton(target, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: opts.text,
    shape: "pill",
    width: Math.max(260, Math.min(380, target.clientWidth || 320)),
    logo_alignment: "left",
    locale: "pt-BR",
  });
}
