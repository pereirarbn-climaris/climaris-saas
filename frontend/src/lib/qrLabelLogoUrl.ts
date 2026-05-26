import { apiUrl } from "./apiUrl";
import type { QrCodeOut } from "../api/qrcodes";

/** Logo da empresa (tenant) — usado nos modelos 2, 3 e 4 das etiquetas QR. */
export function resolveQrLabelLogoUrl(row: Pick<QrCodeOut, "tenant_has_logo">): string | null {
  if (row.tenant_has_logo) {
    return apiUrl("/api/v1/auth/me/tenant/logo/file");
  }
  return null;
}
