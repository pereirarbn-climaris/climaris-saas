import type { GarantiaStartupFotoEvidence, ServiceOrderGarantiaFields } from "./serviceOrderGarantia";

export type GarantiaStartupMetricKey = "pressao" | "tensao" | "corrente" | "tempInsuflamento" | "tempRetorno";

export type GarantiaStartupMetricConfig = {
  key: GarantiaStartupMetricKey;
  apiKey: string;
  valueField: keyof Pick<
    ServiceOrderGarantiaFields,
    | "pressaoTrabalhoPsi"
    | "tensaoMedidaVolts"
    | "correnteCompressorAmperes"
    | "temperaturaInsuflamento"
    | "temperaturaRetorno"
  >;
  fotoField: keyof Pick<
    ServiceOrderGarantiaFields,
    | "pressaoFoto"
    | "tensaoFoto"
    | "correnteFoto"
    | "tempInsuflamentoFoto"
    | "tempRetornoFoto"
  >;
  label: string;
  unit: string;
  placeholder: string;
  lead: string;
};

export const STARTUP_METRIC_CONFIGS: GarantiaStartupMetricConfig[] = [
  {
    key: "pressao",
    apiKey: "pressao_trabalho_psi",
    valueField: "pressaoTrabalhoPsi",
    fotoField: "pressaoFoto",
    label: "Pressão trabalho",
    unit: "PSI",
    placeholder: "115",
    lead: "Fotografe o manômetro. A IA lê a pressão em PSI.",
  },
  {
    key: "tensao",
    apiKey: "tensao_volts",
    valueField: "tensaoMedidaVolts",
    fotoField: "tensaoFoto",
    label: "Tensão medida",
    unit: "V",
    placeholder: "220",
    lead: "Fotografe o multímetro ou pinça. A IA lê a tensão em volts.",
  },
  {
    key: "corrente",
    apiKey: "corrente_compressor_amperes",
    valueField: "correnteCompressorAmperes",
    fotoField: "correnteFoto",
    label: "Corrente compressor",
    unit: "A",
    placeholder: "4,2",
    lead: "Fotografe o visor medindo corrente do compressor.",
  },
  {
    key: "tempInsuflamento",
    apiKey: "temperatura_insuflamento_c",
    valueField: "temperaturaInsuflamento",
    fotoField: "tempInsuflamentoFoto",
    label: "Temp. insuflamento",
    unit: "°C",
    placeholder: "12",
    lead: "Fotografe o termômetro no ar de insuflamento.",
  },
  {
    key: "tempRetorno",
    apiKey: "temperatura_retorno_c",
    valueField: "temperaturaRetorno",
    fotoField: "tempRetornoFoto",
    label: "Temp. retorno",
    unit: "°C",
    placeholder: "24",
    lead: "Fotografe o termômetro no ar de retorno.",
  },
];

export function getStartupMetricFoto(
  garantia: ServiceOrderGarantiaFields,
  config: GarantiaStartupMetricConfig,
): GarantiaStartupFotoEvidence | null {
  return garantia[config.fotoField] as GarantiaStartupFotoEvidence | null;
}

export function resolveStartupMetricValue(
  garantia: ServiceOrderGarantiaFields,
  config: GarantiaStartupMetricConfig,
): string {
  const foto = getStartupMetricFoto(garantia, config);
  return foto?.extractedValue?.trim() || String(garantia[config.valueField] ?? "").trim();
}
