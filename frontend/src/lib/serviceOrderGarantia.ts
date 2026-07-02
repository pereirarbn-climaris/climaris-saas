import type { TenantOut } from "../api/auth";
import type { Equipamento, Cliente } from "../components/v0-ui/service-orders/ServiceOrderFormView";
import {
  DEFAULT_CONDICOES_EXCLUSOES,
  DEFAULT_NOTA_GARANTIA_FABRICA,
  DEFAULT_SERVICOS_COBERTOS,
  DEFAULT_TERMOS_GARANTIA,
} from "./serviceOrderGarantiaDefaults";

export type GarantiaVacuoEvidenceKind = "foto" | "relatorio";
export type GarantiaVacuoSyncStatus = "pending_upload" | "synced" | "failed";

/** Evidência fotográfica de medição de startup (pressão, tensão, corrente, temperatura). */
export interface GarantiaStartupFotoEvidence {
  id: string;
  fileName: string;
  mimeType: string;
  storageKey: string | null;
  publicUrl: string | null;
  offlineBlobRef: string | null;
  syncStatus: GarantiaVacuoSyncStatus | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  capturedAt: string | null;
  capturedOffline: boolean;
  /** Valor extraído pela IA na foto */
  extractedValue: string | null;
}

export interface GarantiaVacuoArquivo {
  id: string;
  kind: GarantiaVacuoEvidenceKind;
  fileName: string;
  mimeType: string;
  storageKey: string | null;
  publicUrl: string | null;
  offlineBlobRef: string | null;
  syncStatus: GarantiaVacuoSyncStatus | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  capturedAt: string | null;
  capturedOffline: boolean;
  /** Valor extraído (IA na foto ou parser .tjf Testo) */
  vacuoFinalMicronsAi: string | null;
  deviceName: string | null;
  deviceSerial: string | null;
}

export interface ServiceOrderGarantiaFields {
  dataInstalacao: string;
  validadeAte: string;
  mesesGarantia: number | null;
  /** Legado — preenchido automaticamente a partir das séries */
  numeroSerie: string;
  serieEvaporadora: string;
  serieCondensadora: string;
  tipoAparelho: string;
  marcaModelo: string;
  capacidade: string;
  localInstalacao: string;
  /** Nome/local do aparelho no cadastro do cliente */
  equipmentTag: string;
  /** Catálogo resolvido pela IA (foto da etiqueta) */
  catalogId: string | null;
  catalogLabel: string | null;
  catalogCategoryName: string | null;
  /** Instalação no cliente (UUID) após sincronizar */
  clientEquipmentId: string | null;
  /** Cartela QR vinculada ao equipamento */
  qrcodeCodeId: string;
  /** Bloco 1 — empresa (snapshot para o termo) */
  empresaRazaoSocial: string;
  empresaNomeFantasia: string;
  empresaCnpj: string;
  empresaEndereco: string;
  empresaCidade: string;
  empresaEstado: string;
  empresaCep: string;
  empresaTelefone: string;
  empresaEmail: string;
  /** Bloco 2 — cliente e local */
  clienteNome: string;
  clienteDocumento: string;
  clienteEndereco: string;
  clienteTelefone: string;
  /** Bloco 4 — prazos */
  prazoGarantiaServico: string;
  notaGarantiaFabrica: string;
  termosGarantia: string;
  condicoesExclusoes: string;
  servicosCobertos: string;
  observacoes: string;
  /** Bloco 7 — startup técnico */
  vacuoFinalMicrons: string;
  /** Foto do visor do vacuômetro */
  vacuoFoto: GarantiaVacuoArquivo | null;
  /** Relatório Testo (.tjf) */
  vacuoRelatorio: GarantiaVacuoArquivo | null;
  /** @deprecated use vacuoFoto */
  vacuoArquivo?: GarantiaVacuoArquivo | null;
  pressaoTrabalhoPsi: string;
  pressaoFoto: GarantiaStartupFotoEvidence | null;
  tensaoMedidaVolts: string;
  tensaoFoto: GarantiaStartupFotoEvidence | null;
  correnteCompressorAmperes: string;
  correnteFoto: GarantiaStartupFotoEvidence | null;
  temperaturaInsuflamento: string;
  tempInsuflamentoFoto: GarantiaStartupFotoEvidence | null;
  temperaturaRetorno: string;
  tempRetornoFoto: GarantiaStartupFotoEvidence | null;
  /** Bloco 8 — encerramento */
  assinaturaLocal: string;
  assinaturaData: string;
  tecnicoResponsavelNome: string;
}

