/** Identificadores das abas da nova tela de Cadastro/Edição de Cliente. */
export type DetailTabId =
  | "cadastro"
  | "unidades"
  | "enderecos"
  | "contatos"
  | "equipamentos"
  | "pmoc"
  | "contratos"
  | "ordens"
  | "financeiro"
  | "historico";

export type DetailTabDef = {
  id: DetailTabId;
  label: string;
};
