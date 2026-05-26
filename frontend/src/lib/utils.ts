/** Combina classes condicionais (estilo shadcn `cn`). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
