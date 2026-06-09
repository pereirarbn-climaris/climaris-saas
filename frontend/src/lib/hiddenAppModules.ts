/**
 * Módulos ocultos nesta versão — serão habilitados em releases futuras.
 * Altere os flags para `false` quando cada módulo estiver pronto para produção.
 */
export const HIDDEN_APP_MODULES = {
  nfse: true,
  chatIa: true,
  whatsappBot: true,
  whatsappCampanhas: true,
  marketplace: true,
  mercadoLivre: true,
} as const;

export type HiddenAppModuleKey = keyof typeof HIDDEN_APP_MODULES;

const HIDDEN_PATH_PREFIXES: Array<{ key: HiddenAppModuleKey; prefix: string }> = [
  { key: "nfse", prefix: "/app/fiscal/nfse" },
  { key: "marketplace", prefix: "/app/marketplace" },
  { key: "whatsappCampanhas", prefix: "/app/integrations/whatsapp-campanhas" },
  { key: "whatsappBot", prefix: "/app/integrations/whatsapp-bot" },
  { key: "chatIa", prefix: "/app/integrations/chat-ia" },
  { key: "mercadoLivre", prefix: "/app/integrations/mercado-livre" },
];

export function isHiddenAppModule(key: HiddenAppModuleKey): boolean {
  return HIDDEN_APP_MODULES[key];
}

export function isHiddenAppModulePath(pathname: string): boolean {
  return HIDDEN_PATH_PREFIXES.some(
    ({ key, prefix }) =>
      HIDDEN_APP_MODULES[key] && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}
