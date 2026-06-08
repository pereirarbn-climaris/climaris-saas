/**
 * Geração do Laudo Técnico (PDF) a partir da ordem de serviço.
 * O layout é montado no backend (ReportLab), alinhado ao Orcamento_Profissional.pdf.
 */

import { fetchServiceOrderLaudoPdf } from "../../api/serviceOrders";
import type { ServiceOrderData } from "../../components/v0-ui/service-orders/ServiceOrderFormView";
import { openPdfBlobInNewTab } from "./pdfService";

export type TechnicalReportSource = {
  orderId: number;
  /** Dados locais do formulário (opcional — o PDF usa a versão persistida na API). */
  formData?: Partial<ServiceOrderData>;
};

/**
 * Busca o laudo na API (cliente, prestador, metodologia, diagnóstico, dados técnicos, fotos)
 * e abre o PDF em nova aba para visualização antes de imprimir ou enviar.
 */
export async function generateTechnicalReportPDF(source: TechnicalReportSource): Promise<void> {
  const { orderId } = source;
  if (!Number.isFinite(orderId) || orderId < 1) {
    throw new Error("Ordem de serviço inválida para gerar o laudo.");
  }
  const blob = await fetchServiceOrderLaudoPdf(orderId);
  openPdfBlobInNewTab(blob, `laudo-os-${orderId}.pdf`);
}
