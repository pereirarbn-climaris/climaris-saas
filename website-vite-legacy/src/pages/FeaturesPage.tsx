import { Link } from "react-router-dom";
import {
  BarChart3,
  ClipboardList,
  FileText,
  QrCode,
  Smartphone,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { FeatureCard } from "../components/FeatureCard";

const mainFeatures = [
  {
    icon: ClipboardList,
    title: "Gestão de OS",
    description:
      "Controle completo das ordens de serviço — agendamento, execução, materiais e assinatura do cliente.",
    bullets: [
      "Agenda por técnico e região",
      "Itens, serviços e equipamentos vinculados",
      "Status em tempo real e histórico por cliente",
      "Integração com WhatsApp para lembretes",
    ],
  },
  {
    icon: Wallet,
    title: "Financeiro",
    description:
      "Financeiro conectado à operação: cobranças, fluxo de caixa e conciliação sem retrabalho.",
    bullets: [
      "Contas a pagar e receber",
      "Cobranças e links de pagamento",
      "Cartões, boletos e conciliação OFX",
      "Relatórios e indicadores gerenciais",
    ],
  },
  {
    icon: FileText,
    title: "Laudos Técnicos",
    description:
      "Documentação técnica profissional com PMOC, laudos e fichas de equipamento via QR Code.",
    bullets: [
      "PMOC e planos de manutenção",
      "Laudos e relatórios em PDF",
      "QR Code com histórico do equipamento",
      "Conformidade e rastreabilidade",
    ],
  },
];

const extras = [
  { icon: Users, label: "Multiusuário com perfis e permissões" },
  { icon: Smartphone, label: "Interface responsiva para técnicos em campo" },
  { icon: QrCode, label: "Catálogo de equipamentos com QR" },
  { icon: Wrench, label: "Manutenção preventiva automatizada" },
  { icon: BarChart3, label: "Dashboard com KPIs da operação" },
];

export function FeaturesPage() {
  return (
    <>
      <section className="border-b border-border bg-surface-elevated">
        <div className="section-container py-14 lg:py-16">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Funcionalidades
          </p>
          <h1 className="mb-4 max-w-3xl text-4xl font-bold tracking-tight text-text">
            Um ERP completo para climatização e refrigeração
          </h1>
          <p className="max-w-2xl text-lg text-text-muted">
            Do primeiro atendimento ao laudo assinado — com a mesma identidade visual e
            experiência do app Climaris.
          </p>
        </div>
      </section>

      <section className="section-container py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {mainFeatures.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="section-container py-16">
          <h2 className="mb-8 text-2xl font-bold text-text">E muito mais</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {extras.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-card border border-border bg-surface-elevated px-4 py-4 shadow-card"
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
          Solicite um orçamento e nossa equipe apresenta o sistema de acordo com o porte da sua
          operação.
        </p>
        <Link to="/contato" className="btn-outline">
          Solicitar Orçamento
        </Link>
      </section>
    </>
  );
}
