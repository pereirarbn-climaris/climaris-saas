import { Building2, ShieldCheck, TrendingUp } from "lucide-react";

const trustPoints = [
  {
    icon: Building2,
    title: "Feito para o setor",
    text: "Fluxos pensados para empresas de climatização e refrigeração — não um ERP genérico adaptado.",
  },
  {
    icon: TrendingUp,
    title: "Escala com sua operação",
    text: "De equipes enxutas a operações com dezenas de técnicos em campo, sem trocar de ferramenta.",
  },
  {
    icon: ShieldCheck,
    title: "Conformidade em dia",
    text: "PMOC, laudos e rastreabilidade integrados ao dia a dia — menos risco e mais credibilidade.",
  },
];

export function SocialProofSection() {
  return (
    <section className="border-y border-border bg-surface-elevated" aria-labelledby="prova-social-title">
      <div className="section-container py-16 lg:py-20">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Confiança do setor
          </p>
          <h2 id="prova-social-title" className="mb-4 text-3xl font-bold tracking-tight text-text">
            Utilizado pelas empresas que são referência no setor
          </h2>
          <p className="text-lg text-text-muted">
            O Climaris centraliza contratos, orçamentos e conformidade técnica para operações que
            não podem depender de planilhas e sistemas desconectados.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {trustPoints.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="rounded-card border border-border bg-surface p-6 text-center shadow-card"
              >
                <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="mb-2 text-base font-semibold text-text">{item.title}</h3>
                <p className="text-sm leading-relaxed text-text-muted">{item.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
