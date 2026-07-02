import Link from "next/link";
import { cta, howItWorks } from "@/lib/site-config";

export function HowItWorksSection() {
  return (
    <section className="section-container py-16 lg:py-20" aria-labelledby="como-funciona-title">
      <div className="mb-10 max-w-2xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
          Como funciona
        </p>
        <h2 id="como-funciona-title" className="mb-3 text-3xl font-bold tracking-tight text-text">
          Da demonstração à operação unificada
        </h2>
        <p className="text-text-muted">
          Processo consultivo para implantar o Climaris no ritmo da sua empresa de climatização.
        </p>
      </div>

      <ol className="grid gap-6 md:grid-cols-3">
        {howItWorks.map((item) => (
          <li
            key={item.step}
            className="relative rounded-card border border-border bg-surface-elevated p-6 shadow-card"
          >
            <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              {item.step}
            </span>
            <h3 className="mb-2 text-lg font-semibold text-text">{item.title}</h3>
            <p className="text-sm leading-relaxed text-text-muted">{item.description}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 text-center">
        <Link href="/contato" className="btn-outline">
          {cta.primary}
        </Link>
      </div>
    </section>
  );
}
