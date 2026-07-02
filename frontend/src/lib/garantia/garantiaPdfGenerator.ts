/**
 * Geração do Termo de Garantia (PDF) a partir da ordem de serviço de instalação.
 * O layout é montado no backend (ReportLab), alinhado ao laudo técnico.
 */

import { fetchServiceOrderGarantiaPdf } from "../../api/serviceOrders";
import { openPdfBlobInNewTab } from "../laudo/pdfService";

export async function generateGarantiaTermPdf(orderId: number): Promise<void> {
  if (!Number.isFinite(orderId) || orderId < 1) {
    throw new Error("Ordem de serviço inválida para gerar o termo de garantia.");
  }
  const blob = await fetchServiceOrderGarantiaPdf(orderId);
  openPdfBlobInNewTab(blob, `Termo de Garantia OS n° ${String(orderId).padStart(3, "0")}.pdf`);
}
