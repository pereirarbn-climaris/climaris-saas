/** Ordem crescente por nome (pt-BR), para selects e resultados de busca. */
export function sortByNameAsc<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true }),
  );
}
