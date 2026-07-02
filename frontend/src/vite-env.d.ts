/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string | undefined;
  /** Deve coincidir com `PLATFORM_OPERATOR_EMAIL` na API (e-mail da operação / painel `/operacao`). */
  readonly VITE_PLATFORM_OPERATOR_EMAIL: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
