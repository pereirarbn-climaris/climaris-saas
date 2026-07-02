import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppShowcaseSection } from "@/components/AppShowcaseSection";
import { BenefitsSection } from "@/components/BenefitsSection";
import { FeaturesGrid } from "@/components/FeaturesGrid";
import { HomeHero } from "@/components/HomeHero";
import { HowItWorksSection } from "@/components/HowItWorksSection";
import { PricingSection } from "@/components/PricingSection";
import { SiteShell } from "@/components/SiteShell";
import { SocialProofSection } from "@/components/SocialProofSection";
import { WhyClimarisSection } from "@/components/WhyClimarisSection";
import { buildPageMetadata } from "@/lib/metadata";
import { cta, siteConfig } from "@/lib/site-config";

export const metadata = buildPageMetadata({
  title: "ERP e Sistema de Gestão para Empresas de Refrigeração",
  description:
    "Sistema de gestão para climatização: controle de ordens de serviço, ERP integrado e conformidade PMOC. Aumente produtividade e rentabilidade dos contratos.",
  path: "/",
});

export default function HomePage() {
  return (
    <SiteShell>
      <HomeHero />

      <WhyClimarisSection />

      <BenefitsSection />

      <section className="section-container py-16 lg:py-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-text">
            Gestão e eficiência para empresas de climatização
          </h2>
          <p className="text-text-muted">
            Agenda, gestão preventiva, PMOC, OS e financeiro — sem sistemas paralelos nem retrabalho
            entre escritório e técnicos em campo.
          </p>
        </div>
        <FeaturesGrid limit={6} />
        <div className="mt-10 text-center">
          <Link href="/funcionalidades" className="btn-outline">
            Ver todas as funcionalidades
          </Link>
        </div>
      </section>

      <PricingSection />

      <SocialProofSection />

      <AppShowcaseSection />

      <HowItWorksSection />

      <section className="border-y border-border bg-surface-elevated">
        <div className="section-container grid gap-8 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-text">
              Pronto para modernizar a gestão da sua empresa?
            </h2>
            <p className="text-text-muted">
              Agende uma demonstração personalizada e veja como o {siteConfig.name} organiza contratos,
              orçamentos e conformidade técnica na prática.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link href="/contato" className="btn-solid">
              {cta.primary}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
            <Link href="/planos" className="btn-outline">
              Ver planos e preços
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
