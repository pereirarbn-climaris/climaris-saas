import {
  BarChart3,
  Building2,
  Calendar,
  CalendarDays,
  ClipboardList,
  Clock,
  FileSignature,
  Link2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type FeaturePageSection = {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
};

export type FeaturePageContent = {
  slug: string;
  title: string;
  subtitle: string;
  heroDescription: string;
  sections: FeaturePageSection[];
  outcomes: string[];
};

export const featurePages: Record<string, FeaturePageContent> = {
  "gestao-empresarial": {
    slug: "gestao-empresarial",
    title: "Gestão Empresarial",
    subtitle: "Operação, contratos e clientes no mesmo painel",
    heroDescription:
      "Centralize ordens de serviço, contratos recorrentes, histórico por equipamento e indicadores da operação — do primeiro contato ao laudo assinado, sem planilhas paralelas.",
    sections: [
      {
        key: "orders",
        icon: ClipboardList,
        title: "Ordens de serviço completas",
        description:
          "Crie, acompanhe e feche OS com checklist, materiais, fotos e assinatura do cliente — escritório e campo sempre alinhados.",
        bullets: [
          "Status em tempo real e histórico por cliente",
          "Checklist configurável por tipo de serviço",
          "Assinatura digital e anexos em campo",
          "Vínculo com equipamentos e contratos",
        ],
      },
      {
        key: "contracts",
        icon: FileSignature,
        title: "Contratos e propostas",
        description:
          "Orçamentos que viram contratos recorrentes — visão clara do que foi vendido e do que ainda precisa ser executado.",
        bullets: [
          "Propostas comerciais e aprovação",
          "Contratos de manutenção recorrente",
          "Escopo, valores e periodicidade centralizados",
          "Base para preventiva e faturamento",
        ],
      },
      {
        key: "clients",
        icon: Building2,
        title: "Clientes e equipamentos",
        description:
          "Cadastro unificado de clientes, unidades e equipamentos com histórico completo de intervenções.",
        bullets: [
          "Ficha por cliente e por local",
          "Catálogo de equipamentos com QR Code",
          "Histórico técnico e comercial",
          "Rastreio de garantias e revisões",
        ],
      },
      {
        key: "dashboard",
        icon: BarChart3,
        title: "Painel gerencial",
        description:
          "KPIs da operação no dashboard — pendências, agenda do dia e produtividade da equipe em um só lugar.",
        bullets: [
          "Visão de OS abertas, atrasadas e concluídas",
          "Indicadores por técnico e região",
          "Integração com financeiro e preventiva",
          "Decisões com dados, não com feeling",
        ],
      },
      {
        key: "team",
        icon: Users,
        title: "Equipe e permissões",
        description:
          "Perfis para administradores, comercial, financeiro e técnicos — cada um vê o que precisa no Climaris.",
        bullets: [
          "Multiusuário por workspace",
          "Permissões por módulo e função",
          "Auditoria de ações críticas",
          "Escala do time enxuto à operação grande",
        ],
      },
    ],
    outcomes: [
      "Menos retrabalho entre comercial, operação e financeiro",
      "Histórico confiável por cliente e equipamento",
      "Contratos recorrentes organizados e executáveis",
      "Gestão profissional mesmo com equipe em crescimento",
    ],
  },
  "agenda-comercial": {
    slug: "agenda-comercial",
    title: "Agenda Comercial",
    subtitle: "Visitas, instalações e manutenções no mesmo calendário do escritório",
    heroDescription:
      "Calendário integrado para agendar visitas técnicas, instalações e manutenções — comercial e operação alinhados, sem conflito de horários nem retrabalho entre equipes.",
    sections: [
      {
        key: "calendar",
        icon: Calendar,
        title: "Calendário unificado",
        description:
          "Visão diária, semanal e por equipe — toda a operação comercial em um só lugar, com filtros por técnico, região ou tipo de serviço.",
        bullets: [
          "Agenda diária e semanal responsiva",
          "Filtros por técnico, cliente ou status",
          "Cores e categorias por tipo de visita",
          "Sincronização em tempo real no workspace",
        ],
      },
      {
        key: "scheduling",
        icon: CalendarDays,
        title: "Agendamento de visitas",
        description:
          "Marque instalações, manutenções corretivas e visitas comerciais com data, horário e responsável definidos desde o primeiro contato.",
        bullets: [
          "Agendamento rápido a partir do cliente ou OS",
          "Duração estimada e janela de atendimento",
          "Reagendamento com histórico preservado",
          "Menos ligações para confirmar horário",
        ],
      },
      {
        key: "os-link",
        icon: Link2,
        title: "Vínculo com OS e clientes",
        description:
          "Cada compromisso na agenda nasce ligado ao cliente, equipamento e ordem de serviço — escritório e campo enxergam a mesma informação.",
        bullets: [
          "OS criada ou vinculada na hora do agendamento",
          "Ficha do cliente e endereço sempre à mão",
          "Check-in e status refletidos no calendário",
          "Rastreio do que foi prometido vs. executado",
        ],
      },
      {
        key: "rules",
        icon: Clock,
        title: "Expediente e feriados",
        description:
          "Respeite o horário comercial do workspace e bloqueie feriados nacionais — evite agendar fora do expediente ou em dias sem equipe.",
        bullets: [
          "Horário de trabalho por dia da semana",
          "Bloqueio automático de feriados nacionais",
          "Configuração por workspace",
          "Menos conflitos e reagendamentos forçados",
        ],
      },
      {
        key: "team-view",
        icon: Users,
        title: "Visão por equipe",
        description:
          "Distribua a carga entre técnicos e comercial com visão clara de quem está ocupado — escale sem perder o controle da agenda.",
        bullets: [
          "Agenda por técnico ou recepção",
          "Identificação de gargalos e ociosidade",
          "Integração com agenda do técnico em campo",
          "Operação coordenada mesmo com time crescendo",
        ],
      },
    ],
    outcomes: [
      "Menos conflito de horários entre comercial e operação",
      "Visitas e OS sempre alinhadas ao que foi combinado",
      "Expediente e feriados respeitados automaticamente",
      "Mais produtividade com roteiro comercial organizado",
    ],
  },
};

export function featurePagePath(slug: string): string {
  return `/funcionalidades/${slug}`;
}

export function getFeaturePage(slug: string): FeaturePageContent | undefined {
  return featurePages[slug];
}
