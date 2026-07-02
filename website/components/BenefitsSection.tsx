import { Calendar, FileText, Wallet, Wrench } from "lucide-react";
import { benefits } from "@/lib/site-config";

const icons = [Calendar, Wrench, FileText, Wallet] as const;

export function BenefitsSection() {
  return (
    <section className="border-y border-border bg-surface-elevated" aria-labelledby="beneficios-title">
      <div className="section-container py-16 lg:py-20">
        <div className="mb-10 max-w-2xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Por que o Climaris
          </p>
          <h2 id="beneficios-title" className="mb-3 text-3xl font-bold tracking-tight text-text">
            Aumente a produtividade da equipe de campo e a rentabilidade dos contratos
          </h2>
          <p className="text-text-muted">
            Software B2B pensado para empresas de climatização que precisam crescer com controle
            operacional e financeiro.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((item, index) => {
            const Icon = icons[index] ?? Calendar;
            return (
              <article
                key={item.title}
                className="rounded-card border border-border bg-surface p-5 shadow-card"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="mb-2 text-base font-semibold text-text">{item.title}</h3>
                <p className="text-sm leading-relaxed text-text-muted">{item.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
