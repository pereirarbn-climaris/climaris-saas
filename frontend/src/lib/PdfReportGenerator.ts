import QRCode from "qrcode";

import { buildPublicPmocValidationUrl } from "./publicPmocValidationUrl";

/** URL alvo do QR Code de validação pública do PMOC. */
export function buildPmocValidationQrTargetUrl(pmocId: number): string {
  return buildPublicPmocValidationUrl(pmocId);
}

/** Gera QR Code como data URL (PNG base64) para preview ou anexos client-side. */
export async function generateQrCodeDataUrl(text: string, size = 128): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

/** QR Code de validação do laudo PMOC (mesmo conteúdo injetado no PDF pelo backend). */
export async function generatePmocValidationQrDataUrl(pmocId: number, size = 128): Promise<string> {
  return generateQrCodeDataUrl(buildPmocValidationQrTargetUrl(pmocId), size);
}

/**
 * O PDF oficial do PMOC é gerado no servidor (`app/pmoc_pdf.py`) com QR no canto superior
 * direito de cada página. Este módulo expõe helpers equivalentes no frontend para preview
 * e futuras gerações client-side.
 */
export const PMOC_PDF_QR_INJECTION = "server-side-pmoc-pdf" as const;