export const EMPTY_GARANTIA: ServiceOrderGarantiaFields = {
  dataInstalacao: "",
  validadeAte: "",
  mesesGarantia: null,
  numeroSerie: "",
  serieEvaporadora: "",
  serieCondensadora: "",
  tipoAparelho: "",
  marcaModelo: "",
  capacidade: "",
  localInstalacao: "",
  equipmentTag: "",
  catalogId: null,
  catalogLabel: null,
  catalogCategoryName: null,
  clientEquipmentId: null,
  qrcodeCodeId: "",
  empresaRazaoSocial: "",
  empresaNomeFantasia: "",
  empresaCnpj: "",
  empresaEndereco: "",
  empresaCidade: "",
  empresaEstado: "",
  empresaCep: "",
  empresaTelefone: "",
  empresaEmail: "",
  clienteNome: "",
  clienteDocumento: "",
  clienteEndereco: "",
  clienteTelefone: "",
  prazoGarantiaServico: "",
  notaGarantiaFabrica: DEFAULT_NOTA_GARANTIA_FABRICA,
  termosGarantia: DEFAULT_TERMOS_GARANTIA,
  condicoesExclusoes: DEFAULT_CONDICOES_EXCLUSOES,
  servicosCobertos: DEFAULT_SERVICOS_COBERTOS,
  observacoes: "",
  vacuoFinalMicrons: "",
  vacuoFoto: null,
  vacuoRelatorio: null,
  pressaoTrabalhoPsi: "",
  pressaoFoto: null,
  tensaoMedidaVolts: "",
  tensaoFoto: null,
  correnteCompressorAmperes: "",
  correnteFoto: null,
  temperaturaInsuflamento: "",
  tempInsuflamentoFoto: null,
  temperaturaRetorno: "",
  tempRetornoFoto: null,
  assinaturaLocal: "",
  assinaturaData: "",
  tecnicoResponsavelNome: "",
};

function str(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

function normalizeVacuoArquivo(raw: unknown, kindFallback: GarantiaVacuoEvidenceKind): GarantiaVacuoArquivo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<GarantiaVacuoArquivo>;
  if (!r.id || !r.fileName) return null;
  const sync = r.syncStatus;
  const syncStatus: GarantiaVacuoSyncStatus | null =
    sync === "pending_upload" || sync === "synced" || sync === "failed" ? sync : null;
  const kind: GarantiaVacuoEvidenceKind =
    r.kind === "foto" || r.kind === "relatorio" ? r.kind : kindFallback;
  return {
    id: String(r.id),
    kind,
    fileName: String(r.fileName),
    mimeType: str(r.mimeType) || (kind === "relatorio" ? "application/json" : "image/jpeg"),
    storageKey: r.storageKey ?? null,
    publicUrl: r.publicUrl ?? null,
    offlineBlobRef: r.offlineBlobRef ?? null,
    syncStatus,
    latitude: typeof r.latitude === "number" ? r.latitude : null,
    longitude: typeof r.longitude === "number" ? r.longitude : null,
    accuracyMeters: typeof r.accuracyMeters === "number" ? r.accuracyMeters : null,
    capturedAt: r.capturedAt ?? null,
    capturedOffline: Boolean(r.capturedOffline),
    vacuoFinalMicronsAi: r.vacuoFinalMicronsAi ?? null,
    deviceName: r.deviceName ?? null,
    deviceSerial: r.deviceSerial ?? null,
  };
}

function normalizeStartupFoto(raw: unknown): GarantiaStartupFotoEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<GarantiaStartupFotoEvidence>;
  if (!r.id || !r.fileName) return null;
  const sync = r.syncStatus;
  const syncStatus: GarantiaVacuoSyncStatus | null =
    sync === "pending_upload" || sync === "synced" || sync === "failed" ? sync : null;
  return {
    id: String(r.id),
    fileName: String(r.fileName),
    mimeType: str(r.mimeType) || "image/jpeg",
    storageKey: r.storageKey ?? null,
    publicUrl: r.publicUrl ?? null,
    offlineBlobRef: r.offlineBlobRef ?? null,
    syncStatus,
    latitude: typeof r.latitude === "number" ? r.latitude : null,
    longitude: typeof r.longitude === "number" ? r.longitude : null,
    accuracyMeters: typeof r.accuracyMeters === "number" ? r.accuracyMeters : null,
    capturedAt: r.capturedAt ?? null,
    capturedOffline: Boolean(r.capturedOffline),
    extractedValue: r.extractedValue ?? null,
  };
}

