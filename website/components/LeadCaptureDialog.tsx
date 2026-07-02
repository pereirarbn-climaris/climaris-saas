"use client";



import { FormEvent, useEffect, useId, useRef, useState } from "react";

import { CheckCircle2, Loader2, X } from "lucide-react";

import type { LeadModalOptions } from "@/context/LeadModalContext";

import { DemoBookingCalendar } from "@/components/DemoBookingCalendar";

import { LgpdConsentField } from "@/components/LgpdConsentField";

import { submitDemoAppointment } from "@/lib/api";

import { cta } from "@/lib/site-config";



type FormState = "idle" | "loading" | "success" | "error";



type Props = {

  open: boolean;

  onOpenChange: (open: boolean) => void;

  options: LeadModalOptions;

};



export function LeadCaptureDialog({ open, onOpenChange, options }: Props) {

  const titleId = useId();

  const dialogRef = useRef<HTMLDialogElement>(null);

  const [state, setState] = useState<FormState>("idle");

  const [error, setError] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [scheduledAt, setScheduledAt] = useState<string | null>(null);

  const [lgpdConsent, setLgpdConsent] = useState(false);



  const isPlan = options.intent === "plan" && Boolean(options.planKey);

  const title = isPlan ? "Escolher plano" : cta.primary;

  const subtitle = isPlan

    ? `Você selecionou o plano ${options.planLabel ?? options.planKey}. Preencha seus dados.`

    : "Escolha um horário e informe seus dados para a demonstração.";



  useEffect(() => {

    const dialog = dialogRef.current;

    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();

    if (!open && dialog.open) dialog.close();

  }, [open]);



  useEffect(() => {

    if (!open) {

      setState("idle");

      setError(null);

      setSuccessMessage(null);

      setScheduledAt(null);

      setLgpdConsent(false);

    }

  }, [open]);



  async function handleSubmit(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    setState("loading");

    setError(null);



    const form = event.currentTarget;

    const data = new FormData(form);



    if (!scheduledAt) {

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
      setSuccessMessage("Demonstração agendada com sucesso! Você receberá a confirmação por e-mail e WhatsApp.");
      setState("success");
      form.reset();
      return;
    }

    try {

      const result = await submitDemoAppointment({

        name: String(data.get("name") ?? ""),

        email: String(data.get("email") ?? ""),

        phone: String(data.get("phone") ?? "") || undefined,

        selected_plan: options.planLabel ?? options.planKey ?? undefined,

        scheduled_at: scheduledAt,

        lgpd_consent: true,

      });

      setSuccessMessage(result.message);

      setState("success");

      form.reset();

    } catch (err) {

      setState("error");

      setError(err instanceof Error ? err.message : "Erro ao enviar formulário.");

    }

  }



  return (

    <dialog

      ref={dialogRef}

      className="max-h-[calc(100dvh-1.5rem)] w-[min(100%,26rem)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-card border border-border bg-surface-elevated p-0 shadow-card-hover backdrop:bg-slate-900/50 sm:w-[min(100%,28rem)]"

      aria-labelledby={titleId}

      onClose={() => onOpenChange(false)}

    >

      <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">

        <div className="flex items-start justify-between gap-3">

          <div className="min-w-0">

            <h2 id={titleId} className="text-base font-semibold text-text sm:text-lg">

              {title}

            </h2>

            <p className="mt-0.5 text-xs text-text-muted sm:text-sm">{subtitle}</p>

          </div>

          <button

            type="button"

            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn border border-border text-text-muted hover:text-text"

            aria-label="Fechar"

            onClick={() => onOpenChange(false)}

          >

            <X className="h-4 w-4" />

          </button>

        </div>

      </div>



      {state === "success" ? (

        <div className="px-4 py-6 text-center sm:px-5">

          <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-success" aria-hidden />

          <h3 className="mb-2 text-lg font-semibold text-text">Solicitação enviada!</h3>

          <p className="text-sm text-text-muted">{successMessage}</p>

          <button type="button" className="btn-outline mt-5" onClick={() => onOpenChange(false)}>

            Fechar

          </button>

        </div>

      ) : (

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">

            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>

              <input name="hp_trap" type="text" tabIndex={-1} autoComplete="off" />

            </div>



            {isPlan ? (

              <div className="mb-3 rounded-btn border border-primary/15 bg-primary/5 px-3 py-2 text-xs sm:text-sm">

                <span className="text-text-muted">Plano selecionado: </span>

                <span className="font-semibold text-primary">{options.planLabel ?? options.planKey}</span>

              </div>

            ) : null}



            <div className="mb-3 grid gap-2.5 sm:grid-cols-2">

              <div className="sm:col-span-2">

                <label htmlFor="lead-name" className="mb-0.5 block text-xs font-medium text-text">

                  Nome *

                </label>

                <input

                  id="lead-name"

                  name="name"

                  className="input-field min-h-10 py-2 text-sm"

                  required

                  minLength={2}

                  maxLength={120}

                />

              </div>



              <div>

                <label htmlFor="lead-email" className="mb-0.5 block text-xs font-medium text-text">

                  E-mail *

                </label>

                <input

                  id="lead-email"

                  name="email"

                  type="email"

                  className="input-field min-h-10 py-2 text-sm"

                  required

                />

              </div>



              <div>

                <label htmlFor="lead-phone" className="mb-0.5 block text-xs font-medium text-text">

                  Telefone / WhatsApp *

                </label>

                <input

                  id="lead-phone"

                  name="phone"

                  type="tel"

                  className="input-field min-h-10 py-2 text-sm"

                  required

                  minLength={8}

                  maxLength={32}

                  placeholder="(16) 99999-9999"

                />

              </div>

            </div>



            <DemoBookingCalendar value={scheduledAt} onChange={setScheduledAt} compact />

            <div className="mt-3">

              <LgpdConsentField id="lead-dialog-lgpd" checked={lgpdConsent} onChange={setLgpdConsent} compact />

            </div>

          </div>



          <div className="shrink-0 border-t border-border bg-surface-elevated px-4 py-3 sm:px-5">

            {error ? (

              <p

                className="mb-2 rounded-btn border border-error/20 bg-error/5 px-3 py-2 text-xs text-error sm:text-sm"

                role="alert"

              >

                {error}

              </p>

            ) : null}



            <button

              type="submit"

              className="btn-solid w-full min-h-10 py-2.5 text-sm"

              disabled={state === "loading" || !scheduledAt || !lgpdConsent}

            >

              {state === "loading" ? (

                <>

                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />

                  Enviando...

                </>

              ) : isPlan ? (

                "Confirmar interesse no plano"

              ) : (

                cta.primary

              )}

            </button>

          </div>

        </form>

      )}

    </dialog>

  );

}

