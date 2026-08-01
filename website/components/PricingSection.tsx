"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Gift, Sparkles } from "lucide-react";
import { useLeadModal } from "@/context/LeadModalContext";
import {
  fallbackPlans,
  formatMaxUsers,
  formatPlanPrice,
  isRegisterPlan,
  planComparisonFeatures,
  splitPlans,
  type PublicPlan,
  fetchPublicPlans,
} from "@/lib/plans";
import { cta, demoSchedulingEnabled, freeTrial, publicCtaLabel, registerUrl } from "@/lib/site-config";

function CellValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm font-medium text-text">{value}</span>;
  }
  return value ? (
    <Check className="mx-auto h-5 w-5 text-success" aria-label="Incluído" />
  ) : (
    <span className="text-text-subtle" aria-label="Não incluído">
      —
    </span>
  );
}

function PlanCta({ plan }: { plan: PublicPlan }) {
  if (isRegisterPlan(plan)) {
    return (
      <Link href={registerUrl(plan.plan_key)} className="btn-solid w-full">
        {cta.freeTrial}
      </Link>
    );
  }

  return (
    <Link
      href={registerUrl(plan.plan_key)}
      className={plan.highlighted ? "btn-solid w-full" : "btn-outline w-full"}
    >
      Escolher plano
    </Link>
  );
}

export function PricingSection({ showComparison = true }: { showComparison?: boolean }) {
  const { openLeadModal } = useLeadModal();
  const [plans, setPlans] = useState<PublicPlan[]>(fallbackPlans);

  useEffect(() => {
    void fetchPublicPlans().then(setPlans);
  }, []);

  const { trialPlan, paidPlans } = splitPlans(plans);
  const comparisonPlans = trialPlan ? [trialPlan, ...paidPlans] : paidPlans;

  return (
    <section id="planos" className="border-y border-border bg-surface-elevated scroll-mt-20">
      <div className="section-container py-16 lg:py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">Planos e preços</p>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Comece grátis ou escolha o plano ideal
          </h2>
          <p className="text-lg text-text-muted">
            Valores e nomes sincronizados com o catálogo do Climaris — alterações no painel Operação
            refletem aqui automaticamente.
          </p>
        </div>

        {trialPlan ? (
          <article className="mb-8 rounded-card border-2 border-primary/25 bg-gradient-to-br from-primary/10 via-surface-elevated to-surface-elevated p-6 shadow-card sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
            <div className="mb-6 lg:mb-0 lg:max-w-2xl">
              <span className="badge-popular mb-3 inline-flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5" aria-hidden />
                {freeTrial.label}
              </span>
              <h3 className="text-2xl font-bold text-text">{trialPlan.display_name}</h3>
              <p className="mt-2 text-text-muted">{trialPlan.description}</p>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" aria-hidden />
                  {trialPlan.finance_label}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" aria-hidden />
                  {formatMaxUsers(trialPlan.max_users)}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" aria-hidden />
                  Sem cartão de crédito
                </li>
              </ul>
            </div>
            <div className="shrink-0 text-center lg:text-right">
              <p className="text-4xl font-bold text-primary">{formatPlanPrice(trialPlan)}</p>
              <p className="mb-4 text-sm text-text-muted">
                {trialPlan.trial_days ?? freeTrial.days} dias para testar
              </p>
              <Link href={registerUrl(trialPlan.plan_key)} className="btn-solid inline-flex min-w-[220px]">
                {cta.freeTrial}
              </Link>
            </div>
          </article>
        ) : null}

        {paidPlans.length > 0 ? (
          <div
            className={`grid gap-6 ${
              paidPlans.length === 1
                ? "max-w-md mx-auto"
                : paidPlans.length === 2
                  ? "sm:grid-cols-2"
                  : "lg:grid-cols-3"
            }`}
          >
            {paidPlans.map((plan) => (
              <article
                key={plan.plan_key}
                className={`pricing-card flex flex-col ${plan.highlighted ? "pricing-card-featured" : ""}`}
              >
                {plan.highlighted ? (
                  <span className="badge-popular mb-4 inline-flex w-fit items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Mais popular
                  </span>
                ) : (
                  <span className="mb-4 h-6" aria-hidden />
                )}

                <h3 className="text-xl font-bold text-text">{plan.display_name}</h3>
                <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-text-muted">{plan.description}</p>

                <div className="my-6">
                  <p className="text-3xl font-bold tracking-tight text-text">{formatPlanPrice(plan)}</p>
                  {plan.monthly_price_brl && plan.monthly_price_brl > 0 ? (
                    <p className="text-sm text-text-muted">por mês / workspace</p>
                  ) : null}
                </div>

                <ul className="mb-8 flex-1 space-y-2.5 text-sm text-text-muted">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {plan.finance_label}
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {formatMaxUsers(plan.max_users)}
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    Gestão de OS e PMOC
                  </li>
                </ul>

                <PlanCta plan={plan} />
              </article>
            ))}
          </div>
        ) : null}

        <div className="mt-8 text-center">
          {demoSchedulingEnabled ? (
            <button
              type="button"
              className="text-sm font-semibold text-primary hover:underline"
              onClick={() => openLeadModal({ intent: "demo" })}
            >
              {cta.primary} — comparar planos com um consultor
            </button>
          ) : (
            <Link href="/contato" className="text-sm font-semibold text-primary hover:underline">
              {publicCtaLabel()} — comparar planos com um consultor
            </Link>
          )}
        </div>

        {showComparison && comparisonPlans.length > 0 ? (
          <div className="mt-14 overflow-x-auto rounded-card border border-border bg-surface shadow-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-5 py-4 font-semibold text-text">Recurso</th>
                  {comparisonPlans.map((plan) => (
                    <th
                      key={plan.plan_key}
                      className={`px-5 py-4 text-center font-semibold ${
                        plan.highlighted || plan.is_free_trial ? "text-primary" : "text-text"
                      }`}
                    >
                      {plan.display_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planComparisonFeatures.map((row) => (
                  <tr key={row.feature} className="border-b border-border/80 last:border-0">
                    <td className="px-5 py-3.5 font-medium text-text">{row.feature}</td>
                    {comparisonPlans.map((plan) => (
                      <td
                        key={`${row.feature}-${plan.plan_key}`}
                        className={`px-5 py-3.5 text-center ${
                          plan.highlighted || plan.is_free_trial ? "bg-primary/[0.03]" : ""
                        }`}
                      >
                        <CellValue value={row.valueForPlan(plan)} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-surface-elevated">
                  <td className="px-5 py-4 font-medium text-text">Financeiro</td>
                  {comparisonPlans.map((plan) => (
                    <td
                      key={`finance-${plan.plan_key}`}
                      className={`px-5 py-4 text-center text-sm ${
                        plan.highlighted || plan.is_free_trial
                          ? "bg-primary/[0.03] font-medium text-primary"
                          : "text-text-muted"
                      }`}
                    >
                      {plan.finance_label}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
