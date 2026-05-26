/** URL pública da ficha do equipamento (cartela QR ou token legado). */
export function buildPublicEquipmentUrl(publicKey: string): string {
  const base = (import.meta.env.VITE_PUBLIC_APP_URL ?? "https://app.climaris.com.br").replace(/\/$/, "");
  const key = publicKey.trim();
  if (/^QR\d+$/i.test(key)) {
    return `${base}/equipment/${encodeURIComponent(key.toUpperCase())}`;
  }
  return `${base}/p/e/${encodeURIComponent(key)}`;
}
