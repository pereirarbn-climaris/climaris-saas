export const LGPD_POLICY_VERSION = "2026-06-19";

export type LgpdLegalSettings = {
  legal_name: string;
  trade_name?: string | null;
  cnpj?: string | null;
  address_street: string;
  address_city: string;
  address_state: string;
  address_postal: string;
  contact_email: string;
  dpo_name?: string | null;
  dpo_email?: string | null;
};

export type LgpdSection = {
  id: string;
  title: string;
  paragraphs: string[];
  list?: string[];
  footer?: string;
};

export function formatCnpjBr(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length !== 14) return value?.trim() || "";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

const DEFAULT_LEGAL: LgpdLegalSettings = {
  legal_name: "Climaris",
  address_street: "Araraquara — atendimento comercial e suporte regional",
  address_city: "Araraquara",
  address_state: "SP",
  address_postal: "14800-000",
  contact_email: "contato@climaris.com.br",
};

function mergeLegal(settings?: Partial<LgpdLegalSettings> | null): LgpdLegalSettings {
  return { ...DEFAULT_LEGAL, ...settings };
}

export function buildLgpdSections(settings?: Partial<LgpdLegalSettings> | null): LgpdSection[] {
  const legal = mergeLegal(settings);
  const cnpjFmt = legal.cnpj ? formatCnpjBr(legal.cnpj) : "";
  const trade = legal.trade_name?.trim();
  const controllerParagraphs = [
    `O controlador dos dados pessoais coletados nesta plataforma é ${legal.legal_name}${
      trade && trade.toLowerCase() !== legal.legal_name.toLowerCase() ? ` (nome fantasia: ${trade})` : ""
    }.`,
    cnpjFmt ? `CNPJ: ${cnpjFmt}.` : "CNPJ: informado nas configurações institucionais da plataforma.",
    `Endereço: ${legal.address_street}, ${legal.address_city} — ${legal.address_state}, CEP ${legal.address_postal}, Brasil.`,
    "Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, utilize o canal de contato indicado na seção \"Contato do encarregado\".",
  ];

  const dpoEmail = legal.dpo_email?.trim() || legal.contact_email;
  const dpoName = legal.dpo_name?.trim();
  const contactParagraphs = [
    "Para questões sobre privacidade e proteção de dados, entre em contato com o encarregado pelo tratamento de dados pessoais (DPO):",
    dpoName ? `Encarregado: ${dpoName}` : "Encarregado: equipe de privacidade Climaris",
    `E-mail: ${dpoEmail}`,
    "Assunto sugerido: Privacidade / LGPD",
  ];

  return [
    {
      id: "introducao",
      title: "1. Introdução",
      paragraphs: [
        `Esta Política de Privacidade descreve como o ${legal.legal_name} trata dados pessoais em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).`,
        "Ao criar uma conta, agendar uma demonstração ou utilizar nossos serviços, você declara estar ciente desta política e do tratamento de dados descrito abaixo.",
      ],
    },
    {
      id: "controlador",
      title: "2. Quem é o controlador dos dados",
      paragraphs: controllerParagraphs,
    },
    {
      id: "dados-coletados",
      title: "3. Quais dados coletamos",
      paragraphs: ["Podemos tratar os seguintes dados, conforme o uso do serviço:"],
      list: [
        "Dados de cadastro: nome, e-mail, telefone, WhatsApp, nome da empresa e documento fiscal (CPF/CNPJ) quando informado.",
        "Dados de autenticação: credenciais de acesso, tokens de sessão e registros de segurança (tentativas de login, dispositivos confiáveis).",
        "Dados operacionais inseridos no ERP: clientes, ordens de serviço, equipamentos, financeiro, PMOC e demais informações que sua empresa cadastra na plataforma.",
        "Dados de contato comercial: informações enviadas em formulários de demonstração ou suporte.",
        "Dados técnicos: endereço IP, navegador, data/hora de acesso e logs necessários à segurança e auditoria.",
      ],
    },
    {
      id: "finalidades",
      title: "4. Finalidades do tratamento",
      paragraphs: ["Utilizamos os dados pessoais para as seguintes finalidades:"],
      list: [
        "Criar e administrar contas de acesso ao sistema.",
        "Prestar o serviço contratado (gestão operacional, financeira e de conformidade técnica).",
        "Enviar comunicações transacionais (confirmação de e-mail, recuperação de senha, avisos do sistema).",
        "Atender solicitações comerciais e agendar demonstrações.",
        "Cumprir obrigações legais e regulatórias aplicáveis.",
        "Prevenir fraudes, proteger a plataforma e garantir a segurança das informações.",
        "Melhorar funcionalidades e experiência de uso, respeitando as configurações de privacidade disponíveis.",
      ],
    },
    {
      id: "bases-legais",
      title: "5. Bases legais (LGPD)",
      paragraphs: ["O tratamento de dados pessoais fundamenta-se, conforme o caso, em:"],
      list: [
        "Execução de contrato ou procedimentos preliminares relacionados ao cadastro e uso do serviço.",
        "Cumprimento de obrigação legal ou regulatória.",
        "Legítimo interesse, como segurança da plataforma e prevenção a fraudes, sempre com balanceamento de direitos.",
        "Consentimento, quando aplicável (por exemplo, em comunicações opcionais ou integrações que você autorizar).",
      ],
    },
    {
      id: "compartilhamento",
      title: "6. Compartilhamento com terceiros",
      paragraphs: [
        "Podemos compartilhar dados com prestadores essenciais à operação do serviço, como provedores de hospedagem, envio de e-mail, processamento de pagamentos (ex.: Stripe), integrações de mensageria (ex.: WhatsApp) e consultas cadastrais autorizadas.",
        "Esses parceiros tratam os dados apenas para as finalidades contratadas e sob obrigações de confidencialidade e segurança compatíveis com a LGPD.",
        "Não vendemos dados pessoais.",
      ],
    },
    {
      id: "retencao",
      title: "7. Retenção e eliminação",
      paragraphs: [
        "Mantemos os dados pelo tempo necessário para cumprir as finalidades descritas, obrigações legais, defesa de direitos e execução contratual.",
        "Após o encerramento da conta, poderemos reter registros mínimos exigidos por lei ou para resolução de disputas, pelo prazo aplicável.",
        "Dados inseridos por sua empresa sobre clientes finais são de responsabilidade do titular da conta (sua empresa), que deve garantir base legal adequada perante seus clientes.",
      ],
    },
    {
      id: "direitos",
      title: "8. Seus direitos como titular",
      paragraphs: ["Nos termos da LGPD, você pode solicitar:"],
      list: [
        "Confirmação da existência de tratamento e acesso aos dados.",
        "Correção de dados incompletos, inexatos ou desatualizados.",
        "Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade.",
        "Portabilidade dos dados a outro fornecedor, quando aplicável.",
        "Informação sobre compartilhamentos realizados.",
        "Revogação do consentimento, quando o tratamento tiver essa base legal.",
      ],
      footer: `Para exercer esses direitos, entre em contato pelo e-mail ${dpoEmail}. Responderemos dentro dos prazos legais.`,
    },
    {
      id: "seguranca",
      title: "9. Segurança da informação",
      paragraphs: [
        "Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado, perda, alteração ou divulgação indevida, incluindo controle de acesso, criptografia em trânsito (HTTPS) e práticas de segurança em autenticação.",
      ],
    },
    {
      id: "cookies",
      title: "10. Cookies e tecnologias similares",
      paragraphs: [
        "Utilizamos cookies e armazenamento local estritamente necessários para manter sua sessão autenticada, lembrar preferências básicas e garantir o funcionamento seguro do sistema.",
        "Não utilizamos cookies de publicidade comportamental em nossa aplicação principal.",
      ],
    },
    {
      id: "alteracoes",
      title: "11. Alterações desta política",
      paragraphs: [
        `Esta política pode ser atualizada periodicamente. A versão vigente é identificada como ${LGPD_POLICY_VERSION}. Alterações relevantes serão comunicadas por meios adequados (e-mail ou aviso no sistema).`,
        "O aceite no cadastro registra a versão da política vigente no momento da criação da conta.",
      ],
    },
    {
      id: "contato",
      title: "12. Contato do encarregado",
      paragraphs: contactParagraphs,
    },
  ];
}

/** Conteúdo estático padrão (fallback sem API). */
export const lgpdSections = buildLgpdSections();
