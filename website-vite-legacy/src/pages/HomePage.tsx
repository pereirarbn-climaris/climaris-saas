import { Link } from "react-router-dom";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { FeatureCard } from "../components/FeatureCard";

const highlights = [
  {
    icon: ClipboardList,
    title: "Gestão de OS",
    description: "Do agendamento à conclusão, com histórico por equipamento e cliente.",
    bullets: ["Agenda e técnicos", "Checklist em campo", "Histórico completo"],
  },
  {
    icon: Wallet,
    title: "Financeiro",
    description: "Fluxo de caixa, cobranças e conciliação integrados à operação.",
    bullets: ["Contas a pagar/receber", "Cobranças automáticas", "Relatórios gerenciais"],
  },
  {
    icon: FileText,
    title: "Laudos Técnicos",
    description: "PMOC, laudos e documentação técnica com padrão profissional.",
    bullets: ["PMOC e conformidade", "PDFs personalizados", "QR Code no equipamento"],
  },
];

export function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-hero text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.08) 0%, transparent 40%)",
          }}
        />
        <div className="section-container relative grid gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
              ERP para climatização
            </p>
            <h1 className="mb-5 max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Operação, financeiro e laudos no mesmo sistema
            </h1>
            <p className="mb-8 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              O Climaris centraliza sua empresa de refrigeração e ar-condicionado — do primeiro
              contato com o cliente até o laudo técnico assinado.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/contato" className="btn-primary">
                Solicitar Orçamento
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link to="/funcionalidades" className="btn-secondary">
                Ver funcionalidades
              </Link>
            </div>
          </div>

          <div className="rounded-card border border-white/15 bg-white/10 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white/90">
              <ShieldCheck className="h-5 w-5" />
              Por que empresas escolhem o Climaris
            </div>
            <ul className="space-y-4 text-sm text-white/85">
              <li className="rounded-btn border border-white/10 bg-white/5 px-4 py-3">
                Mesma experiência visual do app — equipe aprende rápido
              </li>
              <li className="rounded-btn border border-white/10 bg-white/5 px-4 py-3">
                Dados da operação alimentam o financeiro automaticamente
              </li>
              <li className="rounded-btn border border-white/10 bg-white/5 px-4 py-3">
                PMOC, preventiva e documentação técnica sem planilhas
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section-container py-16 lg:py-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-text">
            Tudo que sua empresa precisa
          </h2>
          <p className="text-text-muted">
            Módulos pensados para o dia a dia de empresas de climatização — do escritório ao
            técnico em campo.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {highlights.map((item) => (
            <FeatureCard key={item.title} {...item} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link to="/funcionalidades" className="btn-outline">
            Conhecer todos os recursos
          </Link>
        </div>
      </section>

      <section className="border-y border-border bg-surface-elevated">
        <div className="section-container grid gap-8 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-text">
              Pronto para modernizar sua operação?
            </h2>
            <p className="text-text-muted">
              Fale com nossa equipe e receba uma proposta personalizada para o tamanho da sua
              empresa.
            </p>
          </div>
          <div className="flex justify-start lg:justify-end">
            <Link to="/contato" className="btn-outline">
              Solicitar Orçamento
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
