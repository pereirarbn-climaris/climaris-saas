import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Calendar,
  CalendarClock,
  ClipboardList,
  FileText,
  MapPin,
  QrCode,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

export type ProductFeature = {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
  category: "operacao" | "campo" | "pmoc" | "financeiro";
  slug?: string;
};

export const productFeatures: ProductFeature[] = [
  {
    icon: ClipboardList,
    title: "Gestão Empresarial",
    description:
      "Contratos, ordens de serviço e histórico por cliente — da proposta à execução com visão unificada.",
    bullets: [
      "OS com checklist e assinatura digital",
      "Contratos recorrentes e propostas",
      "Histórico por cliente e equipamento",
      "Status em tempo real no painel",
    ],
    category: "operacao",
    slug: "gestao-empresarial",
  },
  {
    icon: Calendar,
    title: "Agenda Comercial",
    description:
      "Calendário integrado para agendar visitas, instalações e manutenções — escritório e operação no mesmo fluxo.",
    bullets: [
      "Visão diária, semanal e por equipe",
      "Vinculação direta com OS e clientes",
      "Bloqueio de feriados e expediente",
      "Menos conflito de horários e retrabalho",
    ],
    category: "operacao",
    slug: "agenda-comercial",
  },
  {
    icon: CalendarClock,
    title: "Agenda do Técnico",
    description:
      "Roteiro de campo por técnico com ordem do dia, endereços e serviços — produtividade onde importa.",
    bullets: [
      "Agenda mobile por técnico",
      "Sequência de visitas e regiões",
      "Abertura e fechamento de OS em campo",
      "Sincronização com o escritório",
    ],
    category: "campo",
  },
  {
    icon: Wrench,
    title: "Gestão Preventiva",
    description:
      "Planos de manutenção preventiva automatizados — lembretes, campanhas e geração de OS recorrentes.",
    bullets: [
      "Cronogramas por equipamento ou contrato",
      "Alertas e campanhas de preventiva",
      "Conversão automática em OS",
      "Menos equipamento parado, mais receita recorrente",
    ],
    category: "campo",
  },
  {
    icon: FileText,
    title: "PMOC e Laudos Técnicos",
    description:
      "Geração de PMOC, laudos e relatórios técnicos com conformidade legal — pronto para auditoria.",
    bullets: [
      "Geração de PMOC por plano de manutenção",
      "Laudos e relatórios em PDF personalizados",
      "QR Code com histórico do equipamento",
      "Rastreabilidade e validação pública",
    ],
    category: "pmoc",
  },
  {
    icon: Wallet,
    title: "Inteligência Financeira",
    description:
      "Orçamentos, cobranças e fluxo de caixa conectados à operação — margem visível em cada contrato.",
    bullets: [
      "Orçamentos e propostas comerciais",
      "Contas a pagar e receber",
      "Cobranças, boletos e conciliação",
      "Dashboard com KPIs gerenciais",
    ],
    category: "financeiro",
  },
];

export const featureHighlights: { icon: LucideIcon; label: string }[] = [
  { icon: Smartphone, label: "App responsivo para técnicos em campo" },
  { icon: MapPin, label: "Agenda com roteiro por região" },
  { icon: Bell, label: "Lembretes de manutenção preventiva" },
  { icon: QrCode, label: "Catálogo de equipamentos com QR" },
  { icon: Users, label: "Multiusuário com perfis e permissões" },
  { icon: ShieldCheck, label: "Conformidade PMOC integrada" },
  { icon: BarChart3, label: "Indicadores de produtividade e rentabilidade" },
];

export const whyClimarisPillars = [
  {
    icon: CalendarClock,
    title: "Agenda e campo",
    description:
      "Agenda comercial e roteiro do técnico no mesmo sistema — visitas organizadas do escritório ao cliente.",
  },
  {
    icon: Wrench,
    title: "Gestão preventiva",
    description:
      "Cronogramas automatizados, lembretes e OS recorrentes — transforme contratos em receita previsível.",
  },
  {
    icon: FileText,
    title: "PMOC e laudos",
    description:
      "Gere PMOC e laudos técnicos com QR Code no equipamento — conformidade sem planilhas paralelas.",
  },
  {
    icon: ClipboardList,
    title: "Gestão empresarial",
    description:
      "OS, contratos e clientes no mesmo painel — operação sob controle do escritório ao campo.",
  },
  {
    icon: Wallet,
    title: "Financeiro integrado",
    description:
      "Orçamentos e cobranças ligados à operação — enxergue margem real em cada contrato de climatização.",
  },
  {
    icon: ShieldCheck,
    title: "Especializado em HVAC",
    description:
      "Fluxos pensados para refrigeração e climatização — não um ERP genérico adaptado com gambiarras.",
  },
] as const;

export function featuresByCategory(category: ProductFeature["category"]) {
  return productFeatures.filter((f) => f.category === category);
}
