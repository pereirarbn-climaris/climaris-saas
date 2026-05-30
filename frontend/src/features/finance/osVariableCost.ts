/** Categorias de despesa variável (insumos/peças) elegíveis para vínculo com OS. */

const VARIABLE_COST_PATTERN =
  /\b(insumo|insumos|pe[cç]a|pe[cç]as|material|materiais|estoque|componente|refri)\b/i;

export function isVariableCostCategory(categoria: string | null | undefined): boolean {
  const c = (categoria ?? '').trim();
  if (!c) return false;
  return VARIABLE_COST_PATTERN.test(c);
}