export function resolveVacuoMicronsFromGarantia(g: ServiceOrderGarantiaFields): string {
  return (
    g.vacuoRelatorio?.vacuoFinalMicronsAi?.trim() ||
    g.vacuoFoto?.vacuoFinalMicronsAi?.trim() ||
    g.vacuoFinalMicrons.trim()
  );
}

export function normalizeGarantiaFields(
  raw?: Partial<ServiceOrderGarantiaFields> | null,
): ServiceOrderGarantiaFields {
  if (!raw) return { ...EMPTY_GARANTIA };
  const serieEvaporadora = str(raw.serieEvaporadora) || str(raw.numeroSerie);
  const serieCondensadora = str(raw.serieCondensadora);
  const numeroSerie = str(raw.numeroSerie) || serieEvaporadora || serieCondensadora;
  return {
    dataInstalacao: str(raw.dataInstalacao),
    validadeAte: str(raw.validadeAte),
    mesesGarantia:
      raw.mesesGarantia != null && Number.isFinite(raw.mesesGarantia) ? raw.mesesGarantia : null,
    numeroSerie,
    serieEvaporadora,
    serieCondensadora,
    tipoAparelho: str(raw.tipoAparelho),
    marcaModelo: str(raw.marcaModelo),
    capacidade: str(raw.capacidade),
    localInstalacao: str(raw.localInstalacao),
    equipmentTag: str(raw.equipmentTag),
    catalogId: raw.catalogId ?? null,
    catalogLabel: raw.catalogLabel ?? null,
    catalogCategoryName: raw.catalogCategoryName ?? null,
    clientEquipmentId: raw.clientEquipmentId ?? null,
    qrcodeCodeId: str(raw.qrcodeCodeId),
    empresaRazaoSocial: str(raw.empresaRazaoSocial),
    empresaNomeFantasia: str(raw.empresaNomeFantasia),
    empresaCnpj: str(raw.empresaCnpj),
    empresaEndereco: str(raw.empresaEndereco),
    empresaCidade: str(raw.empresaCidade),
    empresaEstado: str(raw.empresaEstado),
    empresaCep: str(raw.empresaCep),
    empresaTelefone: str(raw.empresaTelefone),
    empresaEmail: str(raw.empresaEmail),
    clienteNome: str(raw.clienteNome),
    clienteDocumento: str(raw.clienteDocumento),
    clienteEndereco: str(raw.clienteEndereco),
    clienteTelefone: str(raw.clienteTelefone),
    prazoGarantiaServico: str(raw.prazoGarantiaServico),
    notaGarantiaFabrica: str(raw.notaGarantiaFabrica),
    termosGarantia: str(raw.termosGarantia),
    condicoesExclusoes: str(raw.condicoesExclusoes),
    servicosCobertos: str(raw.servicosCobertos),
    observacoes: str(raw.observacoes),
    vacuoFinalMicrons: str(raw.vacuoFinalMicrons),
    vacuoFoto:
      normalizeVacuoArquivo(raw.vacuoFoto, "foto") ??
      normalizeVacuoArquivo(raw.vacuoArquivo, "foto"),
    vacuoRelatorio: normalizeVacuoArquivo(raw.vacuoRelatorio, "relatorio"),
    pressaoTrabalhoPsi: str(raw.pressaoTrabalhoPsi),
    pressaoFoto: normalizeStartupFoto(raw.pressaoFoto),
    tensaoMedidaVolts: str(raw.tensaoMedidaVolts),
    tensaoFoto: normalizeStartupFoto(raw.tensaoFoto),
    correnteCompressorAmperes: str(raw.correnteCompressorAmperes),
    correnteFoto: normalizeStartupFoto(raw.correnteFoto),
    temperaturaInsuflamento: str(raw.temperaturaInsuflamento),
    tempInsuflamentoFoto: normalizeStartupFoto(raw.tempInsuflamentoFoto),
    temperaturaRetorno: str(raw.temperaturaRetorno),
    tempRetornoFoto: normalizeStartupFoto(raw.tempRetornoFoto),
    assinaturaLocal: str(raw.assinaturaLocal),
    assinaturaData: str(raw.assinaturaData),
    tecnicoResponsavelNome: str(raw.tecnicoResponsavelNome),
  };
}

export function resolveGarantiaSerial(g: ServiceOrderGarantiaFields): string {
  return g.serieEvaporadora.trim() || g.serieCondensadora.trim() || g.numeroSerie.trim();
}

