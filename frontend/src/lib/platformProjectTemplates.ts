/** Sugestões de tarefas por módulo — a operação escolhe o que aplicar em cada projeto. */

export type ProjectTaskTemplate = {
  id: string;
  category: string;
  title: string;
  description?: string;
};

export const PROJECT_TASK_TEMPLATES: ProjectTaskTemplate[] = [
  { id: "kickoff", category: "Comercial", title: "Kick-off e levantamento de processos" },
  { id: "mapeamento", category: "Comercial", title: "Mapear fluxo comercial e operacional do cliente" },
  { id: "workspace", category: "Base", title: "Configurar workspace, usuários e perfis de acesso" },
  { id: "branding", category: "Base", title: "Identidade visual e dados da empresa" },
  { id: "clientes", category: "Cadastros", title: "Importar ou cadastrar clientes e equipamentos" },
  { id: "servicos", category: "Cadastros", title: "Configurar serviços, produtos e tabela de preços" },
  { id: "agenda", category: "Módulo Agenda", title: "Implantar agenda comercial e roteiro de técnicos" },
  { id: "os", category: "Módulo OS", title: "Fluxo de ordens de serviço (abertura → execução → fechamento)" },
  { id: "orcamentos", category: "Módulo Comercial", title: "Orçamentos e aprovação pelo cliente" },
  { id: "financeiro", category: "Módulo Financeiro", title: "Contas, cobranças e conciliação financeira" },
  { id: "preventiva", category: "Módulo Preventiva", title: "Gestão preventiva e contratos recorrentes" },
  { id: "pmoc", category: "Módulo PMOC", title: "PMOC, laudos técnicos e conformidade" },
  { id: "whatsapp", category: "Integrações", title: "WhatsApp: lembretes de agenda e bot" },
  { id: "treinamento-adm", category: "Entrega", title: "Treinamento da equipe administrativa" },
  { id: "treinamento-campo", category: "Entrega", title: "Treinamento dos técnicos em campo" },
  { id: "golive", category: "Entrega", title: "Go-live e acompanhamento pós-implantação (30 dias)" },
];

export const PROJECT_TASK_TEMPLATE_CATEGORIES = [
  ...new Set(PROJECT_TASK_TEMPLATES.map((t) => t.category)),
];
