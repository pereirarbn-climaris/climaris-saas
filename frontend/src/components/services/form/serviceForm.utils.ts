import type { ServiceOut } from "../../../api/services";
import type { ServiceProductInputPayload } from "../../../api/services";
import { numberToBrlInput } from "../../../lib/currencyBrInput";
import type { ServiceProductInputRow } from "./serviceForm.types";
import {
  DEFAULT_SERVICE_CATEGORIES,
  type PreventiveIntervalType,
  type ServiceFormValues,
  type ServiceIconKey,
} from "./serviceForm.types";
import { normalizeServiceIconKey } from "../serviceIcons";
import { inferServiceType } from "../services.utils";

export function emptyServiceFormValues(): ServiceFormValues {
  return {
    name: "",
    code: "",
    description: "",
    service_category: "",
    service_type: "",
    price: numberToBrlInput(0),
    duration_minutes: "",
    is_active: true,
    require_photo: false,
    icon_key: "snowflake",
    notes: "",
    visible_in_service_order: true,
    visible_in_pmoc: true,
    visible_in_contract: true,
    preventive_enabled: false,
    preventive_interval_type: "months",
    preventive_interval_value: "6",
    product_inputs: [],
  };
}

export function sanitizeDurationMinutesInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function parseDurationMinutesInput(raw: string): number | null {
  const value = sanitizeDurationMinutesInput(raw);
  if (!value) return null;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) return null;
  return minutes;
}

export function normalizeIconKey(value: string | null | undefined): ServiceIconKey {
  return normalizeServiceIconKey(value);
}

function mapPreventiveFromService(service: ServiceOut): Pick<
  ServiceFormValues,
  "preventive_enabled" | "preventive_interval_type" | "preventive_interval_value"
> {
  if (
    service.preventive_enabled &&
    service.preventive_interval_type &&
    service.preventive_interval_value
  ) {
    return {
      preventive_enabled: true,
      preventive_interval_type: service.preventive_interval_type,
      preventive_interval_value: String(service.preventive_interval_value),
    };
  }
  if (service.periodicidade_meses != null && service.periodicidade_meses > 0) {
    return {
      preventive_enabled: true,
      preventive_interval_type: "months",
      preventive_interval_value: String(service.periodicidade_meses),
    };
  }
  return {
    preventive_enabled: false,
    preventive_interval_type: "months",
    preventive_interval_value: "6",
  };
}

export function serviceToFormValues(service: ServiceOut): ServiceFormValues {
  const type = service.service_type?.trim() || inferServiceType(service) || "";
  const minutes = Number(service.duration_minutes || 0);
  const preventive = mapPreventiveFromService(service);

  return {
    name: service.name || "",
    code: service.code || "",
    description: service.description || "",
    service_category: service.service_category || "",
    service_type: type,
    price: numberToBrlInput(Number(service.price || 0)),
    duration_minutes: minutes > 0 ? String(minutes) : "",
    is_active: Boolean(service.is_active),
    require_photo: Boolean(service.require_photo),
    icon_key: normalizeIconKey(service.icon_key),
    notes: service.notes || "",
    visible_in_service_order: service.visible_in_service_order ?? true,
    visible_in_pmoc: service.visible_in_pmoc ?? true,
    visible_in_contract: service.visible_in_contract ?? true,
    ...preventive,
    product_inputs: mapProductInputsFromService(service),
  };
}

export function mapProductInputsFromService(service: ServiceOut): ServiceProductInputRow[] {
  return (service.product_inputs ?? []).map((row) => ({
    product_id: String(row.product_id),
    quantity: String(row.quantity),
  }));
}

export function buildProductInputsPayload(rows: ServiceProductInputRow[]): ServiceProductInputPayload[] {
  return rows
    .map((row) => ({
      product_id: Number(row.product_id),
      quantity: Number(row.quantity),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.product_id) &&
        row.product_id > 0 &&
        Number.isFinite(row.quantity) &&
        row.quantity > 0,
    );
}

export function buildPreventivePayload(values: ServiceFormValues): {
  preventive_enabled: boolean;
  preventive_interval_type: PreventiveIntervalType | null;
  preventive_interval_value: number | null;
} {
  if (!values.preventive_enabled) {
    return {
      preventive_enabled: false,
      preventive_interval_type: null,
      preventive_interval_value: null,
    };
  }
  const value = Number(values.preventive_interval_value);
  return {
    preventive_enabled: true,
    preventive_interval_type: values.preventive_interval_type,
    preventive_interval_value: Number.isFinite(value) ? value : null,
  };
}

export function formatCategoryOptionLabel(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return value
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function mergeCategoryOptions(fromDb: string[]): string[] {
  const set = new Set<string>();
  for (const item of [...DEFAULT_SERVICE_CATEGORIES, ...fromDb]) {
    const normalized = item.trim().toLowerCase();
    if (normalized) set.add(normalized);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
