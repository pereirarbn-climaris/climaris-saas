"use client";

import { Sparkles } from "lucide-react";
import { HeroCta } from "./HeroCta";
import { AppDeviceFrame } from "./AppDeviceFrame";
import { useSiteSettings } from "./SiteSettingsProvider";
import { screenshotUrl as resolveShot } from "@/lib/public-settings";
import { siteConfig } from "@/lib/site-config";

export function HomeHero() {
  const { settings } = useSiteSettings();
  const heroImage = resolveShot(settings, "hero", "/screenshots/hero-app.svg");

  return (
    <section className="relative overflow-hidden bg-hero text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.08) 0%, transparent 40%)",
        }}
      />
      <div className="section-container relative grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div className="order-2 lg:order-1">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            SaaS B2B • Gestão para climatização
          </p>
          <h1 className="mb-5 max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {settings.hero_title}
          </h1>
          <p className="mb-4 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
            {settings.hero_subtitle}
          </p>
          <p className="mb-8 max-w-xl text-sm font-medium text-white/75 sm:text-base">
            O sistema completo para gestão de contratos, orçamentos e conformidade técnica (PMOC).
          </p>
          <HeroCta />
        </div>

        <div className="order-1 lg:order-2">
          <AppDeviceFrame src={heroImage} alt="Interface do app Climaris" priority className="lg:translate-y-2" />
        </div>
      </div>

      <div className="section-container pb-14 lg:hidden">
        <div className="rounded-card border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
          <div className="mb-3 text-sm font-medium text-white/90">Módulos principais</div>
          <ul className="grid gap-2 text-sm text-white/85 sm:grid-cols-3">
            {siteConfig.productPillars.map((pillar) => (
              <li key={pillar} className="rounded-btn border border-white/10 bg-white/5 px-3 py-2 text-center">
                {pillar}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
