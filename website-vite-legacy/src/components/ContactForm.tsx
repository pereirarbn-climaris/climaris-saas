import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitLead } from "../lib/api";

type FormState = "idle" | "loading" | "success" | "error";

export function ContactForm() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const result = await submitLead({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? "") || undefined,
        company: String(data.get("company") ?? "") || undefined,
        message: String(data.get("message") ?? ""),
        website_url: String(data.get("website_url") ?? "") || undefined,
      });
      setSuccessMessage(result.message);
      setState("success");
      form.reset();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Erro ao enviar formulário.");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-card border border-success/20 bg-success/5 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-success" />
        <h3 className="mb-2 text-xl font-semibold text-text">Mensagem enviada!</h3>
        <p className="text-sm text-text-muted">{successMessage}</p>
        <button
          type="button"
          className="btn-outline mt-6"
          onClick={() => {
            setState("idle");
            setSuccessMessage(null);
          }}
        >
          Enviar outra mensagem
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label htmlFor="website_url">Website</label>
        <input id="website_url" name="website_url" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label-field">
            Nome *
          </label>
          <input id="name" name="name" className="input-field" required minLength={2} maxLength={120} />
        </div>
        <div>
          <label htmlFor="email" className="label-field">
            E-mail *
          </label>
          <input id="email" name="email" type="email" className="input-field" required />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="label-field">
            Telefone / WhatsApp
          </label>
          <input id="phone" name="phone" type="tel" className="input-field" maxLength={32} />
        </div>
        <div>
          <label htmlFor="company" className="label-field">
            Empresa
          </label>
          <input id="company" name="company" className="input-field" maxLength={160} />
        </div>
      </div>

      <div>
        <label htmlFor="message" className="label-field">
          Como podemos ajudar? *
        </label>
        <textarea
          id="message"
          name="message"
          className="input-field min-h-[140px] resize-y"
          required
          minLength={10}
          maxLength={2000}
          placeholder="Conte sobre sua operação, número de técnicos, principais desafios..."
        />
      </div>

      {error ? (
        <p className="rounded-btn border border-error/20 bg-error/5 px-4 py-3 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn-outline w-full sm:w-auto" disabled={state === "loading"}>
        {state === "loading" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          "Enviar mensagem"
        )}
      </button>
    </form>
  );
}
