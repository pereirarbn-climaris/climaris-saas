"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { DemoBookingCalendar } from "@/components/DemoBookingCalendar";
import { LgpdConsentField } from "@/components/LgpdConsentField";
import { submitDemoAppointment, submitLead } from "@/lib/api";
import { cta, demoSchedulingEnabled, publicCtaLabel, technicianTeamOptions } from "@/lib/site-config";

type FormState = "idle" | "loading" | "success" | "error";

type Props = {
  onSuccess?: () => void;
  compact?: boolean;
  submitLabel?: string;
};

export function LeadForm({
  onSuccess,
  compact = false,
  submitLabel = publicCtaLabel(),
}: Props) {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [lgpdConsent, setLgpdConsent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);

    if (demoSchedulingEnabled && !scheduledAt) {
      setState("error");
      setError("Selecione um horário para a demonstração.");
      return;
    }

    if (!lgpdConsent) {
      setState("error");
      setError("É necessário aceitar a Política de Privacidade e o tratamento de dados conforme a LGPD.");
      return;
    }

    if (String(data.get("hp_trap") ?? "").trim()) {
      setSuccessMessage(
        demoSchedulingEnabled
          ? "Demonstração agendada com sucesso! Você receberá a confirmação por e-mail e WhatsApp."
          : cta.leadSuccess,
      );
      setState("success");
      form.reset();
      setScheduledAt(null);
      return;
    }

    try {
      const base = {
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? "") || undefined,
        company: String(data.get("company") ?? "") || undefined,
        job_title: String(data.get("job_title") ?? "") || undefined,
        technicians_count: String(data.get("technicians_count") ?? "") || undefined,
        lgpd_consent: true as const,
      };

      if (demoSchedulingEnabled) {
        const result = await submitDemoAppointment({
          ...base,
          scheduled_at: scheduledAt!,
        });
        setSuccessMessage(result.message);
      } else {
        const result = await submitLead(base);
        setSuccessMessage(result.message || cta.leadSuccess);
      }

      setState("success");
      form.reset();
      setScheduledAt(null);
      onSuccess?.();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Erro ao enviar formulário.");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-card border border-success/20 bg-success/5 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-success" aria-hidden />
        <h3 className="mb-2 text-xl font-semibold text-text">Solicitação enviada!</h3>
        <p className="text-sm text-text-muted">{successMessage}</p>
        <button
          type="button"
          className="btn-outline mt-6"
          onClick={() => {
            setState("idle");
            setSuccessMessage(null);
            setScheduledAt(null);
          }}
        >
          Enviar outra solicitação
        </button>
      </div>
    );
  }

  const submitDisabled =
    state === "loading" || !lgpdConsent || (demoSchedulingEnabled && !scheduledAt);

  return (
    <form onSubmit={handleSubmit} className={compact ? "space-y-4" : "space-y-5"} noValidate>
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <input name="hp_trap" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className={`grid gap-5 ${compact ? "" : "sm:grid-cols-2"}`}>
        <div>
          <label htmlFor="name" className="label-field">
            Nome do interessado *
          </label>
          <input id="name" name="name" className="input-field" required minLength={2} maxLength={120} />
        </div>
        <div>
          <label htmlFor="job_title" className="label-field">
            Cargo do interessado *
          </label>
          <input
            id="job_title"
            name="job_title"
            className="input-field"
            required
            maxLength={80}
            placeholder="Ex.: Sócio, Gerente operacional"
          />
        </div>
      </div>

      <div className={`grid gap-5 ${compact ? "" : "sm:grid-cols-2"}`}>
        <div>
          <label htmlFor="company" className="label-field">
            Nome da empresa *
          </label>
          <input id="company" name="company" className="input-field" required maxLength={160} />
        </div>
        <div>
          <label htmlFor="technicians_count" className="label-field">
            Número de técnicos na equipe *
          </label>
          <select id="technicians_count" name="technicians_count" className="input-field" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {technicianTeamOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`grid gap-5 ${compact ? "" : "sm:grid-cols-2"}`}>
        <div>
          <label htmlFor="email" className="label-field">
            E-mail corporativo *
          </label>
          <input id="email" name="email" type="email" className="input-field" required />
        </div>
        <div>
          <label htmlFor="phone" className="label-field">
            WhatsApp *
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="input-field"
            required
            minLength={8}
            maxLength={32}
            placeholder="(16) 99999-9999"
          />
        </div>
      </div>

      {demoSchedulingEnabled ? (
        <DemoBookingCalendar value={scheduledAt} onChange={setScheduledAt} />
      ) : null}

      <LgpdConsentField checked={lgpdConsent} onChange={setLgpdConsent} />

      {error ? (
        <p className="rounded-btn border border-error/20 bg-error/5 px-4 py-3 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitDisabled}>
        {state === "loading" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Enviando...
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}
