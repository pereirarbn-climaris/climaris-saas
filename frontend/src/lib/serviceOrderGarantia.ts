import type { Equipamento } from "../components/v0-ui/service-orders/ServiceOrderFormView";

export interface ServiceOrderGarantiaFields {
  dataInstalacao: string;
  validadeAte: string;
  mesesGarantia: number | null;
  numeroSerie: string;
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
  termosGarantia: string;
  condicoesExclusoes: string;
  servicosCobertos: string;
  observacoes: string;
}

export const EMPTY_GARANTIA: ServiceOrderGarantiaFields = {
  dataInstalacao: "",
  validadeAte: "",
  mesesGarantia: null,
  numeroSerie: "",
  marcaModelo: "",
  capacidade: "",
  localInstalacao: "",
  equipmentTag: "",
  catalogId: null,
  catalogLabel: null,
  catalogCategoryName: null,
  clientEquipmentId: null,
  qrcodeCodeId: "",
  termosGarantia: "",
  condicoesExclusoes: "",
  servicosCobertos: "",
  observacoes: "",
};

export function normalizeGarantiaFields(
  raw?: Partial<ServiceOrderGarantiaFields> | null,
): ServiceOrderGarantiaFields {
  if (!raw) return { ...EMPTY_GARANTIA };
  return {
    dataInstalacao: raw.dataInstalacao ?? "",
    validadeAte: raw.validadeAte ?? "",
    mesesGarantia:
      raw.mesesGarantia != null && Number.isFinite(raw.mesesGarantia) ? raw.mesesGarantia : null,
    numeroSerie: raw.numeroSerie ?? "",
    marcaModelo: raw.marcaModelo ?? "",
    capacidade: raw.capacidade ?? "",
    localInstalacao: raw.localInstalacao ?? "",
    equipmentTag: raw.equipmentTag ?? "",
    catalogId: raw.catalogId ?? null,
    catalogLabel: raw.catalogLabel ?? null,
    catalogCategoryName: raw.catalogCategoryName ?? null,
    clientEquipmentId: raw.clientEquipmentId ?? null,
    qrcodeCodeId: raw.qrcodeCodeId ?? "",
    termosGarantia: raw.termosGarantia ?? "",
    condicoesExclusoes: raw.condicoesExclusoes ?? "",
    servicosCobertos: raw.servicosCobertos ?? "",
    observacoes: raw.observacoes ?? "",
  };
}

export function prefillGarantiaFromEquipments(
  equipamentos: Equipamento[],
): Partial<ServiceOrderGarantiaFields> {
  const eq = equipamentos[0];
  if (!eq) return {};
  const marcaModelo = [eq.marca, eq.modelo].filter(Boolean).join(" ").trim();
  return {
    numeroSerie: eq.numeroSerie?.trim() ?? "",
    marcaModelo,
    capacidade: eq.capacidadeBtu > 0 ? `${eq.capacidadeBtu} BTU` : "",
    localInstalacao: eq.localizacao?.trim() ?? "",
    equipmentTag: eq.tag?.trim() || eq.localizacao?.trim() || "",
  };
}

export function addMonthsToDateString(isoDate: string, months: number): string {
  if (!isoDate || !Number.isFinite(months) || months < 1) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + months);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
