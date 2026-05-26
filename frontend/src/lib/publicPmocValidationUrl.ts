/** URL pública de validação PMOC (QR Code no laudo PDF). */
export function buildPublicPmocValidationUrl(pmocId: number): string {
  const base = (import.meta.env.VITE_PUBLIC_APP_URL ?? "https://app.climaris.com.br").replace(/\/$/, "");
  return `${base}/public/pmoc-validation/${pmocId}`;
}