/** Mantém numeroSerie sincronizado quando as séries mudam. */
export function buildGarantiaSerialPatch(
  g: ServiceOrderGarantiaFields,
  patch: Partial<ServiceOrderGarantiaFields>,
): Partial<ServiceOrderGarantiaFields> {
  const evap = (patch.serieEvaporadora ?? g.serieEvaporadora).trim();
  const cond = (patch.serieCondensadora ?? g.serieCondensadora).trim();
  const legacy = (patch.numeroSerie ?? g.numeroSerie).trim();
  return { ...patch, numeroSerie: evap || cond || legacy };
}

export function prefillGarantiaFromEquipments(
  equipamentos: Equipamento[],
): Partial<ServiceOrderGarantiaFields> {
  const eq = equipamentos[0];
  if (!eq) return {};
  const marcaModelo = [eq.marca, eq.modelo].filter(Boolean).join(" ").trim();
  const serial = eq.numeroSerie?.trim() ?? "";
  return {
    numeroSerie: serial,
    serieEvaporadora: serial,
    marcaModelo,
    capacidade: eq.capacidadeBtu > 0 ? `${eq.capacidadeBtu} BTU` : "",
    localInstalacao: eq.localizacao?.trim() ?? "",
    equipmentTag: eq.tag?.trim() || eq.localizacao?.trim() || "",
    tipoAparelho: eq.tipo?.trim() ?? "",
  };
}

export function prefillGarantiaEmpresaFromTenant(tenant: TenantOut): Partial<ServiceOrderGarantiaFields> {
  const streetParts = [tenant.address_street, tenant.address_number, tenant.address_district]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return {
    empresaRazaoSocial: tenant.name?.trim() ?? "",
    empresaNomeFantasia: (tenant.trade_name ?? "").trim() || tenant.name?.trim() || "",
    empresaCnpj: tenant.tax_document?.trim() || tenant.cnpj?.trim() || "",
    empresaEndereco: streetParts.join(", "),
    empresaCidade: tenant.address_city?.trim() ?? "",
    empresaEstado: tenant.address_state?.trim() ?? "",
    empresaCep: tenant.address_postal_code?.trim() ?? "",
    empresaTelefone: tenant.phone?.trim() ?? "",
    empresaEmail: tenant.email?.trim() ?? "",
  };
}

export function prefillGarantiaClienteFromCliente(cliente: Cliente): Partial<ServiceOrderGarantiaFields> {
  return {
    clienteNome: cliente.nome,
    clienteDocumento: cliente.documento,
    clienteEndereco: cliente.endereco ?? "",
    clienteTelefone: cliente.telefone ?? "",
  };
}

/** Preenche campos vazios da garantia com dados da empresa e do cliente. */
export function mergeGarantiaPartyPrefill(
  current: ServiceOrderGarantiaFields,
  tenant?: TenantOut | null,
  cliente?: Cliente | null,
): Partial<ServiceOrderGarantiaFields> {
  const empresa = tenant ? prefillGarantiaEmpresaFromTenant(tenant) : {};
  const cli = cliente ? prefillGarantiaClienteFromCliente(cliente) : {};
  const patch: Partial<ServiceOrderGarantiaFields> = {};

  const fill = <K extends keyof ServiceOrderGarantiaFields>(key: K, value: string | undefined) => {
    const cur = current[key];
    if (value?.trim() && typeof cur === "string" && !cur.trim()) {
      patch[key] = value as ServiceOrderGarantiaFields[K];
    }
  };

  fill("empresaRazaoSocial", empresa.empresaRazaoSocial);
  fill("empresaNomeFantasia", empresa.empresaNomeFantasia);
  fill("empresaCnpj", empresa.empresaCnpj);
  fill("empresaEndereco", empresa.empresaEndereco);
  fill("empresaCidade", empresa.empresaCidade);
  fill("empresaEstado", empresa.empresaEstado);
  fill("empresaCep", empresa.empresaCep);
  fill("empresaTelefone", empresa.empresaTelefone);
  fill("empresaEmail", empresa.empresaEmail);
  fill("clienteNome", cli.clienteNome);
  fill("clienteDocumento", cli.clienteDocumento);
  fill("clienteEndereco", cli.clienteEndereco);
  fill("clienteTelefone", cli.clienteTelefone);

  return patch;
}

export function addMonthsToDateString(isoDate: string, months: number): string {
  if (!isoDate || !Number.isFinite(months) || months < 1) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + months);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
