/** Busca tolerante a acentos e pequenos erros de digitação (ex.: Eccobrisa → Ecobrisa). */

export function stripAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) row[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length];
}

/** `query` vazio → true. Caso contrário, substring, prefixo ou distância pequena. */
export function matchesCatalogSearch(text: string, query: string): boolean {
  const haystack = stripAccents(text);
  const needle = stripAccents(query);
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  if (needle.length >= 2 && haystack.startsWith(needle)) return true;
  const words = haystack.split(/[\s\-+./]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(needle))) return true;
  if (needle.length < 4 || haystack.length < 3) return false;
  const maxDist = needle.length <= 6 ? 1 : 2;
  return levenshtein(haystack, needle) <= maxDist;
}
