import Link from "next/link";
import { PrivacyPolicyBody } from "@/components/PrivacyPolicyBody";
import { SiteShell } from "@/components/SiteShell";
import { buildPageMetadata } from "@/lib/metadata";
import { LGPD_POLICY_VERSION } from "@/lib/lgpd-content";
import { siteConfig } from "@/lib/site-config";

export const metadata = buildPageMetadata({
  title: "Política de Privacidade e LGPD",
  description:
    "Saiba como o Climaris trata dados pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD).",
  path: "/privacidade",
});

export default function PrivacyPage() {
  return (
    <SiteShell>
      <section className="border-b border-border bg-surface-elevated">
        <div className="section-container py-14 lg:py-16">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Privacidade e proteção de dados
          </p>
          <h1 className="mb-4 max-w-3xl text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Política de Privacidade e LGPD
          </h1>
          <p className="max-w-2xl text-lg text-text-muted">
            Entenda como o {siteConfig.name} coleta, utiliza e protege dados pessoais em conformidade com a Lei Geral
            de Proteção de Dados.
          </p>
          <p className="mt-4 text-sm text-text-subtle">
            Versão {LGPD_POLICY_VERSION} · Última atualização: junho de 2026
          </p>
        </div>
      </section>

      <section className="section-container max-w-3xl py-14">
        <PrivacyPolicyBody />

        <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8 text-sm">
          <Link href="/contato" className="font-medium text-primary hover:underline">
            Falar com a equipe
          </Link>
          <Link href="/" className="text-text-muted hover:text-primary">
            Voltar ao início
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
