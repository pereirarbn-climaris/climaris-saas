import { ShieldCheck } from "lucide-react";
import { whyClimarisPillars } from "@/lib/features";

export function WhyClimarisSection() {
  return (
    <section className="section-container py-16 lg:py-20" aria-labelledby="why-climaris-title">
      <div className="mb-10 max-w-2xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
          Autoridade e confiança
        </p>
        <h2 id="why-climaris-title" className="mb-3 text-3xl font-bold tracking-tight text-text">
          Por que escolher o Climaris?
        </h2>
        <p className="text-text-muted">
          ERP especializado em climatização — agenda, preventiva, PMOC e financeiro no mesmo lugar,
          do escritório ao técnico em campo.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {whyClimarisPillars.map((item) => {
          const Icon = item.icon;
          return (
            <article
              key={item.title}
              className="group rounded-card border border-border bg-surface-elevated p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
                <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-text">{item.title}</h3>
              <p className="text-sm leading-relaxed text-text-muted">{item.description}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-10 flex items-center gap-3 rounded-card border border-primary/15 bg-primary/5 px-5 py-4 text-sm text-text-muted">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p>
          Plataforma em produção com empresas de climatização — segurança, backups e suporte
          especializado no setor HVAC.
        </p>
      </div>
    </section>
  );
}
