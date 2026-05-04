/** Base da API. Em dev, deixe vazio para usar o proxy do Vite. Em produção, defina VITE_API_URL. */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
