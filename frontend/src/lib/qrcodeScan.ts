/** Extrai code_id de texto escaneado (URL ou código direto). */
export function parseScannedQrCode(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  const equipment = text.match(/\/equipment\/([^/?#]+)/i);
  if (equipment?.[1]) return equipment[1].trim().toUpperCase();
  const legacy = text.match(/\/p\/e\/([^/?#]+)/i);
  if (legacy?.[1]) return legacy[1].trim();
  if (/^QR\d+$/i.test(text)) return text.toUpperCase();
  return text.toUpperCase();
}
