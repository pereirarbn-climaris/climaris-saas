export type PlatformBroadcastAudience =
  | "all"
  | "new_tenants"
  | "trial"
  | "trial_expiring"
  | "unpaid"
  | "paid";

export type PlatformBroadcastTemplate = {
  id: string;
  label: string;
  category: "geral" | "onboarding" | "cobranca" | "produto";
  audience: PlatformBroadcastAudience;
  title: string;
  body: string;
  linkPath?: string;
};

export const PLATFORM_BROADCAST_AUDIENCE_LABELS: Record<PlatformBroadcastAudience, string> = {
  all: "Todos os workspaces ativos",
  new_tenants: "Novos clientes (últimos 7 dias)",
  trial: "Em período de teste (Free 30 dias)",
  trial_expiring: "Teste expirando (próximos 7 dias)",
  unpaid: "Inadimplentes / teste vencido",
  paid: "Clientes pagantes",
};

export const PLATFORM_BROADCAST_TEMPLATES: PlatformBroadcastTemplate[] = [
  {
    id: "feature",
    label: "Nova função",
    category: "produto",
    audience: "all",
    title: "Nova função no Climaris",
    body:
      "Acabamos de liberar uma novidade na plataforma. Abra o painel e confira as melhorias disponíveis para o seu time.",
    linkPath: "/app",
  },
  {
    id: "maintenance",
    label: "Manutenção",
    category: "geral",
    audience: "all",
    title: "Manutenção programada",
    body:
      "Teremos uma janela de manutenção em breve. O acesso pode ficar instável por alguns minutos. Avisaremos quando tudo estiver normalizado.",
  },
  {
    id: "welcome",
    label: "Boas-vindas",
    category: "onboarding",
    audience: "new_tenants",
    title: "Bem-vindo ao Climaris",
    body:
      "Sua conta foi criada com sucesso. Explore o painel, cadastre clientes e experimente ordens de serviço, agenda e financeiro. Qualquer dúvida, fale com nosso suporte.",
    linkPath: "/app",
  },
  {
    id: "trial_start",
    label: "Início do teste",
    category: "onboarding",
    audience: "trial",
    title: "Seu período de teste começou",
    body:
      "Você tem 30 dias para explorar o Climaris com seu time. Aproveite para cadastrar clientes, criar ordens de serviço e conhecer os módulos do seu plano.",
    linkPath: "/app",
  },
  {
    id: "trial_expiring",
    label: "Teste expirando",
    category: "cobranca",
    audience: "trial_expiring",
    title: "Seu teste está acabando",
    body:
      "Faltam poucos dias para o fim do período de teste. Escolha um plano para continuar usando o Climaris sem interrupções e manter seus dados e configurações.",
    linkPath: "/app/conta",
  },
  {
    id: "unpaid",
    label: "Pagamento pendente",
    category: "cobranca",
    audience: "unpaid",
    title: "Regularize seu acesso ao Climaris",
    body:
      "Identificamos pendência no seu workspace (teste vencido ou conta suspensa). Regularize o pagamento ou escolha um plano para voltar a usar todos os recursos.",
    linkPath: "/app/conta",
  },
  {
    id: "paid_thanks",
    label: "Agradecimento pagantes",
    category: "geral",
    audience: "paid",
    title: "Obrigado por confiar no Climaris",
    body:
      "Agradecemos por ser nosso cliente. Continuamos evoluindo a plataforma para facilitar a operação da sua empresa de climatização.",
    linkPath: "/app",
  },
];

export const PLATFORM_BROADCAST_TEMPLATE_CATEGORIES: Record<PlatformBroadcastTemplate["category"], string> = {
  geral: "Geral",
  onboarding: "Onboarding",
  cobranca: "Cobrança e plano",
  produto: "Produto",
};
