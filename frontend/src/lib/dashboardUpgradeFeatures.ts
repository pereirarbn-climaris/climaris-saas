import type { DashboardTier } from "./dashboardEntitlements";
import { dashboardTierLabel } from "./dashboardEntitlements";

export type DashboardUpgradeFeature = {
  id: string;
  title: string;
  description: string;
  icon: string;
};

export type DashboardUpgradeOffer = {
  targetTier: DashboardTier;
  targetPlanKey: string;
  targetPlanLabel: string;
  headline: string;
  subheadline: string;
  features: DashboardUpgradeFeature[];
};

const BASIC_TO_ADVANCED: DashboardUpgradeOffer = {
  targetTier: "advanced",
  targetPlanKey: "professional",
  targetPlanLabel: "Professional",
  headline: "Desbloqueie o Dashboard Avançado",
  subheadline:
    "Metas de faturamento, agenda integrada, orçamentos pendentes e distribuição de OS — tudo em um painel operacional completo.",
  features: [
    {
      id: "extended-kpis",
      title: "8 indicadores operacionais",
      description: "OS concluídas, orçamentos aguardando, visitas de hoje e crescimento mensal.",
      icon: "📊",
    },
    {
      id: "revenue-targets",
      title: "Gráfico com metas",
      description: "Faturamento com linha de tendência e meta dinâmica mês a mês.",
      icon: "📈",
    },
    {
      id: "quick-actions",
      title: "Ações rápidas",
      description: "Atalhos para OS, orçamentos, agenda, clientes, financeiro e PMOC.",
      icon: "⚡",
    },
    {
      id: "order-breakdown",
      title: "Distribuição de OS",
      description: "Veja quantas ordens estão pendentes, agendadas ou em andamento.",
      icon: "📋",
    },
    {
      id: "upcoming-schedules",
      title: "Próximos agendamentos",
      description: "Compromissos futuros com cliente, técnico e vínculo com a OS.",
      icon: "📅",
    },
  ],
};

const ADVANCED_TO_COMPLETE: DashboardUpgradeOffer = {
  targetTier: "complete",
  targetPlanKey: "enterprise",
  targetPlanLabel: "Enterprise",
  headline: "Desbloqueie o Dashboard Completo",
  subheadline:
    "Painel executivo para donos e gestores: financeiro consolidado, equipe em campo, PMOC e resumo gerencial da empresa.",
  features: [
    {
      id: "executive-summary",
      title: "Resumo executivo",
      description: "Faturamento, conversão de orçamentos, novos clientes e PMOC em uma visão única.",
      icon: "🎯",
    },
    {
      id: "financial-snapshot",
      title: "Posição financeira",
      description: "Contas a receber e pagar, saldo projetado e lançamentos em atraso.",
      icon: "💰",
    },
    {
      id: "team-workload",
      title: "Equipe em campo",
      description: "Carga de visitas por técnico no dia — otimize a operação.",
      icon: "👷",
    },
    {
      id: "executive-chart",
      title: "Gráfico executivo 12 meses",
      description: "Série histórica ampliada com metas para decisões de médio prazo.",
      icon: "📉",
    },
    {
      id: "pmoc-compliance",
      title: "PMOC e conformidade",
      description: "Planos ativos e ocorrências abertas no painel gerencial.",
      icon: "🛡️",
    },
  ],
};

export function getDashboardUpgradeOffer(currentTier: DashboardTier): DashboardUpgradeOffer | null {
  if (currentTier === "basic") return BASIC_TO_ADVANCED;
  if (currentTier === "advanced") return ADVANCED_TO_COMPLETE;
  return null;
}

export function upgradeCtaLabel(offer: DashboardUpgradeOffer): string {
  return `Conhecer plano ${offer.targetPlanLabel}`;
}

export function upgradeTierBadgeLabel(offer: DashboardUpgradeOffer): string {
  return `Dashboard ${dashboardTierLabel(offer.targetTier)}`;
}
