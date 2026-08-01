export type ServiceIconKey =
  | "snowflake"
  | "wrench"
  | "thermometer"
  | "search"
  | "spray"
  | "droplet"
  | "settings"
  | "zap"
  | "more";

export type PreventiveIntervalType = "days" | "months" | "years";

export type ServiceProductInputRow = {
  product_id: string;
  quantity: string;
};

export type ServiceFormValues = {
  name: string;
  code: string;
  description: string;
  service_category: string;
  service_type: string;
  price: string;
  duration_minutes: string;
  is_active: boolean;
  require_photo: boolean;
  icon_key: ServiceIconKey;
  notes: string;
  visible_in_service_order: boolean;
  visible_in_pmoc: boolean;
  visible_in_contract: boolean;
  preventive_enabled: boolean;
  preventive_interval_type: PreventiveIntervalType;
  preventive_interval_value: string;
  product_inputs: ServiceProductInputRow[];
};

export type ServiceFormErrors = Partial<Record<keyof ServiceFormValues, string>>;

export const SERVICE_ICON_OPTIONS: ServiceIconKey[] = [
  "snowflake",
  "wrench",
  "thermometer",
  "search",
  "spray",
  "droplet",
  "settings",
  "zap",
  "more",
];

export const DEFAULT_SERVICE_CATEGORIES = [
  "limpeza",
  "manutencao",
  "refrigeracao",
  "diagnostico",
  "instalacao",
  "higienizacao",
  "outros",
];

export const SERVICE_TYPE_OPTIONS = [
  { value: "preventivo", label: "Preventivo" },
  { value: "corretivo", label: "Corretivo" },
  { value: "instalacao", label: "Instalação" },
  { value: "higienizacao", label: "Higienização" },
  { value: "inspecao", label: "Inspeção" },
  { value: "outros", label: "Outros" },
];

export const DESCRIPTION_MAX = 500;
export const NOTES_MAX = 300;
