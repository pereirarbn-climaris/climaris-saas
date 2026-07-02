export const siteConfig = {
  name: "Climaris",
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME ?? "Climaris",
  cnpj: process.env.NEXT_PUBLIC_CNPJ ?? "",
  title:
    "Climaris — Sistema de Gestão e ERP para Empresas de Climatização",
  description:
    "ERP climatização com controle de ordens de serviço, financeiro automatizado e conformidade PMOC. Sistema de gestão B2B para empresas de refrigeração.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://climaris.com.br",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.climaris.com.br",
  email: "contato@climaris.com.br",
  phone: process.env.NEXT_PUBLIC_PHONE ?? "",
  locale: "pt_BR",
  address: {
    street:
      process.env.NEXT_PUBLIC_ADDRESS_STREET ??
      "Araraquara — atendimento comercial e suporte regional",
    city: "Araraquara",
    state: "SP",
    postalCode: process.env.NEXT_PUBLIC_ADDRESS_POSTAL ?? "14800-000",
    country: "BR",
  },
  geo: {
    latitude: -21.7945,
    longitude: -48.1756,
  },
  services: [
    "Gestão operacional e ordens de serviço",
    "Inteligência financeira integrada",
    "Laudos e conformidade PMOC",
    "Orçamentos e contratos recorrentes",
  ],
  productPillars: [
    "Gestão Operacional",
    "Inteligência Financeira",
    "Laudos e Conformidade",
  ],
  keywords: [
    "sistema de gestão",
    "ERP climatização",
    "controle de ordens de serviço",
    "agenda para técnicos climatização",
    "gestão preventiva ar condicionado",
    "geração de PMOC",
    "software para empresas de refrigeração",
    "gestão de manutenção PMOC",
    "sistema de ordem de serviço para climatização",
    "software HVAC B2B",
    "agenda comercial HVAC",
    "ERP refrigeração comercial",
    "laudo técnico PMOC digital",
  ],
} as const;

export const freeTrial = {
  planKey: "free_30d",
  days: 30,
  label: "30 dias grátis",
  title: "Criar conta grátis",
} as const;

export function registerUrl(plan: string = freeTrial.planKey): string {
  return `${siteConfig.appUrl}/register?plan=${encodeURIComponent(plan)}`;
}

export function loginUrl(): string {
  return `${siteConfig.appUrl}/login`;
}

export const cta = {
  primary: "Agendar Demonstração",
  secondary: "Falar com um Consultor",
  freeTrial: freeTrial.title,
  login: "Entrar",
  loginHint: "Já é cliente?",
  formSuccess: "Demonstração agendada! Você receberá a confirmação por e-mail e WhatsApp.",
} as const;

export const routes = [
  { path: "/", label: "Início" },
  { path: "/funcionalidades", label: "Funcionalidades" },
  { path: "/contato", label: "Contato" },
  { path: "/privacidade", label: "Privacidade" },
] as const;

export const benefits = [
  {
    title: "Agenda que organiza a operação",
    description:
      "Agenda comercial e roteiro por técnico — visitas, instalações e manutenções sem conflito de horário.",
  },
  {
    title: "Preventiva automatizada",
    description:
      "Cronogramas, lembretes e OS recorrentes — transforme contratos de manutenção em receita previsível.",
  },
  {
    title: "PMOC e laudos integrados",
    description:
      "Geração de PMOC, laudos técnicos e QR Code no equipamento — conformidade pronta para auditoria.",
  },
  {
    title: "Financeiro conectado à OS",
    description:
      "Orçamentos, cobranças e margem por contrato — operação e financeiro no mesmo sistema.",
  },
] as const;

export const howItWorks = [
  {
    step: "01",
    title: "Agende uma demonstração",
    description:
      "Conte sobre sua operação: porte da equipe, volume de OS e principais desafios de gestão.",
  },
  {
    step: "02",
    title: "Implantação orientada",
    description:
      "Configuramos o Climaris para seu fluxo comercial — contratos, orçamentos e rotinas de campo.",
  },
  {
    step: "03",
    title: "Gestão unificada",
    description:
      "Operação, financeiro e conformidade técnica no mesmo sistema — escritório e técnicos alinhados.",
  },
] as const;

export const technicianTeamOptions = [
  { value: "1-5", label: "1 a 5 técnicos" },
  { value: "6-15", label: "6 a 15 técnicos" },
  { value: "16-30", label: "16 a 30 técnicos" },
  { value: "30+", label: "Mais de 30 técnicos" },
] as const;

export function localSeoTitle(suffix: string): string {
  return `${suffix} | ${siteConfig.name}`;
}
