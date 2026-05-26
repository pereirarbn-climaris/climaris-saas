/** Toast leve (sem dependência externa) — use `<ToastHost />` na página (canto superior direito). */

export type ToastPayload = { kind: "ok" | "err"; text: string };

type ToastListener = (payload: ToastPayload) => void;

let listener: ToastListener | null = null;

export function subscribeToast(fn: ToastListener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

function emit(kind: ToastPayload["kind"], text: string) {
  const payload = { kind, text };
  if (kind === "err") {
    console.error("[toast]", text);
  } else {
    console.log("[toast]", text);
  }
  listener?.(payload);
}

export const toast = {
  error: (text: string) => emit("err", text),
  success: (text: string) => emit("ok", text),
};
