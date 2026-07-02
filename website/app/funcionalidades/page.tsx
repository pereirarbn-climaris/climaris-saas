import Link from "next/link";
import { FeatureCard } from "@/components/FeatureCard";
import { SiteShell } from "@/components/SiteShell";
import { featureHighlights, featuresByCategory, productFeatures } from "@/lib/features";
import { buildPageMetadata } from "@/lib/metadata";
import { cta } from "@/lib/site-config";

export const metadata = buildPageMetadata({
  title: "Funcionalidades — Agenda, PMOC e Gestão Preventiva",
  description:
    "Agenda comercial, agenda do técnico, gestão preventiva, geração de PMOC, OS e financeiro integrado. Software completo para empresas de climatização e refrigeração.",
  path: "/funcionalidades",
});

const categorySections = [
  {
    id: "operacao",
    label: "Operação e agenda",
    title: "Agenda, OS e contratos no mesmo fluxo",
    description:
      "Organize visitas, distribua serviços por técnico e acompanhe a operação sem planilhas ou sistemas desconectados.",
  },
  {
    id: "campo",
    label: "Campo e preventiva",
    title: "Técnicos produtivos e manutenção preventiva automatizada",
    description:
      "Roteiro diário no celular, cronogramas preventivos e geração automática de OS — mais contratos cumpridos, menos esquecimentos.",
  },
  {
    id: "pmoc",
    label: "PMOC e conformidade",
    title: "Geração de PMOC e laudos com rastreabilidade",
    description:
      "Documentação técnica profissional integrada ao histórico do equipamento — pronta para auditoria e exigências dos clientes.",
  },
  {
    id: "financeiro",
    label: "Financeiro",
    title: "Inteligência financeira conectada à operação",
    description:
      "Orçamentos, cobranças e indicadores alimentados pelas OS e contratos — margem visível em cada serviço.",
  },
] as const;

export default function FeaturesPage() {
  return (
    <SiteShell>
      <section className="border-b border-border bg-surface-elevated">
        <div className="section-container py-14 lg:py-16">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Funcionalidades
          </p>
          <h1 className="mb-4 max-w-3xl text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Agenda, preventiva, PMOC e gestão completa para climatização
          </h1>
          <p className="max-w-2xl text-lg text-text-muted">
            Do agendamento comercial ao roteiro do técnico, da manutenção preventiva à geração de
            PMOC — tudo integrado ao financeiro e às ordens de serviço.
          </p>
        </div>
      </section>

      <section className="section-container py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {productFeatures.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      {categorySections.map((section) => {
        const items = featuresByCategory(section.id);
        if (items.length === 0) return null;
        return (
          <section
            key={section.id}
            className="border-t border-border bg-surface"
            aria-labelledby={`features-${section.id}`}
          >
            <div className="section-container py-16">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
                {section.label}
              </p>
              <h2 id={`features-${section.id}`} className="mb-3 max-w-2xl text-2xl font-bold text-text">
                {section.title}
              </h2>
              <p className="mb-8 max-w-2xl text-text-muted">{section.description}</p>
              <div className="grid gap-6 lg:grid-cols-2">
                {items.map((feature) => (
                  <FeatureCard key={feature.title} {...feature} />
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <section className="border-y border-border bg-surface-elevated">
        <div className="section-container py-16">
          <h2 className="mb-8 text-2xl font-bold text-text">E muito mais</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureHighlights.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-4 shadow-card"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <span className="text-sm font-medium text-text">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-container py-16 text-center">
        <h2 className="mb-3 text-2xl font-bold text-text">Quer ver na prática?</h2>
        <p className="mx-auto mb-6 max-w-xl text-text-muted">
          Agende uma demonstração e veja agenda, gestão preventiva e geração de PMOC funcionando no
          fluxo da sua operação.
        </p>
        <Link href="/contato" className="btn-outline">
          {cta.primary}
        </Link>
      </section>
    </SiteShell>
  );
}
