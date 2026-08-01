import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import type { FeaturePageContent } from "@/lib/feature-pages";
import { pageImageUrl } from "@/lib/website-pages";
import { SiteShell } from "./SiteShell";
import { cta, publicCtaLabel, registerUrl } from "@/lib/site-config";

type Props = {
  page: FeaturePageContent;
  images?: Record<string, string | null>;
};

export function FeatureDetailLayout({ page, images = {} }: Props) {
  const heroSrc = pageImageUrl(images, "hero");
  const showcaseSrc = pageImageUrl(images, "showcase");

  return (
    <SiteShell>
      <section className="border-b border-border bg-surface-elevated">
        <div className="section-container py-14 lg:py-16">
          <Link
            href="/funcionalidades"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-text-muted transition hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Voltar para funcionalidades
          </Link>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">Módulo</p>
              <h1 className="mb-3 max-w-3xl text-3xl font-bold tracking-tight text-text sm:text-4xl">
                {page.title}
              </h1>
              <p className="mb-2 text-lg font-medium text-primary">{page.subtitle}</p>
              <p className="max-w-2xl text-lg text-text-muted">{page.heroDescription}</p>
            </div>
            {heroSrc || showcaseSrc ? (
              <div className="relative mx-auto w-full max-w-xl">
                {heroSrc ? (
                  <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
                    <Image
                      src={heroSrc}
                      alt={`${page.title} — Climaris`}
                      width={960}
                      height={540}
                      className="h-auto w-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : null}
                {showcaseSrc ? (
                  <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface shadow-card lg:absolute lg:-bottom-6 lg:-right-4 lg:mt-0 lg:w-[55%]">
                    <Image
                      src={showcaseSrc}
                      alt={`Destaque ${page.title}`}
                      width={520}
                      height={320}
                      className="h-auto w-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section-container py-16">
        <div className="grid gap-8 lg:grid-cols-2">
          {page.sections.map((section) => {
            const Icon = section.icon;
            const sectionImage = pageImageUrl(images, `section-${section.key}`);
            return (
              <article
                key={section.key}
                className="rounded-card border border-border bg-surface-elevated p-6 shadow-card"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </div>
                <h2 className="mb-2 text-xl font-semibold text-text">{section.title}</h2>
                {sectionImage ? (
                  <div className="mb-4 overflow-hidden rounded-lg border border-border">
                    <Image
                      src={sectionImage}
                      alt={section.title}
                      width={640}
                      height={360}
                      className="h-auto w-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : null}
                <p className="mb-4 text-sm leading-relaxed text-text-muted">{section.description}</p>
                <ul className="space-y-2 text-sm text-text-muted">
                  {section.bullets.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="section-container py-14">
          <h2 className="mb-6 text-2xl font-bold text-text">Resultados para sua empresa</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {page.outcomes.map((outcome) => (
              <li
                key={outcome}
                className="flex gap-3 rounded-card border border-border bg-surface-elevated px-4 py-4 text-sm text-text-muted shadow-card"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
                <span>{outcome}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-container py-16 text-center">
        <h2 className="mb-3 text-2xl font-bold text-text">Pronto para estruturar sua gestão?</h2>
        <p className="mx-auto mb-8 max-w-xl text-text-muted">
          Teste o Climaris grátis por 30 dias ou fale com nossa equipe comercial.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href={registerUrl()} className="btn-solid">
            {cta.freeTrial}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Link>
          <Link href="/contato" className="btn-outline">
            {publicCtaLabel()}
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
