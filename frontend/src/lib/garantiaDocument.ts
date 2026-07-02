import type { TenantOut } from "../api/auth";
import type { TenantGarantiaSettings } from "../api/garantiaSettings";
import type { Cliente } from "../components/v0-ui/service-orders/ServiceOrderFormView";
import {
  addMonthsToDateString,
  prefillGarantiaClienteFromCliente,
  prefillGarantiaEmpresaFromTenant,
  type ServiceOrderGarantiaFields,
} from "./serviceOrderGarantia";

/** Garantia enriquecida para PDF/termo impresso (empresa, cliente e textos legais do tenant). */
export type GarantiaDocumentFields = ServiceOrderGarantiaFields;

export function mergeGarantiaForDocument(
  garantia: ServiceOrderGarantiaFields,
  tenantSettings: TenantGarantiaSettings,
  tenant?: TenantOut | null,
  cliente?: Cliente | null,
): GarantiaDocumentFields {
  const empresa = tenant ? prefillGarantiaEmpresaFromTenant(tenant) : {};
  const cli = cliente ? prefillGarantiaClienteFromCliente(cliente) : {};
  const meses = garantia.mesesGarantia ?? tenantSettings.defaultMesesGarantia;
  const dataInstalacao = garantia.dataInstalacao.trim() || garantia.assinaturaData.trim();
  const validadeAte =
    garantia.validadeAte.trim() ||
    (dataInstalacao && meses ? addMonthsToDateString(dataInstalacao, meses) : "");

  return {
    ...garantia,
    empresaRazaoSocial: garantia.empresaRazaoSocial.trim() || empresa.empresaRazaoSocial || "",
    empresaNomeFantasia: garantia.empresaNomeFantasia.trim() || empresa.empresaNomeFantasia || "",
    empresaCnpj: garantia.empresaCnpj.trim() || empresa.empresaCnpj || "",
    empresaEndereco: garantia.empresaEndereco.trim() || empresa.empresaEndereco || "",
    empresaCidade: garantia.empresaCidade.trim() || empresa.empresaCidade || "",
    empresaEstado: garantia.empresaEstado.trim() || empresa.empresaEstado || "",
    empresaCep: garantia.empresaCep.trim() || empresa.empresaCep || "",
    empresaTelefone: garantia.empresaTelefone.trim() || empresa.empresaTelefone || "",
    empresaEmail: garantia.empresaEmail.trim() || empresa.empresaEmail || "",
    clienteNome: garantia.clienteNome.trim() || cli.clienteNome || "",
    clienteDocumento: garantia.clienteDocumento.trim() || cli.clienteDocumento || "",
    clienteEndereco: garantia.clienteEndereco.trim() || cli.clienteEndereco || cliente?.endereco?.trim() || "",
    clienteTelefone: garantia.clienteTelefone.trim() || cli.clienteTelefone || "",
    mesesGarantia: meses,
    dataInstalacao,
    validadeAte,
    prazoGarantiaServico: garantia.prazoGarantiaServico.trim() || tenantSettings.prazoGarantiaServico,
    notaGarantiaFabrica: garantia.notaGarantiaFabrica.trim() || tenantSettings.notaGarantiaFabrica,
    termosGarantia: garantia.termosGarantia.trim() || tenantSettings.termosGarantia,
    servicosCobertos: garantia.servicosCobertos.trim() || tenantSettings.servicosCobertos,
    condicoesExclusoes: garantia.condicoesExclusoes.trim() || tenantSettings.condicoesExclusoes,
  };
}

export function resolveGarantiaVigenciaLabel(
  garantia: ServiceOrderGarantiaFields,
  tenantSettings?: TenantGarantiaSettings | null,
): { summary: string; sub: string } {
  const meses = garantia.mesesGarantia ?? tenantSettings?.defaultMesesGarantia ?? null;
  const data = garantia.dataInstalacao.trim() || garantia.assinaturaData.trim();
  const validade =
    garantia.validadeAte.trim() ||
    (data && meses ? addMonthsToDateString(data, meses) : "");
  if (!validade) {
    return { summary: "Defina a data da instalação", sub: meses ? `${meses} meses (config.)` : "Configure em Administração" };
  }
  const d = new Date(`${validade}T12:00:00`);
  const summary = Number.isNaN(d.getTime()) ? validade : d.toLocaleDateString("pt-BR");
  const sub =
    data && meses
      ? `Início ${new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR")} · ${meses} meses`
      : meses
        ? `${meses} meses de garantia`
        : "Prazo nas configurações da garantia";
  return { summary, sub };
}
