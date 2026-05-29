/** Toast leve (sem dependência externa) — use `<ToastHost />` no layout ou na página. */

export type ToastPayload = { kind: "ok" | "err"; text: string };

type ToastListener = (payload: ToastPayload) => void;

let listener: ToastListener | null = null;
/** Mantém o último toast entre trocas de rota (ex.: cadastrar → editar). */
let pending: ToastPayload | null = null;

export function subscribeToast(fn: ToastListener): () => void {
  listener = fn;
  if (pending) {
    fn(pending);
  }
  return () => {
    if (listener === fn) listener = null;
  };
}

export function clearPendingToast() {
  pending = null;
}

function emit(kind: ToastPayload["kind"], text: string) {
  const payload = { kind, text };
  if (kind === "err") {
    console.error("[toast]", text);
  } else {
    console.log("[toast]", text);
  }
  pending = payload;
  listener?.(payload);
}

export const toast = {
  error: (text: string) => emit("err", text),
  success: (text: string) => emit("ok", text),
};
