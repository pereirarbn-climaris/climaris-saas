import Link from "next/link";
import { PricingSection } from "@/components/PricingSection";
import { SiteShell } from "@/components/SiteShell";
import { WhyClimarisSection } from "@/components/WhyClimarisSection";
import { buildPageMetadata } from "@/lib/metadata";
import { cta } from "@/lib/site-config";

export const metadata = buildPageMetadata({
  title: "Planos e Preços — ERP Climatização",
  description:
    "Compare planos Starter, Professional e Enterprise. Sistema de gestão para empresas de refrigeração com controle de ordens de serviço e financeiro integrado.",
  path: "/planos",
});

export default function PlanosPage() {
  return (
    <SiteShell>
      <section className="border-b border-border bg-surface-elevated">
        <div className="section-container py-14 lg:py-16">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">Planos SaaS</p>
          <h1 className="mb-4 max-w-3xl text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Planos e preços para empresas de climatização
          </h1>
          <p className="max-w-2xl text-lg text-text-muted">
            Escolha o nível que combina com o porte da sua operação — ou{" "}
            <Link href="/contato" className="font-medium text-primary hover:underline">
              {cta.secondary.toLowerCase()}
            </Link>{" "}
            para uma recomendação personalizada.
          </p>
        </div>
      </section>

      <PricingSection showComparison />

      <WhyClimarisSection />

      <section className="section-container py-12 text-center">
        <p className="mb-4 text-text-muted">
          Ainda em dúvida? Agende uma demonstração sem compromisso.
        </p>
        <Link href="/contato" className="btn-solid">
          {cta.primary}
        </Link>
      </section>
    </SiteShell>
  );
}
