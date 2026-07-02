import { Mail, MapPin, MessageSquare } from "lucide-react";
import { LeadForm } from "@/components/LeadForm";
import { SiteShell } from "@/components/SiteShell";
import { buildPageMetadata } from "@/lib/metadata";
import { cta, siteConfig } from "@/lib/site-config";

export const metadata = buildPageMetadata({
  title: "Agendar Demonstração do Climaris",
  description:
    "Fale com um consultor ou agende uma demonstração do software de gestão para empresas de climatização. Gestão de manutenção PMOC, OS e contratos.",
  path: "/contato",
});

export default function ContactPage() {
  return (
    <SiteShell>
      <section className="border-b border-border bg-surface-elevated">
        <div className="section-container py-14 lg:py-16">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Contato comercial
          </p>
          <h1 className="mb-4 max-w-3xl text-3xl font-bold tracking-tight text-text sm:text-4xl">
            {cta.secondary}
          </h1>
          <p className="max-w-2xl text-lg text-text-muted">
            Preencha o formulário para agendar uma demonstração personalizada do Climaris — o sistema
            completo para gestão de contratos, orçamentos e conformidade técnica (PMOC).
          </p>
        </div>
      </section>

      <section className="section-container py-16" id="formulario">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="space-y-6">
            <div className="rounded-card border border-border bg-surface-elevated p-6 shadow-card">
              <h2 className="mb-4 text-lg font-semibold text-text">Fale com a equipe Climaris</h2>
              <ul className="space-y-4 text-sm text-text-muted">
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="font-medium text-text">Sede comercial</p>
                    <p>
                      {siteConfig.address.street}
                      <br />
                      {siteConfig.address.city} — {siteConfig.address.state}
                      <br />
                      CEP {siteConfig.address.postalCode}
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="font-medium text-text">E-mail</p>
                    <a href={`mailto:${siteConfig.email}`} className="hover:text-primary">
                      {siteConfig.email}
                    </a>
                  </div>
                </li>
                <li className="flex gap-3">
                  <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="font-medium text-text">Módulos</p>
                    <p>{siteConfig.productPillars.join(" • ")}</p>
                  </div>
                </li>
              </ul>
            </div>
          </aside>

          <div className="rounded-card border border-border bg-surface-elevated p-6 shadow-card sm:p-8">
            <LeadForm submitLabel={cta.primary} />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
