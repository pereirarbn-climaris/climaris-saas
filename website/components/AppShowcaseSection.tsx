"use client";

import Image from "next/image";
import { useSiteSettings } from "./SiteSettingsProvider";
import { screenshotUrl } from "@/lib/public-settings";

const SHOWCASE = [
  {
    slot: "dashboard" as const,
    fallback: "/screenshots/dashboard-app.svg",
    title: "Painel com visão completa da operação",
    text: "KPIs, agenda e pendências em um dashboard alinhado ao app Climaris.",
  },
  {
    slot: "orders" as const,
    fallback: "/screenshots/orders-app.svg",
    title: "Gestão de OS em tempo real",
    text: "Agende técnicos, acompanhe execução e histórico por cliente e equipamento.",
  },
  {
    slot: "finance" as const,
    fallback: "/screenshots/finance-app.svg",
    title: "Financeiro automatizado",
    text: "Cobranças e fluxo de caixa conectados à operação — sem retrabalho.",
  },
];

export function AppShowcaseSection() {
  const { settings } = useSiteSettings();

  return (
    <section className="border-y border-border bg-surface">
      <div className="section-container py-16 lg:py-20">
        <div className="mb-12 max-w-2xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            O app por dentro
          </p>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-text">
            Interface moderna, a mesma que sua equipe usa no dia a dia
          </h2>
          <p className="text-text-muted">
            Prints reais do Climaris — configure as imagens no painel Operação → Site institucional.
          </p>
        </div>

        <div className="space-y-16">
          {SHOWCASE.map((item, index) => {
            const src = screenshotUrl(settings, item.slot, item.fallback);
            const reversed = index % 2 === 1;
            return (
              <article
                key={item.slot}
                className={`grid items-center gap-10 lg:grid-cols-2 ${reversed ? "lg:[&>*:first-child]:order-2" : ""}`}
              >
                <div className="rounded-card border border-border bg-surface-elevated p-3 shadow-card">
                  <div className="overflow-hidden rounded-xl border border-border/80 bg-[#e2eef8]">
                    <Image
                      src={src}
                      alt={item.title}
                      width={1200}
                      height={750}
                      className="h-auto w-full object-cover object-top"
                      unoptimized
                    />
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-2xl font-bold tracking-tight text-text">{item.title}</h3>
                  <p className="text-base leading-relaxed text-text-muted">{item.text}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
